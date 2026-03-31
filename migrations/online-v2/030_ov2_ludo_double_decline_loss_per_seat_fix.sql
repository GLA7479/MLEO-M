-- Ensure finished `__result__` always exposes `lossPerSeat` (double-decline path + snapshot backfill).

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_ludo_respond_double(
  p_room_id uuid,
  p_participant_key text,
  p_answer text,
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
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_my_seat int;
  v_dbl jsonb;
  v_board jsonb;
  v_active int[];
  v_pending int[];
  v_next int;
  v_rest int[];
  v_locks jsonb;
  v_value int;
  v_next_dbl jsonb;
  v_proposer int;
  v_doubled boolean := false;
  v_ps jsonb;
  v_cycle jsonb;
  v_stake bigint;
  v_idem_rev bigint;
  v_mem_pk text;
  v_seat int;
BEGIN
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
  IF NOT FOUND OR v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No active Ludo session');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_ludo_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.phase IS DISTINCT FROM 'playing' OR v_sess.status IS DISTINCT FROM 'live' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_PLAYING', 'message', 'Session not in playing phase');
  END IF;
  IF p_expected_revision IS NOT NULL AND v_sess.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REVISION_MISMATCH', 'message', 'Revision mismatch');
  END IF;
  v_my_seat := (
    SELECT s.seat_index FROM public.ov2_ludo_seats s
    WHERE s.session_id = v_sess.id AND s.participant_key = v_pk
    LIMIT 1
  );
  IF v_my_seat IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No Ludo seat for participant');
  END IF;

  v_dbl := COALESCE(v_sess.parity_state -> '__double__', '{}'::jsonb);
  IF (v_dbl ->> 'awaiting')::int IS DISTINCT FROM v_my_seat THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_AWAITING', 'message', 'Not awaiting this seat');
  END IF;
  v_proposer := (v_dbl ->> 'proposed_by')::int;
  v_board := COALESCE(v_sess.board, '{}'::jsonb);
  v_active := COALESCE(v_sess.active_seats, ARRAY[]::int[]);
  v_value := COALESCE((v_dbl ->> 'value')::int, 1);

  IF lower(trim(COALESCE(p_answer, ''))) = 'decline' THEN
    v_board := jsonb_set(v_board, '{winner}', to_jsonb(v_proposer), true);
    v_sess.board := v_board;
    v_sess.phase := 'finished';
    v_sess.status := 'live';
    v_sess.current_turn := NULL;
    v_sess.turn_deadline := NULL;
    v_sess.parity_state := jsonb_set(COALESCE(v_sess.parity_state, '{}'::jsonb), '{__result__}', jsonb_build_object(
      'winner', v_proposer,
      'multiplier', v_value,
      'prize', (COALESCE((v_sess.parity_state ->> '__entry__')::bigint, 0) * COALESCE(cardinality(v_active), 0) * v_value),
      'lossPerSeat', (COALESCE((v_sess.parity_state ->> '__entry__')::bigint, 0) * v_value),
      'timestamp', (extract(epoch from now()) * 1000)::bigint
    ), true);
    v_sess.parity_state := jsonb_set(v_sess.parity_state, '{__double__}', jsonb_build_object('value', v_value, 'proposed_by', NULL, 'awaiting', NULL, 'pending', '[]'::jsonb, 'locks', '{}'::jsonb, 'expires_at', NULL), true);
    UPDATE public.ov2_ludo_sessions
    SET board = v_sess.board, phase = v_sess.phase, current_turn = NULL, turn_deadline = NULL, parity_state = v_sess.parity_state, revision = revision + 1, updated_at = now()
    WHERE id = v_sess.id
    RETURNING * INTO v_sess;
    RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_ludo_build_client_snapshot(v_sess, v_pk));
  END IF;

  SELECT array_agg((x)::int) INTO v_pending
  FROM jsonb_array_elements_text(COALESCE(v_dbl -> 'pending', '[]'::jsonb)) t(x);
  v_locks := COALESCE(v_dbl -> 'locks', '{}'::jsonb) || jsonb_build_object(v_my_seat::text, true);

  IF v_pending IS NOT NULL AND cardinality(v_pending) > 0 THEN
    v_next := v_pending[1];
    v_rest := CASE WHEN cardinality(v_pending) > 1 THEN v_pending[2:cardinality(v_pending)] ELSE ARRAY[]::int[] END;
    v_next_dbl := v_dbl
      || jsonb_build_object('awaiting', v_next, 'pending', to_jsonb(v_rest), 'locks', v_locks, 'expires_at', (extract(epoch from now() + interval '30 seconds') * 1000)::bigint);
  ELSE
    IF (
      SELECT bool_and(COALESCE((v_locks ->> s::text)::boolean, false))
      FROM unnest(v_active) AS q(s)
    ) THEN
      v_next_dbl := jsonb_build_object('value', v_value * 2, 'proposed_by', NULL, 'awaiting', NULL, 'pending', '[]'::jsonb, 'locks', '{}'::jsonb, 'expires_at', NULL);
      v_doubled := true;
    ELSE
      v_next_dbl := jsonb_build_object('value', v_value, 'proposed_by', NULL, 'awaiting', NULL, 'pending', '[]'::jsonb, 'locks', v_locks, 'expires_at', NULL);
    END IF;
  END IF;

  v_ps := COALESCE(v_sess.parity_state, '{}'::jsonb);
  v_ps := jsonb_set(v_ps, '{__double__}', v_next_dbl, true);

  IF v_doubled THEN
    v_cycle := COALESCE(v_ps -> '__double_cycle_used', '[]'::jsonb);
    v_cycle := v_cycle || to_jsonb(v_proposer);
    IF NOT EXISTS (
      SELECT 1
      FROM unnest(v_active) AS t(x)
      WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_cycle) e
        WHERE (e::text)::int = t.x
      )
    ) THEN
      v_cycle := '[]'::jsonb;
    END IF;
    v_ps := jsonb_set(v_ps, '{__double_cycle_used}', v_cycle, true);

    v_stake := COALESCE(v_room.stake_per_seat, 0);
    v_idem_rev := v_sess.revision + 1;
    IF v_stake > 0 THEN
      FOREACH v_seat IN ARRAY v_active
      LOOP
        SELECT s.participant_key INTO v_mem_pk
        FROM public.ov2_ludo_seats s
        WHERE s.session_id = v_sess.id AND s.seat_index = v_seat
        LIMIT 1;
        IF v_mem_pk IS NULL OR length(trim(v_mem_pk)) = 0 THEN
          CONTINUE;
        END IF;
        UPDATE public.ov2_room_members m
        SET
          amount_locked = COALESCE(m.amount_locked, 0) + v_stake,
          updated_at = now()
        WHERE m.room_id = p_room_id AND m.participant_key = v_mem_pk;

        INSERT INTO public.ov2_economy_events (
          room_id,
          participant_key,
          event_kind,
          amount,
          match_seq,
          idempotency_key,
          payload
        ) VALUES (
          p_room_id,
          v_mem_pk,
          'adjust',
          v_stake,
          v_room.match_seq,
          'ludo_double:' || v_sess.id::text || ':' || v_idem_rev::text || ':seat:' || v_seat::text,
          jsonb_build_object('kind', 'ludo_double_step', 'session_id', v_sess.id, 'revision', v_idem_rev, 'seat', v_seat)
        );
      END LOOP;

      UPDATE public.ov2_rooms
      SET
        pot_locked = COALESCE(pot_locked, 0) + (v_stake * cardinality(v_active)),
        updated_at = now()
      WHERE id = p_room_id;
    END IF;
  END IF;

  UPDATE public.ov2_ludo_sessions
  SET
    parity_state = v_ps,
    revision = revision + 1,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_ludo_build_client_snapshot(v_sess, v_pk));
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
  v_cycle jsonb;
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
        'lossPerSeat', (v_entry * v_mult),
        'timestamp', (extract(epoch from COALESCE(p_session.updated_at, now())) * 1000)::bigint
      );
    END IF;
  END IF;

  IF v_result IS NOT NULL AND jsonb_typeof(v_result) = 'object' THEN
    IF NOT (v_result ? 'lossPerSeat')
       OR v_result->'lossPerSeat' IS NULL
       OR jsonb_typeof(v_result->'lossPerSeat') = 'null' THEN
      v_entry := COALESCE((p_session.parity_state ->> '__entry__')::bigint, 0);
      IF (v_result ? 'multiplier') AND length(trim(COALESCE(v_result->>'multiplier', ''))) > 0 THEN
        v_mult := (v_result->>'multiplier')::int;
      ELSE
        v_mult := COALESCE((p_session.parity_state -> '__double__' ->> 'value')::int, 1);
      END IF;
      IF v_mult IS NOT NULL THEN
        v_result := v_result || jsonb_build_object('lossPerSeat', v_entry * v_mult);
      END IF;
    END IF;
  END IF;

  v_cycle := COALESCE(p_session.parity_state -> '__double_cycle_used', '[]'::jsonb);

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
    'doubleCycleUsedSeats', v_cycle,
    'result', COALESCE(v_result, 'null'::jsonb),
    'missedTurns', COALESCE(p_session.parity_state -> 'missed_turns', '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_ludo_respond_double(uuid, text, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_ludo_respond_double(uuid, text, text, bigint) TO anon, authenticated, service_role;

COMMIT;
