-- OV2 Bomber Arena — open_session + authoritative snapshot. Apply after 160.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_bomber_arena_build_client_snapshot(
  p_session_id uuid,
  p_participant_key text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_sid uuid := p_session_id;
  v_room_id uuid;
  v_match_seq int;
  v_revision bigint;
  v_sim_tick bigint;
  v_phase text;
  v_status text;
  v_board jsonb;
  v_turn int;
  v_my_seat int;
  v_winner int;
  v_is_draw boolean;
BEGIN
  IF v_sid IS NULL THEN
    RETURN jsonb_build_object('error', true, 'message', 'session_id required');
  END IF;

  v_room_id := (
    SELECT s.room_id FROM public.ov2_bomber_arena_sessions s WHERE s.id = v_sid LIMIT 1
  );
  v_match_seq := (
    SELECT s.match_seq FROM public.ov2_bomber_arena_sessions s WHERE s.id = v_sid LIMIT 1
  );
  v_revision := (
    SELECT s.revision FROM public.ov2_bomber_arena_sessions s WHERE s.id = v_sid LIMIT 1
  );
  v_sim_tick := (
    SELECT s.sim_tick FROM public.ov2_bomber_arena_sessions s WHERE s.id = v_sid LIMIT 1
  );
  v_phase := (
    SELECT s.phase FROM public.ov2_bomber_arena_sessions s WHERE s.id = v_sid LIMIT 1
  );
  v_status := (
    SELECT s.status FROM public.ov2_bomber_arena_sessions s WHERE s.id = v_sid LIMIT 1
  );
  v_board := (
    SELECT coalesce(s.board, '{}'::jsonb) FROM public.ov2_bomber_arena_sessions s WHERE s.id = v_sid LIMIT 1
  );
  v_turn := coalesce((v_board ->> 'turnSeat')::int, 0);
  v_winner := (
    SELECT s.winner_seat FROM public.ov2_bomber_arena_sessions s WHERE s.id = v_sid LIMIT 1
  );
  v_is_draw := coalesce((
    SELECT s.is_draw FROM public.ov2_bomber_arena_sessions s WHERE s.id = v_sid LIMIT 1
  ), false);

  v_my_seat := NULL;
  IF length(v_pk) > 0 THEN
    v_my_seat := (
      SELECT s.seat_index
      FROM public.ov2_bomber_arena_seats s
      WHERE s.session_id = v_sid AND trim(s.participant_key) = v_pk
      LIMIT 1
    );
  END IF;

  RETURN jsonb_build_object(
    'sessionId', v_sid,
    'roomId', v_room_id,
    'matchSeq', v_match_seq,
    'revision', v_revision,
    'simTick', v_sim_tick,
    'phase', v_phase,
    'status', v_status,
    'turnSeat', v_turn,
    'board', v_board,
    'mySeat', to_jsonb(v_my_seat),
    'winnerSeat', to_jsonb(v_winner),
    'isDraw', v_is_draw,
    'seats', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'seatIndex', s.seat_index,
          'participantKey', trim(s.participant_key),
          'isAlive', s.is_alive
        )
        ORDER BY s.seat_index
      )
      FROM public.ov2_bomber_arena_seats s
      WHERE s.session_id = v_sid
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_bomber_arena_build_client_snapshot(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_bomber_arena_build_client_snapshot(uuid, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ov2_bomber_arena_get_snapshot(p_room_id uuid, p_participant_key text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_product text;
  v_active uuid;
  v_snap jsonb;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id required');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.ov2_rooms r WHERE r.id = p_room_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;

  v_product := (
    SELECT r.product_game_id FROM public.ov2_rooms r WHERE r.id = p_room_id LIMIT 1
  );
  IF v_product IS DISTINCT FROM 'ov2_bomber_arena' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a Bomber Arena room');
  END IF;

  v_active := (
    SELECT r.active_session_id FROM public.ov2_rooms r WHERE r.id = p_room_id LIMIT 1
  );
  IF v_active IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SESSION', 'message', 'No active session');
  END IF;

  v_snap := public.ov2_bomber_arena_build_client_snapshot(v_active, v_pk);
  IF v_snap ? 'error' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'snapshot', v_snap);
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_bomber_arena_get_snapshot(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_bomber_arena_get_snapshot(uuid, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ov2_bomber_arena_open_session(
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
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_room_match_seq int;
  v_product text;
  v_host text;
  v_schema int;
  v_room_status text;
  v_existing uuid;
  v_seated int;
  v_sess_id uuid;
  v_board jsonb;
  v_snap jsonb;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id required');
  END IF;
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'participant_key required');
  END IF;
  IF p_expected_room_match_seq IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'p_expected_room_match_seq required');
  END IF;

  PERFORM 1 FROM public.ov2_rooms r WHERE r.id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;

  v_room_match_seq := (SELECT r.match_seq FROM public.ov2_rooms r WHERE r.id = p_room_id LIMIT 1);
  IF v_room_match_seq IS DISTINCT FROM p_expected_room_match_seq THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'MATCH_SEQ_MISMATCH',
      'message', 'Room match_seq does not match expected value; refresh the room and retry.'
    );
  END IF;

  v_product := (SELECT r.product_game_id FROM public.ov2_rooms r WHERE r.id = p_room_id LIMIT 1);
  IF v_product IS DISTINCT FROM 'ov2_bomber_arena' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a Bomber Arena room');
  END IF;

  v_host := (SELECT r.host_participant_key FROM public.ov2_rooms r WHERE r.id = p_room_id LIMIT 1);
  IF v_host IS DISTINCT FROM v_pk THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_HOST', 'message', 'Only room host can open a session');
  END IF;

  v_schema := (SELECT r.shared_schema_version FROM public.ov2_rooms r WHERE r.id = p_room_id LIMIT 1);
  IF coalesce(v_schema, 0) IS DISTINCT FROM 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Bomber Arena requires shared_schema_version = 1');
  END IF;

  v_room_status := (SELECT r.status FROM public.ov2_rooms r WHERE r.id = p_room_id LIMIT 1);
  IF coalesce(v_room_status, '') IS DISTINCT FROM 'IN_GAME' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'ROOM_NOT_STARTED',
      'message', 'Room must be started before opening a session.'
    );
  END IF;

  v_existing := (
    SELECT s.id
    FROM public.ov2_bomber_arena_sessions s
    WHERE s.room_id = p_room_id
      AND s.status = 'live'
      AND s.phase = 'playing'
    ORDER BY s.created_at DESC
    LIMIT 1
  );

  IF v_existing IS NOT NULL THEN
    UPDATE public.ov2_rooms r
    SET active_session_id = v_existing,
        active_runtime_id = v_existing,
        updated_at = now()
    WHERE r.id = p_room_id
      AND r.active_session_id IS DISTINCT FROM v_existing;

    v_snap := public.ov2_bomber_arena_build_client_snapshot(v_existing, v_pk);
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'snapshot', v_snap);
  END IF;

  v_seated := coalesce((
    SELECT count(*)::int
    FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id
      AND m.seat_index IS NOT NULL
  ), 0);

  IF v_seated IS DISTINCT FROM 2 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'NOT_ENOUGH_PLAYERS',
      'message', 'Bomber Arena MVP requires exactly two seated members.'
    );
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
      'message', 'All seated players must have committed stakes before starting.'
    );
  END IF;

  v_board := public.ov2_bomber_arena_initial_board_json();

  INSERT INTO public.ov2_bomber_arena_sessions (
    room_id,
    match_seq,
    status,
    phase,
    revision,
    sim_tick,
    player_count,
    board,
    winner_seat,
    is_draw,
    active_seats
  ) VALUES (
    p_room_id,
    v_room_match_seq,
    'live',
    'playing',
    0,
    0,
    2,
    v_board,
    NULL,
    false,
    ARRAY[0, 1]::integer[]
  )
  RETURNING id INTO v_sess_id;

  INSERT INTO public.ov2_bomber_arena_seats (session_id, seat_index, participant_key, room_member_id, is_alive, meta)
  SELECT
    v_sess_id,
    m.seat_index,
    m.participant_key,
    m.id,
    true,
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

  v_snap := public.ov2_bomber_arena_build_client_snapshot(v_sess_id, v_pk);
  RETURN jsonb_build_object('ok', true, 'idempotent', false, 'snapshot', v_snap);
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_bomber_arena_open_session(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_bomber_arena_open_session(uuid, text, integer) TO anon, authenticated, service_role;

COMMIT;
