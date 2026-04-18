-- AUTO-GENERATED from ludo/077_ov2_ludo_multiplayer_double_rule8.sql via scripts/gen-ov2-snakes-double-from-ludo077.mjs
-- Snakes & Ladders: Rule 8 economy + multiplayer double parity (ported naming).
-- Requires 150_ov2_snakes_ladders_shared_game.sql (build_client_snapshot + sessions must exist first).
-- Apply AFTER 150 (151 defines double/forfeit/missed_turn that call into snapshot defined in 150).

BEGIN;

-- OV2 Ludo: multiplayer double rules + Rule 8 economy.
--
-- RULE 8 (authoritative): On decline / double-timeout / voluntary forfeit / strike elimination,
-- the removed player forfeits committed liability = __entry__ × current __double__.value
-- (initial stake plus incremental double locks). Enforced in:
--   • public.ov2_snakes_ladders_rule8_forfeit_committed_stake — ov2_economy_events (forfeit), amount_locked↓, pot_locked↓
--   • Call sites: respond_double, handle_double_timeout, voluntary_forfeit, mark_missed_turn
-- Finish-path settlement (ov2_ludo_after_finish_emit_settlement) unchanged: winner credit; losers metadata;
-- __result__.lossPerSeat (when present) documents per-seat loss at finish; Rule 8 economy runs at forfeit time.
--
-- Also: ×16 cap, ≤2 initiations per seat per match (__double_initiations), 2p decline/timeout ends match,
-- 3+ eliminates responder and rebuilds double queue; LEAST(value×2, 16) on accept/rebuild completion.
-- Session creators (open_session, rematch) seed __double_initiations / __double_cycle_used for a fresh match.


-- -----------------------------------------------------------------------------
-- Rule 8: forfeit committed stake (idempotent: updates only if insert succeeded)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ov2_snakes_ladders_rule8_forfeit_committed_stake(
  p_room_id uuid,
  p_participant_key text,
  p_session_id uuid,
  p_match_seq integer,
  p_entry bigint,
  p_multiplier_value int,
  p_idempotency_suffix text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_amt bigint;
  v_take bigint;
  v_cur_lock bigint;
  v_room public.ov2_rooms%ROWTYPE;
  v_idem text;
  v_ins uuid;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 OR p_session_id IS NULL THEN
    RETURN;
  END IF;
  v_amt := COALESCE(p_entry, 0) * GREATEST(1, COALESCE(p_multiplier_value, 1));
  IF v_amt <= 0 THEN
    RETURN;
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COALESCE(m.amount_locked, 0) INTO v_cur_lock
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id AND m.participant_key = v_pk
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_take := LEAST(GREATEST(v_cur_lock, 0), v_amt);

  v_idem := 'snakes_rule8_forfeit:' || p_session_id::text || ':' || v_pk || ':' || trim(COALESCE(p_idempotency_suffix, ''));

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
    v_pk,
    'forfeit',
    v_take,
    p_match_seq,
    v_idem,
    jsonb_build_object(
      'kind', 'snakes_rule8_double_elimination',
      'session_id', p_session_id,
      'rule', 8,
      'committedLiabilityExpected', v_amt,
      'note', 'Forfeits initial stake plus accepted double adjustments (entry × multiplier) at elimination time.'
    )
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_ins;

  IF v_ins IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.ov2_room_members m
  SET
    amount_locked = GREATEST(0, COALESCE(m.amount_locked, 0) - v_take),
    updated_at = now()
  WHERE m.room_id = p_room_id AND m.participant_key = v_pk;

  UPDATE public.ov2_rooms
  SET
    pot_locked = GREATEST(0, COALESCE(pot_locked, 0) - v_take),
    updated_at = now()
  WHERE id = p_room_id;
END;
$$;

COMMENT ON FUNCTION public.ov2_snakes_ladders_rule8_forfeit_committed_stake(uuid, text, uuid, integer, bigint, int, text) IS
  'Snakes & Ladders Rule 8: forfeit participant committed liability (entry×multiplier); economy forfeit row + amount_locked/pot_locked decrement. Idempotent.';

REVOKE ALL ON FUNCTION public.ov2_snakes_ladders_rule8_forfeit_committed_stake(uuid, text, uuid, integer, bigint, int, text) FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- Rebuild __double__ after removing a seat; may complete multiplier step (×2 capped at 16).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._ov2_snakes_ladders_double_rebuild_after_elimination(
  p_double jsonb,
  p_removed_seat int,
  p_active int[],
  p_old_value int
)
RETURNS TABLE(r_double jsonb, r_doubled boolean, r_new_value int)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_dbl jsonb := COALESCE(p_double, '{}'::jsonb);
  v_prop int;
  v_val int := GREATEST(1, COALESCE(p_old_value, 1));
  v_resp int[];
  v_locks jsonb;
  v_s int;
  v_all boolean := true;
  v_first_pending int := NULL;
  v_pending int[] := ARRAY[]::int[];
  v_have_await boolean := false;
  v_new_val int;
BEGIN
  r_doubled := false;
  r_new_value := v_val;

  IF (v_dbl ->> 'proposed_by') IS NULL OR (v_dbl ->> 'awaiting') IS NULL THEN
    r_double := jsonb_build_object(
      'value', v_val,
      'proposed_by', NULL,
      'awaiting', NULL,
      'pending', '[]'::jsonb,
      'locks', '{}'::jsonb,
      'expires_at', NULL
    );
    RETURN NEXT;
    RETURN;
  END IF;

  v_prop := (v_dbl ->> 'proposed_by')::int;

  IF p_removed_seat IS NOT NULL AND v_prop IS NOT NULL AND v_prop = p_removed_seat THEN
    r_double := jsonb_build_object(
      'value', v_val,
      'proposed_by', NULL,
      'awaiting', NULL,
      'pending', '[]'::jsonb,
      'locks', '{}'::jsonb,
      'expires_at', NULL
    );
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT COALESCE(array_agg(x ORDER BY x), ARRAY[]::int[])
  INTO v_resp
  FROM unnest(COALESCE(p_active, ARRAY[]::int[])) AS t(x)
  WHERE x IS DISTINCT FROM v_prop;

  v_locks := COALESCE(v_dbl -> 'locks', '{}'::jsonb);
  v_locks := v_locks - p_removed_seat::text;
  v_locks := (
    SELECT COALESCE(jsonb_object_agg(k, v_locks -> k), '{}'::jsonb)
    FROM (
      SELECT x::text AS k
      FROM unnest(COALESCE(p_active, ARRAY[]::int[])) AS u(x)
      WHERE v_locks ? x::text
    ) q
  );

  IF v_resp IS NULL OR cardinality(v_resp) = 0 THEN
    r_double := jsonb_build_object(
      'value', v_val,
      'proposed_by', NULL,
      'awaiting', NULL,
      'pending', '[]'::jsonb,
      'locks', '{}'::jsonb,
      'expires_at', NULL
    );
    RETURN NEXT;
    RETURN;
  END IF;

  FOREACH v_s IN ARRAY v_resp
  LOOP
    IF NOT COALESCE((v_locks ->> v_s::text)::boolean, false) THEN
      v_all := false;
      IF NOT v_have_await THEN
        v_first_pending := v_s;
        v_have_await := true;
      ELSE
        v_pending := array_append(v_pending, v_s);
      END IF;
    END IF;
  END LOOP;

  IF v_all THEN
    v_new_val := LEAST(v_val * 2, 16);
    r_new_value := v_new_val;
    r_doubled := (v_new_val > v_val);
    r_double := jsonb_build_object(
      'value', v_new_val,
      'proposed_by', NULL,
      'awaiting', NULL,
      'pending', '[]'::jsonb,
      'locks', '{}'::jsonb,
      'expires_at', NULL
    );
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_have_await AND v_first_pending IS NOT NULL THEN
    r_double := jsonb_build_object(
      'value', v_val,
      'proposed_by', v_prop,
      'awaiting', v_first_pending,
      'pending', to_jsonb(v_pending),
      'locks', v_locks,
      'expires_at', (extract(epoch from now() + interval '30 seconds') * 1000)::bigint
    );
    RETURN NEXT;
    RETURN;
  END IF;

  r_double := jsonb_build_object(
    'value', v_val,
    'proposed_by', NULL,
    'awaiting', NULL,
    'pending', '[]'::jsonb,
    'locks', '{}'::jsonb,
    'expires_at', NULL
  );
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public._ov2_snakes_ladders_double_rebuild_after_elimination(jsonb, int, int[], int) FROM PUBLIC;

-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._ov2_snakes_ladders_double_apply_incremental_lock(
  p_room_id uuid,
  p_sess public.ov2_snakes_ladders_sessions,
  p_active int[],
  p_idem_rev bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_stake bigint;
  v_mem_pk text;
  v_seat int;
  v_new_event uuid;
  v_lock_seats int := 0;
BEGIN
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_stake := COALESCE(v_room.stake_per_seat, 0);
  IF v_stake <= 0 THEN
    RETURN;
  END IF;

  FOREACH v_seat IN ARRAY COALESCE(p_active, ARRAY[]::int[])
  LOOP
    SELECT trim(s.participant_key) INTO v_mem_pk
    FROM public.ov2_snakes_ladders_seats s
    WHERE s.session_id = p_sess.id AND s.seat_index = v_seat
    LIMIT 1;
    IF v_mem_pk IS NULL OR length(v_mem_pk) = 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.ov2_economy_events (
      room_id, participant_key, event_kind, amount, match_seq, idempotency_key, payload
    ) VALUES (
      p_room_id,
      v_mem_pk,
      'adjust',
      v_stake,
      v_room.match_seq,
      'snakes_double:' || p_sess.id::text || ':' || p_idem_rev::text || ':seat:' || v_seat::text,
      jsonb_build_object('kind', 'snakes_double_step', 'session_id', p_sess.id, 'revision', p_idem_rev, 'seat', v_seat)
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_new_event;

    IF v_new_event IS NOT NULL THEN
      UPDATE public.ov2_room_members m
      SET
        amount_locked = COALESCE(m.amount_locked, 0) + v_stake,
        updated_at = now()
      WHERE m.room_id = p_room_id AND m.participant_key = v_mem_pk;
      v_lock_seats := v_lock_seats + 1;
    END IF;
  END LOOP;

  IF v_lock_seats > 0 THEN
    UPDATE public.ov2_rooms
    SET
      pot_locked = COALESCE(pot_locked, 0) + (v_stake * v_lock_seats),
      updated_at = now()
    WHERE id = p_room_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._ov2_snakes_ladders_double_apply_incremental_lock(uuid, public.ov2_snakes_ladders_sessions, int[], bigint) FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- offer_double (×16, initiation cap, cycle)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ov2_snakes_ladders_offer_double(
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
  v_sess public.ov2_snakes_ladders_sessions%ROWTYPE;
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
  v_val int;
  v_inits jsonb;
  v_init_count int;
BEGIN
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
  IF NOT FOUND OR v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No active Snakes session');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_snakes_ladders_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.phase IS DISTINCT FROM 'playing' OR v_sess.status IS DISTINCT FROM 'live' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_PLAYING', 'message', 'Session not in playing phase');
  END IF;
  IF p_expected_revision IS NOT NULL AND v_sess.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REVISION_MISMATCH', 'message', 'Revision mismatch');
  END IF;

  v_my_seat := (
    SELECT s.seat_index FROM public.ov2_snakes_ladders_seats s
    WHERE s.session_id = v_sess.id AND s.participant_key = v_pk
    LIMIT 1
  );
  IF v_my_seat IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No Snakes seat for participant');
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
  v_val := COALESCE((v_dbl ->> 'value')::int, 1);
  IF v_val >= 16 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'DOUBLE_MAX_MULTIPLIER', 'message', 'Maximum multiplier (×16) reached');
  END IF;

  IF (v_dbl ->> 'proposed_by') IS NOT NULL OR (v_dbl ->> 'awaiting') IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'DOUBLE_PENDING', 'message', 'Another double proposal is pending');
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(v_sess.parity_state -> '__double_cycle_used', '[]'::jsonb)) e
    WHERE (e::text)::int = v_my_seat
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'DOUBLE_CYCLE_USED',
      'message', 'You already used your double for this cycle; wait until the cycle resets.'
    );
  END IF;

  v_inits := COALESCE(v_sess.parity_state -> '__double_initiations', '{}'::jsonb);
  v_init_count := COALESCE(NULLIF(trim(v_inits ->> v_my_seat::text), '')::int, 0);
  IF v_init_count >= 2 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'DOUBLE_INITIATION_CAP',
      'message', 'You may initiate at most two doubles per match.'
    );
  END IF;

  IF COALESCE((v_dbl -> 'locks' ->> v_my_seat::text)::boolean, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'DOUBLE_LOCKED', 'message', 'You already proposed this round');
  END IF;

  SELECT array_agg(x ORDER BY x) INTO v_others FROM unnest(v_active) AS t(x) WHERE x <> v_my_seat;
  IF v_others IS NULL OR cardinality(v_others) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_OPPONENT', 'message', 'No opponent to respond');
  END IF;
  v_next := v_others[1];
  v_rest := CASE WHEN cardinality(v_others) > 1 THEN v_others[2:cardinality(v_others)] ELSE ARRAY[]::int[] END;

  v_next_dbl := jsonb_build_object(
    'value', v_val,
    'proposed_by', v_my_seat,
    'awaiting', v_next,
    'pending', to_jsonb(v_rest),
    'locks', COALESCE(v_dbl -> 'locks', '{}'::jsonb) || jsonb_build_object(v_my_seat::text, true),
    'expires_at', (extract(epoch from now() + interval '30 seconds') * 1000)::bigint
  );

  v_sess.parity_state := jsonb_set(
    COALESCE(v_sess.parity_state, '{}'::jsonb),
    '{__double__}',
    v_next_dbl,
    true
  );
  v_sess.parity_state := jsonb_set(
    v_sess.parity_state,
    '{__double_initiations}',
    jsonb_set(
      v_inits,
      ARRAY[v_my_seat::text],
      to_jsonb(v_init_count + 1),
      true
    ),
    true
  );

  UPDATE public.ov2_snakes_ladders_sessions
  SET
    parity_state = v_sess.parity_state,
    revision = revision + 1,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_snakes_ladders_build_client_snapshot(v_sess, v_pk));
END;
$$;

-- -----------------------------------------------------------------------------
-- respond_double (Rule 8 on decline; 3+ elimination + rebuild)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ov2_snakes_ladders_respond_double(
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
  v_sess public.ov2_snakes_ladders_sessions%ROWTYPE;
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
  v_idem_rev bigint;
  v_rebuilt jsonb;
  v_rb_doubled boolean;
  v_loser_pk text;
  v_entry bigint;
  v_updated_active int[];
  v_n_active int;
  v_stake_n int;
BEGIN
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
  IF NOT FOUND OR v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No active Snakes session');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_snakes_ladders_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.phase IS DISTINCT FROM 'playing' OR v_sess.status IS DISTINCT FROM 'live' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_PLAYING', 'message', 'Session not in playing phase');
  END IF;
  IF p_expected_revision IS NOT NULL AND v_sess.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REVISION_MISMATCH', 'message', 'Revision mismatch');
  END IF;
  v_my_seat := (
    SELECT s.seat_index FROM public.ov2_snakes_ladders_seats s
    WHERE s.session_id = v_sess.id AND s.participant_key = v_pk
    LIMIT 1
  );
  IF v_my_seat IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No Snakes seat for participant');
  END IF;

  v_dbl := COALESCE(v_sess.parity_state -> '__double__', '{}'::jsonb);
  IF (v_dbl ->> 'awaiting')::int IS DISTINCT FROM v_my_seat THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_AWAITING', 'message', 'Not awaiting this seat');
  END IF;
  v_proposer := (v_dbl ->> 'proposed_by')::int;
  v_board := COALESCE(v_sess.board, '{}'::jsonb);
  v_active := COALESCE(v_sess.active_seats, ARRAY[]::int[]);
  v_value := COALESCE((v_dbl ->> 'value')::int, 1);
  v_entry := COALESCE((v_sess.parity_state ->> '__entry__')::bigint, 0);
  v_n_active := COALESCE(cardinality(v_active), 0);
  v_stake_n := COALESCE(NULLIF((v_sess.parity_state ->> '__stake_seat_count'), '')::int, 0);
  IF v_stake_n < 1 THEN
    v_stake_n := GREATEST(v_n_active, 1);
  END IF;

  IF lower(trim(COALESCE(p_answer, ''))) = 'decline' THEN
    SELECT trim(s.participant_key) INTO v_loser_pk
    FROM public.ov2_snakes_ladders_seats s
    WHERE s.session_id = v_sess.id AND s.seat_index = v_my_seat
    LIMIT 1;

    PERFORM public.ov2_snakes_ladders_rule8_forfeit_committed_stake(
      p_room_id,
      COALESCE(v_loser_pk, v_pk),
      v_sess.id,
      v_room.match_seq,
      v_entry,
      v_value,
      'decline:' || v_sess.revision::text
    );

    IF v_n_active <= 2 THEN
      v_board := jsonb_set(v_board, '{winner}', to_jsonb(v_proposer), true);
      v_sess.board := v_board;
      v_sess.phase := 'finished';
      v_sess.status := 'live';
      v_sess.current_turn := NULL;
      v_sess.turn_deadline := NULL;
      v_sess.parity_state := jsonb_set(COALESCE(v_sess.parity_state, '{}'::jsonb), '{__result__}', jsonb_build_object(
        'winner', v_proposer,
        'multiplier', v_value,
        'prize', (v_entry * v_value * v_stake_n),
        'lossPerSeat', (v_entry * v_value),
        'eliminatedSeat', v_my_seat,
        'rule8', true,
        'timestamp', (extract(epoch from now()) * 1000)::bigint
      ), true);
      v_sess.parity_state := jsonb_set(v_sess.parity_state, '{__double__}', jsonb_build_object(
        'value', v_value, 'proposed_by', NULL, 'awaiting', NULL, 'pending', '[]'::jsonb, 'locks', '{}'::jsonb, 'expires_at', NULL
      ), true);
      UPDATE public.ov2_snakes_ladders_sessions
      SET board = v_sess.board, phase = v_sess.phase, current_turn = NULL, turn_deadline = NULL, parity_state = v_sess.parity_state, revision = revision + 1, updated_at = now()
      WHERE id = v_sess.id
      RETURNING * INTO v_sess;
      RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_snakes_ladders_build_client_snapshot(v_sess, v_pk));
    END IF;

    DELETE FROM public.ov2_snakes_ladders_seats
    WHERE session_id = v_sess.id AND seat_index = v_my_seat;
    v_updated_active := array_remove(v_active, v_my_seat);
    v_board := jsonb_set(v_board, '{activeSeats}', to_jsonb(v_updated_active), true);
    v_board := jsonb_set(v_board, '{positions}', COALESCE(v_board->'positions','{}'::jsonb) - v_my_seat::text, true);
    IF NOT (v_updated_active @> ARRAY[COALESCE((v_board ->> 'turnSeat')::int, -999)]) THEN
      v_board := jsonb_set(v_board, '{turnSeat}', to_jsonb(v_updated_active[1]), true);
    END IF;

    SELECT r_double, r_doubled INTO v_rebuilt, v_rb_doubled
    FROM public._ov2_snakes_ladders_double_rebuild_after_elimination(v_dbl, v_my_seat, v_updated_active, v_value);

    v_ps := COALESCE(v_sess.parity_state, '{}'::jsonb);
    v_ps := jsonb_set(v_ps, '{__double__}', v_rebuilt, true);

    IF v_rb_doubled THEN
      v_cycle := COALESCE(v_ps -> '__double_cycle_used', '[]'::jsonb);
      v_cycle := v_cycle || to_jsonb(v_proposer);
      IF NOT EXISTS (
        SELECT 1
        FROM unnest(v_updated_active) AS t(x)
        WHERE NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(v_cycle) e
          WHERE (e::text)::int = x
        )
      ) THEN
        v_cycle := '[]'::jsonb;
      END IF;
      v_ps := jsonb_set(v_ps, '{__double_cycle_used}', v_cycle, true);
      v_idem_rev := v_sess.revision + 1;
      PERFORM public._ov2_snakes_ladders_double_apply_incremental_lock(p_room_id, v_sess, v_updated_active, v_idem_rev);
    END IF;

    UPDATE public.ov2_snakes_ladders_sessions
    SET
      board = v_board,
      active_seats = v_updated_active,
      current_turn = (v_board ->> 'turnSeat')::int,
      turn_deadline = now() + make_interval(secs => GREATEST(5, COALESCE(NULLIF(current_setting('app.ludo_turn_seconds', true), '')::int, 30))),
      parity_state = v_ps,
      revision = revision + 1,
      updated_at = now()
    WHERE id = v_sess.id
    RETURNING * INTO v_sess;

    RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_snakes_ladders_build_client_snapshot(v_sess, v_pk));
  END IF;

  -- accept
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
      v_next_dbl := jsonb_build_object(
        'value', LEAST(v_value * 2, 16),
        'proposed_by', NULL,
        'awaiting', NULL,
        'pending', '[]'::jsonb,
        'locks', '{}'::jsonb,
        'expires_at', NULL
      );
      v_doubled := (LEAST(v_value * 2, 16) > v_value);
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
        WHERE (e::text)::int = x
      )
    ) THEN
      v_cycle := '[]'::jsonb;
    END IF;
    v_ps := jsonb_set(v_ps, '{__double_cycle_used}', v_cycle, true);

    v_idem_rev := v_sess.revision + 1;
    PERFORM public._ov2_snakes_ladders_double_apply_incremental_lock(p_room_id, v_sess, v_active, v_idem_rev);
  END IF;

  UPDATE public.ov2_snakes_ladders_sessions
  SET
    parity_state = v_ps,
    revision = revision + 1,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_snakes_ladders_build_client_snapshot(v_sess, v_pk));
END;
$$;

-- -----------------------------------------------------------------------------
-- handle_double_timeout (Rule 8; 2p finish; 3+ eliminate + rebuild)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ov2_snakes_ladders_handle_double_timeout(
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
  v_sess public.ov2_snakes_ladders_sessions%ROWTYPE;
  v_board jsonb;
  v_active int[];
  v_dbl jsonb;
  v_value int;
  v_proposer int;
  v_winner int;
  v_updated_active int[];
  v_next_dbl jsonb;
  v_entry bigint;
  v_exp_pk text;
  v_rebuilt jsonb;
  v_rb_doubled boolean;
  v_ps jsonb;
  v_cycle jsonb;
  v_idem_rev bigint;
  v_stake_n int;
BEGIN
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
  IF NOT FOUND OR v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No active Snakes session');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_snakes_ladders_sessions WHERE id = v_room.active_session_id FOR UPDATE;
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
  v_stake_n := COALESCE(NULLIF((v_sess.parity_state ->> '__stake_seat_count'), '')::int, 0);
  IF v_stake_n < 1 THEN
    v_stake_n := GREATEST(cardinality(v_active), 1);
  END IF;

  SELECT trim(s.participant_key) INTO v_exp_pk
  FROM public.ov2_snakes_ladders_seats s
  WHERE s.session_id = v_sess.id AND s.seat_index = p_expired_seat
  LIMIT 1;

  PERFORM public.ov2_snakes_ladders_rule8_forfeit_committed_stake(
    p_room_id,
    COALESCE(v_exp_pk, ''),
    v_sess.id,
    v_room.match_seq,
    v_entry,
    v_value,
    'dbl_timeout:' || v_sess.revision::text
  );

  IF cardinality(v_active) <= 2 THEN
    v_winner := COALESCE(v_proposer, (
      SELECT x FROM unnest(v_active) AS t(x) WHERE x <> p_expired_seat LIMIT 1
    ));
    v_board := jsonb_set(v_board, '{winner}', to_jsonb(v_winner), true);
    v_next_dbl := jsonb_build_object('value', v_value, 'proposed_by', NULL, 'awaiting', NULL, 'pending', '[]'::jsonb, 'locks', '{}'::jsonb, 'expires_at', NULL);
    UPDATE public.ov2_snakes_ladders_sessions
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
          'prize', (v_entry * v_value * v_stake_n),
          'lossPerSeat', (v_entry * v_value),
          'eliminatedSeat', p_expired_seat,
          'rule8', true,
          'timestamp', (extract(epoch from now()) * 1000)::bigint
        ),
        true
      ),
      revision = revision + 1,
      updated_at = now()
    WHERE id = v_sess.id
    RETURNING * INTO v_sess;
    RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_snakes_ladders_build_client_snapshot(v_sess, ''));
  END IF;

  DELETE FROM public.ov2_snakes_ladders_seats
  WHERE session_id = v_sess.id
    AND seat_index = p_expired_seat;

  v_updated_active := array_remove(v_active, p_expired_seat);
  v_board := jsonb_set(v_board, '{activeSeats}', to_jsonb(v_updated_active), true);
  v_board := jsonb_set(v_board, '{positions}', COALESCE(v_board->'positions','{}'::jsonb) - p_expired_seat::text, true);
  IF NOT (v_updated_active @> ARRAY[COALESCE((v_board ->> 'turnSeat')::int, -999)]) THEN
    v_board := jsonb_set(v_board, '{turnSeat}', to_jsonb(v_updated_active[1]), true);
  END IF;

  SELECT r_double, r_doubled INTO v_rebuilt, v_rb_doubled
  FROM public._ov2_snakes_ladders_double_rebuild_after_elimination(v_dbl, p_expired_seat, v_updated_active, v_value);

  v_ps := COALESCE(v_sess.parity_state, '{}'::jsonb);
  v_ps := jsonb_set(v_ps, '{__double__}', v_rebuilt, true);

  IF v_rb_doubled THEN
    v_cycle := COALESCE(v_ps -> '__double_cycle_used', '[]'::jsonb);
    v_cycle := v_cycle || to_jsonb(v_proposer);
    IF NOT EXISTS (
      SELECT 1
      FROM unnest(v_updated_active) AS t(x)
      WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_cycle) e
        WHERE (e::text)::int = x
      )
    ) THEN
      v_cycle := '[]'::jsonb;
    END IF;
    v_ps := jsonb_set(v_ps, '{__double_cycle_used}', v_cycle, true);
    v_idem_rev := v_sess.revision + 1;
    PERFORM public._ov2_snakes_ladders_double_apply_incremental_lock(p_room_id, v_sess, v_updated_active, v_idem_rev);
  END IF;

  UPDATE public.ov2_snakes_ladders_sessions
  SET
    board = v_board,
    active_seats = v_updated_active,
    current_turn = (v_board ->> 'turnSeat')::int,
    turn_deadline = now() + make_interval(secs => GREATEST(5, COALESCE(NULLIF(current_setting('app.ludo_turn_seconds', true), '')::int, 30))),
    parity_state = v_ps,
    revision = revision + 1,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_snakes_ladders_build_client_snapshot(v_sess, ''));
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_snakes_ladders_handle_double_timeout(uuid, integer, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_snakes_ladders_handle_double_timeout(uuid, integer, bigint) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- voluntary_forfeit (Rule 8 + double rebuild when continuing)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ov2_snakes_ladders_voluntary_forfeit(
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
  v_sess public.ov2_snakes_ladders_sessions%ROWTYPE;
  v_board jsonb;
  v_active int[];
  v_seat int;
  v_turn int;
  v_next int;
  v_idx int;
  v_mult int;
  v_entry bigint;
  v_dbl jsonb;
  v_rebuilt jsonb;
  v_rb_doubled boolean;
  v_ps jsonb;
  v_cycle jsonb;
  v_idem_rev bigint;
  v_proposer int;
  v_pot_seats int;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_snakes_ladders' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Not a Snakes room');
  END IF;
  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No active session');
  END IF;

  SELECT * INTO v_sess FROM public.ov2_snakes_ladders_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_PLAYING', 'message', 'Session not in playing phase');
  END IF;

  SELECT seat_index INTO v_seat
  FROM public.ov2_snakes_ladders_seats
  WHERE session_id = v_sess.id AND participant_key = v_pk
  LIMIT 1;

  IF v_seat IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_IN_MATCH', 'message', 'Not seated in this Snakes session');
  END IF;

  v_mult := COALESCE((v_sess.parity_state -> '__double__' ->> 'value')::int, 1);
  v_entry := COALESCE((v_sess.parity_state ->> '__entry__')::bigint, 0);
  v_dbl := COALESCE(v_sess.parity_state -> '__double__', '{}'::jsonb);

  PERFORM public.ov2_snakes_ladders_rule8_forfeit_committed_stake(
    p_room_id,
    v_pk,
    v_sess.id,
    v_room.match_seq,
    v_entry,
    v_mult,
    'forfeit:' || v_sess.revision::text || ':seat:' || v_seat::text
  );

  v_board := COALESCE(v_sess.board, '{}'::jsonb);
  v_turn := COALESCE((v_board ->> 'turnSeat')::int, v_sess.current_turn);

  SELECT count(*)::int INTO v_pot_seats FROM public.ov2_snakes_ladders_seats WHERE session_id = v_sess.id;

  DELETE FROM public.ov2_snakes_ladders_seats
  WHERE session_id = v_sess.id AND seat_index = v_seat AND participant_key = v_pk;

  v_active := array_remove(COALESCE(v_sess.active_seats, ARRAY[]::int[]), v_seat);
  v_board := jsonb_set(v_board, '{activeSeats}', to_jsonb(v_active), true);
  v_board := jsonb_set(v_board, '{positions}', COALESCE(v_board->'positions','{}'::jsonb) - v_seat::text, true);

  IF cardinality(v_active) <= 1 THEN
    IF cardinality(v_active) = 1 THEN
      v_board := jsonb_set(v_board, '{winner}', to_jsonb(v_active[1]), true);
    END IF;
    v_sess.parity_state := jsonb_set(
      COALESCE(v_sess.parity_state, '{}'::jsonb),
      '{__result__}',
      jsonb_build_object(
        'winner', CASE WHEN cardinality(v_active) = 1 THEN v_active[1] ELSE NULL END,
        'forfeit_by', v_pk,
        'multiplier', v_mult,
        'prize', (GREATEST(v_entry, 0) * GREATEST(v_mult, 1) * GREATEST(v_pot_seats, 0)),
        'lossPerSeat', (GREATEST(v_entry, 0) * GREATEST(v_mult, 1)),
        'rule8', true,
        'timestamp', (extract(epoch from now()) * 1000)::bigint
      ),
      true
    );
    v_sess.parity_state := jsonb_set(
      v_sess.parity_state,
      '{__double__}',
      jsonb_build_object('value', v_mult, 'proposed_by', NULL, 'awaiting', NULL, 'pending', '[]'::jsonb, 'locks', '{}'::jsonb, 'expires_at', NULL),
      true
    );
    UPDATE public.ov2_snakes_ladders_sessions
    SET
      board = v_board,
      active_seats = v_active,
      phase = 'finished',
      current_turn = NULL,
      turn_deadline = NULL,
      parity_state = v_sess.parity_state,
      revision = revision + 1,
      updated_at = now()
    WHERE id = v_sess.id
    RETURNING * INTO v_sess;

    RETURN jsonb_build_object('ok', true, 'finished', true, 'snapshot', public.ov2_snakes_ladders_build_client_snapshot(v_sess, v_pk));
  END IF;

  SELECT r_double, r_doubled INTO v_rebuilt, v_rb_doubled
  FROM public._ov2_snakes_ladders_double_rebuild_after_elimination(v_dbl, v_seat, v_active, v_mult);

  v_ps := COALESCE(v_sess.parity_state, '{}'::jsonb);
  v_ps := jsonb_set(v_ps, '{__double__}', v_rebuilt, true);

  IF v_rb_doubled THEN
    v_proposer := (v_dbl ->> 'proposed_by')::int;
    v_cycle := COALESCE(v_ps -> '__double_cycle_used', '[]'::jsonb);
    v_cycle := v_cycle || to_jsonb(v_proposer);
    IF NOT EXISTS (
      SELECT 1
      FROM unnest(v_active) AS t(x)
      WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_cycle) e
        WHERE (e::text)::int = x
      )
    ) THEN
      v_cycle := '[]'::jsonb;
    END IF;
    v_ps := jsonb_set(v_ps, '{__double_cycle_used}', v_cycle, true);
    v_idem_rev := v_sess.revision + 1;
    PERFORM public._ov2_snakes_ladders_double_apply_incremental_lock(p_room_id, v_sess, v_active, v_idem_rev);
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

  v_board := jsonb_set(
    jsonb_set(v_board, '{turnSeat}', CASE WHEN v_next IS NULL THEN 'null'::jsonb ELSE to_jsonb(v_next) END, true),
    '{dice}',
    'null'::jsonb,
    true
  );
  v_board := jsonb_set(v_board, '{lastDice}', 'null'::jsonb, true);

  UPDATE public.ov2_snakes_ladders_sessions
  SET
    board = v_board,
    active_seats = v_active,
    current_turn = v_next,
    turn_deadline = CASE
      WHEN v_next IS NULL THEN NULL
      ELSE now() + make_interval(secs => GREATEST(5, COALESCE(NULLIF(current_setting('app.ludo_turn_seconds', true), '')::int, 30)))
    END,
    parity_state = v_ps,
    revision = revision + 1,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  RETURN jsonb_build_object('ok', true, 'finished', false, 'snapshot', public.ov2_snakes_ladders_build_client_snapshot(v_sess, v_pk));
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_snakes_ladders_voluntary_forfeit(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_snakes_ladders_voluntary_forfeit(uuid, text) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- mark_missed_turn (Rule 8 on strike-out; double rebuild when match continues)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ov2_snakes_ladders_mark_missed_turn(
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
  v_sess public.ov2_snakes_ladders_sessions%ROWTYPE;
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
  v_dbl jsonb;
  v_rebuilt jsonb;
  v_rb_doubled boolean;
  v_ps jsonb;
  v_cycle jsonb;
  v_idem_rev bigint;
  v_proposer int;
  v_pot_seats int;
BEGIN
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
  IF NOT FOUND OR v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No active session');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_snakes_ladders_sessions WHERE id = v_room.active_session_id FOR UPDATE;
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
    FROM public.ov2_snakes_ladders_seats s
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
    v_mult := COALESCE((v_sess.parity_state -> '__double__' ->> 'value')::int, 1);
    v_entry := COALESCE((v_sess.parity_state ->> '__entry__')::bigint, 0);
    v_dbl := COALESCE(v_sess.parity_state -> '__double__', '{}'::jsonb);

    PERFORM public.ov2_snakes_ladders_rule8_forfeit_committed_stake(
      p_room_id,
      trim(v_turn_pk),
      v_sess.id,
      v_room.match_seq,
      v_entry,
      v_mult,
      'strike:' || v_sess.revision::text || ':seat:' || p_turn_seat::text
    );

    SELECT count(*)::int INTO v_pot_seats FROM public.ov2_snakes_ladders_seats WHERE session_id = v_sess.id;

    DELETE FROM public.ov2_snakes_ladders_seats
    WHERE session_id = v_sess.id
      AND seat_index = p_turn_seat
      AND participant_key = v_turn_pk;

    v_active := array_remove(COALESCE(v_sess.active_seats, ARRAY[]::int[]), p_turn_seat);
    v_board := jsonb_set(v_board, '{activeSeats}', to_jsonb(v_active), true);
    v_board := jsonb_set(v_board, '{positions}', COALESCE(v_board->'positions','{}'::jsonb) - p_turn_seat::text, true);
    IF cardinality(v_active) = 1 THEN
      v_board := jsonb_set(v_board, '{winner}', to_jsonb(v_active[1]), true);
      v_sess.parity_state := jsonb_set(
        COALESCE(v_sess.parity_state, '{}'::jsonb),
        '{__result__}',
        jsonb_build_object(
          'winner', v_active[1],
          'multiplier', v_mult,
          'prize', (GREATEST(v_entry, 0) * GREATEST(v_mult, 1) * GREATEST(v_pot_seats, 0)),
          'lossPerSeat', (GREATEST(v_entry, 0) * GREATEST(v_mult, 1)),
          'rule8', true,
          'eliminatedSeat', p_turn_seat,
          'timestamp', (extract(epoch from now()) * 1000)::bigint
        ),
        true
      );
      v_sess.parity_state := jsonb_set(
        v_sess.parity_state,
        '{__double__}',
        jsonb_build_object('value', v_mult, 'proposed_by', NULL, 'awaiting', NULL, 'pending', '[]'::jsonb, 'locks', '{}'::jsonb, 'expires_at', NULL),
        true
      );
      UPDATE public.ov2_snakes_ladders_sessions
      SET board = v_board, active_seats = v_active, phase = 'finished', current_turn = NULL, turn_deadline = NULL, parity_state = v_sess.parity_state, revision = revision + 1, updated_at = now()
      WHERE id = v_sess.id
      RETURNING * INTO v_sess;
      RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_snakes_ladders_build_client_snapshot(v_sess, ''));
    END IF;

    SELECT r_double, r_doubled INTO v_rebuilt, v_rb_doubled
    FROM public._ov2_snakes_ladders_double_rebuild_after_elimination(v_dbl, p_turn_seat, v_active, v_mult);

    v_ps := v_sess.parity_state;
    v_ps := jsonb_set(v_ps, '{__double__}', v_rebuilt, true);

    IF v_rb_doubled THEN
      v_proposer := (v_dbl ->> 'proposed_by')::int;
      v_cycle := COALESCE(v_ps -> '__double_cycle_used', '[]'::jsonb);
      v_cycle := v_cycle || to_jsonb(v_proposer);
      IF NOT EXISTS (
        SELECT 1
        FROM unnest(v_active) AS t(x)
        WHERE NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(v_cycle) e
          WHERE (e::text)::int = x
        )
      ) THEN
        v_cycle := '[]'::jsonb;
      END IF;
      v_ps := jsonb_set(v_ps, '{__double_cycle_used}', v_cycle, true);
      v_idem_rev := v_sess.revision + 1;
      PERFORM public._ov2_snakes_ladders_double_apply_incremental_lock(p_room_id, v_sess, v_active, v_idem_rev);
    END IF;

    v_sess.parity_state := v_ps;
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

  UPDATE public.ov2_snakes_ladders_sessions
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

  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_snakes_ladders_build_client_snapshot(v_sess, ''));
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_snakes_ladders_mark_missed_turn(uuid, integer, text, boolean, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_snakes_ladders_mark_missed_turn(uuid, integer, text, boolean, bigint) TO anon, authenticated, service_role;


COMMIT;
