-- OV2 Ludo parity RPCs: timeout tick + double state machine.
-- Apply after 019_ov2_ludo_parity_core.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_ludo_offer_double(
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
  v_sess public.ov2_ludo_sessions%ROWTYPE;
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_board jsonb;
  v_turn int;
  v_my_seat int;
  v_active int[];
  v_dbl jsonb;
  v_others int[];
  v_next int;
  v_rest int[];
  v_next_dbl jsonb;
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

  v_board := COALESCE(v_sess.board, '{}'::jsonb);
  v_turn := COALESCE((v_board ->> 'turnSeat')::int, v_sess.current_turn);
  IF v_turn IS DISTINCT FROM v_my_seat THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_YOUR_TURN', 'message', 'Not your turn');
  END IF;
  IF (v_board -> 'dice') IS NULL OR jsonb_typeof(v_board -> 'dice') = 'null' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_DICE', 'message', 'Roll before doubling');
  END IF;

  v_active := COALESCE(v_sess.active_seats, ARRAY[]::int[]);
  v_dbl := COALESCE(v_sess.parity_state -> '__double__', '{}'::jsonb);
  IF (v_dbl ->> 'proposed_by') IS NOT NULL OR (v_dbl ->> 'awaiting') IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'DOUBLE_PENDING', 'message', 'Another double proposal is pending');
  END IF;
  IF COALESCE((v_dbl -> 'locks' ->> v_my_seat::text)::boolean, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'DOUBLE_LOCKED', 'message', 'You already proposed this round');
  END IF;

  SELECT array_agg(x) INTO v_others FROM unnest(v_active) AS t(x) WHERE x <> v_my_seat;
  IF v_others IS NULL OR cardinality(v_others) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_OPPONENT', 'message', 'No opponent to respond');
  END IF;
  v_next := v_others[1];
  v_rest := CASE WHEN cardinality(v_others) > 1 THEN v_others[2:cardinality(v_others)] ELSE ARRAY[]::int[] END;

  v_next_dbl := jsonb_build_object(
    'value', COALESCE((v_dbl ->> 'value')::int, 1),
    'proposed_by', v_my_seat,
    'awaiting', v_next,
    'pending', to_jsonb(v_rest),
    'locks', COALESCE(v_dbl -> 'locks', '{}'::jsonb) || jsonb_build_object(v_my_seat::text, true),
    'expires_at', (extract(epoch from now() + interval '30 seconds') * 1000)::bigint
  );

  UPDATE public.ov2_ludo_sessions
  SET
    parity_state = jsonb_set(COALESCE(parity_state, '{}'::jsonb), '{__double__}', v_next_dbl, true),
    revision = revision + 1,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_ludo_build_client_snapshot(v_sess, v_pk));
END;
$$;

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
    ELSE
      v_next_dbl := jsonb_build_object('value', v_value, 'proposed_by', NULL, 'awaiting', NULL, 'pending', '[]'::jsonb, 'locks', v_locks, 'expires_at', NULL);
    END IF;
  END IF;

  UPDATE public.ov2_ludo_sessions
  SET
    parity_state = jsonb_set(COALESCE(parity_state, '{}'::jsonb), '{__double__}', v_next_dbl, true),
    revision = revision + 1,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_ludo_build_client_snapshot(v_sess, v_pk));
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_ludo_offer_double(uuid, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_ludo_offer_double(uuid, text, bigint) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_ludo_respond_double(uuid, text, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_ludo_respond_double(uuid, text, text, bigint) TO anon, authenticated, service_role;

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

  v_board := COALESCE(v_sess.board, '{}'::jsonb);
  v_turn := COALESCE((v_board ->> 'turnSeat')::int, v_sess.current_turn);
  IF v_turn IS DISTINCT FROM p_turn_seat THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TURN_MOVED', 'message', 'Turn already moved');
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
    turn_deadline = CASE WHEN v_next IS NULL THEN NULL ELSE now() + interval '30 seconds' END,
    parity_state = v_sess.parity_state,
    revision = revision + 1,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_ludo_build_client_snapshot(v_sess, ''));
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_ludo_mark_missed_turn(uuid, integer, text, boolean, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_ludo_mark_missed_turn(uuid, integer, text, boolean, bigint) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ov2_ludo_handle_double_timeout(
  p_room_id uuid,
  p_expired_seat integer,
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
  v_active int[];
  v_dbl jsonb;
  v_value int;
  v_proposer int;
  v_winner int;
  v_updated_active int[];
  v_next_dbl jsonb;
  v_entry bigint;
BEGIN
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
  IF NOT FOUND OR v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No active Ludo session');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_ludo_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_PLAYING', 'message', 'Session not in playing phase');
  END IF;
  IF p_expected_revision IS NOT NULL AND v_sess.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REVISION_MISMATCH', 'message', 'Revision mismatch');
  END IF;

  v_dbl := COALESCE(v_sess.parity_state -> '__double__', '{}'::jsonb);
  IF (v_dbl ->> 'awaiting')::int IS DISTINCT FROM p_expired_seat THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_AWAITING_SEAT', 'message', 'Seat is not current double responder');
  END IF;

  v_board := COALESCE(v_sess.board, '{}'::jsonb);
  v_active := COALESCE(v_sess.active_seats, ARRAY[]::int[]);
  v_value := COALESCE((v_dbl ->> 'value')::int, 1);
  v_proposer := (v_dbl ->> 'proposed_by')::int;
  v_entry := COALESCE((v_sess.parity_state ->> '__entry__')::bigint, 0);

  IF cardinality(v_active) <= 2 THEN
    v_winner := COALESCE(v_proposer, (
      SELECT x FROM unnest(v_active) AS t(x) WHERE x <> p_expired_seat LIMIT 1
    ));
    v_board := jsonb_set(v_board, '{winner}', to_jsonb(v_winner), true);
    v_next_dbl := jsonb_build_object('value', v_value, 'proposed_by', NULL, 'awaiting', NULL, 'pending', '[]'::jsonb, 'locks', '{}'::jsonb, 'expires_at', NULL);
    UPDATE public.ov2_ludo_sessions
    SET
      board = v_board,
      phase = 'finished',
      current_turn = NULL,
      turn_deadline = NULL,
      parity_state = jsonb_set(
        jsonb_set(COALESCE(v_sess.parity_state, '{}'::jsonb), '{__double__}', v_next_dbl, true),
        '{__result__}',
        jsonb_build_object(
          'winner', v_winner,
          'multiplier', v_value,
          'prize', (v_entry * COALESCE(cardinality(v_active), 0) * v_value),
          'timestamp', (extract(epoch from now()) * 1000)::bigint
        ),
        true
      ),
      revision = revision + 1,
      updated_at = now()
    WHERE id = v_sess.id
    RETURNING * INTO v_sess;
    RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_ludo_build_client_snapshot(v_sess, ''));
  END IF;

  v_updated_active := array_remove(v_active, p_expired_seat);
  DELETE FROM public.ov2_ludo_seats
  WHERE session_id = v_sess.id
    AND seat_index = p_expired_seat;

  v_board := jsonb_set(v_board, '{activeSeats}', to_jsonb(v_updated_active), true);
  v_board := (v_board #- ARRAY['pieces', p_expired_seat::text]) #- ARRAY['finished', p_expired_seat::text];
  IF NOT (v_updated_active @> ARRAY[COALESCE((v_board ->> 'turnSeat')::int, -999)]) THEN
    v_board := jsonb_set(v_board, '{turnSeat}', to_jsonb(v_updated_active[1]), true);
  END IF;
  v_next_dbl := jsonb_build_object('value', v_value, 'proposed_by', NULL, 'awaiting', NULL, 'pending', '[]'::jsonb, 'locks', '{}'::jsonb, 'expires_at', NULL);

  UPDATE public.ov2_ludo_sessions
  SET
    board = v_board,
    active_seats = v_updated_active,
    current_turn = (v_board ->> 'turnSeat')::int,
    turn_deadline = now() + interval '30 seconds',
    parity_state = jsonb_set(COALESCE(v_sess.parity_state, '{}'::jsonb), '{__double__}', v_next_dbl, true),
    revision = revision + 1,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_ludo_build_client_snapshot(v_sess, ''));
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_ludo_handle_double_timeout(uuid, integer, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_ludo_handle_double_timeout(uuid, integer, bigint) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ov2_ludo_persist_result_on_finish()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_winner int;
  v_mult int;
  v_entry bigint;
  v_active_count int;
BEGIN
  IF NEW.phase IS DISTINCT FROM 'finished' THEN
    RETURN NEW;
  END IF;

  IF (COALESCE(NEW.parity_state, '{}'::jsonb) -> '__result__') IS NOT NULL
     AND jsonb_typeof(COALESCE(NEW.parity_state, '{}'::jsonb) -> '__result__') <> 'null' THEN
    RETURN NEW;
  END IF;

  v_winner := CASE WHEN (COALESCE(NEW.board, '{}'::jsonb) ->> 'winner') IS NULL THEN NULL ELSE (NEW.board ->> 'winner')::int END;
  IF v_winner IS NULL THEN
    RETURN NEW;
  END IF;
  v_mult := COALESCE((COALESCE(NEW.parity_state, '{}'::jsonb) -> '__double__' ->> 'value')::int, 1);
  v_entry := COALESCE((COALESCE(NEW.parity_state, '{}'::jsonb) ->> '__entry__')::bigint, 0);
  v_active_count := COALESCE(cardinality(NEW.active_seats), 0);

  NEW.parity_state := jsonb_set(
    COALESCE(NEW.parity_state, '{}'::jsonb),
    '{__result__}',
    jsonb_build_object(
      'winner', v_winner,
      'multiplier', v_mult,
      'prize', (v_entry * v_active_count * v_mult),
      'timestamp', (extract(epoch from COALESCE(NEW.updated_at, now())) * 1000)::bigint
    ),
    true
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ov2_ludo_persist_result_on_finish ON public.ov2_ludo_sessions;
CREATE TRIGGER trg_ov2_ludo_persist_result_on_finish
BEFORE UPDATE ON public.ov2_ludo_sessions
FOR EACH ROW
EXECUTE FUNCTION public.ov2_ludo_persist_result_on_finish();

COMMIT;

