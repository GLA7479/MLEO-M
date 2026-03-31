-- OV2 Ludo parity follow-up:
-- - authoritative turn deadline refresh on roll/move transitions
-- - missed-turn guard: only expired authoritative turns are punishable
-- - host-only rematch RPC for finished sessions

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_ludo_roll(
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
  v_pk text;
  v_sess public.ov2_ludo_sessions%ROWTYPE;
  v_seat int;
  v_board jsonb;
  v_roll int;
  v_movable int[];
  v_turn int;
  v_next_turn int;
  v_new_deadline timestamptz;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id required');
  END IF;
  v_pk := trim(COALESCE(p_participant_key, ''));
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'participant_key required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_ludo' OR v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_ludo_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.room_id IS DISTINCT FROM p_room_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;
  IF p_expected_revision IS NOT NULL AND v_sess.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REVISION_MISMATCH', 'message', 'Revision mismatch', 'revision', v_sess.revision);
  END IF;
  IF v_sess.status IS DISTINCT FROM 'live' OR v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_PLAYING', 'message', 'Session not in playing phase');
  END IF;

  SELECT seat_index INTO v_seat FROM public.ov2_ludo_seats WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No Ludo seat for participant');
  END IF;

  v_board := v_sess.board;
  v_turn := (v_board ->> 'turnSeat')::int;
  IF v_turn IS DISTINCT FROM v_seat THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_YOUR_TURN', 'message', 'Not your turn to roll');
  END IF;
  IF v_board ? 'dice' AND jsonb_typeof(v_board -> 'dice') <> 'null' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'DICE_ALREADY_SET', 'message', 'Roll already pending move');
  END IF;
  IF (v_board ->> 'winner') IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_FINISHED', 'message', 'Game already finished');
  END IF;

  v_roll := 1 + floor(random() * 6)::int;
  v_board := jsonb_set(v_board, '{dice}', to_jsonb(v_roll), true);

  v_movable := public.ov2_ludo_list_movable_pieces(v_board, v_turn, v_roll);
  IF v_movable IS NULL OR array_length(v_movable, 1) IS NULL OR array_length(v_movable, 1) = 0 THEN
    v_board := jsonb_set(v_board, '{lastDice}', to_jsonb(v_roll), true);
    v_board := jsonb_set(v_board, '{dice}', 'null'::jsonb, true);
    v_board := jsonb_set(v_board, '{extraTurn}', 'false'::jsonb, true);
    v_board := public.ov2_ludo_next_turn_on_board(v_board);
  END IF;

  v_next_turn := CASE WHEN (v_board ->> 'winner') IS NULL THEN (v_board ->> 'turnSeat')::int ELSE NULL END;
  IF (v_board ->> 'winner') IS NOT NULL THEN
    v_new_deadline := NULL;
  ELSIF v_sess.current_turn IS DISTINCT FROM v_next_turn OR v_sess.turn_deadline IS NULL THEN
    v_new_deadline := now() + make_interval(secs => GREATEST(5, COALESCE(NULLIF(current_setting('app.ludo_turn_seconds', true), '')::int, 30)));
  ELSE
    v_new_deadline := v_sess.turn_deadline;
  END IF;

  UPDATE public.ov2_ludo_sessions SET
    board = v_board,
    turn_seat = (v_board ->> 'turnSeat')::int,
    dice_value = CASE WHEN (v_board -> 'dice') IS NULL OR v_board -> 'dice' = 'null'::jsonb THEN NULL ELSE (v_board ->> 'dice')::int END,
    last_dice = (v_board ->> 'lastDice')::int,
    winner_seat = CASE WHEN (v_board ->> 'winner') IS NULL THEN NULL ELSE (v_board ->> 'winner')::int END,
    phase = CASE WHEN (v_board ->> 'winner') IS NOT NULL THEN 'finished' ELSE 'playing' END,
    current_turn = v_next_turn,
    turn_deadline = v_new_deadline,
    revision = v_sess.revision + 1,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_ludo_build_client_snapshot(v_sess, v_pk));
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ludo_move(
  p_room_id uuid,
  p_participant_key text,
  p_piece_index integer,
  p_expected_revision bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text;
  v_sess public.ov2_ludo_sessions%ROWTYPE;
  v_seat int;
  v_board jsonb;
  v_new_board jsonb;
  v_turn int;
  v_dice int;
  v_next_turn int;
  v_new_deadline timestamptz;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id required');
  END IF;
  v_pk := trim(COALESCE(p_participant_key, ''));
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'participant_key required');
  END IF;
  IF p_piece_index IS NULL OR p_piece_index < 0 OR p_piece_index > 3 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Invalid piece index');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_ludo' OR v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_ludo_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.room_id IS DISTINCT FROM p_room_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;
  IF p_expected_revision IS NOT NULL AND v_sess.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REVISION_MISMATCH', 'message', 'Revision mismatch', 'revision', v_sess.revision);
  END IF;
  IF v_sess.status IS DISTINCT FROM 'live' OR v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_PLAYING', 'message', 'Session not in playing phase');
  END IF;

  SELECT seat_index INTO v_seat FROM public.ov2_ludo_seats WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No Ludo seat for participant');
  END IF;

  v_board := v_sess.board;
  v_turn := (v_board ->> 'turnSeat')::int;
  v_dice := (v_board ->> 'dice')::int;
  IF v_turn IS DISTINCT FROM v_seat THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_YOUR_TURN', 'message', 'Not your turn to move');
  END IF;
  IF v_dice IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_DICE', 'message', 'Must roll before moving');
  END IF;
  IF NOT public.ov2_ludo_can_move_piece(v_board, v_seat, p_piece_index, v_dice) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ILLEGAL_MOVE', 'message', 'Illegal move');
  END IF;

  v_new_board := public.ov2_ludo_apply_move_on_board(v_board, v_seat, p_piece_index, v_dice);
  IF v_new_board IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'APPLY_FAILED', 'message', 'Move apply failed');
  END IF;
  IF (v_new_board ->> 'winner') IS NULL THEN
    v_new_board := public.ov2_ludo_next_turn_on_board(v_new_board);
  END IF;

  v_next_turn := CASE WHEN (v_new_board ->> 'winner') IS NULL THEN (v_new_board ->> 'turnSeat')::int ELSE NULL END;
  IF (v_new_board ->> 'winner') IS NOT NULL THEN
    v_new_deadline := NULL;
  ELSIF v_sess.current_turn IS DISTINCT FROM v_next_turn OR v_sess.turn_deadline IS NULL THEN
    v_new_deadline := now() + make_interval(secs => GREATEST(5, COALESCE(NULLIF(current_setting('app.ludo_turn_seconds', true), '')::int, 30)));
  ELSE
    v_new_deadline := v_sess.turn_deadline;
  END IF;

  UPDATE public.ov2_ludo_sessions SET
    board = v_new_board,
    turn_seat = (v_new_board ->> 'turnSeat')::int,
    dice_value = CASE WHEN (v_new_board -> 'dice') IS NULL OR v_new_board -> 'dice' = 'null'::jsonb THEN NULL ELSE (v_new_board ->> 'dice')::int END,
    last_dice = (v_new_board ->> 'lastDice')::int,
    winner_seat = CASE WHEN (v_new_board ->> 'winner') IS NULL THEN NULL ELSE (v_new_board ->> 'winner')::int END,
    phase = CASE WHEN (v_new_board ->> 'winner') IS NOT NULL THEN 'finished' ELSE 'playing' END,
    current_turn = v_next_turn,
    turn_deadline = v_new_deadline,
    revision = v_sess.revision + 1,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_ludo_build_client_snapshot(v_sess, v_pk));
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ludo_mark_missed_turn(
  p_room_id uuid,
  p_turn_seat integer,
  p_turn_participant_key text,
  p_turn_is_gone boolean DEFAULT false,
  p_expected_revision bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_sess public.ov2_ludo_sessions%ROWTYPE;
  v_board jsonb;
  v_turn int;
  v_key text;
  v_count int;
  v_active int[];
  v_next int;
  v_idx int;
  v_turn_pk text;
  v_mult int;
  v_entry bigint;
BEGIN
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
  IF NOT FOUND OR v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No active session');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_ludo_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_PLAYING', 'message', 'Session not in playing phase');
  END IF;
  IF p_expected_revision IS NOT NULL AND v_sess.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REVISION_MISMATCH', 'message', 'Revision mismatch');
  END IF;
  IF v_sess.turn_deadline IS NULL OR now() < v_sess.turn_deadline THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TURN_NOT_EXPIRED', 'message', 'Turn deadline not yet expired');
  END IF;

  v_board := COALESCE(v_sess.board, '{}'::jsonb);
  v_turn := COALESCE((v_board ->> 'turnSeat')::int, v_sess.current_turn);
  IF v_turn IS DISTINCT FROM p_turn_seat THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TURN_MOVED', 'message', 'Turn already moved');
  END IF;
  IF NOT (COALESCE(v_sess.active_seats, ARRAY[]::int[]) @> ARRAY[v_turn]) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TURN_OWNER_NOT_ACTIVE', 'message', 'Turn owner not active');
  END IF;
  v_turn_pk := (
    SELECT s.participant_key
    FROM public.ov2_ludo_seats s
    WHERE s.session_id = v_sess.id AND s.seat_index = v_turn
    LIMIT 1
  );
  IF v_turn_pk IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_TURN_OWNER', 'message', 'No participant mapped to turn seat');
  END IF;
  IF trim(COALESCE(p_turn_participant_key, '')) IS DISTINCT FROM v_turn_pk THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TURN_OWNER_CHANGED', 'message', 'Turn owner changed');
  END IF;
  IF COALESCE(p_turn_is_gone, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PLAYER_NOT_GONE', 'message', 'Turn owner is not marked gone');
  END IF;

  v_key := v_turn_pk;
  v_count := COALESCE((v_sess.parity_state -> 'missed_turns' ->> v_key)::int, 0) + 1;
  v_sess.parity_state := jsonb_set(
    jsonb_set(COALESCE(v_sess.parity_state, '{}'::jsonb), '{missed_turns}', COALESCE(v_sess.parity_state -> 'missed_turns', '{}'::jsonb), true),
    ARRAY['missed_turns', v_key],
    to_jsonb(v_count),
    true
  );

  IF v_count >= 3 THEN
    DELETE FROM public.ov2_ludo_seats
    WHERE session_id = v_sess.id
      AND seat_index = p_turn_seat
      AND participant_key = v_turn_pk;

    v_active := array_remove(COALESCE(v_sess.active_seats, ARRAY[]::int[]), p_turn_seat);
    v_board := jsonb_set(v_board, '{activeSeats}', to_jsonb(v_active), true);
    v_board := (v_board #- ARRAY['pieces', p_turn_seat::text]) #- ARRAY['finished', p_turn_seat::text];
    IF cardinality(v_active) = 1 THEN
      v_board := jsonb_set(v_board, '{winner}', to_jsonb(v_active[1]), true);
      v_mult := COALESCE((v_sess.parity_state -> '__double__' ->> 'value')::int, 1);
      v_entry := COALESCE((v_sess.parity_state ->> '__entry__')::bigint, 0);
      v_sess.parity_state := jsonb_set(
        COALESCE(v_sess.parity_state, '{}'::jsonb),
        '{__result__}',
        jsonb_build_object(
          'winner', v_active[1],
          'multiplier', v_mult,
          'prize', (v_entry * 1 * v_mult),
          'timestamp', (extract(epoch from now()) * 1000)::bigint
        ),
        true
      );
      UPDATE public.ov2_ludo_sessions
      SET board = v_board, active_seats = v_active, phase = 'finished', current_turn = NULL, turn_deadline = NULL, parity_state = v_sess.parity_state, revision = revision + 1, updated_at = now()
      WHERE id = v_sess.id
      RETURNING * INTO v_sess;
      RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_ludo_build_client_snapshot(v_sess, ''));
    END IF;
  ELSE
    v_active := COALESCE(v_sess.active_seats, ARRAY[]::int[]);
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
  v_board := jsonb_set(jsonb_set(v_board, '{turnSeat}', CASE WHEN v_next IS NULL THEN 'null'::jsonb ELSE to_jsonb(v_next) END, true), '{dice}', 'null'::jsonb, true);
  v_board := jsonb_set(v_board, '{lastDice}', 'null'::jsonb, true);

  UPDATE public.ov2_ludo_sessions
  SET
    board = v_board,
    active_seats = v_active,
    current_turn = v_next,
    turn_deadline = CASE WHEN v_next IS NULL THEN NULL ELSE now() + make_interval(secs => GREATEST(5, COALESCE(NULLIF(current_setting('app.ludo_turn_seconds', true), '')::int, 30))) END,
    parity_state = v_sess.parity_state,
    revision = revision + 1,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_ludo_build_client_snapshot(v_sess, ''));
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ludo_rematch(
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
  v_prev public.ov2_ludo_sessions%ROWTYPE;
  v_sess public.ov2_ludo_sessions%ROWTYPE;
  v_committed int;
  v_active int[];
  v_board jsonb;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_ludo' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.host_participant_key IS DISTINCT FROM v_pk THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_HOST', 'message', 'Only room host can start rematch');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ov2_room_members m WHERE m.room_id = p_room_id AND m.participant_key = v_pk
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Only room members can start rematch');
  END IF;

  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No Ludo session to rematch');
  END IF;
  SELECT * INTO v_prev FROM public.ov2_ludo_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_prev.phase IS DISTINCT FROM 'finished' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REMATCH_NOT_ALLOWED', 'message', 'Rematch only after finished match');
  END IF;

  SELECT count(*)::int INTO v_committed
  FROM public.ov2_room_members
  WHERE room_id = p_room_id AND seat_index IS NOT NULL;
  IF v_committed < 2 OR v_committed > 4 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_SEAT_COUNT', 'message', 'Need 2-4 seated players');
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
  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_ludo_build_client_snapshot(v_sess, v_pk));
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_ludo_rematch(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_ludo_rematch(uuid, text) TO anon, authenticated, service_role;

COMMIT;
