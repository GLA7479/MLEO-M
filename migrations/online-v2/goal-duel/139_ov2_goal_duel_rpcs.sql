-- Goal Duel: snapshots, open session, step tick, ping.
-- Apply after 138_ov2_goal_duel_engine.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_gd_mirror_public_state(p_pub jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_aw float8 := public.ov2_gd_arena_w();
  v_bx float8; v_p0x float8; v_p1x float8;
  v_j jsonb;
BEGIN
  IF p_pub IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;
  v_bx := coalesce((p_pub -> 'ball' ->> 'x')::float8, 0);
  v_p0x := coalesce((p_pub -> 'p0' ->> 'x')::float8, 0);
  v_p1x := coalesce((p_pub -> 'p1' ->> 'x')::float8, 0);
  v_j := p_pub;
  v_j := jsonb_set(v_j, '{ball,x}', to_jsonb(v_aw - v_bx), true);
  v_j := jsonb_set(v_j, '{p0,x}', to_jsonb(v_aw - v_p0x), true);
  v_j := jsonb_set(v_j, '{p1,x}', to_jsonb(v_aw - v_p1x), true);
  -- mirror horizontal velocity for readability
  IF p_pub ? 'ball' THEN
    v_j := jsonb_set(v_j, '{ball,vx}', to_jsonb(-(coalesce((p_pub -> 'ball' ->> 'vx')::float8, 0.0))), true);
  END IF;
  IF p_pub ? 'p0' THEN
    v_j := jsonb_set(v_j, '{p0,vx}', to_jsonb(-(coalesce((p_pub -> 'p0' ->> 'vx')::float8, 0.0))), true);
    v_j := jsonb_set(v_j, '{p0,face}', to_jsonb(-(coalesce((p_pub -> 'p0' ->> 'face')::float8, 1.0))), true);
  END IF;
  IF p_pub ? 'p1' THEN
    v_j := jsonb_set(v_j, '{p1,vx}', to_jsonb(-(coalesce((p_pub -> 'p1' ->> 'vx')::float8, 0.0))), true);
    v_j := jsonb_set(v_j, '{p1,face}', to_jsonb(-(coalesce((p_pub -> 'p1' ->> 'face')::float8, -1.0))), true);
  END IF;
  RETURN v_j;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_goal_duel_build_client_snapshot(
  p_session public.ov2_goal_duel_sessions,
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
  v_me jsonb;
  v_s0 int;
  v_s1 int;
  v_mend bigint;
  v_res jsonb;
BEGIN
  SELECT s.seat_index INTO v_my
  FROM public.ov2_goal_duel_seats s
  WHERE s.session_id = p_session.id AND s.participant_key = v_pk;
  v_pub := coalesce(p_session.public_state, '{}'::jsonb);
  v_ps := coalesce(p_session.parity_state, '{}'::jsonb);
  IF v_my = 1 THEN
    v_me := public.ov2_gd_mirror_public_state(v_pub);
  ELSE
    v_me := v_pub;
  END IF;
  v_s0 := coalesce((v_ps ->> 'score0')::int, 0);
  v_s1 := coalesce((v_ps ->> 'score1')::int, 0);
  BEGIN
    v_mend := (v_ps ->> 'match_end_ms')::bigint;
  EXCEPTION
    WHEN invalid_text_representation THEN
      v_mend := NULL;
  END;
  v_res := v_ps -> '__result__';
  RETURN jsonb_build_object(
    'revision', p_session.revision,
    'sessionId', p_session.id::text,
    'roomId', p_session.room_id::text,
    'phase', p_session.phase,
    'mySeat', CASE WHEN v_my IS NULL THEN NULL::jsonb ELSE to_jsonb(v_my) END,
    'public', v_me,
    'score0', to_jsonb(v_s0),
    'score1', to_jsonb(v_s1),
    'myScore', CASE
      WHEN v_my = 0 THEN to_jsonb(v_s0)
      WHEN v_my = 1 THEN to_jsonb(v_s1)
      ELSE NULL::jsonb
    END,
    'matchEndMs', CASE WHEN v_mend IS NULL THEN NULL::jsonb ELSE to_jsonb(v_mend) END,
    'winnerSeat', CASE WHEN p_session.winner_seat IS NULL THEN NULL::jsonb ELSE to_jsonb(p_session.winner_seat) END,
    'result', CASE WHEN v_res IS NULL OR jsonb_typeof(v_res) = 'null' THEN NULL::jsonb ELSE v_res END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_goal_duel_open_session(
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
  v_sess public.ov2_goal_duel_sessions%ROWTYPE;
  v_existing public.ov2_goal_duel_sessions%ROWTYPE;
  v_seated int;
  v_entry bigint;
  v_ps jsonb;
  v_now bigint;
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
  IF v_room.product_game_id IS DISTINCT FROM 'ov2_goal_duel' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a Goal Duel room');
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
    FROM public.ov2_goal_duel_sessions
    WHERE id = v_room.active_session_id AND room_id = p_room_id;
    IF FOUND AND v_existing.status = 'live' AND v_existing.phase = 'playing' THEN
      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'snapshot', public.ov2_goal_duel_build_client_snapshot(v_existing, v_pk)
      );
    END IF;
  END IF;

  SELECT count(*)::int INTO v_seated
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL;
  IF v_seated <> 2 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_SEAT_COUNT', 'message', 'Goal Duel needs exactly two seated players');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL AND m.wallet_state IS DISTINCT FROM 'committed'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STAKES_NOT_COMMITTED', 'message', 'All seated players must commit stakes');
  END IF;

  v_entry := coalesce(v_room.stake_per_seat, 0);
  v_now := (extract(epoch from clock_timestamp()) * 1000)::bigint;

  INSERT INTO public.ov2_goal_duel_sessions (
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
    public.ov2_gd_initial_public_state(),
    '{}'::jsonb
  )
  RETURNING * INTO v_sess;

  v_ps := jsonb_build_object(
    '__entry__', to_jsonb(v_entry),
    'score0', 0,
    'score1', 0,
    'match_end_ms', v_now + public.ov2_gd_match_duration_ms(),
    'last_step_ms', v_now,
    'last_action_ms_0', v_now,
    'last_action_ms_1', v_now,
    'last_kick_ms_0', 0,
    'last_kick_ms_1', 0,
    'pending_inputs', jsonb_build_object(
      '0', jsonb_build_object('l', false, 'r', false, 'j', false, 'k', false),
      '1', jsonb_build_object('l', false, 'r', false, 'j', false, 'k', false)
    )
  );

  UPDATE public.ov2_goal_duel_sessions
  SET parity_state = v_ps, updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  INSERT INTO public.ov2_goal_duel_seats (session_id, seat_index, participant_key, room_member_id, meta)
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
  SET active_session_id = v_sess.id, updated_at = now()
  WHERE id = p_room_id;

  SELECT * INTO v_sess FROM public.ov2_goal_duel_sessions WHERE id = v_sess.id;
  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_goal_duel_build_client_snapshot(v_sess, v_pk));
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_goal_duel_get_snapshot(
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
  v_sess public.ov2_goal_duel_sessions%ROWTYPE;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Invalid arguments');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_goal_duel' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SESSION', 'message', 'No active session');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_goal_duel_sessions WHERE id = v_room.active_session_id AND room_id = p_room_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;
  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_goal_duel_build_client_snapshot(v_sess, v_pk));
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_goal_duel_ping(
  p_room_id uuid,
  p_participant_key text,
  p_expected_revision bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text := trim(coalesce(p_participant_key, ''));
  v_sess public.ov2_goal_duel_sessions%ROWTYPE;
  v_seat int;
  v_now bigint;
  v_ps jsonb;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Invalid arguments');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_goal_duel' OR v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_goal_duel_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_goal_duel_build_client_snapshot(v_sess, v_pk));
  END IF;
  IF p_expected_revision IS NOT NULL AND v_sess.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REVISION_MISMATCH', 'revision', v_sess.revision);
  END IF;
  SELECT seat_index INTO v_seat FROM public.ov2_goal_duel_seats WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No seat');
  END IF;
  v_now := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_ps := coalesce(v_sess.parity_state, '{}'::jsonb);
  IF v_seat = 0 THEN
    v_ps := jsonb_set(v_ps, '{last_action_ms_0}', to_jsonb(v_now), true);
  ELSE
    v_ps := jsonb_set(v_ps, '{last_action_ms_1}', to_jsonb(v_now), true);
  END IF;
  UPDATE public.ov2_goal_duel_sessions SET parity_state = v_ps, updated_at = now() WHERE id = v_sess.id RETURNING * INTO v_sess;
  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_goal_duel_build_client_snapshot(v_sess, v_pk));
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_goal_duel_step(
  p_room_id uuid,
  p_participant_key text,
  p_l boolean,
  p_r boolean,
  p_j boolean,
  p_k boolean,
  p_expected_revision bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text := trim(coalesce(p_participant_key, ''));
  v_sess public.ov2_goal_duel_sessions%ROWTYPE;
  v_seat int;
  v_now bigint;
  v_ps jsonb;
  v_pub jsonb;
  v_in0 jsonb;
  v_in1 jsonb;
  v_last bigint;
  v_dt int;
  v_out jsonb;
  v_new_pub jsonb;
  v_k0 bigint;
  v_k1 bigint;
  v_goal int;
  v_s0 int;
  v_s1 int;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Invalid arguments');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_goal_duel' OR v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_goal_duel_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_goal_duel_build_client_snapshot(v_sess, v_pk));
  END IF;
  IF p_expected_revision IS NOT NULL AND v_sess.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REVISION_MISMATCH', 'revision', v_sess.revision);
  END IF;
  SELECT seat_index INTO v_seat FROM public.ov2_goal_duel_seats WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No seat');
  END IF;

  v_now := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_ps := coalesce(v_sess.parity_state, '{}'::jsonb);
  v_pub := coalesce(v_sess.public_state, '{}'::jsonb);

  -- merge this participant's inputs into pending
  IF v_seat = 0 THEN
    v_ps := jsonb_set(
      v_ps,
      ARRAY['pending_inputs', '0'],
      jsonb_build_object('l', p_l, 'r', p_r, 'j', p_j, 'k', p_k),
      true
    );
    v_ps := jsonb_set(v_ps, '{last_action_ms_0}', to_jsonb(v_now), true);
  ELSE
    v_ps := jsonb_set(
      v_ps,
      ARRAY['pending_inputs', '1'],
      jsonb_build_object('l', p_l, 'r', p_r, 'j', p_j, 'k', p_k),
      true
    );
    v_ps := jsonb_set(v_ps, '{last_action_ms_1}', to_jsonb(v_now), true);
  END IF;

  v_in0 := coalesce(v_ps -> 'pending_inputs' -> '0', '{}'::jsonb);
  v_in1 := coalesce(v_ps -> 'pending_inputs' -> '1', '{}'::jsonb);
  v_k0 := coalesce((v_ps ->> 'last_kick_ms_0')::bigint, 0);
  v_k1 := coalesce((v_ps ->> 'last_kick_ms_1')::bigint, 0);

  BEGIN
    v_last := (v_ps ->> 'last_step_ms')::bigint;
  EXCEPTION
    WHEN invalid_text_representation THEN
      v_last := v_now;
  END;
  v_dt := (v_now - v_last)::int;
  IF v_dt < public.ov2_gd_min_step_interval_ms() THEN
    UPDATE public.ov2_goal_duel_sessions
    SET parity_state = v_ps, updated_at = now()
    WHERE id = v_sess.id
    RETURNING * INTO v_sess;
    RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_goal_duel_build_client_snapshot(v_sess, v_pk));
  END IF;
  IF v_dt > 120 THEN
    v_dt := 120;
  END IF;

  v_out := public.ov2_gd_sim_step(v_pub, v_ps, v_in0, v_in1, v_dt, v_now);
  v_new_pub := v_out -> 'public_state';
  v_k0 := coalesce((v_out -> 'kick_ms' ->> '0')::bigint, v_k0);
  v_k1 := coalesce((v_out -> 'kick_ms' ->> '1')::bigint, v_k1);
  v_ps := jsonb_set(v_ps, '{last_kick_ms_0}', to_jsonb(v_k0), true);
  v_ps := jsonb_set(v_ps, '{last_kick_ms_1}', to_jsonb(v_k1), true);
  v_ps := jsonb_set(v_ps, '{last_step_ms}', to_jsonb(v_now), true);

  v_goal := public.ov2_gd_detect_goal_event(v_new_pub);
  v_s0 := coalesce((v_ps ->> 'score0')::int, 0);
  v_s1 := coalesce((v_ps ->> 'score1')::int, 0);
  IF v_goal IS NOT NULL THEN
    IF v_goal = 0 THEN
      v_s0 := v_s0 + 1;
    ELSE
      v_s1 := v_s1 + 1;
    END IF;
    v_ps := jsonb_set(v_ps, '{score0}', to_jsonb(v_s0), true);
    v_ps := jsonb_set(v_ps, '{score1}', to_jsonb(v_s1), true);
    v_new_pub := public.ov2_gd_reset_after_goal(v_new_pub);
  END IF;

  UPDATE public.ov2_goal_duel_sessions
  SET
    public_state = v_new_pub,
    parity_state = v_ps,
    revision = v_sess.revision + 1,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_goal_duel_build_client_snapshot(v_sess, v_pk));
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_gd_mirror_public_state(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_gd_mirror_public_state(jsonb) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_goal_duel_build_client_snapshot(public.ov2_goal_duel_sessions, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_goal_duel_build_client_snapshot(public.ov2_goal_duel_sessions, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_goal_duel_open_session(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_goal_duel_open_session(uuid, text, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_goal_duel_get_snapshot(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_goal_duel_get_snapshot(uuid, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_goal_duel_ping(uuid, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_goal_duel_ping(uuid, text, bigint) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_goal_duel_step(uuid, text, boolean, boolean, boolean, boolean, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_goal_duel_step(uuid, text, boolean, boolean, boolean, boolean, bigint) TO anon, authenticated, service_role;

COMMIT;
