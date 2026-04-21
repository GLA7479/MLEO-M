-- OV2 Bomber Arena — player_step + leave/forfeit. Apply after 161.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_bomber_arena_cell_in_arr(p_arr jsonb, px int, py int)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(coalesce(p_arr, '[]'::jsonb)) e
    WHERE (e ->> 0)::int = px
      AND (e ->> 1)::int = py
  );
$$;

REVOKE ALL ON FUNCTION public.ov2_bomber_arena_cell_in_arr(jsonb, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_bomber_arena_cell_in_arr(jsonb, int, int) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ov2_bomber_arena_leave_or_forfeit(
  p_room_id uuid,
  p_participant_key text,
  p_forfeit_game boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_product text;
  v_sid uuid;
  v_my_seat int;
  v_other_seat int;
  v_alive_other boolean;
  v_snap jsonb;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;

  IF NOT coalesce(p_forfeit_game, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORFEIT_REQUIRED', 'message', 'forfeit flag required');
  END IF;

  PERFORM 1 FROM public.ov2_rooms r WHERE r.id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;

  v_product := (SELECT r.product_game_id FROM public.ov2_rooms r WHERE r.id = p_room_id LIMIT 1);
  IF v_product IS DISTINCT FROM 'ov2_bomber_arena' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a Bomber Arena room');
  END IF;

  v_sid := (SELECT r.active_session_id FROM public.ov2_rooms r WHERE r.id = p_room_id LIMIT 1);
  IF v_sid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SESSION', 'message', 'No active session');
  END IF;

  PERFORM 1 FROM public.ov2_bomber_arena_sessions s WHERE s.id = v_sid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;

  IF (SELECT s.phase FROM public.ov2_bomber_arena_sessions s WHERE s.id = v_sid LIMIT 1) IS DISTINCT FROM 'playing' THEN
    v_snap := public.ov2_bomber_arena_build_client_snapshot(v_sid, v_pk);
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'snapshot', v_snap);
  END IF;

  v_my_seat := (
    SELECT s.seat_index
    FROM public.ov2_bomber_arena_seats s
    WHERE s.session_id = v_sid AND trim(s.participant_key) = v_pk
    LIMIT 1
  );
  IF v_my_seat IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_SEATED', 'message', 'Not in this session');
  END IF;

  UPDATE public.ov2_bomber_arena_seats
  SET is_alive = false
  WHERE session_id = v_sid
    AND seat_index = v_my_seat;

  v_other_seat := CASE WHEN v_my_seat = 0 THEN 1 ELSE 0 END;

  v_alive_other := coalesce((
    SELECT s.is_alive
    FROM public.ov2_bomber_arena_seats s
    WHERE s.session_id = v_sid AND s.seat_index = v_other_seat
    LIMIT 1
  ), false);

  IF v_alive_other THEN
    UPDATE public.ov2_bomber_arena_sessions
    SET
      phase = 'finished',
      winner_seat = v_other_seat,
      is_draw = false,
      revision = revision + 1,
      updated_at = now()
    WHERE id = v_sid;
  ELSE
    UPDATE public.ov2_bomber_arena_sessions
    SET
      phase = 'finished',
      winner_seat = NULL,
      is_draw = true,
      revision = revision + 1,
      updated_at = now()
    WHERE id = v_sid;
  END IF;

  v_snap := public.ov2_bomber_arena_build_client_snapshot(v_sid, v_pk);
  RETURN jsonb_build_object('ok', true, 'idempotent', false, 'snapshot', v_snap);
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_bomber_arena_leave_or_forfeit(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_bomber_arena_leave_or_forfeit(uuid, text, boolean) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ov2_bomber_arena_player_step(
  p_room_id uuid,
  p_session_id uuid,
  p_participant_key text,
  p_action jsonb,
  p_client_tick bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_cached jsonb;
  v_max_key bigint;
  v_sid uuid := p_session_id;
  v_room uuid := p_room_id;
  v_product text;
  v_phase text;
  v_board jsonb;
  v_w int;
  v_h int;
  v_turn int;
  v_radius int;
  v_fuse0 int;
  v_max_bombs int;
  v_my_seat int;
  v_ax text;
  v_dx int;
  v_dy int;
  v_px int;
  v_py int;
  v_tx int;
  v_ty int;
  v_bombs jsonb;
  v_nb jsonb;
  v_i int;
  v_el jsonb;
  v_nf int;
  v_hit jsonb;
  v_bx int;
  v_by int;
  v_br int;
  v_cx int;
  v_cy int;
  v_p0x int;
  v_p0y int;
  v_p1x int;
  v_p1y int;
  v_alive0 boolean;
  v_alive1 boolean;
  v_kill0 boolean := false;
  v_kill1 boolean := false;
  v_exploding boolean := false;
  v_snap jsonb;
  v_resp jsonb;
  v_bcnt int;
  v_j int;
BEGIN
  IF v_room IS NULL OR v_sid IS NULL OR length(v_pk) = 0 OR p_action IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Missing required arguments');
  END IF;

  IF p_client_tick IS NULL OR p_client_tick <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_TICK', 'message', 'p_client_tick must be a positive integer');
  END IF;

  v_cached := (
    SELECT i.response
    FROM public.ov2_bomber_arena_step_idempotency i
    WHERE i.session_id = v_sid
      AND trim(i.participant_key) = v_pk
      AND i.idempotency_key = p_client_tick
    LIMIT 1
  );
  IF v_cached IS NOT NULL THEN
    RETURN v_cached;
  END IF;

  v_max_key := (
    SELECT max(i.idempotency_key)
    FROM public.ov2_bomber_arena_step_idempotency i
    WHERE i.session_id = v_sid AND trim(i.participant_key) = v_pk
  );
  IF v_max_key IS NOT NULL AND p_client_tick < v_max_key THEN
    RETURN jsonb_build_object('ok', false, 'code', 'OUT_OF_ORDER', 'message', 'client tick out of order');
  END IF;

  PERFORM 1 FROM public.ov2_bomber_arena_sessions s WHERE s.id = v_sid AND s.room_id = v_room FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found for room');
  END IF;

  v_product := (SELECT r.product_game_id FROM public.ov2_rooms r WHERE r.id = v_room LIMIT 1);
  IF v_product IS DISTINCT FROM 'ov2_bomber_arena' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Wrong product');
  END IF;

  v_phase := (SELECT s.phase FROM public.ov2_bomber_arena_sessions s WHERE s.id = v_sid LIMIT 1);
  IF v_phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_PLAYING', 'message', 'Session is not active');
  END IF;

  v_board := (SELECT s.board FROM public.ov2_bomber_arena_sessions s WHERE s.id = v_sid LIMIT 1);
  v_w := greatest(coalesce((v_board ->> 'w')::int, 9), 1);
  v_h := greatest(coalesce((v_board ->> 'h')::int, 9), 1);
  v_turn := coalesce((v_board ->> 'turnSeat')::int, 0);
  v_radius := greatest(coalesce((v_board ->> 'bombRadius')::int, 1), 1);
  v_fuse0 := greatest(coalesce((v_board ->> 'fuseTicksDefault')::int, 3), 1);
  v_max_bombs := greatest(coalesce((v_board ->> 'maxBombsPerPlayer')::int, 1), 1);

  v_my_seat := (
    SELECT s.seat_index
    FROM public.ov2_bomber_arena_seats s
    WHERE s.session_id = v_sid AND trim(s.participant_key) = v_pk
    LIMIT 1
  );
  IF v_my_seat IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_SEATED', 'message', 'Not seated in session');
  END IF;

  IF coalesce((
    SELECT s.is_alive FROM public.ov2_bomber_arena_seats s WHERE s.session_id = v_sid AND s.seat_index = v_my_seat LIMIT 1
  ), false) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ELIMINATED', 'message', 'Player is eliminated');
  END IF;

  IF v_my_seat IS DISTINCT FROM v_turn THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_YOUR_TURN', 'message', 'Not your turn');
  END IF;

  v_ax := lower(trim(coalesce(p_action ->> 'type', '')));
  IF v_ax = 'move' THEN
    v_dx := coalesce((p_action ->> 'dx')::int, 0);
    v_dy := coalesce((p_action ->> 'dy')::int, 0);
    IF (v_dx <> 0 AND v_dy <> 0) OR (v_dx = 0 AND v_dy = 0) OR abs(v_dx) > 1 OR abs(v_dy) > 1 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'BAD_MOVE', 'message', 'Invalid move delta');
    END IF;
    v_px := coalesce((v_board -> 'players' -> (v_my_seat::text) ->> 'x')::int, 0);
    v_py := coalesce((v_board -> 'players' -> (v_my_seat::text) ->> 'y')::int, 0);
    v_tx := v_px + v_dx;
    v_ty := v_py + v_dy;
    IF v_tx < 0 OR v_ty < 0 OR v_tx >= v_w OR v_ty >= v_h THEN
      RETURN jsonb_build_object('ok', false, 'code', 'BAD_MOVE', 'message', 'Out of bounds');
    END IF;
    IF public.ov2_bomber_arena_cell_in_arr(v_board -> 'walls', v_tx, v_ty) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'BLOCKED', 'message', 'Cannot move into a wall');
    END IF;
    v_p0x := coalesce((v_board -> 'players' -> '0' ->> 'x')::int, -1);
    v_p0y := coalesce((v_board -> 'players' -> '0' ->> 'y')::int, -1);
    v_p1x := coalesce((v_board -> 'players' -> '1' ->> 'x')::int, -1);
    v_p1y := coalesce((v_board -> 'players' -> '1' ->> 'y')::int, -1);
    IF (v_tx = v_p0x AND v_ty = v_p0y AND v_my_seat <> 0) OR (v_tx = v_p1x AND v_ty = v_p1y AND v_my_seat <> 1) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'BLOCKED', 'message', 'Cannot move onto opponent');
    END IF;
    v_bombs := coalesce(v_board -> 'bombs', '[]'::jsonb);
    v_bcnt := coalesce(jsonb_array_length(v_bombs), 0);
    FOR v_i IN 0..v_bcnt - 1 LOOP
      v_el := v_bombs -> v_i;
      IF (v_el ->> 'x')::int = v_tx AND (v_el ->> 'y')::int = v_ty THEN
        RETURN jsonb_build_object('ok', false, 'code', 'BLOCKED', 'message', 'Cannot move onto a bomb');
      END IF;
    END LOOP;
    v_board := jsonb_set(v_board, ARRAY['players', v_my_seat::text, 'x'], to_jsonb(v_tx), true);
    v_board := jsonb_set(v_board, ARRAY['players', v_my_seat::text, 'y'], to_jsonb(v_ty), true);
  ELSIF v_ax = 'bomb' THEN
    v_px := coalesce((v_board -> 'players' -> (v_my_seat::text) ->> 'x')::int, 0);
    v_py := coalesce((v_board -> 'players' -> (v_my_seat::text) ->> 'y')::int, 0);
    v_bombs := coalesce(v_board -> 'bombs', '[]'::jsonb);
    v_bcnt := 0;
    FOR v_i IN 0..coalesce(jsonb_array_length(v_bombs), 0) - 1 LOOP
      v_el := v_bombs -> v_i;
      IF (v_el ->> 'x')::int = v_px AND (v_el ->> 'y')::int = v_py THEN
        RETURN jsonb_build_object('ok', false, 'code', 'BOMB_HERE', 'message', 'Bomb already on this cell');
      END IF;
      IF coalesce((v_el ->> 'owner')::int, -1) = v_my_seat THEN
        v_bcnt := v_bcnt + 1;
      END IF;
    END LOOP;
    IF v_bcnt >= v_max_bombs THEN
      RETURN jsonb_build_object('ok', false, 'code', 'BOMB_LIMIT', 'message', 'Bomb limit reached');
    END IF;
    v_el := jsonb_build_object('x', v_px, 'y', v_py, 'fuse', v_fuse0, 'owner', v_my_seat);
    v_board := jsonb_set(
      v_board,
      ARRAY['bombs'],
      coalesce(v_board -> 'bombs', '[]'::jsonb) || jsonb_build_array(v_el),
      true
    );
  ELSIF v_ax = 'wait' THEN
    NULL;
  ELSE
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_ACTION', 'message', 'Unknown action type');
  END IF;

  v_bombs := coalesce(v_board -> 'bombs', '[]'::jsonb);
  v_nb := '[]'::jsonb;
  FOR v_i IN 0..coalesce(jsonb_array_length(v_bombs), 0) - 1 LOOP
    v_el := v_bombs -> v_i;
    v_nf := greatest(coalesce((v_el ->> 'fuse')::int, 0) - 1, 0);
    v_el := jsonb_set(v_el, '{fuse}', to_jsonb(v_nf), true);
    v_nb := v_nb || jsonb_build_array(v_el);
  END LOOP;
  v_board := jsonb_set(v_board, ARRAY['bombs'], v_nb, true);

  v_hit := '[]'::jsonb;
  v_bombs := coalesce(v_board -> 'bombs', '[]'::jsonb);
  FOR v_i IN 0..coalesce(jsonb_array_length(v_bombs), 0) - 1 LOOP
    v_el := v_bombs -> v_i;
    IF coalesce((v_el ->> 'fuse')::int, 1) <= 0 THEN
      v_exploding := true;
      v_bx := (v_el ->> 'x')::int;
      v_by := (v_el ->> 'y')::int;
      IF NOT public.ov2_bomber_arena_cell_in_arr(v_hit, v_bx, v_by) THEN
        v_hit := v_hit || jsonb_build_array(jsonb_build_array(v_bx, v_by));
      END IF;
      FOR v_br IN 1..v_radius LOOP
        v_cx := v_bx + v_br;
        v_cy := v_by;
        IF v_cx >= v_w THEN EXIT; END IF;
        IF public.ov2_bomber_arena_cell_in_arr(v_board -> 'walls', v_cx, v_cy) THEN EXIT; END IF;
        IF NOT public.ov2_bomber_arena_cell_in_arr(v_hit, v_cx, v_cy) THEN
          v_hit := v_hit || jsonb_build_array(jsonb_build_array(v_cx, v_cy));
        END IF;
      END LOOP;
      FOR v_br IN 1..v_radius LOOP
        v_cx := v_bx - v_br;
        v_cy := v_by;
        IF v_cx < 0 THEN EXIT; END IF;
        IF public.ov2_bomber_arena_cell_in_arr(v_board -> 'walls', v_cx, v_cy) THEN EXIT; END IF;
        IF NOT public.ov2_bomber_arena_cell_in_arr(v_hit, v_cx, v_cy) THEN
          v_hit := v_hit || jsonb_build_array(jsonb_build_array(v_cx, v_cy));
        END IF;
      END LOOP;
      FOR v_br IN 1..v_radius LOOP
        v_cx := v_bx;
        v_cy := v_by + v_br;
        IF v_cy >= v_h THEN EXIT; END IF;
        IF public.ov2_bomber_arena_cell_in_arr(v_board -> 'walls', v_cx, v_cy) THEN EXIT; END IF;
        IF NOT public.ov2_bomber_arena_cell_in_arr(v_hit, v_cx, v_cy) THEN
          v_hit := v_hit || jsonb_build_array(jsonb_build_array(v_cx, v_cy));
        END IF;
      END LOOP;
      FOR v_br IN 1..v_radius LOOP
        v_cx := v_bx;
        v_cy := v_by - v_br;
        IF v_cy < 0 THEN EXIT; END IF;
        IF public.ov2_bomber_arena_cell_in_arr(v_board -> 'walls', v_cx, v_cy) THEN EXIT; END IF;
        IF NOT public.ov2_bomber_arena_cell_in_arr(v_hit, v_cx, v_cy) THEN
          v_hit := v_hit || jsonb_build_array(jsonb_build_array(v_cx, v_cy));
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  IF v_exploding THEN
    v_nb := '[]'::jsonb;
    FOR v_i IN 0..coalesce(jsonb_array_length(v_bombs), 0) - 1 LOOP
      v_el := v_bombs -> v_i;
      IF coalesce((v_el ->> 'fuse')::int, 1) > 0 THEN
        v_nb := v_nb || jsonb_build_array(v_el);
      END IF;
    END LOOP;
    v_board := jsonb_set(v_board, ARRAY['bombs'], v_nb, true);

    FOR v_i IN 0..coalesce(jsonb_array_length(v_hit), 0) - 1 LOOP
      v_el := v_hit -> v_i;
      v_cx := (v_el ->> 0)::int;
      v_cy := (v_el ->> 1)::int;
      IF public.ov2_bomber_arena_cell_in_arr(v_board -> 'breakables', v_cx, v_cy) THEN
        v_nb := '[]'::jsonb;
        FOR v_j IN 0..coalesce(jsonb_array_length(v_board -> 'breakables'), 0) - 1 LOOP
          v_el := (v_board -> 'breakables') -> v_j;
          IF NOT ((v_el ->> 0)::int = v_cx AND (v_el ->> 1)::int = v_cy) THEN
            v_nb := v_nb || jsonb_build_array(v_el);
          END IF;
        END LOOP;
        v_board := jsonb_set(v_board, ARRAY['breakables'], v_nb, true);
      END IF;
    END LOOP;

    v_p0x := coalesce((v_board -> 'players' -> '0' ->> 'x')::int, -1);
    v_p0y := coalesce((v_board -> 'players' -> '0' ->> 'y')::int, -1);
    v_p1x := coalesce((v_board -> 'players' -> '1' ->> 'x')::int, -1);
    v_p1y := coalesce((v_board -> 'players' -> '1' ->> 'y')::int, -1);
    FOR v_i IN 0..coalesce(jsonb_array_length(v_hit), 0) - 1 LOOP
      v_el := v_hit -> v_i;
      v_cx := (v_el ->> 0)::int;
      v_cy := (v_el ->> 1)::int;
      IF v_cx = v_p0x AND v_cy = v_p0y THEN
        v_kill0 := true;
      END IF;
      IF v_cx = v_p1x AND v_cy = v_p1y THEN
        v_kill1 := true;
      END IF;
    END LOOP;
  END IF;

  IF v_kill0 THEN
    UPDATE public.ov2_bomber_arena_seats SET is_alive = false WHERE session_id = v_sid AND seat_index = 0;
  END IF;
  IF v_kill1 THEN
    UPDATE public.ov2_bomber_arena_seats SET is_alive = false WHERE session_id = v_sid AND seat_index = 1;
  END IF;

  v_alive0 := coalesce((
    SELECT s.is_alive FROM public.ov2_bomber_arena_seats s WHERE s.session_id = v_sid AND s.seat_index = 0 LIMIT 1
  ), false);
  v_alive1 := coalesce((
    SELECT s.is_alive FROM public.ov2_bomber_arena_seats s WHERE s.session_id = v_sid AND s.seat_index = 1 LIMIT 1
  ), false);

  IF v_alive0 IS NOT TRUE AND v_alive1 IS NOT TRUE THEN
    UPDATE public.ov2_bomber_arena_sessions
    SET
      board = v_board,
      phase = 'finished',
      winner_seat = NULL,
      is_draw = true,
      sim_tick = sim_tick + 1,
      revision = revision + 1,
      updated_at = now()
    WHERE id = v_sid;
  ELSIF v_alive0 IS NOT TRUE THEN
    v_board := jsonb_set(v_board, ARRAY['turnSeat'], to_jsonb(1), true);
    UPDATE public.ov2_bomber_arena_sessions
    SET
      board = v_board,
      phase = 'finished',
      winner_seat = 1,
      is_draw = false,
      sim_tick = sim_tick + 1,
      revision = revision + 1,
      updated_at = now()
    WHERE id = v_sid;
  ELSIF v_alive1 IS NOT TRUE THEN
    v_board := jsonb_set(v_board, ARRAY['turnSeat'], to_jsonb(0), true);
    UPDATE public.ov2_bomber_arena_sessions
    SET
      board = v_board,
      phase = 'finished',
      winner_seat = 0,
      is_draw = false,
      sim_tick = sim_tick + 1,
      revision = revision + 1,
      updated_at = now()
    WHERE id = v_sid;
  ELSE
    v_board := jsonb_set(v_board, ARRAY['turnSeat'], to_jsonb(1 - v_turn), true);
    UPDATE public.ov2_bomber_arena_sessions
    SET
      board = v_board,
      sim_tick = sim_tick + 1,
      revision = revision + 1,
      updated_at = now()
    WHERE id = v_sid;
  END IF;

  v_snap := public.ov2_bomber_arena_build_client_snapshot(v_sid, v_pk);
  v_resp := jsonb_build_object('ok', true, 'snapshot', v_snap);

  INSERT INTO public.ov2_bomber_arena_step_idempotency (session_id, participant_key, idempotency_key, response)
  VALUES (v_sid, v_pk, p_client_tick, v_resp)
  ON CONFLICT (session_id, participant_key, idempotency_key) DO NOTHING;

  RETURN v_resp;
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_bomber_arena_player_step(uuid, uuid, text, jsonb, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_bomber_arena_player_step(uuid, uuid, text, jsonb, bigint) TO anon, authenticated, service_role;

COMMIT;
