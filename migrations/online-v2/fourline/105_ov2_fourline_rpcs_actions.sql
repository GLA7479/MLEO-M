-- OV2 FourLine: doubles, timer, forfeit, settlement, rematch, claim. Apply after 104_ov2_fourline_rpcs.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_fourline_offer_double(
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
  v_sess public.ov2_fourline_sessions%ROWTYPE;
  v_seat int;
  v_board jsonb;
  v_turn int;
  v_ps jsonb;
  v_mult int;
  v_prop int;
  v_other int;
  v_dacc int;
  v_deadline bigint;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
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
    RETURN jsonb_build_object('ok', false, 'code', 'DOUBLE_PENDING', 'message', 'A stake increase is already pending');
  END IF;

  SELECT seat_index INTO v_seat FROM public.ov2_fourline_seats WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No seat for participant');
  END IF;

  v_board := v_sess.board;
  v_turn := (v_board ->> 'turnSeat')::int;
  IF v_turn IS DISTINCT FROM v_seat THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_YOUR_TURN', 'message', 'Only the active player can propose a stake increase');
  END IF;

  v_ps := COALESCE(v_sess.parity_state, '{}'::jsonb);
  v_mult := public.ov2_fl_parity_stake_mult(v_ps);
  v_dacc := COALESCE((v_ps ->> 'doubles_accepted')::int, 0);
  IF v_dacc >= 4 OR v_mult >= 16 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_MORE_DOUBLES', 'message', 'Maximum stake increases reached');
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

  UPDATE public.ov2_fourline_sessions
  SET
    parity_state = v_ps,
    revision = v_sess.revision + 1,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_fourline_build_client_snapshot(v_sess, v_pk));
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_fourline_respond_double(
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
  v_sess public.ov2_fourline_sessions%ROWTYPE;
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

  v_ps := COALESCE(v_sess.parity_state, '{}'::jsonb);
  IF NOT (v_ps ? 'pending_double') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_PENDING_DOUBLE', 'message', 'Nothing to respond to');
  END IF;

  v_pd := v_ps -> 'pending_double';
  SELECT seat_index INTO v_seat FROM public.ov2_fourline_seats WHERE session_id = v_sess.id AND participant_key = v_pk;
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
    v_ps := public.ov2_fourline_parity_bump_timer(v_ps, v_from, v_from);
    UPDATE public.ov2_fourline_sessions
    SET
      parity_state = v_ps,
      revision = v_sess.revision + 1,
      updated_at = now()
    WHERE id = v_sess.id
    RETURNING * INTO v_sess;
    RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_fourline_build_client_snapshot(v_sess, v_pk));
  END IF;

  v_mult := public.ov2_fl_parity_stake_mult(v_ps);
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
  v_board := jsonb_set(COALESCE(v_sess.board, '{}'::jsonb), '{winner}', to_jsonb(v_from), true);
  UPDATE public.ov2_fourline_sessions
  SET
    board = v_board,
    winner_seat = v_from,
    phase = 'finished',
    parity_state = v_ps,
    revision = v_sess.revision + 1,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_fourline_build_client_snapshot(v_sess, v_pk));
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_fourline_mark_turn_timeout(
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
  v_sess public.ov2_fourline_sessions%ROWTYPE;
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
  v_mult bigint;
  v_pd jsonb;
  v_from int;
  v_resp int;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
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

  SELECT seat_index INTO v_seat FROM public.ov2_fourline_seats WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No seat for participant');
  END IF;

  IF v_sess.status IS DISTINCT FROM 'live' OR v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'snapshot', public.ov2_fourline_build_client_snapshot(v_sess, v_pk));
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
      RETURN jsonb_build_object('ok', true, 'idempotent', true, 'snapshot', public.ov2_fourline_build_client_snapshot(v_sess, v_pk));
    END IF;

    v_mult := public.ov2_fl_parity_stake_mult(v_ps);
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
    v_board := jsonb_set(COALESCE(v_board, '{}'::jsonb), '{winner}', to_jsonb(v_from), true);
    UPDATE public.ov2_fourline_sessions
    SET
      board = v_board,
      winner_seat = v_from,
      phase = 'finished',
      parity_state = v_ps,
      revision = v_sess.revision + 1,
      updated_at = now()
    WHERE id = v_sess.id
    RETURNING * INTO v_sess;
    RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_fourline_build_client_snapshot(v_sess, v_pk));
  END IF;

  IF NOT (v_ps ? 'turn_deadline_at') OR NOT (v_ps ? 'turn_deadline_seat') THEN
    v_ps := public.ov2_fourline_parity_bump_timer(v_ps, v_turn, NULL);
    UPDATE public.ov2_fourline_sessions
    SET
      parity_state = v_ps,
      revision = v_sess.revision + 1,
      updated_at = now()
    WHERE id = v_sess.id
    RETURNING * INTO v_sess;
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'snapshot', public.ov2_fourline_build_client_snapshot(v_sess, v_pk));
  END IF;

  v_deadline := (v_ps ->> 'turn_deadline_at')::bigint;
  v_dl_seat := (v_ps ->> 'turn_deadline_seat')::int;

  IF v_dl_seat IS DISTINCT FROM v_turn THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'snapshot', public.ov2_fourline_build_client_snapshot(v_sess, v_pk));
  END IF;

  IF v_now < v_deadline THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'snapshot', public.ov2_fourline_build_client_snapshot(v_sess, v_pk));
  END IF;

  v_missed := COALESCE(v_ps -> 'missed_turns', jsonb_build_object('0', 0, '1', 0));
  v_miss := COALESCE((v_missed ->> v_turn::text)::int, 0) + 1;
  v_missed := jsonb_set(v_missed, ARRAY[v_turn::text], to_jsonb(v_miss), true);

  IF v_miss >= 3 THEN
    v_other := CASE WHEN v_turn = 0 THEN 1 ELSE 0 END;
    v_mult := public.ov2_fl_parity_stake_mult(v_ps);
    v_entry := COALESCE((v_ps ->> '__entry__')::bigint, 0);
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
    v_board := jsonb_set(v_board, '{winner}', to_jsonb(v_other), true);
    UPDATE public.ov2_fourline_sessions
    SET
      board = v_board,
      winner_seat = v_other,
      phase = 'finished',
      parity_state = v_ps,
      revision = v_sess.revision + 1,
      updated_at = now()
    WHERE id = v_sess.id
    RETURNING * INTO v_sess;
    RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_fourline_build_client_snapshot(v_sess, v_pk));
  END IF;

  v_ps := jsonb_set(v_ps, '{missed_turns}', v_missed, true);
  v_other := CASE WHEN v_turn = 0 THEN 1 ELSE 0 END;
  v_ps := public.ov2_fourline_parity_bump_timer(v_ps, v_other, NULL);
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

CREATE OR REPLACE FUNCTION public.ov2_fourline_voluntary_forfeit(
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
  v_sess public.ov2_fourline_sessions%ROWTYPE;
  v_seat int;
  v_other int;
  v_entry bigint;
  v_mult bigint;
  v_ps jsonb;
  v_board jsonb;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_fourline' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Not a FourLine room');
  END IF;
  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No active session');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_fourline_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_PLAYING', 'message', 'Session not in play');
  END IF;
  SELECT seat_index INTO v_seat FROM public.ov2_fourline_seats WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_IN_MATCH', 'message', 'Not seated in this session');
  END IF;
  v_other := CASE WHEN v_seat = 0 THEN 1 ELSE 0 END;
  v_mult := public.ov2_fl_parity_stake_mult(v_sess.parity_state);
  v_entry := COALESCE((v_sess.parity_state ->> '__entry__')::bigint, 0);
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

  UPDATE public.ov2_fourline_sessions
  SET
    board = v_board,
    winner_seat = v_other,
    phase = 'finished',
    parity_state = v_ps,
    revision = revision + 1,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_fourline_build_client_snapshot(v_sess, v_pk));
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_fourline_after_finish_emit_settlement()
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
  IF v_res IS NULL OR jsonb_typeof(v_res) = 'null' THEN
    RETURN NULL;
  END IF;

  IF coalesce((v_res ->> 'draw')::boolean, false) THEN
    v_entry := COALESCE((NEW.parity_state ->> '__entry__')::bigint, 0);
    FOR r IN
      SELECT trim(participant_key) AS pk
      FROM public.ov2_fourline_seats
      WHERE session_id = v_sess_id
    LOOP
      IF r.pk IS NULL OR length(r.pk) = 0 THEN
        CONTINUE;
      END IF;
      v_idem := 'ov2:settle:' || v_room_id::text || ':' || v_sess_id::text || ':' || r.pk || ':fl_draw_refund:';
      INSERT INTO public.ov2_settlement_lines (
        room_id, match_seq, recipient_participant_key, line_kind, amount, idempotency_key, game_session_id, meta
      ) VALUES (
        v_room_id,
        v_match_seq,
        r.pk,
        'fl_draw_refund',
        v_entry,
        v_idem,
        v_sess_id,
        jsonb_build_object(
          'gameId', 'ov2_fourline',
          'sessionId', v_sess_id,
          'board_full', coalesce((v_res ->> 'board_full')::boolean, false),
          'refundPerSeat', v_entry,
          'lossAlreadyCommitted', true
        )
      )
      ON CONFLICT (idempotency_key) DO NOTHING;
    END LOOP;

    UPDATE public.ov2_fourline_sessions
    SET status = 'closed', updated_at = now()
    WHERE id = v_sess_id AND status IS DISTINCT FROM 'closed';

    RETURN NULL;
  END IF;

  IF NOT (v_res ? 'winner') THEN
    RETURN NULL;
  END IF;
  v_winner_seat := (v_res ->> 'winner')::int;
  IF v_winner_seat IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT trim(participant_key) INTO v_winner_pk
  FROM public.ov2_fourline_seats
  WHERE session_id = v_sess_id AND seat_index = v_winner_seat
  LIMIT 1;
  IF v_winner_pk IS NULL OR length(v_winner_pk) = 0 THEN
    RETURN NULL;
  END IF;
  v_entry := COALESCE((NEW.parity_state ->> '__entry__')::bigint, 0);
  v_prize := COALESCE(NULLIF((v_res ->> 'prize'), '')::bigint, 0);
  v_loss := COALESCE(NULLIF((v_res ->> 'lossPerSeat'), '')::bigint, 0);
  IF v_loss IS NULL OR v_loss <= 0 THEN
    v_loss := v_entry * public.ov2_fl_parity_stake_mult(NEW.parity_state);
  END IF;
  IF v_prize IS NULL OR v_prize <= 0 THEN
    v_prize := v_loss * 2;
  END IF;

  v_idem := 'ov2:settle:' || v_room_id::text || ':' || v_sess_id::text || ':' || v_winner_pk || ':fl_win:';
  INSERT INTO public.ov2_settlement_lines (
    room_id, match_seq, recipient_participant_key, line_kind, amount, idempotency_key, game_session_id, meta
  ) VALUES (
    v_room_id,
    v_match_seq,
    v_winner_pk,
    'fl_win',
    v_prize,
    v_idem,
    v_sess_id,
    jsonb_build_object(
      'gameId', 'ov2_fourline',
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
    FROM public.ov2_fourline_seats
    WHERE session_id = v_sess_id
      AND seat_index IS DISTINCT FROM v_winner_seat
  LOOP
    IF r.pk IS NULL OR length(r.pk) = 0 THEN
      CONTINUE;
    END IF;
    v_idem := 'ov2:settle:' || v_room_id::text || ':' || v_sess_id::text || ':' || r.pk || ':fl_loss:';
    INSERT INTO public.ov2_settlement_lines (
      room_id, match_seq, recipient_participant_key, line_kind, amount, idempotency_key, game_session_id, meta
    ) VALUES (
      v_room_id,
      v_match_seq,
      r.pk,
      'fl_loss',
      0,
      v_idem,
      v_sess_id,
      jsonb_build_object(
        'gameId', 'ov2_fourline',
        'sessionId', v_sess_id,
        'seat', r.seat_index,
        'lossPerSeat', v_loss,
        'lossAlreadyCommitted', true
      )
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END LOOP;

  UPDATE public.ov2_fourline_sessions
  SET status = 'closed', updated_at = now()
  WHERE id = v_sess_id AND status IS DISTINCT FROM 'closed';

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_ov2_fourline_finish_settlement ON public.ov2_fourline_sessions;
CREATE TRIGGER trg_ov2_fourline_finish_settlement
AFTER UPDATE OF phase ON public.ov2_fourline_sessions
FOR EACH ROW
WHEN (NEW.phase IS NOT DISTINCT FROM 'finished' AND OLD.phase IS DISTINCT FROM 'finished')
EXECUTE FUNCTION public.ov2_fourline_after_finish_emit_settlement();

CREATE OR REPLACE FUNCTION public._ov2_fl_member_rematch_requested(p_meta jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    (p_meta -> 'fl' ->> 'rematch_requested') IN ('true', 't', '1')
    OR (p_meta -> 'fl' -> 'rematch_requested') IS NOT DISTINCT FROM 'true'::jsonb;
$$;

CREATE OR REPLACE FUNCTION public.ov2_fourline_request_rematch(
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
  v_sess public.ov2_fourline_sessions%ROWTYPE;
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_member public.ov2_room_members%ROWTYPE;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_fourline' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.lifecycle_phase IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_ACTIVE', 'message', 'Room must be active');
  END IF;
  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No active session');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_fourline_sessions WHERE id = v_room.active_session_id;
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
  IF public._ov2_fl_member_rematch_requested(v_member.meta) THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;
  UPDATE public.ov2_room_members
  SET
    meta = jsonb_set(
      COALESCE(meta, '{}'::jsonb),
      '{fl}',
      COALESCE(meta -> 'fl', '{}'::jsonb)
        || jsonb_build_object('rematch_requested', true, 'rematch_at', to_jsonb(now()::text)),
      true
    ),
    updated_at = now()
  WHERE room_id = p_room_id AND participant_key = v_pk;
  RETURN jsonb_build_object('ok', true, 'idempotent', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_fourline_cancel_rematch(
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
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_fourline' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  SELECT * INTO v_member FROM public.ov2_room_members WHERE room_id = p_room_id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Not a member');
  END IF;
  IF NOT public._ov2_fl_member_rematch_requested(v_member.meta) THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;
  UPDATE public.ov2_room_members
  SET
    meta = CASE
      WHEN meta ? 'fl' THEN jsonb_set(meta, '{fl}', (meta -> 'fl') - 'rematch_requested' - 'rematch_at', true)
      ELSE meta
    END,
    updated_at = now()
  WHERE room_id = p_room_id AND participant_key = v_pk;
  RETURN jsonb_build_object('ok', true, 'idempotent', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_fourline_start_next_match(
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
  v_sess public.ov2_fourline_sessions%ROWTYPE;
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_next_ms int;
  v_eligible int;
  v_ready int;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_fourline' THEN
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
  SELECT * INTO v_sess FROM public.ov2_fourline_sessions WHERE id = v_room.active_session_id;
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
    AND public._ov2_fl_member_rematch_requested(m.meta);
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
      WHEN m.meta ? 'fl' THEN jsonb_set(m.meta, '{fl}', (m.meta -> 'fl') - 'rematch_requested' - 'rematch_at', true)
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
    'room', public.ov2_shared_room_to_public_jsonb(v_room),
    'members', public.ov2_shared_members_to_public_jsonb(p_room_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_fourline_claim_settlement(
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
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_fourline' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a FourLine room');
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

REVOKE ALL ON FUNCTION public.ov2_fourline_offer_double(uuid, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_fourline_offer_double(uuid, text, bigint) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_fourline_respond_double(uuid, text, boolean, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_fourline_respond_double(uuid, text, boolean, bigint) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_fourline_mark_turn_timeout(uuid, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_fourline_mark_turn_timeout(uuid, text, bigint) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_fourline_voluntary_forfeit(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_fourline_voluntary_forfeit(uuid, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_fourline_after_finish_emit_settlement() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._ov2_fl_member_rematch_requested(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ov2_fourline_request_rematch(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_fourline_request_rematch(uuid, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_fourline_cancel_rematch(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_fourline_cancel_rematch(uuid, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_fourline_start_next_match(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_fourline_start_next_match(uuid, text, integer) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_fourline_claim_settlement(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_fourline_claim_settlement(uuid, text) TO anon, authenticated, service_role;

COMMIT;
