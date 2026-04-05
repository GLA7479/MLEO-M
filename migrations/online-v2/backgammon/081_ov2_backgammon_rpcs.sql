-- Backgammon RPCs: open session (shared bridge), roll, move, snapshot, forfeit, rematch, settlement, claim.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_backgammon_primary_session_id(p_room_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT s.id INTO v_id
  FROM public.ov2_backgammon_sessions s
  WHERE s.room_id = p_room_id
    AND s.status = 'live'
    AND s.phase = 'playing'
  ORDER BY s.match_seq DESC, s.created_at DESC
  LIMIT 1;
  IF FOUND THEN
    RETURN v_id;
  END IF;
  SELECT s.id INTO v_id
  FROM public.ov2_backgammon_sessions s
  WHERE s.room_id = p_room_id
    AND s.status = 'live'
  ORDER BY s.match_seq DESC, s.created_at DESC
  LIMIT 1;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_backgammon_primary_session_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_backgammon_primary_session_id(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ov2_backgammon_build_client_snapshot(
  p_session public.ov2_backgammon_sessions,
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
  v_can_move boolean := false;
  v_w int;
BEGIN
  v_board := COALESCE(p_session.board, '{}'::jsonb);
  v_turn := (v_board ->> 'turnSeat')::int;
  v_phase := p_session.phase;
  SELECT s.seat_index INTO v_my_seat
  FROM public.ov2_backgammon_seats s
  WHERE s.session_id = p_session.id AND s.participant_key = v_pk;
  v_finished := (v_phase = 'finished' OR (v_board ->> 'winner') IS NOT NULL);
  v_w := public.ov2_bg_check_winner(v_board);

  IF p_session.status = 'live' AND NOT v_finished AND v_my_seat IS NOT NULL THEN
    IF v_my_seat = v_turn
       AND (v_board -> 'diceAvail' IS NULL OR jsonb_typeof(v_board -> 'diceAvail') <> 'array'
         OR jsonb_array_length(COALESCE(v_board -> 'diceAvail', '[]'::jsonb)) = 0)
       AND (v_board -> 'dice' IS NULL OR jsonb_typeof(v_board -> 'dice') = 'null') THEN
      v_can_roll := true;
    END IF;
    IF v_my_seat = v_turn
       AND v_board -> 'diceAvail' IS NOT NULL
       AND jsonb_typeof(v_board -> 'diceAvail') = 'array'
       AND jsonb_array_length(v_board -> 'diceAvail') > 0 THEN
      v_can_move := true;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'revision', p_session.revision,
    'sessionId', p_session.id::text,
    'roomId', p_session.room_id::text,
    'phase', v_phase,
    'activeSeats', to_jsonb(p_session.active_seats),
    'mySeat', CASE WHEN v_my_seat IS NULL THEN NULL::jsonb ELSE to_jsonb(v_my_seat) END,
    'board', v_board,
    'turnSeat', to_jsonb(v_turn),
    'winnerSeat', CASE WHEN p_session.winner_seat IS NULL THEN NULL::jsonb ELSE to_jsonb(p_session.winner_seat) END,
    'canClientRoll', v_can_roll,
    'canClientMove', v_can_move,
    'boardViewReadOnly', (v_my_seat IS NULL OR v_finished OR (NOT v_can_roll AND NOT v_can_move))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_backgammon_open_session(
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
  v_sess public.ov2_backgammon_sessions%ROWTYPE;
  v_existing public.ov2_backgammon_sessions%ROWTYPE;
  v_seated_count int;
  v_board jsonb;
  v_is_shared boolean;
  v_entry bigint;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id required');
  END IF;
  v_pk := trim(COALESCE(p_participant_key, ''));
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'participant_key required');
  END IF;
  PERFORM COALESCE(p_presence_leader_key, '');

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.product_game_id IS DISTINCT FROM 'ov2_backgammon' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a Backgammon room');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND m.participant_key = v_pk
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Only room members can open a session');
  END IF;
  IF v_room.host_participant_key IS DISTINCT FROM v_pk THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_HOST', 'message', 'Only room host can open a Backgammon session');
  END IF;

  v_is_shared := COALESCE(v_room.shared_schema_version, 0) = 1;
  IF v_is_shared THEN
    IF COALESCE(v_room.status, '') IS DISTINCT FROM 'IN_GAME' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_STARTED', 'message', 'Room must be started before opening a session.');
    END IF;
  ELSE
    IF v_room.lifecycle_phase IS DISTINCT FROM 'active' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_ACTIVE', 'message', 'Room must be active before opening a session.');
    END IF;
  END IF;

  IF v_room.active_session_id IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.ov2_backgammon_sessions
    WHERE id = v_room.active_session_id AND room_id = p_room_id;
    IF FOUND AND v_existing.status = 'live' AND v_existing.phase = 'playing' THEN
      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'snapshot', public.ov2_backgammon_build_client_snapshot(v_existing, v_pk)
      );
    END IF;
  END IF;

  SELECT count(*)::int INTO v_seated_count
  FROM public.ov2_room_members
  WHERE room_id = p_room_id AND seat_index IS NOT NULL;
  IF v_seated_count IS DISTINCT FROM 2 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_SEAT_COUNT', 'message', 'Backgammon requires exactly two seated players');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL
      AND m.seat_index NOT IN (0, 1)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_SEATS', 'message', 'Use seats 1 and 2 only (indices 0 and 1)');
  END IF;

  v_board := public.ov2_bg_initial_board_json();
  v_entry := COALESCE(v_room.stake_per_seat, 0);

  INSERT INTO public.ov2_backgammon_sessions (
    room_id, match_seq, status, phase, revision, board, turn_seat, winner_seat, active_seats, parity_state
  ) VALUES (
    p_room_id,
    v_room.match_seq,
    'live',
    'playing',
    0,
    v_board,
    (v_board ->> 'turnSeat')::int,
    NULL,
    ARRAY[0, 1]::integer[],
    jsonb_build_object('__entry__', to_jsonb(v_entry), '__result__', NULL)
  )
  RETURNING * INTO v_sess;

  INSERT INTO public.ov2_backgammon_seats (session_id, seat_index, participant_key, room_member_id, meta)
  SELECT
    v_sess.id,
    m.seat_index::int,
    m.participant_key,
    m.id,
    '{}'::jsonb
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL
  ORDER BY m.seat_index ASC;

  UPDATE public.ov2_rooms
  SET
    active_session_id = v_sess.id,
    active_runtime_id = v_sess.id,
    updated_at = now()
  WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'snapshot', public.ov2_backgammon_build_client_snapshot(v_sess, v_pk)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_backgammon_roll(
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
  v_sess public.ov2_backgammon_sessions%ROWTYPE;
  v_seat int;
  v_board jsonb;
  v_d1 int;
  v_d2 int;
  v_avail jsonb;
  v_turn int;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id required');
  END IF;
  v_pk := trim(COALESCE(p_participant_key, ''));
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'participant_key required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_backgammon' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No active session');
  END IF;

  SELECT * INTO v_sess FROM public.ov2_backgammon_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.room_id IS DISTINCT FROM p_room_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;
  IF p_expected_revision IS NOT NULL AND v_sess.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REVISION_MISMATCH', 'message', 'Revision mismatch', 'revision', v_sess.revision);
  END IF;
  IF v_sess.status IS DISTINCT FROM 'live' OR v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_PLAYING', 'message', 'Session not playing');
  END IF;

  SELECT seat_index INTO v_seat FROM public.ov2_backgammon_seats WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No seat for participant');
  END IF;

  v_board := v_sess.board;
  v_turn := (v_board ->> 'turnSeat')::int;
  IF v_turn IS DISTINCT FROM v_seat THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_YOUR_TURN', 'message', 'Not your turn');
  END IF;
  IF jsonb_array_length(COALESCE(v_board -> 'diceAvail', '[]'::jsonb)) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'DICE_PENDING', 'message', 'Finish moves before rolling again');
  END IF;

  v_d1 := 1 + floor(random() * 6)::int;
  v_d2 := 1 + floor(random() * 6)::int;
  IF v_d1 = v_d2 THEN
    v_avail := jsonb_build_array(v_d1, v_d1, v_d1, v_d1);
  ELSE
    v_avail := jsonb_build_array(GREATEST(v_d1, v_d2), LEAST(v_d1, v_d2));
  END IF;

  v_board := jsonb_set(jsonb_set(v_board, '{dice}', jsonb_build_array(v_d1, v_d2), true), '{diceAvail}', v_avail, true);

  IF NOT public.ov2_bg_any_legal_exists(v_board, v_turn) THEN
    v_board := public.ov2_bg_finish_turn_board(v_board);
  END IF;

  UPDATE public.ov2_backgammon_sessions
  SET
    board = v_board,
    turn_seat = (v_board ->> 'turnSeat')::int,
    revision = v_sess.revision + 1,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_backgammon_build_client_snapshot(v_sess, v_pk));
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_backgammon_move(
  p_room_id uuid,
  p_participant_key text,
  p_from integer,
  p_to integer,
  p_die integer,
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
  v_sess public.ov2_backgammon_sessions%ROWTYPE;
  v_seat int;
  v_board jsonb;
  v_turn int;
  v_ap jsonb;
  v_w int;
  v_entry bigint;
  v_ps jsonb;
BEGIN
  IF p_room_id IS NULL OR p_die IS NULL OR p_die < 1 OR p_die > 6 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Invalid arguments');
  END IF;
  v_pk := trim(COALESCE(p_participant_key, ''));
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'participant_key required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_backgammon' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No active session');
  END IF;

  SELECT * INTO v_sess FROM public.ov2_backgammon_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;
  IF p_expected_revision IS NOT NULL AND v_sess.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REVISION_MISMATCH', 'message', 'Revision mismatch', 'revision', v_sess.revision);
  END IF;
  IF v_sess.status IS DISTINCT FROM 'live' OR v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_PLAYING', 'message', 'Session not playing');
  END IF;

  SELECT seat_index INTO v_seat FROM public.ov2_backgammon_seats WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No seat for participant');
  END IF;

  v_board := v_sess.board;
  v_turn := (v_board ->> 'turnSeat')::int;
  IF v_turn IS DISTINCT FROM v_seat THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_YOUR_TURN', 'message', 'Not your turn');
  END IF;

  v_ap := public.ov2_bg_apply_step_full(v_board, v_turn, p_from, p_to, p_die);
  IF coalesce((v_ap ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', COALESCE(v_ap ->> 'code', 'ILLEGAL_MOVE'),
      'message', 'Illegal move'
    );
  END IF;

  v_board := v_ap -> 'board';
  v_w := public.ov2_bg_check_winner(v_board);
  IF v_w IS NOT NULL THEN
    v_board := jsonb_set(v_board, '{winner}', to_jsonb(v_w), true);
    v_entry := COALESCE((v_sess.parity_state ->> '__entry__')::bigint, 0);
    v_ps := jsonb_set(
      COALESCE(v_sess.parity_state, '{}'::jsonb),
      '{__result__}',
      jsonb_build_object(
        'winner', v_w,
        'prize', v_entry * 2,
        'lossPerSeat', v_entry,
        'timestamp', (extract(epoch from now()) * 1000)::bigint
      ),
      true
    );
    UPDATE public.ov2_backgammon_sessions
    SET
      board = v_board,
      turn_seat = (v_board ->> 'turnSeat')::int,
      winner_seat = v_w,
      phase = 'finished',
      parity_state = v_ps,
      revision = v_sess.revision + 1,
      updated_at = now()
    WHERE id = v_sess.id
    RETURNING * INTO v_sess;
    RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_backgammon_build_client_snapshot(v_sess, v_pk));
  END IF;

  IF jsonb_array_length(COALESCE(v_board -> 'diceAvail', '[]'::jsonb)) = 0 THEN
    v_board := public.ov2_bg_finish_turn_board(v_board);
  ELSIF NOT public.ov2_bg_any_legal_exists(v_board, v_turn) THEN
    v_board := public.ov2_bg_finish_turn_board(v_board);
  END IF;

  UPDATE public.ov2_backgammon_sessions
  SET
    board = v_board,
    turn_seat = (v_board ->> 'turnSeat')::int,
    revision = v_sess.revision + 1,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_backgammon_build_client_snapshot(v_sess, v_pk));
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_backgammon_get_snapshot(
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
  v_sess public.ov2_backgammon_sessions%ROWTYPE;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id required');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_backgammon' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a Backgammon room');
  END IF;
  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SESSION', 'message', 'No active session');
  END IF;
  SELECT * INTO v_sess
  FROM public.ov2_backgammon_sessions
  WHERE id = v_room.active_session_id AND room_id = p_room_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;
  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_backgammon_build_client_snapshot(v_sess, v_pk));
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_backgammon_voluntary_forfeit(
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
  v_sess public.ov2_backgammon_sessions%ROWTYPE;
  v_seat int;
  v_other int;
  v_entry bigint;
  v_ps jsonb;
  v_board jsonb;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_backgammon' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Not a Backgammon room');
  END IF;
  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No active session');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_backgammon_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_PLAYING', 'message', 'Session not in play');
  END IF;
  SELECT seat_index INTO v_seat FROM public.ov2_backgammon_seats WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_IN_MATCH', 'message', 'Not seated in this session');
  END IF;
  v_other := CASE WHEN v_seat = 0 THEN 1 ELSE 0 END;
  v_entry := COALESCE((v_sess.parity_state ->> '__entry__')::bigint, 0);
  v_board := jsonb_set(COALESCE(v_sess.board, '{}'::jsonb), '{winner}', to_jsonb(v_other), true);
  v_ps := jsonb_set(
    COALESCE(v_sess.parity_state, '{}'::jsonb),
    '{__result__}',
    jsonb_build_object(
      'winner', v_other,
      'prize', v_entry * 2,
      'lossPerSeat', v_entry,
      'forfeit_by', v_pk,
      'timestamp', (extract(epoch from now()) * 1000)::bigint
    ),
    true
  );

  UPDATE public.ov2_backgammon_sessions
  SET
    board = v_board,
    winner_seat = v_other,
    phase = 'finished',
    parity_state = v_ps,
    revision = revision + 1,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_backgammon_build_client_snapshot(v_sess, v_pk));
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_backgammon_after_finish_emit_settlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res jsonb;
  v_winner_seat int;
  v_winner_pk text;
  v_prize bigint;
  v_loss bigint;
  v_entry bigint;
  r record;
  v_idem text;
  v_room_id uuid := NEW.room_id;
  v_match_seq int := NEW.match_seq;
  v_sess_id uuid := NEW.id;
BEGIN
  v_res := COALESCE(NEW.parity_state, '{}'::jsonb) -> '__result__';
  IF v_res IS NULL OR jsonb_typeof(v_res) = 'null' OR NOT (v_res ? 'winner') THEN
    RETURN NULL;
  END IF;
  v_winner_seat := (v_res ->> 'winner')::int;
  IF v_winner_seat IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT trim(participant_key) INTO v_winner_pk
  FROM public.ov2_backgammon_seats
  WHERE session_id = v_sess_id AND seat_index = v_winner_seat
  LIMIT 1;
  IF v_winner_pk IS NULL OR length(v_winner_pk) = 0 THEN
    RETURN NULL;
  END IF;
  v_entry := COALESCE((NEW.parity_state ->> '__entry__')::bigint, 0);
  v_prize := COALESCE(NULLIF((v_res ->> 'prize'), '')::bigint, 0);
  v_loss := COALESCE(NULLIF((v_res ->> 'lossPerSeat'), '')::bigint, 0);
  IF v_loss IS NULL OR v_loss <= 0 THEN
    v_loss := v_entry;
  END IF;
  IF v_prize IS NULL OR v_prize <= 0 THEN
    v_prize := v_loss * 2;
  END IF;

  v_idem := 'ov2:settle:' || v_room_id::text || ':' || v_sess_id::text || ':' || v_winner_pk || ':bg_win:';
  INSERT INTO public.ov2_settlement_lines (
    room_id, match_seq, recipient_participant_key, line_kind, amount, idempotency_key, game_session_id, meta
  ) VALUES (
    v_room_id,
    v_match_seq,
    v_winner_pk,
    'bg_win',
    v_prize,
    v_idem,
    v_sess_id,
    jsonb_build_object(
      'gameId', 'ov2_backgammon',
      'sessionId', v_sess_id,
      'winnerSeat', v_winner_seat,
      'prize', v_prize,
      'lossPerSeat', v_loss,
      'lossAlreadyCommitted', true
    )
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  FOR r IN
    SELECT trim(participant_key) AS pk, seat_index
    FROM public.ov2_backgammon_seats
    WHERE session_id = v_sess_id
      AND seat_index IS DISTINCT FROM v_winner_seat
  LOOP
    IF r.pk IS NULL OR length(r.pk) = 0 THEN
      CONTINUE;
    END IF;
    v_idem := 'ov2:settle:' || v_room_id::text || ':' || v_sess_id::text || ':' || r.pk || ':bg_loss:';
    INSERT INTO public.ov2_settlement_lines (
      room_id, match_seq, recipient_participant_key, line_kind, amount, idempotency_key, game_session_id, meta
    ) VALUES (
      v_room_id,
      v_match_seq,
      r.pk,
      'bg_loss',
      0,
      v_idem,
      v_sess_id,
      jsonb_build_object(
        'gameId', 'ov2_backgammon',
        'sessionId', v_sess_id,
        'seat', r.seat_index,
        'lossPerSeat', v_loss,
        'lossAlreadyCommitted', true
      )
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END LOOP;

  UPDATE public.ov2_backgammon_sessions
  SET status = 'closed', updated_at = now()
  WHERE id = v_sess_id AND status IS DISTINCT FROM 'closed';

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_ov2_backgammon_finish_settlement ON public.ov2_backgammon_sessions;
CREATE TRIGGER trg_ov2_backgammon_finish_settlement
AFTER UPDATE OF phase ON public.ov2_backgammon_sessions
FOR EACH ROW
WHEN (NEW.phase IS NOT DISTINCT FROM 'finished' AND OLD.phase IS DISTINCT FROM 'finished')
EXECUTE FUNCTION public.ov2_backgammon_after_finish_emit_settlement();

CREATE OR REPLACE FUNCTION public._ov2_bg_member_rematch_requested(p_meta jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    (p_meta -> 'bg' ->> 'rematch_requested') IN ('true', 't', '1')
    OR (p_meta -> 'bg' -> 'rematch_requested') IS NOT DISTINCT FROM 'true'::jsonb;
$$;

CREATE OR REPLACE FUNCTION public.ov2_backgammon_request_rematch(
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
  v_sess public.ov2_backgammon_sessions%ROWTYPE;
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_member public.ov2_room_members%ROWTYPE;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_backgammon' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.lifecycle_phase IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_ACTIVE', 'message', 'Room must be active');
  END IF;
  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No active session');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_backgammon_sessions WHERE id = v_room.active_session_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;
  IF v_sess.phase IS DISTINCT FROM 'finished' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REMATCH_NOT_ALLOWED', 'message', 'Match must be finished');
  END IF;
  IF v_sess.match_seq IS DISTINCT FROM v_room.match_seq THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STALE_SESSION', 'message', 'Stale session');
  END IF;
  SELECT * INTO v_member FROM public.ov2_room_members WHERE room_id = p_room_id AND participant_key = v_pk;
  IF NOT FOUND OR v_member.seat_index IS NULL OR v_member.wallet_state IS DISTINCT FROM 'committed' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_ELIGIBLE', 'message', 'Must be seated and committed');
  END IF;
  IF public._ov2_bg_member_rematch_requested(v_member.meta) THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;
  UPDATE public.ov2_room_members
  SET
    meta = jsonb_set(
      COALESCE(meta, '{}'::jsonb),
      '{bg}',
      COALESCE(meta -> 'bg', '{}'::jsonb)
        || jsonb_build_object('rematch_requested', true, 'rematch_at', to_jsonb(now()::text)),
      true
    ),
    updated_at = now()
  WHERE room_id = p_room_id AND participant_key = v_pk;
  RETURN jsonb_build_object('ok', true, 'idempotent', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_backgammon_cancel_rematch(
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
  v_member public.ov2_room_members%ROWTYPE;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_backgammon' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  SELECT * INTO v_member FROM public.ov2_room_members WHERE room_id = p_room_id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Not a member');
  END IF;
  IF NOT public._ov2_bg_member_rematch_requested(v_member.meta) THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;
  UPDATE public.ov2_room_members
  SET
    meta = CASE
      WHEN meta ? 'bg' THEN jsonb_set(meta, '{bg}', (meta -> 'bg') - 'rematch_requested' - 'rematch_at', true)
      ELSE meta
    END,
    updated_at = now()
  WHERE room_id = p_room_id AND participant_key = v_pk;
  RETURN jsonb_build_object('ok', true, 'idempotent', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_backgammon_start_next_match(
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
  v_sess public.ov2_backgammon_sessions%ROWTYPE;
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_next_ms int;
  v_eligible int;
  v_ready int;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_backgammon' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.host_participant_key IS DISTINCT FROM v_pk THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_HOST', 'message', 'Only host can start next match');
  END IF;
  IF p_expected_match_seq IS NOT NULL AND p_expected_match_seq IS DISTINCT FROM v_room.match_seq THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STALE_MATCH_SEQ', 'message', 'match_seq changed', 'match_seq', v_room.match_seq);
  END IF;
  IF v_room.lifecycle_phase IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_ACTIVE', 'message', 'Room must be active');
  END IF;
  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No session');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_backgammon_sessions WHERE id = v_room.active_session_id;
  IF NOT FOUND OR v_sess.phase IS DISTINCT FROM 'finished' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REMATCH_NOT_ALLOWED', 'message', 'Previous match must be finished');
  END IF;
  IF v_sess.match_seq IS DISTINCT FROM v_room.match_seq THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STALE_SESSION', 'message', 'Session mismatch');
  END IF;
  SELECT count(*)::int INTO v_eligible
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL AND m.wallet_state = 'committed';
  IF v_eligible < 2 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_ENOUGH_PLAYERS', 'message', 'Need two seated committed players');
  END IF;
  SELECT count(*)::int INTO v_ready
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id
    AND m.seat_index IS NOT NULL
    AND m.wallet_state = 'committed'
    AND public._ov2_bg_member_rematch_requested(m.meta);
  IF v_ready < v_eligible THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'NOT_ALL_REMATCH_READY',
      'message', 'All players must request rematch first',
      'ready', v_ready,
      'eligible', v_eligible
    );
  END IF;
  v_next_ms := COALESCE(v_room.match_seq, 0) + 1;
  UPDATE public.ov2_room_members m
  SET
    meta = CASE
      WHEN m.meta ? 'bg' THEN jsonb_set(m.meta, '{bg}', (m.meta -> 'bg') - 'rematch_requested' - 'rematch_at', true)
      ELSE m.meta
    END,
    wallet_state = CASE WHEN m.seat_index IS NOT NULL THEN 'none' ELSE m.wallet_state END,
    amount_locked = CASE WHEN m.seat_index IS NOT NULL THEN 0 ELSE m.amount_locked END,
    updated_at = now()
  WHERE m.room_id = p_room_id;
  UPDATE public.ov2_rooms
  SET
    match_seq = v_next_ms,
    active_session_id = NULL,
    active_runtime_id = NULL,
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

CREATE OR REPLACE FUNCTION public.ov2_backgammon_claim_settlement(
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
  v_pk text;
  v_has_any boolean;
  v_has_undelivered boolean;
  v_lines jsonb;
  v_total bigint;
  v_idempotent boolean;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id required');
  END IF;
  v_pk := trim(COALESCE(p_participant_key, ''));
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'participant_key required');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_backgammon' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a Backgammon room');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND trim(m.participant_key) = v_pk
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Not a member');
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.ov2_settlement_lines sl
    WHERE sl.room_id = p_room_id AND trim(sl.recipient_participant_key) = v_pk
  ) INTO v_has_any;
  SELECT EXISTS (
    SELECT 1 FROM public.ov2_settlement_lines sl
    WHERE sl.room_id = p_room_id AND trim(sl.recipient_participant_key) = v_pk AND sl.vault_delivered_at IS NULL
  ) INTO v_has_undelivered;
  IF NOT v_has_undelivered THEN
    v_idempotent := v_has_any;
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', v_idempotent,
      'room_id', p_room_id,
      'participant_key', v_pk,
      'lines', '[]'::jsonb,
      'total_amount', 0
    );
  END IF;
  WITH u AS (
    UPDATE public.ov2_settlement_lines sl
    SET vault_delivered_at = now()
    WHERE sl.room_id = p_room_id
      AND trim(sl.recipient_participant_key) = v_pk
      AND sl.vault_delivered_at IS NULL
    RETURNING sl.id, sl.amount, sl.line_kind, sl.idempotency_key, sl.match_seq
  )
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', u.id,
          'amount', u.amount,
          'line_kind', u.line_kind,
          'idempotency_key', u.idempotency_key,
          'match_seq', u.match_seq
        )
        ORDER BY u.match_seq, u.id
      ),
      '[]'::jsonb
    ),
    COALESCE(sum(u.amount), 0)::bigint
  INTO v_lines, v_total
  FROM u;
  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'room_id', p_room_id,
    'participant_key', v_pk,
    'lines', COALESCE(v_lines, '[]'::jsonb),
    'total_amount', COALESCE(v_total, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_backgammon_open_session(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_backgammon_open_session(uuid, text, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_backgammon_roll(uuid, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_backgammon_roll(uuid, text, bigint) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_backgammon_move(uuid, text, integer, integer, integer, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_backgammon_move(uuid, text, integer, integer, integer, bigint) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_backgammon_get_snapshot(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_backgammon_get_snapshot(uuid, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_backgammon_voluntary_forfeit(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_backgammon_voluntary_forfeit(uuid, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public._ov2_bg_member_rematch_requested(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ov2_backgammon_request_rematch(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_backgammon_request_rematch(uuid, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_backgammon_cancel_rematch(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_backgammon_cancel_rematch(uuid, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_backgammon_start_next_match(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_backgammon_start_next_match(uuid, text, integer) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_backgammon_claim_settlement(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_backgammon_claim_settlement(uuid, text) TO anon, authenticated, service_role;

COMMIT;
