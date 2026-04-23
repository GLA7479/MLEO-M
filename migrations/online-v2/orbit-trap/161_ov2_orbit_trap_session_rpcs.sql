-- OV2 Orbit Trap: RPCs (open_session, get_snapshot, apply_action, leave_game).
-- Apply after orbit-trap/160_ov2_orbit_trap_engine.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_orbit_trap_build_client_snapshot(
  p_session public.ov2_orbit_trap_sessions,
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
  v_state jsonb;
  v_phase text;
BEGIN
  v_state := COALESCE(p_session.state, '{}'::jsonb);
  v_phase := COALESCE(p_session.phase, 'playing');

  IF length(v_pk) > 0 THEN
    v_my_seat := (
      SELECT s.seat_index
      FROM public.ov2_orbit_trap_seats s
      WHERE s.session_id = p_session.id
        AND s.participant_key = v_pk
      LIMIT 1
    );
  END IF;

  RETURN jsonb_build_object(
    'sessionId', p_session.id,
    'roomId', p_session.room_id,
    'matchSeq', p_session.match_seq,
    'revision', p_session.revision,
    'phase', v_phase,
    'status', p_session.status,
    'state', v_state,
    'mySeat', to_jsonb(v_my_seat),
    'winnerSeat', p_session.winner_seat,
    'activeSeats', to_jsonb(COALESCE(p_session.active_seats, ARRAY[]::int[]))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_orbit_trap_build_client_snapshot(public.ov2_orbit_trap_sessions, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_orbit_trap_build_client_snapshot(public.ov2_orbit_trap_sessions, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ov2_orbit_trap_get_snapshot(p_room_id uuid, p_participant_key text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_room_product text;
  v_active uuid;
  v_snap jsonb;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id required');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.ov2_rooms r WHERE r.id = p_room_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;

  v_room_product := (
    SELECT r.product_game_id FROM public.ov2_rooms r WHERE r.id = p_room_id
  );
  IF v_room_product IS DISTINCT FROM 'ov2_orbit_trap' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not an Orbit Trap room');
  END IF;

  v_active := (
    SELECT r.active_session_id FROM public.ov2_rooms r WHERE r.id = p_room_id
  );
  IF v_active IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SESSION', 'message', 'No active session');
  END IF;

  v_snap := (
    SELECT public.ov2_orbit_trap_build_client_snapshot(s, v_pk)
    FROM public.ov2_orbit_trap_sessions s
    WHERE s.id = v_active
      AND s.room_id = p_room_id
    LIMIT 1
  );
  IF v_snap IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'snapshot', v_snap);
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_orbit_trap_get_snapshot(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_orbit_trap_get_snapshot(uuid, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ov2_orbit_trap_open_session(
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
  v_room_product text;
  v_host_pk text;
  v_room_ssv int;
  v_room_status text;
  v_existing uuid;
  v_seated_count int;
  v_active int[];
  v_sess_id uuid;
  v_snap jsonb;
  v_init jsonb;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;
  IF p_expected_room_match_seq IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'p_expected_room_match_seq required');
  END IF;

  PERFORM 1 FROM public.ov2_rooms r WHERE r.id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;

  v_room_match_seq := (SELECT r.match_seq FROM public.ov2_rooms r WHERE r.id = p_room_id);
  IF v_room_match_seq IS DISTINCT FROM p_expected_room_match_seq THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'MATCH_SEQ_MISMATCH',
      'message', 'Room match_seq does not match expected value; refresh the room and retry.'
    );
  END IF;

  v_room_product := (SELECT r.product_game_id FROM public.ov2_rooms r WHERE r.id = p_room_id);
  IF v_room_product IS DISTINCT FROM 'ov2_orbit_trap' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not an Orbit Trap room');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND m.participant_key = v_pk
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Only room members can open a session');
  END IF;

  v_host_pk := (SELECT r.host_participant_key FROM public.ov2_rooms r WHERE r.id = p_room_id);
  IF v_host_pk IS DISTINCT FROM v_pk THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_HOST', 'message', 'Only room host can open a session');
  END IF;

  v_room_ssv := (SELECT r.shared_schema_version FROM public.ov2_rooms r WHERE r.id = p_room_id);
  IF COALESCE(v_room_ssv, 0) IS DISTINCT FROM 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Orbit Trap requires shared_schema_version = 1');
  END IF;

  v_room_status := (SELECT r.status FROM public.ov2_rooms r WHERE r.id = p_room_id);
  IF COALESCE(v_room_status, '') IS DISTINCT FROM 'IN_GAME' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'ROOM_NOT_STARTED',
      'message', 'Room must be started before opening a session.'
    );
  END IF;

  v_existing := (
    SELECT s.id
    FROM public.ov2_orbit_trap_sessions s
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

    v_snap := (
      SELECT public.ov2_orbit_trap_build_client_snapshot(s, v_pk)
      FROM public.ov2_orbit_trap_sessions s
      WHERE s.id = v_existing
      LIMIT 1
    );
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'snapshot', v_snap);
  END IF;

  v_seated_count := COALESCE((
    SELECT count(*)::int FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL
  ), 0);

  IF v_seated_count < 2 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_ENOUGH_PLAYERS', 'message', 'Need at least two seated members');
  END IF;
  IF v_seated_count > 4 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TOO_MANY_PLAYERS', 'message', 'Orbit Trap supports at most four seated members');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ov2_room_members m
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
    WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL
    ORDER BY m.seat_index ASC
  );

  v_init := public._ot_initial_state_jsonb();

  INSERT INTO public.ov2_orbit_trap_sessions (
    room_id,
    match_seq,
    status,
    phase,
    revision,
    state,
    winner_seat,
    active_seats
  ) VALUES (
    p_room_id,
    v_room_match_seq,
    'live',
    'playing',
    0,
    v_init,
    NULL,
    v_active
  )
  RETURNING id INTO v_sess_id;

  INSERT INTO public.ov2_orbit_trap_seats (session_id, seat_index, participant_key, room_member_id, meta)
  SELECT
    v_sess_id,
    m.seat_index,
    m.participant_key,
    m.id,
    '{}'::jsonb
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL
  ORDER BY m.seat_index ASC;

  UPDATE public.ov2_rooms
  SET active_session_id = v_sess_id,
      active_runtime_id = v_sess_id,
      updated_at = now()
  WHERE id = p_room_id;

  v_snap := (
    SELECT public.ov2_orbit_trap_build_client_snapshot(s, v_pk)
    FROM public.ov2_orbit_trap_sessions s
    WHERE s.id = v_sess_id
    LIMIT 1
  );

  RETURN jsonb_build_object('ok', true, 'idempotent', false, 'snapshot', v_snap);
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_orbit_trap_open_session(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_orbit_trap_open_session(uuid, text, integer) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ov2_orbit_trap_apply_action(
  p_room_id uuid,
  p_participant_key text,
  p_action jsonb,
  p_expected_revision bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_room_product text;
  v_sess_id uuid;
  v_seat int;
  v_rev bigint;
  v_state jsonb;
  v_out jsonb;
  v_new_state jsonb;
  v_new_rev bigint;
  v_snap jsonb;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 OR p_action IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id, participant_key, and action required');
  END IF;

  PERFORM 1 FROM public.ov2_rooms r WHERE r.id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;

  v_room_product := (SELECT r.product_game_id FROM public.ov2_rooms r WHERE r.id = p_room_id);
  IF v_room_product IS DISTINCT FROM 'ov2_orbit_trap' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not an Orbit Trap room');
  END IF;

  v_sess_id := (SELECT r.active_session_id FROM public.ov2_rooms r WHERE r.id = p_room_id);
  IF v_sess_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SESSION', 'message', 'No active session');
  END IF;

  PERFORM 1 FROM public.ov2_orbit_trap_sessions s WHERE s.id = v_sess_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;

  v_seat := (
    SELECT s.seat_index
    FROM public.ov2_orbit_trap_seats s
    WHERE s.session_id = v_sess_id AND s.participant_key = v_pk
    LIMIT 1
  );
  IF v_seat IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_IN_MATCH', 'message', 'Not seated in this session');
  END IF;

  SELECT s.revision, s.state
  INTO v_rev, v_state
  FROM public.ov2_orbit_trap_sessions s
  WHERE s.id = v_sess_id;

  IF p_expected_revision IS NOT NULL AND v_rev IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'REVISION_MISMATCH',
      'message', 'Stale revision; refetch snapshot and retry.',
      'revision', v_rev
    );
  END IF;

  v_out := public._ot_try_apply_action(v_state, v_seat, p_action);
  IF COALESCE((v_out->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', COALESCE(v_out->>'code', 'REJECTED'),
      'message', COALESCE(v_out->>'code', 'Action rejected')
    );
  END IF;

  v_new_state := v_out->'state';
  v_new_rev := COALESCE((v_new_state->>'revision')::bigint, v_rev + 1);

  UPDATE public.ov2_orbit_trap_sessions s
  SET
    state = v_new_state,
    revision = v_new_rev,
    phase = COALESCE(v_new_state->>'phase', s.phase),
    winner_seat = CASE
      WHEN COALESCE(v_new_state->>'phase', '') = 'finished'
        AND v_new_state ? 'winnerSeat'
        AND (v_new_state->'winnerSeat') IS NOT NULL
        AND jsonb_typeof(v_new_state->'winnerSeat') <> 'null'
        THEN (v_new_state->>'winnerSeat')::int
      ELSE s.winner_seat
    END,
    updated_at = now()
  WHERE s.id = v_sess_id;

  v_snap := (
    SELECT public.ov2_orbit_trap_build_client_snapshot(s, v_pk)
    FROM public.ov2_orbit_trap_sessions s
    WHERE s.id = v_sess_id
    LIMIT 1
  );

  RETURN jsonb_build_object('ok', true, 'snapshot', v_snap);
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_orbit_trap_apply_action(uuid, text, jsonb, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_orbit_trap_apply_action(uuid, text, jsonb, bigint) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ov2_orbit_trap_leave_game(p_room_id uuid, p_participant_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_room_product text;
  v_sess_id uuid;
  v_seat int;
  v_state jsonb;
  v_rev bigint;
  v_winner int;
  v_other int;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;

  PERFORM 1 FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;

  v_room_product := (SELECT r.product_game_id FROM public.ov2_rooms r WHERE r.id = p_room_id);
  v_sess_id := (SELECT r.active_session_id FROM public.ov2_rooms r WHERE r.id = p_room_id);

  IF v_room_product IS DISTINCT FROM 'ov2_orbit_trap' OR v_sess_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room or session not found');
  END IF;

  PERFORM 1 FROM public.ov2_orbit_trap_sessions s WHERE s.id = v_sess_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_PLAYING', 'message', 'Session not in play');
  END IF;

  IF COALESCE((SELECT s.phase FROM public.ov2_orbit_trap_sessions s WHERE s.id = v_sess_id), '') IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_PLAYING', 'message', 'Session not in play');
  END IF;

  v_seat := (
    SELECT s.seat_index
    FROM public.ov2_orbit_trap_seats s
    WHERE s.session_id = v_sess_id AND s.participant_key = v_pk
    LIMIT 1
  );
  IF v_seat IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_IN_MATCH', 'message', 'Not seated in this session');
  END IF;

  v_other := (
    SELECT s2.seat_index
    FROM public.ov2_orbit_trap_seats s2
    WHERE s2.session_id = v_sess_id
      AND s2.seat_index IS DISTINCT FROM v_seat
    ORDER BY s2.seat_index ASC
    LIMIT 1
  );
  v_winner := COALESCE(v_other, 0);

  SELECT s.revision, s.state INTO v_rev, v_state
  FROM public.ov2_orbit_trap_sessions s WHERE s.id = v_sess_id;

  v_state := jsonb_set(COALESCE(v_state, '{}'::jsonb), '{phase}', '"finished"'::jsonb, true);
  v_state := jsonb_set(v_state, '{winnerSeat}', to_jsonb(v_winner), true);
  v_state := jsonb_set(v_state, '{revision}', to_jsonb(v_rev + 1), true);

  UPDATE public.ov2_orbit_trap_sessions s
  SET
    phase = 'finished',
    winner_seat = v_winner,
    state = v_state,
    revision = v_rev + 1,
    updated_at = now()
  WHERE s.id = v_sess_id;

  RETURN jsonb_build_object(
    'ok', true,
    'finished', true,
    'snapshot', (
      SELECT public.ov2_orbit_trap_build_client_snapshot(s, v_pk)
      FROM public.ov2_orbit_trap_sessions s
      WHERE s.id = v_sess_id
      LIMIT 1
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_orbit_trap_leave_game(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_orbit_trap_leave_game(uuid, text) TO anon, authenticated, service_role;

COMMIT;
