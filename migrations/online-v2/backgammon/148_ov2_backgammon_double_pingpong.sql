-- OV2 Backgammon: FlipGrid-style table stake doubles (ping-pong) + snapshot + mult on finishes.
-- File: `148_ov2_backgammon_double_pingpong.sql` (unique prefix; avoid duplicating `086` used by checkers schema).
-- Apply after `085_ov2_backgammon_submit_turn_crash_safe.sql`.
-- Requires `112_ov2_shared_stake_commit_max_liability.sql` (`ov2_shared_require_max_double_liability_for_open_session`).
-- Uses shared `ov2_bd_parity_stake_mult` (chess 146 / checkers 147 / same pattern — idempotent if defined).

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_bd_parity_stake_mult(p_parity jsonb)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_parity IS NULL OR jsonb_typeof(p_parity) <> 'object' THEN 1
    WHEN NOT (p_parity ? 'stake_multiplier') THEN 1
    ELSE greatest(1, least(16, coalesce(nullif((p_parity ->> 'stake_multiplier'), '')::int, 1)))
  END;
$$;

REVOKE ALL ON FUNCTION public.ov2_bd_parity_stake_mult(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_bd_parity_stake_mult(jsonb) TO anon, authenticated, service_role;

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
  v_td bigint;
  v_playing boolean;
  v_mult int;
  v_pd jsonb;
  v_can_offer_dbl boolean := false;
  v_can_respond_dbl boolean := false;
  v_dbl_acc int;
  v_ic0 int;
  v_ic1 int;
  v_last_init int;
BEGIN
  v_board := COALESCE(p_session.board, '{}'::jsonb);
  v_turn := (v_board ->> 'turnSeat')::int;
  v_phase := p_session.phase;
  SELECT s.seat_index INTO v_my_seat
  FROM public.ov2_backgammon_seats s
  WHERE s.session_id = p_session.id AND s.participant_key = v_pk;
  v_finished := (v_phase = 'finished' OR (v_board ->> 'winner') IS NOT NULL);
  v_w := public.ov2_bg_check_winner(v_board);
  v_playing := (p_session.status = 'live' AND NOT v_finished AND v_phase = 'playing');

  v_pd := p_session.parity_state -> 'pending_double';
  IF v_pd IS NULL OR jsonb_typeof(v_pd) <> 'object' THEN
    v_pd := NULL;
  END IF;
  IF v_playing AND v_pd IS NOT NULL THEN
    BEGIN
      IF (v_pd ->> 'responder_seat')::int IS NOT DISTINCT FROM v_my_seat THEN
        v_can_respond_dbl := true;
      END IF;
    EXCEPTION
      WHEN invalid_text_representation THEN
        v_can_respond_dbl := false;
    END;
  END IF;

  IF p_session.status = 'live' AND NOT v_finished AND v_my_seat IS NOT NULL AND v_pd IS NULL THEN
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

  v_mult := public.ov2_bd_parity_stake_mult(p_session.parity_state);
  v_dbl_acc := COALESCE((p_session.parity_state ->> 'doubles_accepted')::int, 0);
  v_ic0 := COALESCE((p_session.parity_state ->> 'double_init_0')::int, 0);
  v_ic1 := COALESCE((p_session.parity_state ->> 'double_init_1')::int, 0);
  v_last_init := NULL;
  IF COALESCE(p_session.parity_state, '{}'::jsonb) ? 'last_double_initiator_seat' THEN
    BEGIN
      v_last_init := (p_session.parity_state ->> 'last_double_initiator_seat')::int;
    EXCEPTION
      WHEN invalid_text_representation THEN
        v_last_init := NULL;
    END;
  END IF;
  IF v_playing AND v_pd IS NULL AND v_my_seat IS NOT NULL AND v_turn IN (0, 1) AND v_my_seat = v_turn THEN
    IF v_mult < 16 AND v_dbl_acc < 4 THEN
      IF (v_my_seat = 0 AND v_ic0 < 2 AND (v_last_init IS NULL OR v_last_init IS DISTINCT FROM 0))
         OR (v_my_seat = 1 AND v_ic1 < 2 AND (v_last_init IS NULL OR v_last_init IS DISTINCT FROM 1)) THEN
        v_can_offer_dbl := true;
      END IF;
    END IF;
  END IF;

  v_td := NULL;
  IF v_playing AND COALESCE(p_session.parity_state, '{}'::jsonb) ? 'turn_deadline_at' THEN
    v_td := (p_session.parity_state ->> 'turn_deadline_at')::bigint;
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
    'boardViewReadOnly', (v_my_seat IS NULL OR v_finished OR (NOT v_can_roll AND NOT v_can_move)),
    'turnDeadline', CASE WHEN v_td IS NULL THEN NULL::jsonb ELSE to_jsonb(v_td) END,
    'missedTurns', COALESCE(p_session.parity_state -> 'missed_turns', jsonb_build_object('0', 0, '1', 0)),
    'stakeMultiplier', to_jsonb(v_mult),
    'doublesAccepted', to_jsonb(v_dbl_acc),
    'pendingDouble', COALESCE(to_jsonb(v_pd), 'null'::jsonb),
    'canOfferDouble', v_can_offer_dbl,
    'mustRespondDouble', v_can_respond_dbl
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_backgammon_offer_double(
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
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_sess public.ov2_backgammon_sessions%ROWTYPE;
  v_seat int;
  v_board jsonb;
  v_turn int;
  v_ps jsonb;
  v_mult int;
  v_prop int;
  v_other int;
  v_dacc int;
  v_deadline bigint;
  v_ic0 int;
  v_ic1 int;
  v_last_init int;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
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
  IF COALESCE(v_sess.parity_state, '{}'::jsonb) ? 'pending_double' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'DOUBLE_PENDING', 'message', 'A stake increase is already pending');
  END IF;

  SELECT seat_index INTO v_seat FROM public.ov2_backgammon_seats WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No seat for participant');
  END IF;

  v_board := v_sess.board;
  v_turn := (v_board ->> 'turnSeat')::int;
  IF v_turn IS DISTINCT FROM v_seat THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_YOUR_TURN', 'message', 'Only the active player can propose a stake increase');
  END IF;

  v_ps := COALESCE(v_sess.parity_state, '{}'::jsonb);
  v_mult := public.ov2_bd_parity_stake_mult(v_ps);
  v_dacc := COALESCE((v_ps ->> 'doubles_accepted')::int, 0);
  IF v_dacc >= 4 OR v_mult >= 16 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_MORE_DOUBLES', 'message', 'Maximum stake increases reached');
  END IF;

  v_ic0 := COALESCE((v_ps ->> 'double_init_0')::int, 0);
  v_ic1 := COALESCE((v_ps ->> 'double_init_1')::int, 0);
  IF v_seat = 0 AND v_ic0 >= 2 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_MORE_DOUBLES', 'message', 'Maximum stake increases reached');
  END IF;
  IF v_seat = 1 AND v_ic1 >= 2 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_MORE_DOUBLES', 'message', 'Maximum stake increases reached');
  END IF;

  v_last_init := NULL;
  IF v_ps ? 'last_double_initiator_seat' THEN
    BEGIN
      v_last_init := (v_ps ->> 'last_double_initiator_seat')::int;
    EXCEPTION
      WHEN invalid_text_representation THEN
        v_last_init := NULL;
    END;
  END IF;
  IF v_last_init IS NOT NULL AND v_last_init = v_seat THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'DOUBLE_NOT_ALTERNATING',
      'message', 'Wait for your opponent to propose a stake increase before you can propose again'
    );
  END IF;

  v_prop := v_mult * 2;
  IF v_prop > 16 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_MORE_DOUBLES', 'message', 'Maximum stake multiplier is 16');
  END IF;

  v_other := CASE WHEN v_seat = 0 THEN 1 ELSE 0 END;
  v_deadline := (extract(epoch from now()) * 1000)::bigint + 30000;

  v_ps := jsonb_set(
    v_ps,
    '{pending_double}',
    jsonb_build_object(
      'from_seat', v_seat,
      'responder_seat', v_other,
      'proposed_mult', v_prop,
      'deadline_ms', v_deadline
    ),
    true
  );
  v_ps := jsonb_set(v_ps, '{turn_deadline_at}', to_jsonb(v_deadline), true);
  v_ps := jsonb_set(v_ps, '{turn_deadline_seat}', to_jsonb(v_other), true);
  v_ps := jsonb_set(v_ps, '{last_double_initiator_seat}', to_jsonb(v_seat), true);
  IF v_seat = 0 THEN
    v_ps := jsonb_set(v_ps, '{double_init_0}', to_jsonb(v_ic0 + 1), true);
  ELSE
    v_ps := jsonb_set(v_ps, '{double_init_1}', to_jsonb(v_ic1 + 1), true);
  END IF;

  UPDATE public.ov2_backgammon_sessions
  SET
    parity_state = v_ps,
    revision = v_sess.revision + 1,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_backgammon_build_client_snapshot(v_sess, v_pk));
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_backgammon_respond_double(
  p_room_id uuid,
  p_participant_key text,
  p_accept boolean,
  p_expected_revision bigint DEFAULT NULL
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
  v_ps jsonb;
  v_pd jsonb;
  v_from int;
  v_resp int;
  v_prop int;
  v_mult int;
  v_entry bigint;
  v_board jsonb;
  v_dacc int;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
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

  v_ps := COALESCE(v_sess.parity_state, '{}'::jsonb);
  IF NOT (v_ps ? 'pending_double') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_PENDING_DOUBLE', 'message', 'Nothing to respond to');
  END IF;

  v_pd := v_ps -> 'pending_double';
  SELECT seat_index INTO v_seat FROM public.ov2_backgammon_seats WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No seat for participant');
  END IF;

  v_resp := (v_pd ->> 'responder_seat')::int;
  v_from := (v_pd ->> 'from_seat')::int;
  v_prop := (v_pd ->> 'proposed_mult')::int;

  IF v_seat IS DISTINCT FROM v_resp THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_RESPONDER', 'message', 'Only the challenged player can respond');
  END IF;

  IF coalesce(p_accept, false) THEN
    v_dacc := COALESCE((v_ps ->> 'doubles_accepted')::int, 0) + 1;
    v_ps := jsonb_set(v_ps, '{stake_multiplier}', to_jsonb(v_prop), true);
    v_ps := jsonb_set(v_ps, '{doubles_accepted}', to_jsonb(v_dacc), true);
    v_ps := v_ps - 'pending_double';
    v_ps := public.ov2_backgammon_parity_bump_timer(v_ps, v_from, v_from);
    UPDATE public.ov2_backgammon_sessions
    SET
      parity_state = v_ps,
      revision = v_sess.revision + 1,
      updated_at = now()
    WHERE id = v_sess.id
    RETURNING * INTO v_sess;
    RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_backgammon_build_client_snapshot(v_sess, v_pk));
  END IF;

  v_mult := public.ov2_bd_parity_stake_mult(v_ps);
  v_entry := COALESCE((v_ps ->> '__entry__')::bigint, 0);
  v_ps := jsonb_set(
    v_ps,
    '{__result__}',
    jsonb_build_object(
      'winner', v_from,
      'prize', v_entry * 2 * v_mult,
      'lossPerSeat', v_entry * v_mult,
      'stakeMultiplier', v_mult,
      'double_declined', true,
      'timestamp', (extract(epoch from now()) * 1000)::bigint
    ),
    true
  );
  v_ps := v_ps - 'pending_double';
  v_board := jsonb_set(COALESCE(v_sess.board, '{}'::jsonb), '{winner}', to_jsonb(v_from), true);
  UPDATE public.ov2_backgammon_sessions
  SET
    board = v_board,
    winner_seat = v_from,
    phase = 'finished',
    parity_state = v_ps,
    revision = v_sess.revision + 1,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_backgammon_build_client_snapshot(v_sess, v_pk));
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_backgammon_offer_double(uuid, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_backgammon_offer_double(uuid, text, bigint) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_backgammon_respond_double(uuid, text, boolean, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_backgammon_respond_double(uuid, text, boolean, bigint) TO anon, authenticated, service_role;

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
  v_ps jsonb;
  v_guard jsonb;
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
  IF (
    SELECT array_agg(m.seat_index ORDER BY m.seat_index)
    FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL
  ) IS DISTINCT FROM ARRAY[0, 1]::integer[] THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_SEAT_ASSIGNMENT', 'message', 'Backgammon requires one player in seat 0 and one in seat 1');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id
      AND m.seat_index IS NOT NULL
      AND m.wallet_state IS DISTINCT FROM 'committed'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STAKES_NOT_COMMITTED', 'message', 'Both seated players must have committed stakes before starting');
  END IF;

  SELECT public.ov2_shared_require_max_double_liability_for_open_session(p_room_id) INTO v_guard;
  IF (v_guard->>'ok')::boolean IS NOT TRUE THEN
    RETURN v_guard;
  END IF;

  v_board := public.ov2_bg_initial_board_json();
  v_entry := COALESCE(v_room.stake_per_seat, 0);
  v_ps := jsonb_build_object(
    '__entry__', to_jsonb(v_entry),
    '__result__', NULL,
    'stake_multiplier', 1,
    'doubles_accepted', 0,
    'double_init_0', 0,
    'double_init_1', 0,
    'turn_deadline_at', (extract(epoch from now()) * 1000)::bigint + 30000,
    'turn_deadline_seat', (v_board ->> 'turnSeat')::int,
    'missed_turns', jsonb_build_object('0', 0, '1', 0)
  );

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
    v_ps
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
  IF COALESCE(v_sess.parity_state, '{}'::jsonb) ? 'pending_double' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'DOUBLE_PENDING', 'message', 'A stake increase is already pending');
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
    parity_state = public.ov2_backgammon_parity_bump_timer(
      v_sess.parity_state,
      (v_board ->> 'turnSeat')::int,
      v_seat
    ),
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
  v_mult int;
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
  IF COALESCE(v_sess.parity_state, '{}'::jsonb) ? 'pending_double' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'DOUBLE_PENDING', 'message', 'A stake increase is already pending');
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
    v_mult := public.ov2_bd_parity_stake_mult(v_sess.parity_state);
    v_ps := jsonb_set(
      COALESCE(v_sess.parity_state, '{}'::jsonb),
      '{__result__}',
      jsonb_build_object(
        'winner', v_w,
        'prize', v_entry * 2 * v_mult,
        'lossPerSeat', v_entry * v_mult,
        'stakeMultiplier', v_mult,
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
    parity_state = public.ov2_backgammon_parity_bump_timer(
      v_sess.parity_state,
      (v_board ->> 'turnSeat')::int,
      v_seat
    ),
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

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
  v_mult int;
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
  v_mult := public.ov2_bd_parity_stake_mult(v_sess.parity_state);
  v_board := jsonb_set(COALESCE(v_sess.board, '{}'::jsonb), '{winner}', to_jsonb(v_other), true);
  v_ps := jsonb_set(
    COALESCE(v_sess.parity_state, '{}'::jsonb),
    '{__result__}',
    jsonb_build_object(
      'winner', v_other,
      'prize', v_entry * 2 * v_mult,
      'lossPerSeat', v_entry * v_mult,
      'stakeMultiplier', v_mult,
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

CREATE OR REPLACE FUNCTION public.ov2_backgammon_mark_turn_timeout(
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
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_sess public.ov2_backgammon_sessions%ROWTYPE;
  v_seat int;
  v_board jsonb;
  v_ps jsonb;
  v_now bigint;
  v_deadline bigint;
  v_dl_seat int;
  v_turn int;
  v_miss int;
  v_missed jsonb;
  v_other int;
  v_entry bigint;
  v_pd jsonb;
  v_from int;
  v_resp int;
  v_mult int;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
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

  SELECT seat_index INTO v_seat FROM public.ov2_backgammon_seats WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No seat for participant');
  END IF;

  IF v_sess.status IS DISTINCT FROM 'live' OR v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'snapshot', public.ov2_backgammon_build_client_snapshot(v_sess, v_pk));
  END IF;

  v_board := v_sess.board;
  v_ps := COALESCE(v_sess.parity_state, '{}'::jsonb);
  v_turn := (v_board ->> 'turnSeat')::int;
  v_now := (extract(epoch from now()) * 1000)::bigint;

  IF v_ps ? 'pending_double' THEN
    v_pd := v_ps -> 'pending_double';
    v_deadline := (v_pd ->> 'deadline_ms')::bigint;
    v_from := (v_pd ->> 'from_seat')::int;
    v_resp := (v_pd ->> 'responder_seat')::int;

    IF v_now < v_deadline THEN
      RETURN jsonb_build_object('ok', true, 'idempotent', true, 'snapshot', public.ov2_backgammon_build_client_snapshot(v_sess, v_pk));
    END IF;

    v_mult := public.ov2_bd_parity_stake_mult(v_ps);
    v_entry := COALESCE((v_ps ->> '__entry__')::bigint, 0);
    v_ps := jsonb_set(
      v_ps,
      '{__result__}',
      jsonb_build_object(
        'winner', v_from,
        'prize', v_entry * 2 * v_mult,
        'lossPerSeat', v_entry * v_mult,
        'stakeMultiplier', v_mult,
        'double_timeout', true,
        'timeout_loser_seat', v_resp,
        'timestamp', v_now
      ),
      true
    );
    v_ps := v_ps - 'pending_double';
    v_board := jsonb_set(COALESCE(v_board, '{}'::jsonb), '{winner}', to_jsonb(v_from), true);
    UPDATE public.ov2_backgammon_sessions
    SET
      board = v_board,
      winner_seat = v_from,
      phase = 'finished',
      parity_state = v_ps,
      revision = v_sess.revision + 1,
      updated_at = now()
    WHERE id = v_sess.id
    RETURNING * INTO v_sess;
    RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_backgammon_build_client_snapshot(v_sess, v_pk));
  END IF;

  IF NOT (v_ps ? 'turn_deadline_at') OR NOT (v_ps ? 'turn_deadline_seat') THEN
    UPDATE public.ov2_backgammon_sessions
    SET
      parity_state = public.ov2_backgammon_parity_bump_timer(v_ps, v_turn, NULL),
      revision = v_sess.revision + 1,
      updated_at = now()
    WHERE id = v_sess.id
    RETURNING * INTO v_sess;
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'snapshot', public.ov2_backgammon_build_client_snapshot(v_sess, v_pk));
  END IF;

  v_deadline := (v_ps ->> 'turn_deadline_at')::bigint;
  v_dl_seat := (v_ps ->> 'turn_deadline_seat')::int;

  IF v_dl_seat IS DISTINCT FROM v_turn THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'snapshot', public.ov2_backgammon_build_client_snapshot(v_sess, v_pk));
  END IF;

  IF v_now < v_deadline THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'snapshot', public.ov2_backgammon_build_client_snapshot(v_sess, v_pk));
  END IF;

  v_missed := COALESCE(v_ps -> 'missed_turns', jsonb_build_object('0', 0, '1', 0));
  v_miss := COALESCE((v_missed ->> v_turn::text)::int, 0) + 1;
  v_missed := jsonb_set(v_missed, ARRAY[v_turn::text], to_jsonb(v_miss), true);

  IF v_miss >= 3 THEN
    v_other := CASE WHEN v_turn = 0 THEN 1 ELSE 0 END;
    v_entry := COALESCE((v_ps ->> '__entry__')::bigint, 0);
    v_mult := public.ov2_bd_parity_stake_mult(v_ps);
    v_board := jsonb_set(v_board, '{winner}', to_jsonb(v_other), true);
    v_ps := jsonb_set(
      jsonb_set(v_ps, '{missed_turns}', v_missed, true),
      '{__result__}',
      jsonb_build_object(
        'winner', v_other,
        'prize', v_entry * 2 * v_mult,
        'lossPerSeat', v_entry * v_mult,
        'stakeMultiplier', v_mult,
        'timeout_loser_seat', v_turn,
        'timestamp', v_now
      ),
      true
    );
    UPDATE public.ov2_backgammon_sessions
    SET
      board = v_board,
      turn_seat = (v_board ->> 'turnSeat')::int,
      winner_seat = v_other,
      phase = 'finished',
      parity_state = v_ps,
      revision = v_sess.revision + 1,
      updated_at = now()
    WHERE id = v_sess.id
    RETURNING * INTO v_sess;
    RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_backgammon_build_client_snapshot(v_sess, v_pk));
  END IF;

  v_ps := jsonb_set(v_ps, '{missed_turns}', v_missed, true);
  v_board := public.ov2_bg_finish_turn_board(v_board);
  v_ps := public.ov2_backgammon_parity_bump_timer(v_ps, (v_board ->> 'turnSeat')::int, NULL);

  UPDATE public.ov2_backgammon_sessions
  SET
    board = v_board,
    turn_seat = (v_board ->> 'turnSeat')::int,
    parity_state = v_ps,
    revision = v_sess.revision + 1,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_backgammon_build_client_snapshot(v_sess, v_pk));
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_backgammon_submit_turn(
  p_room_id uuid,
  p_participant_key text,
  p_steps jsonb,
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
  v_turn_txt text;
  v_chk jsonb;
  v_w int;
  v_entry bigint;
  v_mult int;
  v_ps jsonb;
  v_n int;
  v_snap jsonb;
BEGIN
  v_pk := trim(COALESCE(p_participant_key, ''));
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;

  IF p_steps IS NULL OR jsonb_typeof(p_steps) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'p_steps must be a JSON array');
  END IF;

  v_n := jsonb_array_length(p_steps);
  IF v_n > 16 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Too many steps');
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
  IF COALESCE(v_sess.parity_state, '{}'::jsonb) ? 'pending_double' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'DOUBLE_PENDING', 'message', 'A stake increase is already pending');
  END IF;

  SELECT seat_index INTO v_seat FROM public.ov2_backgammon_seats WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No seat for participant');
  END IF;

  v_board := v_sess.board;
  IF v_board IS NULL OR jsonb_typeof(v_board) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_BOARD', 'message', 'Session board missing');
  END IF;

  v_turn_txt := v_board ->> 'turnSeat';
  IF v_turn_txt IS NULL OR v_turn_txt !~ '^[01]$' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_BOARD', 'message', 'Invalid turnSeat on board');
  END IF;
  v_turn := v_turn_txt::int;

  IF v_turn IS DISTINCT FROM v_seat THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_YOUR_TURN', 'message', 'Not your turn');
  END IF;

  IF v_n = 0 THEN
    IF public.ov2_bg_any_legal_exists(v_board, v_turn) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'MUST_PLAY', 'message', 'Legal moves exist; cannot pass');
    END IF;
    v_board := public.ov2_bg_finish_turn_board(v_board);
    UPDATE public.ov2_backgammon_sessions
    SET
      board = v_board,
      turn_seat = (v_board ->> 'turnSeat')::int,
      revision = v_sess.revision + 1,
      parity_state = public.ov2_backgammon_parity_bump_timer(
        v_sess.parity_state,
        (v_board ->> 'turnSeat')::int,
        v_seat
      ),
      updated_at = now()
    WHERE id = v_sess.id
    RETURNING * INTO v_sess;
    BEGIN
      v_snap := public.ov2_backgammon_build_client_snapshot(v_sess, v_pk);
    EXCEPTION
      WHEN OTHERS THEN
        RETURN jsonb_build_object('ok', false, 'code', 'INTERNAL_ERROR', 'message', 'Could not build snapshot');
    END;
    RETURN jsonb_build_object('ok', true, 'snapshot', v_snap);
  END IF;

  v_chk := public.ov2_bg_validate_submit_sequence(v_board, v_turn, p_steps);
  IF coalesce((v_chk ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', COALESCE(v_chk ->> 'code', 'INVALID_SEQUENCE'),
      'message', COALESCE(v_chk ->> 'message', 'Invalid turn sequence'),
      'step_index', v_chk -> 'step_index'
    );
  END IF;
  v_board := v_chk -> 'board';
  IF v_board IS NULL OR jsonb_typeof(v_board) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INTERNAL_ERROR', 'message', 'Missing board after validation');
  END IF;

  v_w := public.ov2_bg_check_winner(v_board);
  IF v_w IS NOT NULL THEN
    v_board := jsonb_set(v_board, '{winner}', to_jsonb(v_w), true);
    v_entry := COALESCE((v_sess.parity_state ->> '__entry__')::bigint, 0);
    v_mult := public.ov2_bd_parity_stake_mult(v_sess.parity_state);
    v_ps := jsonb_set(
      COALESCE(v_sess.parity_state, '{}'::jsonb),
      '{__result__}',
      jsonb_build_object(
        'winner', v_w,
        'prize', v_entry * 2 * v_mult,
        'lossPerSeat', v_entry * v_mult,
        'stakeMultiplier', v_mult,
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
    BEGIN
      v_snap := public.ov2_backgammon_build_client_snapshot(v_sess, v_pk);
    EXCEPTION
      WHEN OTHERS THEN
        RETURN jsonb_build_object('ok', false, 'code', 'INTERNAL_ERROR', 'message', 'Could not build snapshot');
    END;
    RETURN jsonb_build_object('ok', true, 'snapshot', v_snap);
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
    parity_state = public.ov2_backgammon_parity_bump_timer(
      v_sess.parity_state,
      (v_board ->> 'turnSeat')::int,
      v_seat
    ),
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  BEGIN
    v_snap := public.ov2_backgammon_build_client_snapshot(v_sess, v_pk);
  EXCEPTION
    WHEN OTHERS THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INTERNAL_ERROR', 'message', 'Could not build snapshot');
  END;
  RETURN jsonb_build_object('ok', true, 'snapshot', v_snap);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INTERNAL_ERROR',
      'message', 'Unexpected error during submit; try again',
      'sqlstate', SQLSTATE
    );
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_backgammon_submit_turn(uuid, text, jsonb, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_backgammon_submit_turn(uuid, text, jsonb, bigint) TO anon, authenticated, service_role;

COMMIT;
