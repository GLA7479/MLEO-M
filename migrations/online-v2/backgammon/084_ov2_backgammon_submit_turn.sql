-- OV2 Backgammon: atomic full-turn submit (draft confirm). Does NOT remove ov2_backgammon_move.
-- Apply after 083. Server enforces full-turn legality (max dice, forced higher die, pass-only-when-blocked)
-- via ov2_bg_validate_submit_sequence — mirrors lib/online-v2/backgammon/ov2BackgammonClientLegality.js.
--
-- PLANNED (not in this file — requires product sign-off + ledger work):
--   • Doubling cube: parity_state keys, RPCs offer_double / respond_double, max 2 doubles/player,
--     max 4/match, no consecutive double by same player, reject = loss at current multiplier 1→2→4→8→16.
--   • Vault: reserve min(16 * stake_per_seat) per player at match start, settle on end, release delta.

BEGIN;

-- Distinct face values in diceAvail, sorted ascending (for forced-higher-die when max playable = 1).
CREATE OR REPLACE FUNCTION public.ov2_bg_avail_distinct_sorted(p_avail jsonb)
RETURNS int[]
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(
    array_agg(DISTINCT x ORDER BY x),
    ARRAY[]::int[]
  )
  FROM (
    SELECT (jsonb_array_elements_text(COALESCE(p_avail, '[]'::jsonb)))::int AS x
  ) s;
$$;

-- Legal next steps from p_board for p_turn: same enumeration + dedupe as client ov2BgClientLegalFirstMoves
-- (unique die order in diceAvail, bar priority, then full from/to scan including bear-off).
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
  v_avail := p_board -> 'diceAvail';
  IF v_avail IS NULL OR jsonb_typeof(v_avail) <> 'array' OR jsonb_array_length(v_avail) = 0 THEN
    RETURN '[]'::jsonb;
  END IF;
  v_len := jsonb_array_length(v_avail);
  FOR v_i IN 0..(v_len - 1) LOOP
    v_d := (v_avail -> v_i)::text::int;
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
      IF NOT (v_key = ANY(v_step_keys)) THEN
        v_step_keys := array_append(v_step_keys, v_key);
        v_out := v_out || jsonb_build_array(jsonb_build_object('from', -1, 'to', 24 - v_d, 'die', v_d));
      END IF;
      CONTINUE;
    END IF;

    v_r := public.ov2_bg_validate_step(p_board, p_turn, -1, v_d - 1, v_d);
    IF p_turn = 1 AND public.ov2_bg_bar_get(p_board, 1) > 0 AND coalesce((v_r ->> 'ok')::boolean, false) THEN
      v_key := format('-1,%s,%s', v_d - 1, v_d);
      IF NOT (v_key = ANY(v_step_keys)) THEN
        v_step_keys := array_append(v_step_keys, v_key);
        v_out := v_out || jsonb_build_array(jsonb_build_object('from', -1, 'to', v_d - 1, 'die', v_d));
      END IF;
      CONTINUE;
    END IF;

    IF (p_turn = 0 AND public.ov2_bg_bar_get(p_board, 0) = 0) OR (p_turn = 1 AND public.ov2_bg_bar_get(p_board, 1) = 0) THEN
      v_r := public.ov2_bg_validate_step(p_board, p_turn, -1, -1, v_d);
      IF coalesce((v_r ->> 'ok')::boolean, false) THEN
        v_key := format('-1,-1,%s', v_d);
        IF NOT (v_key = ANY(v_step_keys)) THEN
          v_step_keys := array_append(v_step_keys, v_key);
          v_out := v_out || jsonb_build_array(jsonb_build_object('from', -1, 'to', -1, 'die', v_d));
        END IF;
      END IF;
      FOR v_from IN 0..23 LOOP
        FOR v_to IN -1..23 LOOP
          v_r := public.ov2_bg_validate_step(p_board, p_turn, v_from, v_to, v_d);
          IF coalesce((v_r ->> 'ok')::boolean, false) THEN
            v_key := format('%s,%s,%s', v_from, v_to, v_d);
            IF NOT (v_key = ANY(v_step_keys)) THEN
              v_step_keys := array_append(v_step_keys, v_key);
              v_out := v_out || jsonb_build_array(jsonb_build_object('from', v_from, 'to', v_to, 'die', v_d));
            END IF;
          END IF;
        END LOOP;
      END LOOP;
    END IF;
  END LOOP;
  RETURN v_out;
END;
$$;

-- Maximum number of dice playable from this position (compulsory full use when possible).
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
BEGIN
  IF p_turn IS DISTINCT FROM 0 AND p_turn IS DISTINCT FROM 1 THEN
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
    v_ap := public.ov2_bg_apply_step_full(
      p_board,
      p_turn,
      (v_el ->> 'from')::int,
      (v_el ->> 'to')::int,
      (v_el ->> 'die')::int
    );
    IF coalesce((v_ap ->> 'ok')::boolean, false) THEN
      v_sub := 1 + public.ov2_bg_max_dice_playable(v_ap -> 'board', p_turn);
      IF v_sub > v_best THEN
        v_best := v_sub;
      END IF;
    END IF;
  END LOOP;
  RETURN v_best;
END;
$$;

-- Full-sequence validation: maximal dice, per-step legality, terminal state, forced higher die when maxPlay=1.
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
BEGIN
  IF p_turn IS DISTINCT FROM 0 AND p_turn IS DISTINCT FROM 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_TURN', 'message', 'Invalid turn seat');
  END IF;
  IF p_steps IS NULL OR jsonb_typeof(p_steps) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'p_steps must be a JSON array');
  END IF;

  v_n := jsonb_array_length(p_steps);
  v_initial_avail := COALESCE(p_board -> 'diceAvail', '[]'::jsonb);
  v_max := public.ov2_bg_max_dice_playable(p_board, p_turn);

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
    v_from := (v_el ->> 'from')::int;
    v_to := (v_el ->> 'to')::int;
    v_die := (v_el ->> 'die')::int;
    IF v_die IS NULL OR v_die < 1 OR v_die > 6 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STEP', 'message', 'Invalid die in step', 'step_index', v_i);
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
      IF (p_steps -> 0 ->> 'die')::int IS DISTINCT FROM v_forced THEN
        RETURN jsonb_build_object(
          'ok', false,
          'code', 'MUST_PLAY_HIGHER_DIE',
          'message', format('When only one die can be played, use the %s.', v_forced)
        );
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'board', v_board);
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_bg_avail_distinct_sorted(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ov2_bg_enumerate_legal_first_steps(jsonb, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ov2_bg_max_dice_playable(jsonb, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ov2_bg_validate_submit_sequence(jsonb, integer, jsonb) FROM PUBLIC;

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
  v_chk jsonb;
  v_w int;
  v_entry bigint;
  v_ps jsonb;
  v_n int;
BEGIN
  v_pk := trim(COALESCE(p_participant_key, ''));
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;

  IF p_steps IS NULL OR jsonb_typeof(p_steps) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'p_steps must be a JSON array');
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

  v_n := jsonb_array_length(p_steps);

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
    RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_backgammon_build_client_snapshot(v_sess, v_pk));
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

REVOKE ALL ON FUNCTION public.ov2_backgammon_submit_turn(uuid, text, jsonb, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_backgammon_submit_turn(uuid, text, jsonb, bigint) TO anon, authenticated, service_role;

COMMIT;
