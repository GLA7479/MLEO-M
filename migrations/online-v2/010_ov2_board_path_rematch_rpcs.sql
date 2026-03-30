-- Board Path: rematch + next match (post-finish). Apply after 009_ov2_board_path_turn_rpcs.sql.
-- Rematch intent lives in ov2_room_members.meta->board_path (no new tables).

BEGIN;

-- =============================================================================
-- Helpers: read / write rematch_requested on member meta (jsonb)
-- =============================================================================

CREATE OR REPLACE FUNCTION public._ov2_bp_member_rematch_requested(p_meta jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    (p_meta->'board_path'->>'rematch_requested') IN ('true', 't', '1')
    OR (p_meta->'board_path'->'rematch_requested') IS NOT DISTINCT FROM 'true'::jsonb;
$$;

-- =============================================================================
-- ov2_board_path_request_rematch
-- =============================================================================

CREATE OR REPLACE FUNCTION public.ov2_board_path_request_rematch(
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
  v_sess public.ov2_board_path_sessions%ROWTYPE;
  v_pk text;
  v_member public.ov2_room_members%ROWTYPE;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id required');
  END IF;

  v_pk := trim(COALESCE(p_participant_key, ''));
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'participant_key required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;

  IF v_room.product_game_id IS DISTINCT FROM 'ov2_board_path' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a board path room');
  END IF;

  IF v_room.lifecycle_phase IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_ACTIVE', 'message', 'Room must be active');
  END IF;

  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'Room has no active session');
  END IF;

  SELECT * INTO v_sess
  FROM public.ov2_board_path_sessions
  WHERE id = v_room.active_session_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Active session row missing');
  END IF;

  IF v_sess.phase IS DISTINCT FROM 'ended' OR v_sess.status IS DISTINCT FROM 'live' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REMATCH_NOT_ALLOWED', 'message', 'Rematch only after the match has ended');
  END IF;

  IF v_sess.match_seq IS DISTINCT FROM v_room.match_seq THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STALE_SESSION', 'message', 'Session does not match room match cycle');
  END IF;

  SELECT * INTO v_member
  FROM public.ov2_room_members
  WHERE room_id = p_room_id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Not a room member');
  END IF;

  IF v_member.wallet_state IS DISTINCT FROM 'committed' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_COMMITTED', 'message', 'Member must be stake-committed');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ov2_board_path_seats
    WHERE session_id = v_sess.id AND participant_key = v_pk
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No seat in the finished session for this member');
  END IF;

  IF public._ov2_bp_member_rematch_requested(v_member.meta) THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;

  UPDATE public.ov2_room_members
  SET
    meta = jsonb_set(
      COALESCE(meta, '{}'::jsonb),
      '{board_path}',
      COALESCE(meta->'board_path', '{}'::jsonb)
        || jsonb_build_object('rematch_requested', true, 'rematch_at', to_jsonb(now()::text)),
      true
    ),
    updated_at = now()
  WHERE room_id = p_room_id AND participant_key = v_pk;

  RETURN jsonb_build_object('ok', true, 'idempotent', false);
END;
$$;

-- =============================================================================
-- ov2_board_path_cancel_rematch
-- =============================================================================

CREATE OR REPLACE FUNCTION public.ov2_board_path_cancel_rematch(
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
  v_sess public.ov2_board_path_sessions%ROWTYPE;
  v_pk text;
  v_member public.ov2_room_members%ROWTYPE;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id required');
  END IF;

  v_pk := trim(COALESCE(p_participant_key, ''));
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'participant_key required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;

  IF v_room.product_game_id IS DISTINCT FROM 'ov2_board_path' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a board path room');
  END IF;

  IF v_room.lifecycle_phase IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_ACTIVE', 'message', 'Room must be active');
  END IF;

  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'Room has no active session');
  END IF;

  SELECT * INTO v_sess
  FROM public.ov2_board_path_sessions
  WHERE id = v_room.active_session_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Active session row missing');
  END IF;

  IF v_sess.phase IS DISTINCT FROM 'ended' OR v_sess.status IS DISTINCT FROM 'live' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REMATCH_NOT_ALLOWED', 'message', 'Cancel rematch only while the match is finished');
  END IF;

  IF v_sess.match_seq IS DISTINCT FROM v_room.match_seq THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STALE_SESSION', 'message', 'Session does not match room match cycle');
  END IF;

  SELECT * INTO v_member
  FROM public.ov2_room_members
  WHERE room_id = p_room_id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Not a room member');
  END IF;

  IF v_member.wallet_state IS DISTINCT FROM 'committed' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_COMMITTED', 'message', 'Member must be stake-committed');
  END IF;

  IF NOT public._ov2_bp_member_rematch_requested(v_member.meta) THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;

  UPDATE public.ov2_room_members
  SET
    meta = CASE
      WHEN meta ? 'board_path' THEN
        jsonb_set(
          meta,
          '{board_path}',
          (meta->'board_path') - 'rematch_requested' - 'rematch_at',
          true
        )
      ELSE meta
    END,
    updated_at = now()
  WHERE room_id = p_room_id AND participant_key = v_pk;

  RETURN jsonb_build_object('ok', true, 'idempotent', false);
END;
$$;

-- =============================================================================
-- ov2_board_path_start_next_match
-- =============================================================================

CREATE OR REPLACE FUNCTION public.ov2_board_path_start_next_match(
  p_room_id uuid,
  p_participant_key text,
  p_expected_match_seq integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_sess public.ov2_board_path_sessions%ROWTYPE;
  v_pk text;
  v_member public.ov2_room_members%ROWTYPE;
  v_eligible int;
  v_ready int;
  v_ms bigint;
  v_pl int;
  v_bs jsonb;
  v_new public.ov2_board_path_sessions%ROWTYPE;
  v_next_ms int;
  v_pos jsonb;
  v_pk_seat text;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id required');
  END IF;

  v_pk := trim(COALESCE(p_participant_key, ''));
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'participant_key required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;

  IF v_room.product_game_id IS DISTINCT FROM 'ov2_board_path' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a board path room');
  END IF;

  IF v_room.lifecycle_phase IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_ACTIVE', 'message', 'Room must be active');
  END IF;

  IF trim(COALESCE(v_room.host_participant_key, '')) IS DISTINCT FROM v_pk THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_HOST', 'message', 'Only the host can start the next match');
  END IF;

  IF p_expected_match_seq IS NOT NULL AND p_expected_match_seq IS DISTINCT FROM v_room.match_seq THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'STALE_MATCH_SEQ',
      'message', 'Room match_seq changed; refresh and try again',
      'match_seq', v_room.match_seq
    );
  END IF;

  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'Room has no active session');
  END IF;

  SELECT * INTO v_sess
  FROM public.ov2_board_path_sessions
  WHERE id = v_room.active_session_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Active session row missing');
  END IF;

  IF v_sess.phase IS DISTINCT FROM 'ended' OR v_sess.status IS DISTINCT FROM 'live' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FINISHED', 'message', 'Active session is not a finished match');
  END IF;

  IF v_sess.match_seq IS DISTINCT FROM v_room.match_seq THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_MATCH_MISMATCH', 'message', 'Active session match_seq does not match room');
  END IF;

  SELECT * INTO v_member
  FROM public.ov2_room_members
  WHERE room_id = p_room_id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Host is not a room member');
  END IF;

  SELECT count(*)::int INTO v_eligible
  FROM public.ov2_room_members
  WHERE room_id = p_room_id AND wallet_state = 'committed';

  IF v_eligible < 2 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_ENOUGH_PLAYERS', 'message', 'Need at least two committed members');
  END IF;

  SELECT count(*)::int INTO v_ready
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id
    AND m.wallet_state = 'committed'
    AND public._ov2_bp_member_rematch_requested(m.meta);

  IF v_ready < v_eligible THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'NOT_ALL_REMATCH_READY',
      'message', 'All committed players must request rematch first',
      'ready', v_ready,
      'eligible', v_eligible
    );
  END IF;

  v_bs := COALESCE(v_sess.board_state, '{}'::jsonb);
  v_pl := COALESCE((v_bs->>'pathLength')::int, (v_bs->>'path_length')::int, 30);
  IF v_pl IS NULL OR v_pl < 1 THEN
    v_pl := 30;
  END IF;

  v_pos := '{}'::jsonb;
  FOR v_participant IN
    SELECT m.participant_key
    FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND m.wallet_state = 'committed'
    ORDER BY m.participant_key ASC
  LOOP
    v_pos := v_pos || jsonb_build_object(trim(v_participant), 0);
  END LOOP;

  v_ms := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_next_ms := v_room.match_seq + 1;

  UPDATE public.ov2_room_members m
  SET
    meta = CASE
      WHEN m.meta ? 'board_path' THEN
        jsonb_set(
          m.meta,
          '{board_path}',
          (m.meta->'board_path') - 'rematch_requested' - 'rematch_at',
          true
        )
      ELSE m.meta
    END,
    updated_at = now()
  WHERE m.room_id = p_room_id;

  INSERT INTO public.ov2_board_path_sessions (
    room_id,
    match_seq,
    engine_phase,
    phase,
    status,
    turn_index,
    active_seat_index,
    winner_seat_index,
    round_index,
    turn_meta,
    board_state,
    event_log,
    revision,
    turn
  ) VALUES (
    p_room_id,
    v_next_ms,
    'pregame',
    'pregame',
    'live',
    0,
    0,
    NULL,
    0,
    jsonb_build_object(
      'turnNumber', 1,
      'activeSeatIndex', 0,
      'startedAt', v_ms,
      'step', 'awaiting_roll'
    ),
    jsonb_build_object('pathLength', v_pl, 'positions', v_pos),
    '[]'::jsonb,
    0,
    '{}'::jsonb
  )
  RETURNING * INTO v_new;

  INSERT INTO public.ov2_board_path_seats (
    session_id,
    room_member_id,
    seat_index,
    participant_key,
    is_host,
    is_ready,
    meta
  )
  SELECT
    v_new.id,
    m.id,
    (ROW_NUMBER() OVER (ORDER BY m.participant_key ASC)) - 1,
    m.participant_key,
    (trim(COALESCE(m.participant_key, '')) = trim(COALESCE(v_room.host_participant_key, ''))),
    COALESCE(m.is_ready, false),
    '{}'::jsonb
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id AND m.wallet_state = 'committed'
  ORDER BY m.participant_key ASC;

  UPDATE public.ov2_rooms
  SET
    match_seq = v_next_ms,
    active_session_id = v_new.id,
    updated_at = now()
  WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'ok', true,
    'match_seq', v_next_ms,
    'session', public.ov2_board_path_session_to_jsonb(v_new),
    'seats', public.ov2_board_path_seats_to_jsonb(v_new.id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public._ov2_bp_member_rematch_requested(jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.ov2_board_path_request_rematch(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_board_path_request_rematch(uuid, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_board_path_cancel_rematch(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_board_path_cancel_rematch(uuid, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_board_path_start_next_match(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_board_path_start_next_match(uuid, text, integer) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.ov2_board_path_request_rematch(uuid, text) IS 'Board Path: committed member requests rematch after active session ended.';
COMMENT ON FUNCTION public.ov2_board_path_cancel_rematch(uuid, text) IS 'Board Path: withdraw rematch request on finished active session.';
COMMENT ON FUNCTION public.ov2_board_path_start_next_match(uuid, text, integer) IS 'Board Path: host starts next match after all committed members requested rematch.';

COMMIT;
