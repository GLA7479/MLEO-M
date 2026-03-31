-- Board Path: turn RPCs (roll / move / end turn). Apply after 008_ov2_board_path_open_session.sql.

BEGIN;

-- --- Columns for winner + round tracking (client already understands these conceptually) ---

ALTER TABLE public.ov2_board_path_sessions
  ADD COLUMN IF NOT EXISTS winner_seat_index integer,
  ADD COLUMN IF NOT EXISTS round_index integer NOT NULL DEFAULT 0;

UPDATE public.ov2_board_path_sessions
SET round_index = 0
WHERE round_index IS NULL;

-- --- Session JSON helper: include new columns ---

CREATE OR REPLACE FUNCTION public.ov2_board_path_session_to_jsonb(p_session public.ov2_board_path_sessions)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', p_session.id,
    'room_id', p_session.room_id,
    'match_seq', p_session.match_seq,
    'status', p_session.status,
    'phase', p_session.phase,
    'engine_phase', p_session.engine_phase,
    'turn_index', p_session.turn_index,
    'active_seat_index', p_session.active_seat_index,
    'winner_seat_index', p_session.winner_seat_index,
    'round_index', p_session.round_index,
    'turn_meta', COALESCE(p_session.turn_meta, '{}'::jsonb),
    'board_state', COALESCE(p_session.board_state, '{}'::jsonb),
    'event_log', COALESCE(p_session.event_log, '[]'::jsonb),
    'revision', p_session.revision,
    'created_at', p_session.created_at
  );
$$;

-- =============================================================================
-- ov2_board_path_roll_session
-- =============================================================================

CREATE OR REPLACE FUNCTION public.ov2_board_path_roll_session(
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
  v_sess public.ov2_board_path_sessions%ROWTYPE;
  v_pk text;
  v_member public.ov2_room_members%ROWTYPE;
  v_seat int;
  v_n int;
  v_active int;
  v_min_seat int;
  v_max_seat int;
  v_tm jsonb;
  v_step text;
  v_ms bigint;
  v_roll int;
  v_new_tm jsonb;
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
  WHERE id = v_room.active_session_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Active session row missing');
  END IF;

  IF p_expected_revision IS NOT NULL AND v_sess.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'REVISION_MISMATCH',
      'message', 'Session revision does not match expected',
      'revision', v_sess.revision
    );
  END IF;

  IF v_sess.phase = 'ended' OR v_sess.status IS DISTINCT FROM 'live' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_ENDED', 'message', 'Session is finished or closed');
  END IF;

  IF v_sess.phase NOT IN ('pregame', 'playing') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PHASE', 'message', 'Session is not in a rollable phase');
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

  SELECT seat_index INTO v_seat
  FROM public.ov2_board_path_seats
  WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No session seat for participant');
  END IF;

  SELECT count(*)::int INTO v_n FROM public.ov2_board_path_seats WHERE session_id = v_sess.id;
  IF v_n < 2 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_ENOUGH_PLAYERS', 'message', 'Need at least two seats');
  END IF;

  SELECT min(seat_index)::int, max(seat_index)::int INTO v_min_seat, v_max_seat
  FROM public.ov2_board_path_seats WHERE session_id = v_sess.id;

  v_active := COALESCE(v_sess.active_seat_index, v_min_seat);

  IF v_seat IS DISTINCT FROM v_active THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_YOUR_TURN', 'message', 'Only the active seat may roll');
  END IF;

  v_tm := COALESCE(v_sess.turn_meta, '{}'::jsonb);
  v_step := nullif(trim(COALESCE(v_tm->>'step', '')), '');

  IF v_sess.phase = 'playing' THEN
    IF v_step IS NOT NULL AND v_step <> 'awaiting_roll' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'WRONG_STEP', 'message', 'Roll not allowed in current step');
    END IF;
  END IF;

  IF v_sess.phase = 'pregame' THEN
    IF v_step IS NOT NULL AND v_step NOT IN ('awaiting_roll') THEN
      RETURN jsonb_build_object('ok', false, 'code', 'WRONG_STEP', 'message', 'Roll not allowed in current step');
    END IF;
  END IF;

  v_roll := 1 + (floor(random() * 6))::int;
  v_ms := (extract(epoch from clock_timestamp()) * 1000)::bigint;

  v_new_tm := v_tm
    || jsonb_build_object(
      'turnNumber', COALESCE((v_tm->>'turnNumber')::int, 1),
      'activeSeatIndex', v_active,
      'startedAt', COALESCE((v_tm->>'startedAt')::bigint, v_ms),
      'step', 'awaiting_move',
      'rollValue', v_roll,
      'rolledAt', v_ms,
      'actedByParticipantKey', v_pk
    );
  v_new_tm := v_new_tm - 'movedAt' - 'endedAt';

  UPDATE public.ov2_board_path_sessions
  SET
    phase = CASE WHEN v_sess.phase = 'pregame' THEN 'playing' ELSE v_sess.phase END,
    engine_phase = CASE WHEN v_sess.phase = 'pregame' THEN 'playing' ELSE v_sess.engine_phase END,
    active_seat_index = v_active,
    turn_meta = v_new_tm,
    revision = revision + 1,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  RETURN jsonb_build_object(
    'ok', true,
    'revision', v_sess.revision,
    'session', public.ov2_board_path_session_to_jsonb(v_sess),
    'seats', public.ov2_board_path_seats_to_jsonb(v_sess.id)
  );
END;
$$;

-- =============================================================================
-- ov2_board_path_move_session
-- =============================================================================

CREATE OR REPLACE FUNCTION public.ov2_board_path_move_session(
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
  v_sess public.ov2_board_path_sessions%ROWTYPE;
  v_pk text;
  v_member public.ov2_room_members%ROWTYPE;
  v_seat int;
  v_n int;
  v_active int;
  v_tm jsonb;
  v_step text;
  v_roll int;
  v_ms bigint;
  v_board jsonb;
  v_path_len int;
  v_pos jsonb;
  v_cur int;
  v_new int;
  v_new_tm jsonb;
  v_new_board jsonb;
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
  WHERE id = v_room.active_session_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Active session row missing');
  END IF;

  IF p_expected_revision IS NOT NULL AND v_sess.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'REVISION_MISMATCH',
      'message', 'Session revision does not match expected',
      'revision', v_sess.revision
    );
  END IF;

  IF v_sess.phase = 'ended' OR v_sess.status IS DISTINCT FROM 'live' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_ENDED', 'message', 'Session is finished or closed');
  END IF;

  IF v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PHASE', 'message', 'Move only in playing phase');
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

  SELECT seat_index INTO v_seat
  FROM public.ov2_board_path_seats
  WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No session seat for participant');
  END IF;

  v_active := COALESCE(v_sess.active_seat_index, 0);
  IF v_seat IS DISTINCT FROM v_active THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_YOUR_TURN', 'message', 'Only the active seat may move');
  END IF;

  v_tm := COALESCE(v_sess.turn_meta, '{}'::jsonb);
  v_step := nullif(trim(COALESCE(v_tm->>'step', '')), '');

  IF v_step IS DISTINCT FROM 'awaiting_move' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_STEP', 'message', 'Move only after roll');
  END IF;

  v_roll := (v_tm->>'rollValue')::int;
  IF v_roll IS NULL OR v_roll < 1 OR v_roll > 6 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ROLL', 'message', 'No valid roll to apply');
  END IF;

  v_board := COALESCE(v_sess.board_state, '{"pathLength": 30, "positions": {}}'::jsonb);
  v_path_len := COALESCE((v_board->>'pathLength')::int, 30);
  IF v_path_len < 1 THEN
    v_path_len := 30;
  END IF;

  v_pos := COALESCE(v_board->'positions', '{}'::jsonb);
  v_cur := COALESCE((v_pos->>v_pk)::int, 0);
  IF v_cur < 0 THEN
    v_cur := 0;
  END IF;

  v_new := v_cur + v_roll;
  IF v_new > v_path_len THEN
    v_new := v_path_len;
  END IF;

  v_new_board := jsonb_set(
    v_board,
    '{positions}',
    v_pos || jsonb_build_object(v_pk, to_jsonb(v_new)),
    true
  );

  v_ms := (extract(epoch from clock_timestamp()) * 1000)::bigint;

  IF v_new >= v_path_len THEN
    v_new_tm := v_tm
      || jsonb_build_object(
        'step', 'ended',
        'movedAt', v_ms,
        'endedAt', v_ms,
        'actedByParticipantKey', v_pk
      );

    UPDATE public.ov2_board_path_sessions
    SET
      board_state = v_new_board,
      winner_seat_index = v_seat,
      phase = 'ended',
      engine_phase = 'ended',
      turn_meta = v_new_tm,
      revision = revision + 1,
      updated_at = now()
    WHERE id = v_sess.id
    RETURNING * INTO v_sess;
  ELSE
    v_new_tm := v_tm
      || jsonb_build_object(
        'step', 'awaiting_end',
        'movedAt', v_ms,
        'actedByParticipantKey', v_pk
      );

    UPDATE public.ov2_board_path_sessions
    SET
      board_state = v_new_board,
      turn_meta = v_new_tm,
      revision = revision + 1,
      updated_at = now()
    WHERE id = v_sess.id
    RETURNING * INTO v_sess;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'revision', v_sess.revision,
    'session', public.ov2_board_path_session_to_jsonb(v_sess),
    'seats', public.ov2_board_path_seats_to_jsonb(v_sess.id)
  );
END;
$$;

-- =============================================================================
-- ov2_board_path_end_turn_session
-- =============================================================================

CREATE OR REPLACE FUNCTION public.ov2_board_path_end_turn_session(
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
  v_sess public.ov2_board_path_sessions%ROWTYPE;
  v_pk text;
  v_member public.ov2_room_members%ROWTYPE;
  v_seat int;
  v_n int;
  v_active int;
  v_max_seat int;
  v_next int;
  v_tm jsonb;
  v_step text;
  v_ms bigint;
  v_tn int;
  v_ri int;
  v_new_tm jsonb;
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
  WHERE id = v_room.active_session_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Active session row missing');
  END IF;

  IF p_expected_revision IS NOT NULL AND v_sess.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'REVISION_MISMATCH',
      'message', 'Session revision does not match expected',
      'revision', v_sess.revision
    );
  END IF;

  IF v_sess.phase = 'ended' OR v_sess.status IS DISTINCT FROM 'live' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_ENDED', 'message', 'Session is finished or closed');
  END IF;

  IF v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PHASE', 'message', 'End turn only in playing phase');
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

  SELECT seat_index INTO v_seat
  FROM public.ov2_board_path_seats
  WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No session seat for participant');
  END IF;

  v_active := COALESCE(v_sess.active_seat_index, 0);
  IF v_seat IS DISTINCT FROM v_active THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_YOUR_TURN', 'message', 'Only the active seat may end the turn');
  END IF;

  v_tm := COALESCE(v_sess.turn_meta, '{}'::jsonb);
  v_step := nullif(trim(COALESCE(v_tm->>'step', '')), '');

  IF v_step IS DISTINCT FROM 'awaiting_end' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_STEP', 'message', 'End turn only after move');
  END IF;

  SELECT count(*)::int INTO v_n FROM public.ov2_board_path_seats WHERE session_id = v_sess.id;
  SELECT max(seat_index)::int INTO v_max_seat FROM public.ov2_board_path_seats WHERE session_id = v_sess.id;

  v_next := (v_active + 1) % v_n;
  IF v_next < 0 THEN
    v_next := 0;
  END IF;

  v_ms := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_tn := COALESCE((v_tm->>'turnNumber')::int, 1) + 1;
  v_ri := COALESCE(v_sess.round_index, 0);
  IF v_next = 0 AND v_active = v_max_seat THEN
    v_ri := v_ri + 1;
  END IF;

  v_new_tm := (v_tm
    - 'rollValue'
    - 'rolledAt'
    - 'movedAt'
    - 'endedAt'
    - 'actedByParticipantKey')
    || jsonb_build_object(
      'turnNumber', v_tn,
      'activeSeatIndex', v_next,
      'startedAt', v_ms,
      'step', 'awaiting_roll'
    );

  UPDATE public.ov2_board_path_sessions
  SET
    active_seat_index = v_next,
    turn_index = turn_index + 1,
    round_index = v_ri,
    turn_meta = v_new_tm,
    revision = revision + 1,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  RETURN jsonb_build_object(
    'ok', true,
    'revision', v_sess.revision,
    'session', public.ov2_board_path_session_to_jsonb(v_sess),
    'seats', public.ov2_board_path_seats_to_jsonb(v_sess.id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_board_path_roll_session(uuid, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_board_path_roll_session(uuid, text, bigint) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_board_path_move_session(uuid, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_board_path_move_session(uuid, text, bigint) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_board_path_end_turn_session(uuid, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_board_path_end_turn_session(uuid, text, bigint) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.ov2_board_path_roll_session(uuid, text, bigint) IS 'Board Path: active seat rolls 1..6; first roll may leave pregame → playing.';
COMMENT ON FUNCTION public.ov2_board_path_move_session(uuid, text, bigint) IS 'Board Path: active seat moves by pending rollValue; may end game.';
COMMENT ON FUNCTION public.ov2_board_path_end_turn_session(uuid, text, bigint) IS 'Board Path: hand off turn after move; clears roll, step awaiting_roll.';

COMMIT;
