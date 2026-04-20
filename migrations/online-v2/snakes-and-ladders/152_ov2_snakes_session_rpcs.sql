-- OV2 Snakes & Ladders: open_session + get_snapshot + client snapshot. Apply after 151.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_snakes_build_client_snapshot(
  p_session public.ov2_snakes_sessions,
  p_participant_key text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_my_seat int;
  v_board jsonb;
  v_turn int;
  v_phase text;
  v_finished boolean;
  v_can_roll boolean := false;
  v_last int;
BEGIN
  v_board := COALESCE(p_session.board, '{}'::jsonb);
  v_turn := (v_board ->> 'turnSeat')::int;
  v_phase := COALESCE(p_session.phase, 'playing');
  v_finished := (v_phase = 'finished');

  IF length(v_pk) > 0 THEN
    v_my_seat := (
      SELECT s.seat_index
      FROM public.ov2_snakes_seats s
      WHERE s.session_id = p_session.id AND s.participant_key = v_pk
      LIMIT 1
    );
  END IF;

  v_last := NULL;
  IF v_board ? 'lastRoll' AND jsonb_typeof(v_board -> 'lastRoll') <> 'null' THEN
    v_last := (v_board ->> 'lastRoll')::int;
  END IF;

  IF p_session.status = 'live' AND NOT v_finished AND v_my_seat IS NOT NULL
     AND v_turn IS NOT DISTINCT FROM v_my_seat
  THEN
    v_can_roll := true;
  END IF;

  RETURN jsonb_build_object(
    'sessionId', p_session.id,
    'roomId', p_session.room_id,
    'matchSeq', p_session.match_seq,
    'revision', p_session.revision,
    'phase', v_phase,
    'status', p_session.status,
    'turnSeat', v_turn,
    'activeSeats', to_jsonb(COALESCE(p_session.active_seats, ARRAY[]::int[])),
    'currentTurn', p_session.current_turn,
    'board', v_board,
    'mySeat', to_jsonb(v_my_seat),
    'winnerSeat', p_session.winner_seat,
    'lastRoll', to_jsonb(v_last),
    'canRoll', v_can_roll,
    'result', v_board -> 'result'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_snakes_build_client_snapshot(public.ov2_snakes_sessions, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_snakes_build_client_snapshot(public.ov2_snakes_sessions, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ov2_snakes_get_snapshot(p_room_id uuid, p_participant_key text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_room_exists boolean;
  v_room_product_game_id text;
  v_active_session_id uuid;
  v_snapshot jsonb;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id required');
  END IF;

  v_room_exists := EXISTS (
    SELECT 1
    FROM public.ov2_rooms r
    WHERE r.id = p_room_id
  );
  IF NOT v_room_exists THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;

  v_room_product_game_id := (
    SELECT r.product_game_id
    FROM public.ov2_rooms r
    WHERE r.id = p_room_id
  );
  IF v_room_product_game_id IS DISTINCT FROM 'ov2_snakes_and_ladders' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a Snakes & Ladders room');
  END IF;

  v_active_session_id := (
    SELECT r.active_session_id
    FROM public.ov2_rooms r
    WHERE r.id = p_room_id
  );
  IF v_active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SESSION', 'message', 'No active session');
  END IF;

  v_snapshot := (
    SELECT public.ov2_snakes_build_client_snapshot(s, v_pk)
    FROM public.ov2_snakes_sessions s
    WHERE s.id = v_active_session_id
      AND s.room_id = p_room_id
    LIMIT 1
  );
  IF v_snapshot IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'snapshot', v_snapshot);
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_snakes_get_snapshot(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_snakes_get_snapshot(uuid, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ov2_snakes_open_session(
  p_room_id uuid,
  p_participant_key text,
  p_expected_room_match_seq integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pk text;
  v_room_exists boolean;
  v_room_match_seq integer;
  v_room_product_game_id text;
  v_room_host_participant_key text;
  v_room_shared_schema_version integer;
  v_room_status text;
  v_existing_session_id uuid;
  v_seated_count int;
  v_active int[];
  v_board jsonb;
  v_sess_id uuid;
  v_snapshot jsonb;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id required');
  END IF;

  v_pk := trim(COALESCE(p_participant_key, ''));
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'participant_key required');
  END IF;

  IF p_expected_room_match_seq IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'p_expected_room_match_seq required');
  END IF;

  PERFORM 1
  FROM public.ov2_rooms r
  WHERE r.id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;

  v_room_exists := true;

  v_room_match_seq := (
    SELECT r.match_seq
    FROM public.ov2_rooms r
    WHERE r.id = p_room_id
  );

  IF v_room_match_seq IS DISTINCT FROM p_expected_room_match_seq THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'MATCH_SEQ_MISMATCH',
      'message', 'Room match_seq does not match expected value; refresh the room and retry.'
    );
  END IF;

  v_room_product_game_id := (
    SELECT r.product_game_id
    FROM public.ov2_rooms r
    WHERE r.id = p_room_id
  );

  IF v_room_product_game_id IS DISTINCT FROM 'ov2_snakes_and_ladders' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a Snakes & Ladders room');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id
      AND m.participant_key = v_pk
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Only room members can open a session');
  END IF;

  v_room_host_participant_key := (
    SELECT r.host_participant_key
    FROM public.ov2_rooms r
    WHERE r.id = p_room_id
  );

  IF v_room_host_participant_key IS DISTINCT FROM v_pk THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_HOST', 'message', 'Only room host can open a session');
  END IF;

  v_room_shared_schema_version := (
    SELECT r.shared_schema_version
    FROM public.ov2_rooms r
    WHERE r.id = p_room_id
  );

  IF COALESCE(v_room_shared_schema_version, 0) IS DISTINCT FROM 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Snakes requires shared_schema_version = 1');
  END IF;

  v_room_status := (
    SELECT r.status
    FROM public.ov2_rooms r
    WHERE r.id = p_room_id
  );

  IF COALESCE(v_room_status, '') IS DISTINCT FROM 'IN_GAME' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'ROOM_NOT_STARTED',
      'message', 'Room must be started before opening a session.'
    );
  END IF;

  v_existing_session_id := (
    SELECT s.id
    FROM public.ov2_snakes_sessions s
    WHERE s.room_id = p_room_id
      AND s.status = 'live'
      AND s.phase = 'playing'
    ORDER BY s.created_at DESC
    LIMIT 1
  );

  IF v_existing_session_id IS NOT NULL THEN
    UPDATE public.ov2_rooms r
    SET active_session_id = v_existing_session_id,
        active_runtime_id = v_existing_session_id,
        updated_at = now()
    WHERE r.id = p_room_id
      AND r.active_session_id IS DISTINCT FROM v_existing_session_id;

    v_snapshot := (
      SELECT public.ov2_snakes_build_client_snapshot(s, v_pk)
      FROM public.ov2_snakes_sessions s
      WHERE s.id = v_existing_session_id
      LIMIT 1
    );

    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'snapshot', v_snapshot
    );
  END IF;

  v_seated_count := COALESCE((
    SELECT count(*)::int
    FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id
      AND m.seat_index IS NOT NULL
  ), 0);

  IF v_seated_count < 2 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_ENOUGH_PLAYERS', 'message', 'Need at least two seated members');
  END IF;

  IF v_seated_count > 4 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TOO_MANY_PLAYERS', 'message', 'Snakes & Ladders supports at most four seated members');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id
      AND m.seat_index IS NOT NULL
      AND m.wallet_state IS DISTINCT FROM 'committed'
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'STAKES_NOT_COMMITTED',
      'message', 'All seated players must have committed stakes before starting'
    );
  END IF;

  v_active := ARRAY(
    SELECT m.seat_index
    FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id
      AND m.seat_index IS NOT NULL
    ORDER BY m.seat_index ASC
  );

  IF v_active IS NULL OR cardinality(v_active) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_ENOUGH_PLAYERS', 'message', 'Need at least two seated members');
  END IF;

  v_board := public.ov2_snakes_initial_board_json(v_active);

  INSERT INTO public.ov2_snakes_sessions (
    room_id,
    match_seq,
    status,
    phase,
    revision,
    board,
    winner_seat,
    active_seats,
    current_turn,
    last_roll
  ) VALUES (
    p_room_id,
    v_room_match_seq,
    'live',
    'playing',
    0,
    v_board,
    NULL,
    v_active,
    (v_board ->> 'turnSeat')::int,
    NULL
  )
  RETURNING id INTO v_sess_id;

  INSERT INTO public.ov2_snakes_seats (session_id, seat_index, participant_key, room_member_id, meta)
  SELECT
    v_sess_id,
    m.seat_index,
    m.participant_key,
    m.id,
    '{}'::jsonb
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id
    AND m.seat_index IS NOT NULL
  ORDER BY m.seat_index ASC;

  UPDATE public.ov2_rooms
  SET active_session_id = v_sess_id,
      active_runtime_id = v_sess_id,
      updated_at = now()
  WHERE id = p_room_id;

  v_snapshot := (
    SELECT public.ov2_snakes_build_client_snapshot(s, v_pk)
    FROM public.ov2_snakes_sessions s
    WHERE s.id = v_sess_id
    LIMIT 1
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'snapshot', v_snapshot
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_snakes_open_session(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_snakes_open_session(uuid, text, integer) TO anon, authenticated, service_role;

COMMIT;
