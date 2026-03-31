-- OV2 Ludo parity core (ported from old LudoMP runtime semantics).
-- IMPORTANT: migration is additive/idempotent-oriented; app must tolerate not-yet-applied SQL.

BEGIN;

ALTER TABLE public.ov2_ludo_sessions
  ADD COLUMN IF NOT EXISTS current_turn integer,
  ADD COLUMN IF NOT EXISTS turn_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS parity_state jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.ov2_ludo_claim_seat(
  p_room_id uuid,
  p_participant_key text,
  p_seat_index integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_upd int;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'participant_key required');
  END IF;
  IF p_seat_index IS NULL OR p_seat_index < 0 OR p_seat_index > 3 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_SEAT', 'message', 'Seat must be 0..3');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.product_game_id IS DISTINCT FROM 'ov2_ludo' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a Ludo room');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id
      AND m.participant_key <> v_pk
      AND m.seat_index = p_seat_index
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEAT_TAKEN', 'message', 'Seat taken');
  END IF;

  UPDATE public.ov2_room_members
  SET seat_index = p_seat_index, updated_at = now()
  WHERE room_id = p_room_id AND participant_key = v_pk;
  GET DIAGNOSTICS v_upd = ROW_COUNT;
  IF v_upd = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Not a room member');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'room', public.ov2_room_to_public_jsonb(v_room),
    'members', public.ov2_members_to_public_jsonb(p_room_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ludo_leave_seat(
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
  v_upd int;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'participant_key required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.product_game_id IS DISTINCT FROM 'ov2_ludo' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a Ludo room');
  END IF;

  UPDATE public.ov2_room_members
  SET seat_index = NULL, updated_at = now()
  WHERE room_id = p_room_id AND participant_key = v_pk;
  GET DIAGNOSTICS v_upd = ROW_COUNT;
  IF v_upd = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Not a room member');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'room', public.ov2_room_to_public_jsonb(v_room),
    'members', public.ov2_members_to_public_jsonb(p_room_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ludo_leader_key(p_room_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT m.participant_key
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id
    AND m.seat_index IS NOT NULL
  ORDER BY COALESCE(NULLIF(trim(m.display_name), ''), '~'), m.participant_key
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.ov2_ludo_primary_session_id(p_room_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_primary uuid;
  v_dupes uuid[];
BEGIN
  SELECT s.id
  INTO v_primary
  FROM public.ov2_ludo_sessions s
  WHERE s.room_id = p_room_id AND s.status = 'live'
  ORDER BY s.created_at ASC, s.id ASC
  LIMIT 1;

  IF v_primary IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(array_agg(s.id), ARRAY[]::uuid[])
  INTO v_dupes
  FROM public.ov2_ludo_sessions s
  WHERE s.room_id = p_room_id
    AND s.status = 'live'
    AND s.id <> v_primary;

  IF cardinality(v_dupes) > 0 THEN
    INSERT INTO public.ov2_ludo_seats (session_id, seat_index, participant_key, room_member_id, meta)
    SELECT
      v_primary,
      ds.seat_index,
      ds.participant_key,
      ds.room_member_id,
      COALESCE(ds.meta, '{}'::jsonb)
    FROM public.ov2_ludo_seats ds
    WHERE ds.session_id = ANY(v_dupes)
    ORDER BY ds.created_at ASC, ds.id ASC
    ON CONFLICT DO NOTHING;
  END IF;

  DELETE FROM public.ov2_ludo_sessions s
  WHERE s.room_id = p_room_id
    AND s.status = 'live'
    AND s.id <> v_primary;

  UPDATE public.ov2_rooms
  SET active_session_id = v_primary, updated_at = now()
  WHERE id = p_room_id
    AND active_session_id IS DISTINCT FROM v_primary;

  RETURN v_primary;
END;
$$;

DROP FUNCTION IF EXISTS public.ov2_ludo_open_session(uuid, text);
CREATE OR REPLACE FUNCTION public.ov2_ludo_open_session(
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
  v_presence_leader text;
  v_sess public.ov2_ludo_sessions%ROWTYPE;
  v_existing public.ov2_ludo_sessions%ROWTYPE;
  v_committed int;
  v_active int[];
  v_board jsonb;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id required');
  END IF;
  v_pk := trim(COALESCE(p_participant_key, ''));
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'participant_key required');
  END IF;
  v_presence_leader := trim(COALESCE(p_presence_leader_key, ''));
  IF length(v_presence_leader) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'presence_leader_key required');
  END IF;
  IF v_presence_leader IS DISTINCT FROM v_pk THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_LEADER', 'message', 'Only presence leader can start');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.product_game_id IS DISTINCT FROM 'ov2_ludo' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a Ludo room');
  END IF;

  SELECT * INTO v_existing
  FROM public.ov2_ludo_sessions
  WHERE id = public.ov2_ludo_primary_session_id(p_room_id)
    AND room_id = p_room_id
    AND status = 'live';
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'snapshot', public.ov2_ludo_build_client_snapshot(v_existing, v_pk)
    );
  END IF;

  SELECT count(*)::int INTO v_committed
  FROM public.ov2_room_members
  WHERE room_id = p_room_id AND seat_index IS NOT NULL;
  IF v_committed < 2 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_ENOUGH_PLAYERS', 'message', 'Need at least two seated members');
  END IF;
  IF v_committed > 4 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TOO_MANY_PLAYERS', 'message', 'Ludo supports at most four seated members');
  END IF;

  SELECT array_agg(m.seat_index ORDER BY m.seat_index ASC)
  INTO v_active
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id
    AND m.seat_index IS NOT NULL;

  IF v_active IS NULL OR cardinality(v_active) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_ENOUGH_PLAYERS', 'message', 'Need at least two seated members');
  END IF;

  v_board := public.ov2_ludo_initial_board_json(v_active);

  INSERT INTO public.ov2_ludo_sessions (
    room_id, match_seq, status, phase, revision, board, turn_seat, dice_value, last_dice, winner_seat, active_seats,
    current_turn, turn_deadline, parity_state
  ) VALUES (
    p_room_id,
    v_room.match_seq,
    'live',
    'playing',
    0,
    v_board,
    (v_board ->> 'turnSeat')::int,
    NULL,
    NULL,
    NULL,
    v_active,
    (v_board ->> 'turnSeat')::int,
    now() + make_interval(secs => GREATEST(5, COALESCE(NULLIF(current_setting('app.ludo_turn_seconds', true), '')::int, 30))),
    jsonb_build_object(
      '__entry__', v_room.stake_per_seat,
      '__double__', jsonb_build_object('value', 1, 'proposed_by', NULL, 'awaiting', NULL, 'pending', '[]'::jsonb, 'locks', '{}'::jsonb, 'expires_at', NULL),
      '__result__', NULL
    )
  )
  RETURNING * INTO v_sess;

  INSERT INTO public.ov2_ludo_seats (session_id, seat_index, participant_key, room_member_id, meta)
  SELECT
    v_sess.id,
    m.seat_index,
    m.participant_key,
    m.id,
    '{}'::jsonb
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id
    AND m.seat_index IS NOT NULL
  ORDER BY m.seat_index ASC;

  UPDATE public.ov2_rooms SET active_session_id = v_sess.id, updated_at = now() WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'snapshot', public.ov2_ludo_build_client_snapshot(v_sess, v_pk)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ludo_get_snapshot(
  p_room_id uuid,
  p_participant_key text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_sess public.ov2_ludo_sessions%ROWTYPE;
  v_primary uuid;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.product_game_id IS DISTINCT FROM 'ov2_ludo' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a Ludo room');
  END IF;

  v_primary := public.ov2_ludo_primary_session_id(p_room_id);
  IF v_primary IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SESSION', 'message', 'No active Ludo session');
  END IF;

  SELECT * INTO v_sess
  FROM public.ov2_ludo_sessions
  WHERE id = v_primary AND room_id = p_room_id AND status = 'live';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Ludo session not found');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'snapshot', public.ov2_ludo_build_client_snapshot(v_sess, v_pk)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ludo_build_client_snapshot(
  p_session public.ov2_ludo_sessions,
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
  v_dice int;
  v_phase text;
  v_finished boolean;
  v_can_roll boolean := false;
  v_can_move boolean := false;
  v_legal int[];
  v_result jsonb;
  v_active_count int;
  v_entry bigint;
  v_mult int;
  v_winner int;
BEGIN
  v_board := COALESCE(p_session.board, '{}'::jsonb);
  v_turn := (v_board ->> 'turnSeat')::int;
  v_dice := CASE WHEN (v_board -> 'dice') IS NULL OR jsonb_typeof(v_board -> 'dice') = 'null' THEN NULL ELSE (v_board ->> 'dice')::int END;
  v_phase := COALESCE(p_session.phase, '');
  v_my_seat := (
    SELECT s.seat_index
    FROM public.ov2_ludo_seats s
    WHERE s.session_id = p_session.id AND s.participant_key = v_pk
    LIMIT 1
  );
  v_finished := (v_phase = 'finished' OR (v_board ->> 'winner') IS NOT NULL);

  IF p_session.status = 'live' AND NOT v_finished AND v_my_seat IS NOT NULL THEN
    IF v_my_seat = v_turn AND v_dice IS NULL THEN
      v_can_roll := true;
    END IF;
    IF v_my_seat = v_turn AND v_dice IS NOT NULL THEN
      v_legal := public.ov2_ludo_list_movable_pieces(v_board, v_turn, v_dice);
      IF array_length(v_legal, 1) IS NOT NULL AND array_length(v_legal, 1) > 0 THEN
        v_can_move := true;
      END IF;
    END IF;
  END IF;

  v_result := COALESCE(p_session.parity_state -> '__result__', 'null'::jsonb);
  IF v_result IS NULL OR jsonb_typeof(v_result) = 'null' THEN
    v_winner := CASE WHEN (v_board ->> 'winner') IS NULL THEN NULL ELSE (v_board ->> 'winner')::int END;
    IF v_winner IS NOT NULL THEN
      v_active_count := COALESCE(cardinality(p_session.active_seats), 0);
      v_entry := COALESCE((p_session.parity_state ->> '__entry__')::bigint, 0);
      v_mult := COALESCE((p_session.parity_state -> '__double__' ->> 'value')::int, 1);
      v_result := jsonb_build_object(
        'winner', v_winner,
        'multiplier', v_mult,
        'prize', (v_entry * v_active_count * v_mult),
        'timestamp', (extract(epoch from COALESCE(p_session.updated_at, now())) * 1000)::bigint
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'revision', p_session.revision,
    'sessionId', p_session.id::text,
    'roomId', p_session.room_id::text,
    'phase', p_session.phase,
    'activeSeats', to_jsonb(p_session.active_seats),
    'mySeat', CASE WHEN v_my_seat IS NULL THEN 'null'::jsonb ELSE to_jsonb(v_my_seat) END,
    'board', v_board,
    'turnSeat', to_jsonb(v_turn),
    'dice', COALESCE((v_board -> 'dice'), 'null'::jsonb),
    'lastDice', COALESCE((v_board -> 'lastDice'), 'null'::jsonb),
    'winnerSeat', CASE WHEN (v_board ->> 'winner') IS NULL THEN 'null'::jsonb ELSE to_jsonb((v_board ->> 'winner')::int) END,
    'canClientRoll', v_can_roll,
    'canClientMovePiece', v_can_move,
    'boardViewReadOnly', (v_my_seat IS NULL OR v_finished OR (NOT v_can_roll AND NOT v_can_move)),
    'legalMovablePieceIndices', CASE WHEN v_legal IS NULL THEN 'null'::jsonb ELSE to_jsonb(v_legal) END,
    'currentTurn', p_session.current_turn,
    'turnDeadline', CASE WHEN p_session.turn_deadline IS NULL THEN NULL ELSE extract(epoch from p_session.turn_deadline) * 1000 END,
    'doubleState', COALESCE(p_session.parity_state -> '__double__', '{}'::jsonb),
    'result', COALESCE(v_result, 'null'::jsonb),
    'missedTurns', COALESCE(p_session.parity_state -> 'missed_turns', '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_ludo_claim_seat(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_ludo_claim_seat(uuid, text, integer) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_ludo_leave_seat(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_ludo_leave_seat(uuid, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_ludo_leader_key(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_ludo_leader_key(uuid) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_ludo_primary_session_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_ludo_primary_session_id(uuid) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_ludo_open_session(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_ludo_open_session(uuid, text, text) TO anon, authenticated, service_role;

COMMIT;

