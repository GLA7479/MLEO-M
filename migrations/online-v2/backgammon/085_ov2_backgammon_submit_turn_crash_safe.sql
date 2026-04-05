-- OV2 Backgammon: crash-safe submit_turn + helpers (apply after 084).
-- Fixes 500s from invalid_text_representation / uncaught errors in JSON casts.
-- TEMP: RAISE LOG lines — remove or downgrade after debugging.

BEGIN;

-- Safe distinct dice faces (1–6); skips null / non-numeric / out-of-range elements.
CREATE OR REPLACE FUNCTION public.ov2_bg_avail_distinct_sorted(p_avail jsonb)
RETURNS int[]
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_elem jsonb;
  v_t text;
  v_d int;
  v_out int[] := ARRAY[]::integer[];
BEGIN
  IF p_avail IS NULL OR jsonb_typeof(p_avail) <> 'array' THEN
    RETURN ARRAY[]::integer[];
  END IF;
  FOR v_elem IN SELECT jsonb_array_elements(p_avail)
  LOOP
    IF v_elem IS NULL OR jsonb_typeof(v_elem) = 'null' THEN
      CONTINUE;
    END IF;
    v_t := v_elem #>> '{}';
    IF v_t IS NULL OR length(trim(v_t)) = 0 THEN
      CONTINUE;
    END IF;
    BEGIN
      v_d := v_t::int;
    EXCEPTION
      WHEN invalid_text_representation THEN
        CONTINUE;
    END;
    IF v_d BETWEEN 1 AND 6 AND NOT (v_d = ANY (v_out)) THEN
      v_out := array_append(v_out, v_d);
    END IF;
  END LOOP;
  RETURN COALESCE(
    ARRAY(SELECT u FROM unnest(v_out) AS u ORDER BY u),
    ARRAY[]::integer[]
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_bg_enumerate_legal_first_steps(p_board jsonb, p_turn int)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_avail jsonb;
  v_len int;
  v_i int;
  v_d int;
  v_elem jsonb;
  v_seen_dice int[] := ARRAY[]::integer[];
  v_dup boolean;
  v_s int;
  v_from int;
  v_to int;
  v_r jsonb;
  v_out jsonb := '[]'::jsonb;
  v_step_keys text[] := ARRAY[]::text[];
  v_key text;
BEGIN
  IF p_board IS NULL OR jsonb_typeof(p_board) <> 'object' THEN
    RETURN '[]'::jsonb;
  END IF;
  v_avail := p_board -> 'diceAvail';
  IF v_avail IS NULL OR jsonb_typeof(v_avail) <> 'array' OR jsonb_array_length(v_avail) = 0 THEN
    RETURN '[]'::jsonb;
  END IF;
  v_len := jsonb_array_length(v_avail);
  FOR v_i IN 0..(v_len - 1) LOOP
    v_elem := v_avail -> v_i;
    IF v_elem IS NULL OR jsonb_typeof(v_elem) = 'null' THEN
      CONTINUE;
    END IF;
    BEGIN
      v_d := (v_elem #>> '{}')::int;
    EXCEPTION
      WHEN invalid_text_representation THEN
        CONTINUE;
    END;
    IF v_d IS NULL OR v_d < 1 OR v_d > 6 THEN
      CONTINUE;
    END IF;

    v_dup := false;
    FOREACH v_s IN ARRAY v_seen_dice LOOP
      IF v_s = v_d THEN
        v_dup := true;
        EXIT;
      END IF;
    END LOOP;
    IF v_dup THEN
      CONTINUE;
    END IF;
    v_seen_dice := array_append(v_seen_dice, v_d);

    v_r := public.ov2_bg_validate_step(p_board, p_turn, -1, 24 - v_d, v_d);
    IF p_turn = 0 AND public.ov2_bg_bar_get(p_board, 0) > 0 AND coalesce((v_r ->> 'ok')::boolean, false) THEN
      v_key := format('-1,%s,%s', 24 - v_d, v_d);
      IF NOT (v_key = ANY (v_step_keys)) THEN
        v_step_keys := array_append(v_step_keys, v_key);
        v_out := v_out || jsonb_build_array(jsonb_build_object('from', -1, 'to', 24 - v_d, 'die', v_d));
      END IF;
      CONTINUE;
    END IF;

    v_r := public.ov2_bg_validate_step(p_board, p_turn, -1, v_d - 1, v_d);
    IF p_turn = 1 AND public.ov2_bg_bar_get(p_board, 1) > 0 AND coalesce((v_r ->> 'ok')::boolean, false) THEN
      v_key := format('-1,%s,%s', v_d - 1, v_d);
      IF NOT (v_key = ANY (v_step_keys)) THEN
        v_step_keys := array_append(v_step_keys, v_key);
        v_out := v_out || jsonb_build_array(jsonb_build_object('from', -1, 'to', v_d - 1, 'die', v_d));
      END IF;
      CONTINUE;
    END IF;

    IF (p_turn = 0 AND public.ov2_bg_bar_get(p_board, 0) = 0) OR (p_turn = 1 AND public.ov2_bg_bar_get(p_board, 1) = 0) THEN
      v_r := public.ov2_bg_validate_step(p_board, p_turn, -1, -1, v_d);
      IF coalesce((v_r ->> 'ok')::boolean, false) THEN
        v_key := format('-1,-1,%s', v_d);
        IF NOT (v_key = ANY (v_step_keys)) THEN
          v_step_keys := array_append(v_step_keys, v_key);
          v_out := v_out || jsonb_build_array(jsonb_build_object('from', -1, 'to', -1, 'die', v_d));
        END IF;
      END IF;
      FOR v_from IN 0..23 LOOP
        FOR v_to IN -1..23 LOOP
          v_r := public.ov2_bg_validate_step(p_board, p_turn, v_from, v_to, v_d);
          IF coalesce((v_r ->> 'ok')::boolean, false) THEN
            v_key := format('%s,%s,%s', v_from, v_to, v_d);
            IF NOT (v_key = ANY (v_step_keys)) THEN
              v_step_keys := array_append(v_step_keys, v_key);
              v_out := v_out || jsonb_build_array(jsonb_build_object('from', v_from, 'to', v_to, 'die', v_d));
            END IF;
          END IF;
        END LOOP;
      END LOOP;
    END IF;
  END LOOP;
  RETURN v_out;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'ov2_bg_enumerate_legal_first_steps err state=% msg=% turn=%', SQLSTATE, SQLERRM, p_turn;
    RETURN '[]'::jsonb;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_bg_max_dice_playable(p_board jsonb, p_turn int)
RETURNS int
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_steps jsonb;
  v_n int;
  v_i int;
  v_el jsonb;
  v_ap jsonb;
  v_sub int;
  v_best int := 0;
  v_from int;
  v_to int;
  v_die int;
BEGIN
  IF p_turn IS DISTINCT FROM 0 AND p_turn IS DISTINCT FROM 1 THEN
    RETURN 0;
  END IF;
  IF p_board IS NULL OR jsonb_typeof(p_board) <> 'object' THEN
    RETURN 0;
  END IF;
  IF p_board -> 'diceAvail' IS NULL
     OR jsonb_typeof(p_board -> 'diceAvail') <> 'array'
     OR jsonb_array_length(p_board -> 'diceAvail') = 0 THEN
    RETURN 0;
  END IF;
  IF NOT public.ov2_bg_any_legal_exists(p_board, p_turn) THEN
    RETURN 0;
  END IF;
  v_steps := public.ov2_bg_enumerate_legal_first_steps(p_board, p_turn);
  v_n := jsonb_array_length(v_steps);
  FOR v_i IN 0..(v_n - 1) LOOP
    v_el := v_steps -> v_i;
    IF v_el IS NULL OR jsonb_typeof(v_el) <> 'object' THEN
      CONTINUE;
    END IF;
    BEGIN
      v_from := (v_el ->> 'from')::int;
      v_to := (v_el ->> 'to')::int;
      v_die := (v_el ->> 'die')::int;
    EXCEPTION
      WHEN invalid_text_representation THEN
        CONTINUE;
    END;
    IF v_from IS NULL OR v_to IS NULL OR v_die IS NULL THEN
      CONTINUE;
    END IF;
    v_ap := public.ov2_bg_apply_step_full(p_board, p_turn, v_from, v_to, v_die);
    IF coalesce((v_ap ->> 'ok')::boolean, false) THEN
      v_sub := 1 + public.ov2_bg_max_dice_playable(v_ap -> 'board', p_turn);
      IF v_sub > v_best THEN
        v_best := v_sub;
      END IF;
    END IF;
  END LOOP;
  RETURN v_best;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'ov2_bg_max_dice_playable err state=% msg=% turn=%', SQLSTATE, SQLERRM, p_turn;
    RETURN 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_bg_validate_submit_sequence(p_board jsonb, p_turn int, p_steps jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_n int;
  v_i int;
  v_el jsonb;
  v_from int;
  v_to int;
  v_die int;
  v_max int;
  v_board jsonb := p_board;
  v_initial_avail jsonb;
  v_dist int[];
  v_forced int;
  v_ap jsonb;
  v_avail_left int;
  v_first_die int;
BEGIN
  IF p_turn IS DISTINCT FROM 0 AND p_turn IS DISTINCT FROM 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_TURN', 'message', 'Invalid turn seat');
  END IF;
  IF p_board IS NULL OR jsonb_typeof(p_board) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_BOARD', 'message', 'Invalid board');
  END IF;
  IF p_steps IS NULL OR jsonb_typeof(p_steps) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'p_steps must be a JSON array');
  END IF;

  v_n := jsonb_array_length(p_steps);
  v_initial_avail := COALESCE(p_board -> 'diceAvail', '[]'::jsonb);

  BEGIN
    v_max := public.ov2_bg_max_dice_playable(p_board, p_turn);
  EXCEPTION
    WHEN OTHERS THEN
      RAISE LOG 'ov2_bg_validate_submit_sequence max_dice err state=% msg=%', SQLSTATE, SQLERRM;
      RETURN jsonb_build_object('ok', false, 'code', 'VALIDATION_ERROR', 'message', 'Could not evaluate legal turn length');
  END;

  IF v_max = 0 THEN
    IF v_n > 0 THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'NO_MOVES_BUT_STEPS',
        'message', 'No legal moves; submit an empty sequence to pass'
      );
    END IF;
    RETURN jsonb_build_object('ok', true, 'board', v_board);
  END IF;

  IF v_n <> v_max THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'NOT_MAXIMAL_DICE',
      'message', format('Must play %s dice, not %s.', v_max, v_n)
    );
  END IF;

  FOR v_i IN 0..(v_n - 1) LOOP
    v_el := p_steps -> v_i;
    IF v_el IS NULL OR jsonb_typeof(v_el) <> 'object' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STEP', 'message', 'Invalid step object', 'step_index', v_i);
    END IF;
    BEGIN
      v_from := (v_el ->> 'from')::int;
      v_to := (v_el ->> 'to')::int;
      v_die := (v_el ->> 'die')::int;
    EXCEPTION
      WHEN invalid_text_representation THEN
        RETURN jsonb_build_object(
          'ok', false,
          'code', 'INVALID_STEP',
          'message', 'Step from/to/die must be integers',
          'step_index', v_i
        );
    END;
    IF v_from IS NULL OR v_to IS NULL OR v_die IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STEP', 'message', 'Missing from, to, or die', 'step_index', v_i);
    END IF;
    IF v_die < 1 OR v_die > 6 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STEP', 'message', 'Die must be 1–6', 'step_index', v_i);
    END IF;
    IF v_from < -1 OR v_from > 23 OR v_to < -1 OR v_to > 23 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STEP', 'message', 'from/to out of range', 'step_index', v_i);
    END IF;

    v_ap := public.ov2_bg_apply_step_full(v_board, p_turn, v_from, v_to, v_die);
    IF coalesce((v_ap ->> 'ok')::boolean, false) IS NOT TRUE THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', COALESCE(v_ap ->> 'code', 'ILLEGAL_MOVE'),
        'message', 'Illegal move in sequence',
        'step_index', v_i
      );
    END IF;
    v_board := v_ap -> 'board';
    IF v_board IS NULL OR jsonb_typeof(v_board) <> 'object' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INTERNAL_ERROR', 'message', 'Apply step returned invalid board', 'step_index', v_i);
    END IF;
  END LOOP;

  v_avail_left := jsonb_array_length(COALESCE(v_board -> 'diceAvail', '[]'::jsonb));
  IF v_avail_left > 0 AND public.ov2_bg_any_legal_exists(v_board, p_turn) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INCOMPLETE_TURN',
      'message', 'Sequence leaves playable dice with legal moves remaining'
    );
  END IF;

  IF v_max = 1 THEN
    v_dist := public.ov2_bg_avail_distinct_sorted(v_initial_avail);
    IF coalesce(array_length(v_dist, 1), 0) >= 2 THEN
      SELECT max(x) INTO v_forced FROM unnest(v_dist) AS x;
      BEGIN
        v_first_die := (p_steps -> 0 ->> 'die')::int;
      EXCEPTION
        WHEN invalid_text_representation THEN
          RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STEP', 'message', 'Invalid first-step die');
      END;
      IF v_first_die IS DISTINCT FROM v_forced THEN
        RETURN jsonb_build_object(
          'ok', false,
          'code', 'MUST_PLAY_HIGHER_DIE',
          'message', format('When only one die can be played, use the %s.', v_forced)
        );
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'board', v_board);
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'ov2_bg_validate_submit_sequence err state=% msg=% turn=% steps_n=%', SQLSTATE, SQLERRM, p_turn, v_n;
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'VALIDATION_ERROR',
      'message', 'Turn validation failed unexpectedly'
    );
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

  RAISE LOG
    'ov2_backgammon_submit_turn start room=% session=% rev=% expect_rev=% seat_query_pk=% steps_n=% phase=%',
    p_room_id,
    v_sess.id,
    v_sess.revision,
    p_expected_revision,
    v_pk,
    v_n,
    v_sess.phase;

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
  IF v_board IS NULL OR jsonb_typeof(v_board) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_BOARD', 'message', 'Session board missing');
  END IF;

  v_turn_txt := v_board ->> 'turnSeat';
  IF v_turn_txt IS NULL OR v_turn_txt !~ '^[01]$' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_BOARD', 'message', 'Invalid turnSeat on board');
  END IF;
  v_turn := v_turn_txt::int;

  RAISE LOG
    'ov2_backgammon_submit_turn board seat=% turnSeat=% diceAvail=% steps_len=%',
    v_seat,
    v_turn,
    v_board -> 'diceAvail',
    v_n;

  IF v_turn IS DISTINCT FROM v_seat THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_YOUR_TURN', 'message', 'Not your turn');
  END IF;

  -- Pass turn: no legal moves (same idea as roll auto-finish).
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
        RAISE LOG 'ov2_backgammon_submit_turn snapshot(pass) err state=% msg=%', SQLSTATE, SQLERRM;
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
    BEGIN
      v_snap := public.ov2_backgammon_build_client_snapshot(v_sess, v_pk);
    EXCEPTION
      WHEN OTHERS THEN
        RAISE LOG 'ov2_backgammon_submit_turn snapshot(win) err state=% msg=%', SQLSTATE, SQLERRM;
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
      RAISE LOG 'ov2_backgammon_submit_turn snapshot(normal) err state=% msg=%', SQLSTATE, SQLERRM;
      RETURN jsonb_build_object('ok', false, 'code', 'INTERNAL_ERROR', 'message', 'Could not build snapshot');
  END;
  RETURN jsonb_build_object('ok', true, 'snapshot', v_snap);
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG
      'ov2_backgammon_submit_turn FATAL state=% msg=% room=% steps_n=%',
      SQLSTATE,
      SQLERRM,
      p_room_id,
      v_n;
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INTERNAL_ERROR',
      'message', 'Unexpected error during submit; try again',
      'sqlstate', SQLSTATE
    );
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_bg_avail_distinct_sorted(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ov2_bg_enumerate_legal_first_steps(jsonb, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ov2_bg_max_dice_playable(jsonb, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ov2_bg_validate_submit_sequence(jsonb, integer, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ov2_backgammon_submit_turn(uuid, text, jsonb, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_backgammon_submit_turn(uuid, text, jsonb, bigint) TO anon, authenticated, service_role;

COMMIT;
