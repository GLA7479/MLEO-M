-- OV2 Snakes & Ladders: authoritative roll + finish_if_ready. Apply after 152.

BEGIN;

CREATE OR REPLACE FUNCTION public._ov2_snakes_next_turn_seat(p_active int[], p_current int)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_idx int;
  v_n int;
BEGIN
  IF p_active IS NULL OR cardinality(p_active) < 1 OR p_current IS NULL THEN
    RETURN NULL;
  END IF;
  v_n := cardinality(p_active);
  v_idx := array_position(p_active, p_current);
  IF v_idx IS NULL THEN
    RETURN p_active[1];
  END IF;
  RETURN p_active[(v_idx % v_n) + 1];
END;
$$;

REVOKE ALL ON FUNCTION public._ov2_snakes_next_turn_seat(int[], int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._ov2_snakes_next_turn_seat(int[], int) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ov2_snakes_finish_if_ready(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_product_game_id text;
  v_active_session_id uuid;
  v_session_room_id uuid;
  v_session_phase text;
  v_session_winner_seat int;
  v_session_board jsonb;
  v_ws int;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id required');
  END IF;

  PERFORM 1
  FROM public.ov2_rooms r
  WHERE r.id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'No active Snakes session');
  END IF;

  v_room_product_game_id := (
    SELECT r.product_game_id
    FROM public.ov2_rooms r
    WHERE r.id = p_room_id
  );

  v_active_session_id := (
    SELECT r.active_session_id
    FROM public.ov2_rooms r
    WHERE r.id = p_room_id
  );

  IF v_room_product_game_id IS DISTINCT FROM 'ov2_snakes_and_ladders'
     OR v_active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'No active Snakes session');
  END IF;

  PERFORM 1
  FROM public.ov2_snakes_sessions s
  WHERE s.id = v_active_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;

  v_session_room_id := (
    SELECT s.room_id
    FROM public.ov2_snakes_sessions s
    WHERE s.id = v_active_session_id
  );

  IF v_session_room_id IS DISTINCT FROM p_room_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;

  v_session_phase := (
    SELECT s.phase
    FROM public.ov2_snakes_sessions s
    WHERE s.id = v_active_session_id
  );

  IF v_session_phase IS NOT DISTINCT FROM 'finished' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'message', 'Already finished');
  END IF;

  v_session_winner_seat := (
    SELECT s.winner_seat
    FROM public.ov2_snakes_sessions s
    WHERE s.id = v_active_session_id
  );

  v_session_board := (
    SELECT s.board
    FROM public.ov2_snakes_sessions s
    WHERE s.id = v_active_session_id
  );

  v_ws := COALESCE(
    v_session_winner_seat,
    (v_session_board -> 'result' ->> 'winnerSeat')::int,
    NULL
  );

  IF v_ws IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FINISHED', 'message', 'No winner recorded yet');
  END IF;

  UPDATE public.ov2_snakes_sessions
  SET
    phase = 'finished',
    winner_seat = v_ws,
    updated_at = now(),
    revision = revision + 1
  WHERE id = v_active_session_id
    AND phase IS DISTINCT FROM 'finished';

  RETURN jsonb_build_object('ok', true, 'idempotent', false, 'winnerSeat', v_ws);
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_snakes_finish_if_ready(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_snakes_finish_if_ready(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ov2_snakes_roll(
  p_room_id uuid,
  p_participant_key text,
  p_idempotency_key bigint,
  p_expected_revision bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_room_product_game_id text;
  v_active_session_id uuid;

  v_session_room_id uuid;
  v_session_status text;
  v_session_phase text;
  v_session_revision bigint;
  v_session_board jsonb;
  v_session_active int[];

  v_seat int;
  v_turn int;
  v_roll int;
  v_pos int;
  v_edges jsonb;
  v_streak int;
  v_new_streak int;
  v_final int;
  v_active int[];
  v_next int;
  v_ins int;
  v_extra_turn boolean := false;
  v_snapshot jsonb;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 OR p_idempotency_key IS NULL OR p_idempotency_key <= 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_ARGUMENT',
      'message', 'room_id, participant_key, and positive idempotency_key required'
    );
  END IF;

  PERFORM 1
  FROM public.ov2_rooms r
  WHERE r.id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;

  v_room_product_game_id := (
    SELECT r.product_game_id
    FROM public.ov2_rooms r
    WHERE r.id = p_room_id
  );

  v_active_session_id := (
    SELECT r.active_session_id
    FROM public.ov2_rooms r
    WHERE r.id = p_room_id
  );

  IF v_room_product_game_id IS DISTINCT FROM 'ov2_snakes_and_ladders'
     OR v_active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;

  PERFORM 1
  FROM public.ov2_snakes_sessions s
  WHERE s.id = v_active_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;

  v_session_room_id := (
    SELECT s.room_id
    FROM public.ov2_snakes_sessions s
    WHERE s.id = v_active_session_id
  );

  IF v_session_room_id IS DISTINCT FROM p_room_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;

  v_session_status := (
    SELECT s.status
    FROM public.ov2_snakes_sessions s
    WHERE s.id = v_active_session_id
  );

  v_session_phase := (
    SELECT s.phase
    FROM public.ov2_snakes_sessions s
    WHERE s.id = v_active_session_id
  );

  v_session_revision := (
    SELECT s.revision
    FROM public.ov2_snakes_sessions s
    WHERE s.id = v_active_session_id
  );

  v_session_board := (
    SELECT COALESCE(s.board, '{}'::jsonb)
    FROM public.ov2_snakes_sessions s
    WHERE s.id = v_active_session_id
  );

  v_session_active := (
    SELECT COALESCE(s.active_seats, ARRAY[]::int[])
    FROM public.ov2_snakes_sessions s
    WHERE s.id = v_active_session_id
  );

  IF p_expected_revision IS NOT NULL AND v_session_revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'REVISION_MISMATCH',
      'message', 'Revision mismatch',
      'revision', v_session_revision
    );
  END IF;

  IF v_session_status IS DISTINCT FROM 'live' OR v_session_phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_PLAYING', 'message', 'Session not in playing phase');
  END IF;

  INSERT INTO public.ov2_snakes_roll_idempotency (session_id, idempotency_key)
  VALUES (v_active_session_id, p_idempotency_key)
  ON CONFLICT (session_id, idempotency_key) DO NOTHING
  RETURNING 1 INTO v_ins;

  IF v_ins IS NULL THEN
    v_snapshot := (
      SELECT public.ov2_snakes_build_client_snapshot(s, v_pk)
      FROM public.ov2_snakes_sessions s
      WHERE s.id = v_active_session_id
      LIMIT 1
    );
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'snapshot', v_snapshot);
  END IF;

  v_seat := (
    SELECT s.seat_index
    FROM public.ov2_snakes_seats s
    WHERE s.session_id = v_active_session_id
      AND s.participant_key = v_pk
    LIMIT 1
  );

  IF v_seat IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No seat for participant');
  END IF;

  v_turn := (v_session_board ->> 'turnSeat')::int;

  IF v_turn IS DISTINCT FROM v_seat THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_YOUR_TURN', 'message', 'Not your turn to roll');
  END IF;

  v_active := COALESCE(v_session_active, ARRAY[]::int[]);

  IF cardinality(v_active) < 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATE', 'message', 'No active seats');
  END IF;

  v_roll := 1 + floor(random() * 6)::int;
  v_pos := COALESCE(NULLIF((v_session_board -> 'positions' ->> v_turn::text), '')::int, 1);
  v_streak := COALESCE(NULLIF((v_session_board ->> 'consecutiveSixes'), '')::int, 0);
  v_edges := public.ov2_snakes_board_edges();

  IF v_pos + v_roll > 100 THEN
    v_session_board := jsonb_set(v_session_board, '{consecutiveSixes}', '0'::jsonb, true);
    v_session_board := jsonb_set(v_session_board, '{lastRoll}', to_jsonb(v_roll), true);
    v_next := public._ov2_snakes_next_turn_seat(v_active, v_turn);
    v_session_board := jsonb_set(v_session_board, '{turnSeat}', to_jsonb(v_next), true);

    UPDATE public.ov2_snakes_sessions
    SET
      board = v_session_board,
      current_turn = v_next,
      last_roll = v_roll,
      revision = COALESCE(v_session_revision, 0) + 1,
      updated_at = now()
    WHERE id = v_active_session_id;

    v_snapshot := (
      SELECT public.ov2_snakes_build_client_snapshot(s, v_pk)
      FROM public.ov2_snakes_sessions s
      WHERE s.id = v_active_session_id
      LIMIT 1
    );
    RETURN jsonb_build_object('ok', true, 'snapshot', v_snapshot);
  END IF;

  v_new_streak := CASE WHEN v_roll = 6 THEN v_streak + 1 ELSE 0 END;

  IF v_roll = 6 AND v_new_streak >= 3 THEN
    v_session_board := jsonb_set(v_session_board, '{consecutiveSixes}', '0'::jsonb, true);
    v_session_board := jsonb_set(v_session_board, '{lastRoll}', to_jsonb(v_roll), true);
    v_next := public._ov2_snakes_next_turn_seat(v_active, v_turn);
    v_session_board := jsonb_set(v_session_board, '{turnSeat}', to_jsonb(v_next), true);

    UPDATE public.ov2_snakes_sessions
    SET
      board = v_session_board,
      current_turn = v_next,
      last_roll = v_roll,
      revision = COALESCE(v_session_revision, 0) + 1,
      updated_at = now()
    WHERE id = v_active_session_id;

    v_snapshot := (
      SELECT public.ov2_snakes_build_client_snapshot(s, v_pk)
      FROM public.ov2_snakes_sessions s
      WHERE s.id = v_active_session_id
      LIMIT 1
    );
    RETURN jsonb_build_object('ok', true, 'snapshot', v_snapshot);
  END IF;

  v_final := v_pos + v_roll;
  v_final := public._ov2_snakes_apply_edges_once(v_final, v_edges);

  v_session_board := jsonb_set(
    v_session_board,
    '{positions}',
    COALESCE(v_session_board -> 'positions', '{}'::jsonb) || jsonb_build_object(v_turn::text, to_jsonb(v_final)),
    true
  );
  v_session_board := jsonb_set(v_session_board, '{lastRoll}', to_jsonb(v_roll), true);
  v_session_board := jsonb_set(v_session_board, '{consecutiveSixes}', to_jsonb(v_new_streak), true);

  IF v_final = 100 THEN
    v_session_board := jsonb_set(
      v_session_board,
      '{result}',
      jsonb_build_object(
        'winnerSeat', v_turn,
        'kind', 'win',
        'timestamp', (extract(epoch from now()) * 1000)::bigint
      ),
      true
    );

    UPDATE public.ov2_snakes_sessions
    SET
      board = v_session_board,
      winner_seat = v_turn,
      phase = 'finished',
      current_turn = v_turn,
      last_roll = v_roll,
      revision = COALESCE(v_session_revision, 0) + 1,
      updated_at = now()
    WHERE id = v_active_session_id;

    v_snapshot := (
      SELECT public.ov2_snakes_build_client_snapshot(s, v_pk)
      FROM public.ov2_snakes_sessions s
      WHERE s.id = v_active_session_id
      LIMIT 1
    );
    RETURN jsonb_build_object('ok', true, 'snapshot', v_snapshot);
  END IF;

  v_extra_turn := (v_roll = 6);

  IF v_extra_turn THEN
    v_next := v_turn;
  ELSE
    v_next := public._ov2_snakes_next_turn_seat(v_active, v_turn);
  END IF;

  v_session_board := jsonb_set(v_session_board, '{turnSeat}', to_jsonb(v_next), true);

  UPDATE public.ov2_snakes_sessions
  SET
    board = v_session_board,
    current_turn = v_next,
    last_roll = v_roll,
    revision = COALESCE(v_session_revision, 0) + 1,
    updated_at = now()
  WHERE id = v_active_session_id;

  v_snapshot := (
    SELECT public.ov2_snakes_build_client_snapshot(s, v_pk)
    FROM public.ov2_snakes_sessions s
    WHERE s.id = v_active_session_id
    LIMIT 1
  );

  RETURN jsonb_build_object('ok', true, 'snapshot', v_snapshot);
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_snakes_roll(uuid, text, bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_snakes_roll(uuid, text, bigint, bigint) TO anon, authenticated, service_role;

COMMIT;
