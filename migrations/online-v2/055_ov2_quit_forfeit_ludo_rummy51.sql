-- OV2 quit/forfeit: allow leaving shared + legacy rooms during IN_GAME / active match
-- by applying authoritative game forfeit first, then member leave.
--
-- DRAFT — review before apply. Depends on: 047 (ov2_shared_leave_room), 006 (ov2_leave_room),
-- Ludo migrations (ov2_ludo_sessions / seats), Rummy51 041 (sessions / snapshot builder).
-- Do not execute without approval.

BEGIN;

-- Replace 2-arg overloads (Postgres treats (uuid,text) and (uuid,text,bool) as distinct).
DROP FUNCTION IF EXISTS public.ov2_shared_leave_room(uuid, text);
DROP FUNCTION IF EXISTS public.ov2_leave_room(uuid, text);

-- -----------------------------------------------------------------------------
-- Ludo: voluntary forfeit (same structural outcome as 3-strike elimination in
-- ov2_ludo_mark_missed_turn family — player removed from live session).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ov2_ludo_voluntary_forfeit(
  p_room_id uuid,
  p_participant_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_sess public.ov2_ludo_sessions%ROWTYPE;
  v_board jsonb;
  v_active int[];
  v_seat int;
  v_turn int;
  v_next int;
  v_idx int;
  v_mult int;
  v_entry bigint;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_ludo' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Not a Ludo room');
  END IF;
  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No active session');
  END IF;

  SELECT * INTO v_sess FROM public.ov2_ludo_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_PLAYING', 'message', 'Session not in playing phase');
  END IF;

  SELECT seat_index INTO v_seat
  FROM public.ov2_ludo_seats
  WHERE session_id = v_sess.id AND participant_key = v_pk
  LIMIT 1;

  IF v_seat IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_IN_MATCH', 'message', 'Not seated in this Ludo session');
  END IF;

  v_board := COALESCE(v_sess.board, '{}'::jsonb);
  v_turn := COALESCE((v_board ->> 'turnSeat')::int, v_sess.current_turn);

  DELETE FROM public.ov2_ludo_seats
  WHERE session_id = v_sess.id AND seat_index = v_seat AND participant_key = v_pk;

  v_active := array_remove(COALESCE(v_sess.active_seats, ARRAY[]::int[]), v_seat);
  v_board := jsonb_set(v_board, '{activeSeats}', to_jsonb(v_active), true);
  v_board := (v_board #- ARRAY['pieces', v_seat::text]) #- ARRAY['finished', v_seat::text];

  IF cardinality(v_active) <= 1 THEN
    IF cardinality(v_active) = 1 THEN
      v_board := jsonb_set(v_board, '{winner}', to_jsonb(v_active[1]), true);
    END IF;
    v_mult := COALESCE((v_sess.parity_state -> '__double__' ->> 'value')::int, 1);
    v_entry := COALESCE((v_sess.parity_state ->> '__entry__')::bigint, 0);
    v_sess.parity_state := jsonb_set(
      COALESCE(v_sess.parity_state, '{}'::jsonb),
      '{__result__}',
      jsonb_build_object(
        'winner', CASE WHEN cardinality(v_active) = 1 THEN v_active[1] ELSE NULL END,
        'forfeit_by', v_pk,
        'multiplier', v_mult,
        'prize', (v_entry * 1 * v_mult),
        'timestamp', (extract(epoch from now()) * 1000)::bigint
      ),
      true
    );
    UPDATE public.ov2_ludo_sessions
    SET
      board = v_board,
      active_seats = v_active,
      phase = 'finished',
      current_turn = NULL,
      turn_deadline = NULL,
      parity_state = v_sess.parity_state,
      revision = revision + 1,
      updated_at = now()
    WHERE id = v_sess.id
    RETURNING * INTO v_sess;

    RETURN jsonb_build_object('ok', true, 'finished', true, 'snapshot', public.ov2_ludo_build_client_snapshot(v_sess, v_pk));
  END IF;

  IF cardinality(v_active) > 0 THEN
    v_idx := array_position(v_active, v_turn);
    IF v_idx IS NULL THEN
      v_next := v_active[1];
    ELSE
      v_next := v_active[(v_idx % cardinality(v_active)) + 1];
    END IF;
  ELSE
    v_next := NULL;
  END IF;

  v_board := jsonb_set(
    jsonb_set(v_board, '{turnSeat}', CASE WHEN v_next IS NULL THEN 'null'::jsonb ELSE to_jsonb(v_next) END, true),
    '{dice}',
    'null'::jsonb,
    true
  );
  v_board := jsonb_set(v_board, '{lastDice}', 'null'::jsonb, true);

  UPDATE public.ov2_ludo_sessions
  SET
    board = v_board,
    active_seats = v_active,
    current_turn = v_next,
    turn_deadline = CASE
      WHEN v_next IS NULL THEN NULL
      ELSE now() + make_interval(secs => GREATEST(5, COALESCE(NULLIF(current_setting('app.ludo_turn_seconds', true), '')::int, 30)))
    END,
    revision = revision + 1,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  RETURN jsonb_build_object('ok', true, 'finished', false, 'snapshot', public.ov2_ludo_build_client_snapshot(v_sess, v_pk));
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_ludo_voluntary_forfeit(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_ludo_voluntary_forfeit(uuid, text) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Rummy51: voluntary forfeit — eliminate quitter with full hand penalty, advance turn.
-- (Narrow but consistent with round-loss scoring in ov2_rummy51_submit_turn.)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ov2_rummy51_voluntary_forfeit(
  p_room_id uuid,
  p_participant_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_sess public.ov2_rummy51_sessions%ROWTYPE;
  v_hand jsonb;
  v_penalty int;
  v_j int;
  v_c jsonb;
  v_ps jsonb;
  v_score int;
  v_active_left int;
  v_pk2 text;
  v_as jsonb;
  v_new_as jsonb := '[]'::jsonb;
  v_i int;
  v_ns int;
  v_turn_next text;
  v_found_turn_idx int := -1;
  v_k text;
  v_tm jsonb;
  v_mi int;
  v_meld jsonb;
  v_keep_melds jsonb := '[]'::jsonb;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_rummy51' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Not a Rummy51 room');
  END IF;
  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SESSION', 'message', 'No active session');
  END IF;

  SELECT * INTO v_sess FROM public.ov2_rummy51_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_PLAYING', 'message', 'Not playing');
  END IF;

  IF coalesce((v_sess.player_state -> v_pk ->> 'isEliminated')::boolean, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_ELIMINATED', 'message', 'Already eliminated');
  END IF;

  v_hand := coalesce(v_sess.hands -> v_pk, '[]'::jsonb);
  v_ps := v_sess.player_state;

  IF NOT coalesce((v_ps -> v_pk ->> 'hasOpenedThisHand')::boolean, false) THEN
    v_penalty := 100;
  ELSE
    v_penalty := 0;
    FOR v_j IN 0..GREATEST(coalesce(jsonb_array_length(v_hand), 0) - 1, -1) LOOP
      v_c := v_hand -> v_j;
      v_penalty := v_penalty + public._ov2_r51_hand_penalty_card(v_c);
    END LOOP;
  END IF;

  v_score := coalesce((v_ps -> v_pk ->> 'scoreTotal')::int, 0) + v_penalty;
  v_ps := jsonb_set(v_ps, ARRAY[v_pk, 'scoreTotal'], to_jsonb(v_score), true);
  v_ps := jsonb_set(v_ps, ARRAY[v_pk, 'roundPenalty'], to_jsonb(v_penalty), true);
  v_ps := jsonb_set(v_ps, ARRAY[v_pk, 'isEliminated'], to_jsonb(true), true);

  v_sess.hands := jsonb_set(coalesce(v_sess.hands, '{}'::jsonb), ARRAY[v_pk], '[]'::jsonb, true);

  v_as := coalesce(v_sess.active_seats, '[]'::jsonb);
  v_ns := coalesce(jsonb_array_length(v_as), 0);
  FOR v_i IN 0..GREATEST(v_ns - 1, -1) LOOP
    IF (v_as -> v_i ->> 'participantKey') IS DISTINCT FROM v_pk THEN
      v_new_as := v_new_as || jsonb_build_array(v_as -> v_i);
    END IF;
  END LOOP;
  v_sess.active_seats := v_new_as;

  v_tm := coalesce(v_sess.table_melds, '[]'::jsonb);
  FOR v_mi IN 0..GREATEST(coalesce(jsonb_array_length(v_tm), 0) - 1, -1) LOOP
    v_meld := v_tm -> v_mi;
    IF (v_meld ->> 'ownerParticipantKey') IS DISTINCT FROM v_pk THEN
      v_keep_melds := v_keep_melds || jsonb_build_array(v_meld);
    END IF;
  END LOOP;
  v_sess.table_melds := v_keep_melds;

  IF v_sess.turn_participant_key IS NOT DISTINCT FROM v_pk THEN
    v_sess.pending_draw_source := NULL;
    v_sess.taken_discard_card_id := NULL;
    v_ns := coalesce(jsonb_array_length(v_new_as), 0);
    IF v_ns <= 0 THEN
      v_turn_next := NULL;
    ELSE
      v_found_turn_idx := -1;
      FOR v_i IN 0..GREATEST(jsonb_array_length(v_as) - 1, -1) LOOP
        IF (v_as -> v_i ->> 'participantKey') IS NOT DISTINCT FROM v_pk THEN
          v_found_turn_idx := v_i;
          EXIT;
        END IF;
      END LOOP;
      IF v_found_turn_idx < 0 THEN
        v_turn_next := v_new_as -> 0 ->> 'participantKey';
      ELSE
        FOR v_i IN 1..GREATEST(coalesce(jsonb_array_length(v_as), 0), 1) LOOP
          v_k := v_as -> ((v_found_turn_idx + v_i) % GREATEST(coalesce(jsonb_array_length(v_as), 1), 1)) ->> 'participantKey';
          IF v_k IS NOT NULL
             AND NOT coalesce((v_ps -> v_k ->> 'isEliminated')::boolean, false) THEN
            v_turn_next := v_k;
            EXIT;
          END IF;
        END LOOP;
        IF v_turn_next IS NULL THEN
          v_turn_next := v_new_as -> 0 ->> 'participantKey';
        END IF;
      END IF;
    END IF;
    v_sess.turn_participant_key := coalesce(v_turn_next, v_sess.turn_participant_key);
  END IF;

  v_sess.player_state := v_ps;
  v_sess.revision := v_sess.revision + 1;

  v_active_left := 0;
  FOR v_pk2 IN SELECT jsonb_object_keys(v_sess.player_state) LOOP
    IF NOT coalesce((v_sess.player_state -> v_pk2 ->> 'isEliminated')::boolean, false) THEN
      v_active_left := v_active_left + 1;
    END IF;
  END LOOP;

  IF v_active_left <= 1 THEN
    v_sess.phase := 'finished';
    v_sess.finished_at := now();
    SELECT jj INTO v_sess.winner_participant_key
    FROM (SELECT jsonb_object_keys(v_sess.player_state) AS jj) z
    WHERE NOT coalesce((v_sess.player_state -> z.jj ->> 'isEliminated')::boolean, false)
    LIMIT 1;
    v_sess.winner_name := coalesce(
      nullif(trim(v_sess.player_state -> v_sess.winner_participant_key ->> 'displayName'), ''),
      v_sess.winner_participant_key
    );
  END IF;

  UPDATE public.ov2_rummy51_sessions
  SET
    hands = v_sess.hands,
    active_seats = v_sess.active_seats,
    table_melds = v_sess.table_melds,
    player_state = v_sess.player_state,
    turn_participant_key = v_sess.turn_participant_key,
    pending_draw_source = v_sess.pending_draw_source,
    taken_discard_card_id = v_sess.taken_discard_card_id,
    phase = v_sess.phase,
    finished_at = v_sess.finished_at,
    winner_participant_key = v_sess.winner_participant_key,
    winner_name = v_sess.winner_name,
    revision = v_sess.revision,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;

  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_rummy51_build_snapshot(v_room, v_sess));
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_rummy51_voluntary_forfeit(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_rummy51_voluntary_forfeit(uuid, text) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Shared leave: optional forfeit when IN_GAME (must be applied before member leave).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ov2_shared_leave_room(
  p_room_id uuid,
  p_participant_key text,
  p_forfeit_game boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_cnt int;
  v_new_host uuid;
  v_room_id uuid := p_room_id;
  v_in_ludo_match boolean := false;
  v_in_r51_match boolean := false;
  v_ff jsonb;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key are required.');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.shared_schema_version IS DISTINCT FROM 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found.');
  END IF;

  IF v_room.status NOT IN ('OPEN', 'STARTING', 'IN_GAME') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATE', 'message', 'Cannot leave in this room state.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND m.participant_key = v_pk
      AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'You are not in this room.');
  END IF;

  IF v_room.status = 'IN_GAME' THEN
    v_in_ludo_match := v_room.product_game_id IS NOT DISTINCT FROM 'ov2_ludo'
      AND v_room.active_session_id IS NOT NULL
      AND coalesce((SELECT phase FROM public.ov2_ludo_sessions WHERE id = v_room.active_session_id), '') = 'playing'
      AND EXISTS (
        SELECT 1 FROM public.ov2_ludo_seats ls
        WHERE ls.session_id = v_room.active_session_id AND ls.participant_key = v_pk
      );
    v_in_r51_match := v_room.product_game_id IS NOT DISTINCT FROM 'ov2_rummy51'
      AND v_room.active_session_id IS NOT NULL
      AND coalesce((SELECT phase FROM public.ov2_rummy51_sessions WHERE id = v_room.active_session_id), '') = 'playing'
      AND coalesce(
        (SELECT (player_state -> v_pk ->> 'isEliminated')::boolean FROM public.ov2_rummy51_sessions WHERE id = v_room.active_session_id),
        false
      ) IS NOT TRUE;

    IF v_in_ludo_match OR v_in_r51_match THEN
      IF NOT COALESCE(p_forfeit_game, false) THEN
        RETURN jsonb_build_object(
          'ok', false,
          'code', 'MUST_FORFEIT',
          'message', 'Leave during an active match requires forfeit. Call again with p_forfeit_game := true.'
        );
      END IF;
      IF v_in_ludo_match THEN
        v_ff := public.ov2_ludo_voluntary_forfeit(p_room_id, v_pk);
        IF coalesce((v_ff ->> 'ok')::boolean, false) IS NOT TRUE THEN
          RETURN v_ff;
        END IF;
      ELSIF v_in_r51_match THEN
        v_ff := public.ov2_rummy51_voluntary_forfeit(p_room_id, v_pk);
        IF coalesce((v_ff ->> 'ok')::boolean, false) IS NOT TRUE THEN
          RETURN v_ff;
        END IF;
      END IF;
      SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
    END IF;
  END IF;

  UPDATE public.ov2_room_members
  SET
    seat_index = NULL,
    member_state = 'left',
    left_at = now(),
    updated_at = now()
  WHERE room_id = p_room_id AND participant_key = v_pk;

  SELECT count(*)::int INTO v_cnt
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id
    AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected');

  IF v_cnt <= 0 THEN
    UPDATE public.ov2_rooms
    SET
      status = 'CLOSED',
      lifecycle_phase = 'closed',
      closed_reason = 'empty',
      ended_at = now(),
      updated_at = now()
    WHERE id = p_room_id
    RETURNING * INTO v_room;

    PERFORM public.ov2_shared_touch_room_activity(p_room_id);

    RETURN jsonb_build_object(
      'ok', true,
      'closed', true,
      'room', public.ov2_shared_room_to_public_jsonb(v_room),
      'members', '[]'::jsonb
    );
  END IF;

  IF v_room.host_participant_key IS NOT DISTINCT FROM v_pk THEN
    SELECT m.id INTO v_new_host
    FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id
      AND m.participant_key IS DISTINCT FROM v_pk
      AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected')
    ORDER BY m.joined_at ASC NULLS LAST, m.id ASC
    LIMIT 1;

    IF v_new_host IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATE', 'message', 'Could not transfer host.');
    END IF;

    UPDATE public.ov2_room_members
    SET role = 'member'
    WHERE room_id = p_room_id
      AND COALESCE(member_state, 'joined') IN ('joined', 'disconnected');

    UPDATE public.ov2_room_members SET role = 'host' WHERE id = v_new_host;

    UPDATE public.ov2_rooms r
    SET
      host_member_id = v_new_host,
      host_participant_key = (SELECT participant_key FROM public.ov2_room_members WHERE id = v_new_host),
      updated_at = now()
    WHERE r.id = p_room_id
    RETURNING * INTO v_room;
  ELSE
    SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
  END IF;

  PERFORM public.ov2_shared_touch_room_activity(p_room_id);

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'ok', true,
    'closed', false,
    'room', public.ov2_shared_room_to_public_jsonb(v_room),
    'members', public.ov2_shared_members_to_public_jsonb(p_room_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_shared_leave_room(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_shared_leave_room(uuid, text, boolean) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.ov2_shared_leave_room(uuid, text, boolean) IS
  'OV2 shared: leave room. When IN_GAME and seated in an active Ludo/Rummy51 match, pass p_forfeit_game=true to forfeit first.';

-- -----------------------------------------------------------------------------
-- Legacy leave: same contract for non-shared rows (lifecycle active / open session).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ov2_leave_room(
  p_room_id uuid,
  p_participant_key text,
  p_forfeit_game boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text;
  v_cnt int;
  v_new_host text;
  v_remaining int;
  v_in_ludo_match boolean := false;
  v_in_r51_match boolean := false;
  v_ff jsonb;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found.');
  END IF;

  v_pk := trim(COALESCE(p_participant_key, ''));
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Participant is required.');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found.');
  END IF;

  IF v_room.lifecycle_phase NOT IN ('lobby', 'pending_start', 'pending_stakes', 'active') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_STATE',
      'message', 'You cannot leave in this room phase.'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ov2_room_members WHERE room_id = p_room_id AND participant_key = v_pk
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'NOT_MEMBER',
      'message', 'You are not in this room.'
    );
  END IF;

  IF v_room.lifecycle_phase = 'active' AND v_room.shared_schema_version IS DISTINCT FROM 1 THEN
    v_in_ludo_match := v_room.product_game_id IS NOT DISTINCT FROM 'ov2_ludo'
      AND v_room.active_session_id IS NOT NULL
      AND coalesce((SELECT phase FROM public.ov2_ludo_sessions WHERE id = v_room.active_session_id), '') = 'playing'
      AND EXISTS (
        SELECT 1 FROM public.ov2_ludo_seats ls
        WHERE ls.session_id = v_room.active_session_id AND ls.participant_key = v_pk
      );
    v_in_r51_match := v_room.product_game_id IS NOT DISTINCT FROM 'ov2_rummy51'
      AND v_room.active_session_id IS NOT NULL
      AND coalesce((SELECT phase FROM public.ov2_rummy51_sessions WHERE id = v_room.active_session_id), '') = 'playing'
      AND coalesce(
        (SELECT (player_state -> v_pk ->> 'isEliminated')::boolean FROM public.ov2_rummy51_sessions WHERE id = v_room.active_session_id),
        false
      ) IS NOT TRUE;

    IF v_in_ludo_match OR v_in_r51_match THEN
      IF NOT COALESCE(p_forfeit_game, false) THEN
        RETURN jsonb_build_object(
          'ok', false,
          'code', 'MUST_FORFEIT',
          'message', 'Leave during an active match requires forfeit. Call again with p_forfeit_game := true.'
        );
      END IF;
      IF v_in_ludo_match THEN
        v_ff := public.ov2_ludo_voluntary_forfeit(p_room_id, v_pk);
        IF coalesce((v_ff ->> 'ok')::boolean, false) IS NOT TRUE THEN
          RETURN v_ff;
        END IF;
      ELSIF v_in_r51_match THEN
        v_ff := public.ov2_rummy51_voluntary_forfeit(p_room_id, v_pk);
        IF coalesce((v_ff ->> 'ok')::boolean, false) IS NOT TRUE THEN
          RETURN v_ff;
        END IF;
      END IF;
      SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
    END IF;
  END IF;

  SELECT count(*)::int INTO v_cnt FROM public.ov2_room_members WHERE room_id = p_room_id;

  IF v_cnt <= 1 THEN
    DELETE FROM public.ov2_room_members WHERE room_id = p_room_id AND participant_key = v_pk;
    UPDATE public.ov2_rooms
    SET
      lifecycle_phase = 'closed',
      closed_reason = 'empty',
      updated_at = now()
    WHERE id = p_room_id
    RETURNING * INTO v_room;

    RETURN jsonb_build_object(
      'ok', true,
      'closed', true,
      'room', public.ov2_room_to_public_jsonb(v_room),
      'members', '[]'::jsonb
    );
  END IF;

  IF v_room.host_participant_key IS NOT DISTINCT FROM v_pk THEN
    SELECT m.participant_key INTO v_new_host
    FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND m.participant_key IS DISTINCT FROM v_pk
    ORDER BY m.created_at ASC NULLS LAST, m.participant_key ASC
    LIMIT 1;

    IF v_new_host IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATE', 'message', 'Could not transfer host.');
    END IF;

    UPDATE public.ov2_rooms
    SET host_participant_key = v_new_host, updated_at = now()
    WHERE id = p_room_id;
  END IF;

  DELETE FROM public.ov2_room_members WHERE room_id = p_room_id AND participant_key = v_pk;

  GET DIAGNOSTICS v_remaining = ROW_COUNT;
  IF v_remaining = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'You are not in this room.');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'ok', true,
    'closed', false,
    'room', public.ov2_room_to_public_jsonb(v_room),
    'members', public.ov2_members_to_public_jsonb(p_room_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_leave_room(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_leave_room(uuid, text, boolean) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.ov2_leave_room(uuid, text, boolean) IS
  'OV2 legacy: leave room. When lifecycle active and in Ludo/Rummy51 match, pass p_forfeit_game=true.';

COMMIT;
