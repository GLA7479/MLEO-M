-- OV2 Tanks V1: open session + client snapshot RPCs (minimal bootstrapping).
-- Apply after 146_ov2_tanks_v1_schema.sql.
-- Fire/timeout/simulation RPCs are intentionally not in this pass.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_tanks_build_client_snapshot(
  p_session public.ov2_tanks_sessions,
  p_participant_key text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pk text := trim(coalesce(p_participant_key, ''));
  v_my int;
  v_pub jsonb;
  v_ps jsonb;
BEGIN
  SELECT s.seat_index INTO v_my
  FROM public.ov2_tanks_seats s
  WHERE s.session_id = p_session.id AND s.participant_key = v_pk;

  v_pub := coalesce(p_session.public_state, '{}'::jsonb);
  v_ps := coalesce(p_session.parity_state, '{}'::jsonb);

  RETURN jsonb_build_object(
    'revision', p_session.revision,
    'sessionId', p_session.id::text,
    'roomId', p_session.room_id::text,
    'phase', p_session.phase,
    'mySeat', CASE WHEN v_my IS NULL THEN NULL::jsonb ELSE to_jsonb(v_my) END,
    'winnerSeat', CASE WHEN p_session.winner_seat IS NULL THEN NULL::jsonb ELSE to_jsonb(p_session.winner_seat) END,
    'public', v_pub,
    'parity', v_ps
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_tanks_open_session(
  p_room_id uuid,
  p_participant_key text,
  p_presence_leader_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text;
  v_sess public.ov2_tanks_sessions%ROWTYPE;
  v_existing public.ov2_tanks_sessions%ROWTYPE;
  v_seated int;
  v_now bigint;
  v_pub jsonb;
  v_ps jsonb;
  v_samples jsonb;
  v_seed bigint;
  v_pk0 text;
  v_pk1 text;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id required');
  END IF;
  v_pk := trim(coalesce(p_participant_key, ''));
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'participant_key required');
  END IF;
  PERFORM coalesce(p_presence_leader_key, '');

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.product_game_id IS DISTINCT FROM 'ov2_tanks' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a Tanks room');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ov2_room_members m WHERE m.room_id = p_room_id AND m.participant_key = v_pk
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Only room members can open a session');
  END IF;
  IF v_room.host_participant_key IS DISTINCT FROM v_pk THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_HOST', 'message', 'Only room host can open a session');
  END IF;

  IF coalesce(v_room.shared_schema_version, 0) = 1 THEN
    IF coalesce(v_room.status, '') IS DISTINCT FROM 'IN_GAME' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_STARTED', 'message', 'Room must be started before opening a session.');
    END IF;
  ELSE
    IF v_room.lifecycle_phase IS DISTINCT FROM 'active' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_ACTIVE', 'message', 'Room must be active before opening a session.');
    END IF;
  END IF;

  IF v_room.active_session_id IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.ov2_tanks_sessions
    WHERE id = v_room.active_session_id AND room_id = p_room_id;
    IF FOUND AND v_existing.status = 'live' AND v_existing.phase = 'playing' THEN
      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'snapshot', public.ov2_tanks_build_client_snapshot(v_existing, v_pk)
      );
    END IF;
  END IF;

  SELECT count(*)::int INTO v_seated
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL;
  IF v_seated <> 2 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_SEAT_COUNT', 'message', 'Tanks V1 needs exactly two seated players');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL AND m.wallet_state IS DISTINCT FROM 'committed'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STAKES_NOT_COMMITTED', 'message', 'All seated players must commit stakes');
  END IF;

  v_seed := (extract(epoch from clock_timestamp()) * 1000)::bigint % 2000000000;
  SELECT coalesce(
    jsonb_agg(round((280 + 55 * sin((i / 64.0) * pi() + (v_seed % 997) / 250.0))::numeric, 2) ORDER BY i),
    '[]'::jsonb
  )
  INTO v_samples
  FROM generate_series(0, 64) AS g(i);

  v_pub := jsonb_build_object(
    'terrainSeed', v_seed,
    'mapW', 960,
    'mapH', 540,
    'samples', v_samples
  );

  SELECT trim(m.participant_key) INTO v_pk0
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id AND m.seat_index = 0
  LIMIT 1;
  SELECT trim(m.participant_key) INTO v_pk1
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id AND m.seat_index = 1
  LIMIT 1;

  IF v_pk0 IS NULL OR length(v_pk0) = 0 OR v_pk1 IS NULL OR length(v_pk1) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_SEATS', 'message', 'Seat 0 and seat 1 must be occupied');
  END IF;

  v_now := (extract(epoch from clock_timestamp()) * 1000)::bigint;

  v_ps := jsonb_build_object(
    'rulesVersion', 'tanks_v1',
    'turnIndex', 1,
    'completedTurns', 0,
    'firstMoverKey', v_pk0,
    'activeParticipantKey', v_pk0,
    'turnStartedMs', v_now,
    'turnDeadlineMs', v_now + 30000,
    'participants', jsonb_build_array(v_pk0, v_pk1),
    'hp', jsonb_build_array(80, 80),
    'timeoutStrikes', jsonb_build_array(0, 0),
    'chargesSeat', jsonb_build_array(
      jsonb_build_object('iron', -1, 'he', 6, 'burrower', 3, 'finisher', 1),
      jsonb_build_object('iron', -1, 'he', 6, 'burrower', 3, 'finisher', 1)
    )
  );

  INSERT INTO public.ov2_tanks_sessions (
    room_id, match_seq, status, phase, revision, winner_seat, active_seats, player_count, public_state, parity_state
  ) VALUES (
    p_room_id,
    v_room.match_seq,
    'live',
    'playing',
    0,
    NULL,
    ARRAY[0, 1]::integer[],
    2,
    v_pub,
    v_ps
  )
  RETURNING * INTO v_sess;

  INSERT INTO public.ov2_tanks_seats (session_id, seat_index, participant_key, room_member_id, meta)
  SELECT
    v_sess.id,
    m.seat_index::int,
    m.participant_key,
    m.id,
    '{}'::jsonb
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL
  ORDER BY m.seat_index;

  UPDATE public.ov2_rooms
  SET active_session_id = v_sess.id, active_runtime_id = v_sess.id, updated_at = now()
  WHERE id = p_room_id;

  SELECT * INTO v_sess FROM public.ov2_tanks_sessions WHERE id = v_sess.id;
  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_tanks_build_client_snapshot(v_sess, v_pk));
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_tanks_get_snapshot(
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
  v_pk text := trim(coalesce(p_participant_key, ''));
  v_sess public.ov2_tanks_sessions%ROWTYPE;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Invalid arguments');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_tanks' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SESSION', 'message', 'No active session');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_tanks_sessions WHERE id = v_room.active_session_id AND room_id = p_room_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;
  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_tanks_build_client_snapshot(v_sess, v_pk));
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_tanks_build_client_snapshot(public.ov2_tanks_sessions, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_tanks_build_client_snapshot(public.ov2_tanks_sessions, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_tanks_open_session(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_tanks_open_session(uuid, text, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_tanks_get_snapshot(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_tanks_get_snapshot(uuid, text) TO anon, authenticated, service_role;

COMMIT;
