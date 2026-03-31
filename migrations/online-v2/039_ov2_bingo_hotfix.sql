-- Hotfix: _ov2_bingo_card_matrix_for_seat must produce a 5x5 JSON matrix (not a flat array).
-- Fixes PostgreSQL error: "cannot set path in scalar".
-- Also hardens Bingo rematch meta updates when member.meta is scalar or non-object.

BEGIN;

CREATE OR REPLACE FUNCTION public._ov2_bingo_card_matrix_for_seat(p_seed text, p_round text, p_seat int)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  c0 int[];
  c1 int[];
  c2 int[];
  c3 int[];
  c4 int[];
  grid jsonb;
BEGIN
  c0 := public._ov2_bingo_pick_column_values(p_seed || '::' || p_round || '::' || p_seat::text || ':col:0', 1, 15);
  c1 := public._ov2_bingo_pick_column_values(p_seed || '::' || p_round || '::' || p_seat::text || ':col:1', 16, 30);
  c2 := public._ov2_bingo_pick_column_values(p_seed || '::' || p_round || '::' || p_seat::text || ':col:2', 31, 45);
  c3 := public._ov2_bingo_pick_column_values(p_seed || '::' || p_round || '::' || p_seat::text || ':col:3', 46, 60);
  c4 := public._ov2_bingo_pick_column_values(p_seed || '::' || p_round || '::' || p_seat::text || ':col:4', 61, 75);

  grid := jsonb_build_array(
    jsonb_build_array(c0[1], c1[1], c2[1], c3[1], c4[1]),
    jsonb_build_array(c0[2], c1[2], c2[2], c3[2], c4[2]),
    jsonb_build_array(c0[3], c1[3], c2[3], c3[3], c4[3]),
    jsonb_build_array(c0[4], c1[4], c2[4], c3[4], c4[4]),
    jsonb_build_array(c0[5], c1[5], c2[5], c3[5], c4[5])
  );

  grid := jsonb_set(grid, '{2,2}', '0'::jsonb, true);

  RETURN grid;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_bingo_request_rematch(
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
  v_sess public.ov2_bingo_sessions%ROWTYPE;
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_member public.ov2_room_members%ROWTYPE;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_bingo' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;

  IF v_room.lifecycle_phase IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_ACTIVE', 'message', 'Room must be active');
  END IF;

  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No active session');
  END IF;

  SELECT * INTO v_sess FROM public.ov2_bingo_sessions WHERE id = v_room.active_session_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;

  IF v_sess.phase IS DISTINCT FROM 'finished' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REMATCH_NOT_ALLOWED', 'message', 'Rematch only after the match finishes');
  END IF;

  IF v_sess.match_seq IS DISTINCT FROM v_room.match_seq THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STALE_SESSION', 'message', 'Session does not match room match cycle');
  END IF;

  SELECT * INTO v_member FROM public.ov2_room_members WHERE room_id = p_room_id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Not a room member');
  END IF;

  IF v_member.wallet_state IS DISTINCT FROM 'committed' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_COMMITTED', 'message', 'Member must be stake-committed');
  END IF;

  IF v_member.seat_index IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_SEATED', 'message', 'Must be seated');
  END IF;

  IF NOT (v_sess.active_seats @> jsonb_build_array(v_member.seat_index)) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No seat in this finished session');
  END IF;

  IF public._ov2_bingo_member_rematch_requested(v_member.meta) THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;

  UPDATE public.ov2_room_members
  SET
    meta = jsonb_set(
      CASE WHEN jsonb_typeof(meta) = 'object' THEN meta ELSE '{}'::jsonb END,
      '{bingo}',
      COALESCE(
        CASE WHEN jsonb_typeof((CASE WHEN jsonb_typeof(meta) = 'object' THEN meta ELSE '{}'::jsonb END)->'bingo') = 'object'
          THEN (CASE WHEN jsonb_typeof(meta) = 'object' THEN meta ELSE '{}'::jsonb END)->'bingo'
        END,
        '{}'::jsonb
      ) || jsonb_build_object('rematch_requested', true, 'rematch_at', to_jsonb(now()::text)),
      true
    ),
    updated_at = now()
  WHERE room_id = p_room_id AND participant_key = v_pk;

  RETURN jsonb_build_object('ok', true, 'idempotent', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_bingo_cancel_rematch(
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
  v_sess public.ov2_bingo_sessions%ROWTYPE;
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_member public.ov2_room_members%ROWTYPE;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_bingo' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;

  IF v_room.lifecycle_phase IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_ACTIVE', 'message', 'Room must be active');
  END IF;

  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No active session');
  END IF;

  SELECT * INTO v_sess FROM public.ov2_bingo_sessions WHERE id = v_room.active_session_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;

  IF v_sess.phase IS DISTINCT FROM 'finished' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REMATCH_NOT_ALLOWED', 'message', 'Cancel rematch only after match finished');
  END IF;

  IF v_sess.match_seq IS DISTINCT FROM v_room.match_seq THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STALE_SESSION', 'message', 'Session mismatch');
  END IF;

  SELECT * INTO v_member FROM public.ov2_room_members WHERE room_id = p_room_id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Not a room member');
  END IF;

  IF v_member.wallet_state IS DISTINCT FROM 'committed' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_COMMITTED', 'message', 'Member must be committed');
  END IF;

  IF NOT public._ov2_bingo_member_rematch_requested(v_member.meta) THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;

  UPDATE public.ov2_room_members
  SET
    meta = CASE
      WHEN (CASE WHEN jsonb_typeof(meta) = 'object' THEN meta ELSE '{}'::jsonb END) ? 'bingo'
        AND jsonb_typeof((CASE WHEN jsonb_typeof(meta) = 'object' THEN meta ELSE '{}'::jsonb END)->'bingo') = 'object' THEN
        jsonb_set(
          CASE WHEN jsonb_typeof(meta) = 'object' THEN meta ELSE '{}'::jsonb END,
          '{bingo}',
          ((CASE WHEN jsonb_typeof(meta) = 'object' THEN meta ELSE '{}'::jsonb END)->'bingo') - 'rematch_requested' - 'rematch_at',
          true
        )
      ELSE CASE WHEN jsonb_typeof(meta) = 'object' THEN meta ELSE '{}'::jsonb END
    END,
    updated_at = now()
  WHERE room_id = p_room_id AND participant_key = v_pk;

  RETURN jsonb_build_object('ok', true, 'idempotent', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_bingo_start_next_match(
  p_room_id uuid,
  p_host_participant_key text,
  p_expected_match_seq integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_sess public.ov2_bingo_sessions%ROWTYPE;
  v_pk text := trim(COALESCE(p_host_participant_key, ''));
  v_next_ms int;
  v_eligible int;
  v_ready int;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and host_participant_key required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_bingo' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;

  IF v_room.host_participant_key IS DISTINCT FROM v_pk THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_HOST', 'message', 'Only the host can start the next match');
  END IF;

  IF p_expected_match_seq IS NOT NULL AND p_expected_match_seq IS DISTINCT FROM v_room.match_seq THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'STALE_MATCH_SEQ',
      'message', 'match_seq changed',
      'match_seq', v_room.match_seq
    );
  END IF;

  IF v_room.lifecycle_phase IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_ACTIVE', 'message', 'Room must be active');
  END IF;

  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No session to continue from');
  END IF;

  SELECT * INTO v_sess FROM public.ov2_bingo_sessions WHERE id = v_room.active_session_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;

  IF v_sess.phase IS DISTINCT FROM 'finished' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FINISHED', 'message', 'Match must be finished first');
  END IF;

  IF v_sess.match_seq IS DISTINCT FROM v_room.match_seq THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STALE_SESSION', 'message', 'Session does not match room');
  END IF;

  SELECT count(*)::int INTO v_eligible
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id
    AND m.seat_index IS NOT NULL
    AND m.wallet_state = 'committed';

  IF v_eligible < 2 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_ENOUGH_PLAYERS', 'message', 'Need at least two seated committed players');
  END IF;

  SELECT count(*)::int INTO v_ready
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id
    AND m.seat_index IS NOT NULL
    AND m.wallet_state = 'committed'
    AND public._ov2_bingo_member_rematch_requested(m.meta);

  IF v_ready < v_eligible THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'NOT_ALL_REMATCH_READY',
      'message', 'All seated players must request rematch first',
      'ready', v_ready,
      'eligible', v_eligible
    );
  END IF;

  v_next_ms := COALESCE(v_room.match_seq, 0) + 1;

  UPDATE public.ov2_room_members m
  SET
    meta = CASE
      WHEN (CASE WHEN jsonb_typeof(m.meta) = 'object' THEN m.meta ELSE '{}'::jsonb END) ? 'bingo'
        AND jsonb_typeof((CASE WHEN jsonb_typeof(m.meta) = 'object' THEN m.meta ELSE '{}'::jsonb END)->'bingo') = 'object' THEN
        jsonb_set(
          CASE WHEN jsonb_typeof(m.meta) = 'object' THEN m.meta ELSE '{}'::jsonb END,
          '{bingo}',
          ((CASE WHEN jsonb_typeof(m.meta) = 'object' THEN m.meta ELSE '{}'::jsonb END)->'bingo') - 'rematch_requested' - 'rematch_at',
          true
        )
      ELSE CASE WHEN jsonb_typeof(m.meta) = 'object' THEN m.meta ELSE '{}'::jsonb END
    END,
    wallet_state = CASE WHEN m.seat_index IS NOT NULL THEN 'none' ELSE m.wallet_state END,
    amount_locked = CASE WHEN m.seat_index IS NOT NULL THEN 0 ELSE m.amount_locked END,
    updated_at = now()
  WHERE m.room_id = p_room_id;

  UPDATE public.ov2_rooms
  SET
    match_seq = v_next_ms,
    active_session_id = NULL,
    pot_locked = 0,
    lifecycle_phase = 'pending_stakes',
    updated_at = now()
  WHERE id = p_room_id
  RETURNING * INTO v_room;

  RETURN jsonb_build_object(
    'ok', true,
    'match_seq', v_next_ms,
    'room', public.ov2_room_to_public_jsonb(v_room),
    'members', public.ov2_members_to_public_jsonb(p_room_id)
  );
END;
$$;

COMMIT;
