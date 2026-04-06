-- OV2 FourLine RPCs: snapshot, open, play. Apply after 103_ov2_fourline_engine.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_fourline_build_client_snapshot(
  p_session public.ov2_fourline_sessions,
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
  v_cells jsonb;
  v_td bigint;
  v_mult int;
  v_pd jsonb;
  v_can_offer_dbl boolean := false;
  v_can_respond_dbl boolean := false;
  v_dbl_acc int;
  v_playing boolean;
  v_lm jsonb;
BEGIN
  v_board := COALESCE(p_session.board, '{}'::jsonb);
  v_phase := p_session.phase;
  v_finished := (v_phase = 'finished' OR p_session.winner_seat IS NOT NULL);
  v_playing := (p_session.status = 'live' AND NOT v_finished AND v_phase = 'playing');
  v_cells := COALESCE(v_board -> 'cells', public.ov2_fl_empty_board());
  IF jsonb_typeof(v_cells) <> 'array' OR jsonb_array_length(v_cells) < 42 THEN
    v_cells := public.ov2_fl_empty_board();
  END IF;
  v_turn := NULL;
  BEGIN
    v_turn := (v_board ->> 'turnSeat')::int;
  EXCEPTION
    WHEN invalid_text_representation THEN
      v_turn := NULL;
  END;

  SELECT s.seat_index INTO v_my_seat
  FROM public.ov2_fourline_seats s
  WHERE s.session_id = p_session.id AND s.participant_key = v_pk;

  v_mult := public.ov2_fl_parity_stake_mult(p_session.parity_state);
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

  v_dbl_acc := COALESCE((p_session.parity_state ->> 'doubles_accepted')::int, 0);
  IF v_playing AND v_pd IS NULL AND v_my_seat IS NOT NULL AND v_turn IN (0, 1) AND v_my_seat = v_turn THEN
    IF v_mult < 16 AND v_dbl_acc < 4 THEN
      v_can_offer_dbl := true;
    END IF;
  END IF;

  v_td := NULL;
  IF v_playing AND COALESCE(p_session.parity_state, '{}'::jsonb) ? 'turn_deadline_at' THEN
    BEGIN
      v_td := (p_session.parity_state ->> 'turn_deadline_at')::bigint;
    EXCEPTION
      WHEN invalid_text_representation THEN
        v_td := NULL;
    END;
  END IF;

  v_lm := v_board -> 'lastMove';
  IF v_lm IS NULL OR jsonb_typeof(v_lm) <> 'object' THEN
    v_lm := NULL;
  END IF;

  RETURN jsonb_build_object(
    'revision', p_session.revision,
    'sessionId', p_session.id::text,
    'roomId', p_session.room_id::text,
    'phase', v_phase,
    'activeSeats', to_jsonb(p_session.active_seats),
    'mySeat', CASE WHEN v_my_seat IS NULL THEN NULL::jsonb ELSE to_jsonb(v_my_seat) END,
    'board', jsonb_build_object(
      'turnSeat', CASE WHEN v_turn IS NULL THEN NULL::jsonb ELSE to_jsonb(v_turn) END,
      'cells', v_cells,
      'winner', v_board -> 'winner',
      'lastMove', COALESCE(to_jsonb(v_lm), 'null'::jsonb)
    ),
    'turnSeat', CASE WHEN v_turn IS NULL THEN NULL::jsonb ELSE to_jsonb(v_turn) END,
    'cells', v_cells,
    'lastMove', COALESCE(to_jsonb(v_lm), 'null'::jsonb),
    'winnerSeat', CASE WHEN p_session.winner_seat IS NULL THEN NULL::jsonb ELSE to_jsonb(p_session.winner_seat) END,
    'stakeMultiplier', to_jsonb(v_mult),
    'doublesAccepted', to_jsonb(v_dbl_acc),
    'pendingDouble', COALESCE(to_jsonb(v_pd), 'null'::jsonb),
    'canOfferDouble', v_can_offer_dbl,
    'mustRespondDouble', v_can_respond_dbl,
    'turnDeadline', CASE WHEN v_td IS NULL THEN NULL::jsonb ELSE to_jsonb(v_td) END,
    'missedTurns', COALESCE(p_session.parity_state -> 'missed_turns', jsonb_build_object('0', 0, '1', 0))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_fourline_open_session(
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
  v_sess public.ov2_fourline_sessions%ROWTYPE;
  v_existing public.ov2_fourline_sessions%ROWTYPE;
  v_seated_count int;
  v_board jsonb;
  v_is_shared boolean;
  v_entry bigint;
  v_ps jsonb;
  v_first int;
  v_turn int;
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
  IF v_room.product_game_id IS DISTINCT FROM 'ov2_fourline' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a FourLine room');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND m.participant_key = v_pk
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Only room members can open a session');
  END IF;
  IF v_room.host_participant_key IS DISTINCT FROM v_pk THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_HOST', 'message', 'Only room host can open a FourLine session');
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
    FROM public.ov2_fourline_sessions
    WHERE id = v_room.active_session_id AND room_id = p_room_id;
    IF FOUND AND v_existing.status = 'live' AND v_existing.phase = 'playing' THEN
      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'snapshot', public.ov2_fourline_build_client_snapshot(v_existing, v_pk)
      );
    END IF;
  END IF;

  SELECT count(*)::int INTO v_seated_count
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL;
  IF v_seated_count IS DISTINCT FROM 2 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_SEAT_COUNT', 'message', 'FourLine requires exactly two seated players');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL
      AND m.seat_index NOT IN (0, 1)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_SEATS', 'message', 'Seats must be indices 0 and 1 only');
  END IF;
  IF (
    SELECT array_agg(m.seat_index ORDER BY m.seat_index)
    FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL
  ) IS DISTINCT FROM ARRAY[0, 1]::integer[] THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_SEAT_ASSIGNMENT', 'message', 'FourLine requires one player in seat 0 and one in seat 1');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id
      AND m.seat_index IS NOT NULL
      AND m.wallet_state IS DISTINCT FROM 'committed'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STAKES_NOT_COMMITTED', 'message', 'Both seated players must have committed stakes before starting');
  END IF;

  v_first := CASE WHEN random() < 0.5 THEN 0 ELSE 1 END;
  v_turn := v_first;
  v_board := jsonb_build_object(
    'turnSeat', v_turn,
    'cells', public.ov2_fl_empty_board(),
    'lastMove', NULL
  );

  v_entry := COALESCE(v_room.stake_per_seat, 0);
  v_ps := jsonb_build_object(
    '__entry__', to_jsonb(v_entry),
    '__result__', NULL,
    'stake_multiplier', 1,
    'doubles_accepted', 0,
    'turn_deadline_at', (extract(epoch from now()) * 1000)::bigint + 30000,
    'turn_deadline_seat', to_jsonb(v_turn),
    'missed_turns', jsonb_build_object('0', 0, '1', 0)
  );

  INSERT INTO public.ov2_fourline_sessions (
    room_id, match_seq, status, phase, revision, board, turn_seat, winner_seat, active_seats, parity_state
  ) VALUES (
    p_room_id,
    v_room.match_seq,
    'live',
    'playing',
    0,
    v_board,
    v_turn,
    NULL,
    ARRAY[0, 1]::integer[],
    v_ps
  )
  RETURNING * INTO v_sess;

  INSERT INTO public.ov2_fourline_seats (session_id, seat_index, participant_key, room_member_id, meta)
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
    'snapshot', public.ov2_fourline_build_client_snapshot(v_sess, v_pk)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_fourline_get_snapshot(
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
  v_sess public.ov2_fourline_sessions%ROWTYPE;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id required');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_fourline' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a FourLine room');
  END IF;
  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SESSION', 'message', 'No active session');
  END IF;
  SELECT * INTO v_sess
  FROM public.ov2_fourline_sessions
  WHERE id = v_room.active_session_id AND room_id = p_room_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;
  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_fourline_build_client_snapshot(v_sess, v_pk));
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_fourline_play_column(
  p_room_id uuid,
  p_participant_key text,
  p_column integer,
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
  v_sess public.ov2_fourline_sessions%ROWTYPE;
  v_seat int;
  v_board jsonb;
  v_cells jsonb;
  v_turn int;
  v_ps jsonb;
  v_mult bigint;
  v_entry bigint;
  v_other int;
  v_ok boolean;
  v_new_cells jsonb;
  v_row int;
  v_err text;
  v_won boolean;
BEGIN
  IF p_room_id IS NULL OR p_column IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Invalid arguments');
  END IF;
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'participant_key required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_fourline' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No active session');
  END IF;

  SELECT * INTO v_sess FROM public.ov2_fourline_sessions WHERE id = v_room.active_session_id FOR UPDATE;
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
    RETURN jsonb_build_object('ok', false, 'code', 'DOUBLE_PENDING', 'message', 'Respond to the stake increase first');
  END IF;

  SELECT seat_index INTO v_seat FROM public.ov2_fourline_seats WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No seat for participant');
  END IF;

  v_board := v_sess.board;
  v_turn := (v_board ->> 'turnSeat')::int;
  IF v_turn IS DISTINCT FROM v_seat THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_YOUR_TURN', 'message', 'Not your turn');
  END IF;

  v_cells := COALESCE(v_board -> 'cells', public.ov2_fl_empty_board());
  SELECT ok, new_cells, placed_row, err
  INTO v_ok, v_new_cells, v_row, v_err
  FROM public.ov2_fl_apply_drop(v_cells, p_column::int, v_seat);

  IF NOT v_ok THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'ILLEGAL_MOVE',
      'message', coalesce(v_err, 'Illegal move')
    );
  END IF;

  v_won := public.ov2_fl_has_four_connected(v_new_cells, v_row, p_column::int, v_seat);

  v_board := jsonb_set(v_board, '{cells}', to_jsonb(v_new_cells), true);
  v_board := jsonb_set(
    v_board,
    '{lastMove}',
    jsonb_build_object('row', v_row, 'col', p_column::int),
    true
  );

  IF v_won THEN
    v_mult := public.ov2_fl_parity_stake_mult(v_sess.parity_state);
    v_entry := COALESCE((v_sess.parity_state ->> '__entry__')::bigint, 0);
    v_ps := jsonb_set(
      COALESCE(v_sess.parity_state, '{}'::jsonb),
      '{__result__}',
      jsonb_build_object(
        'winner', v_seat,
        'prize', v_entry * 2 * v_mult,
        'lossPerSeat', v_entry * v_mult,
        'stakeMultiplier', v_mult,
        'four_connected', true,
        'timestamp', (extract(epoch from now()) * 1000)::bigint
      ),
      true
    );
    v_board := jsonb_set(v_board, '{winner}', to_jsonb(v_seat), true);
    UPDATE public.ov2_fourline_sessions
    SET
      board = v_board,
      turn_seat = v_turn,
      winner_seat = v_seat,
      phase = 'finished',
      parity_state = v_ps,
      revision = v_sess.revision + 1,
      updated_at = now()
    WHERE id = v_sess.id
    RETURNING * INTO v_sess;
    RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_fourline_build_client_snapshot(v_sess, v_pk));
  END IF;

  IF public.ov2_fl_board_full(v_new_cells) THEN
    v_mult := public.ov2_fl_parity_stake_mult(v_sess.parity_state);
    v_entry := COALESCE((v_sess.parity_state ->> '__entry__')::bigint, 0);
    v_ps := jsonb_set(
      COALESCE(v_sess.parity_state, '{}'::jsonb),
      '{__result__}',
      jsonb_build_object(
        'draw', true,
        'board_full', true,
        'refundPerSeat', v_entry,
        'stakeMultiplier', v_mult,
        'timestamp', (extract(epoch from now()) * 1000)::bigint
      ),
      true
    );
    UPDATE public.ov2_fourline_sessions
    SET
      board = v_board,
      turn_seat = v_turn,
      winner_seat = NULL,
      phase = 'finished',
      parity_state = v_ps,
      revision = v_sess.revision + 1,
      updated_at = now()
    WHERE id = v_sess.id
    RETURNING * INTO v_sess;
    RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_fourline_build_client_snapshot(v_sess, v_pk));
  END IF;

  v_other := CASE WHEN v_seat = 0 THEN 1 ELSE 0 END;
  v_ps := public.ov2_fourline_parity_bump_timer(v_sess.parity_state, v_other, v_seat);
  v_board := jsonb_set(v_board, '{turnSeat}', to_jsonb(v_other), true);

  UPDATE public.ov2_fourline_sessions
  SET
    board = v_board,
    turn_seat = v_other,
    parity_state = v_ps,
    revision = v_sess.revision + 1,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_fourline_build_client_snapshot(v_sess, v_pk));
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_fourline_build_client_snapshot(public.ov2_fourline_sessions, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_fourline_build_client_snapshot(public.ov2_fourline_sessions, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_fourline_open_session(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_fourline_open_session(uuid, text, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_fourline_get_snapshot(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_fourline_get_snapshot(uuid, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_fourline_play_column(uuid, text, integer, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_fourline_play_column(uuid, text, integer, bigint) TO anon, authenticated, service_role;

COMMIT;
