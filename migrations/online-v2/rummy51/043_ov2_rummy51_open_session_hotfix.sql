-- Hotfix 043: Rummy51 open_session / deal / draw / submit_turn failed with
--   ERROR: column "h" does not exist
-- Root cause: SELECT lists used shorthand (h,s) / (e,r) instead of OUT
-- parameter names from record-returning functions.
-- Apply after 041 (and 042 realtime if used). Repairs DBs that already ran 041.

BEGIN;
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._ov2_r51_deal_hands(
  p_stock jsonb,
  p_keys text[],
  p_per int,
  OUT hands jsonb,
  OUT stock_out jsonb
)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  st jsonb;
  ki int;
  r int;
  c int;
  elem jsonb;
  rest jsonb;
  nk int;
BEGIN
  st := p_stock;
  hands := '{}'::jsonb;
  nk := cardinality(p_keys);
  IF nk < 1 OR p_per < 1 THEN
    stock_out := st;
    RETURN;
  END IF;
  FOR ki IN 1..nk LOOP
    hands := jsonb_set(hands, ARRAY[p_keys[ki]], '[]'::jsonb, true);
  END LOOP;
  FOR r IN 1..p_per LOOP
    FOR ki IN 1..nk LOOP
      SELECT pl.elem, pl.rest INTO elem, rest FROM public._ov2_r51_jsonb_pop_last(st) AS pl;
      IF elem IS NULL THEN
        stock_out := st;
        RETURN;
      END IF;
      st := rest;
      hands := jsonb_set(
        hands,
        ARRAY[p_keys[ki]],
        coalesce(hands -> p_keys[ki], '[]'::jsonb) || jsonb_build_array(elem),
        true
      );
    END LOOP;
  END LOOP;
  stock_out := st;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_rummy51_open_session(
  p_room_id uuid,
  p_host_participant_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text := trim(COALESCE(p_host_participant_key, ''));
  v_sess public.ov2_rummy51_sessions%ROWTYPE;
  v_existing public.ov2_rummy51_sessions%ROWTYPE;
  v_seated int;
  v_keys text[];
  v_deck jsonb;
  v_shuf jsonb;
  v_stock jsonb;
  v_disc jsonb;
  v_hands jsonb;
  v_top jsonb;
  v_rest jsonb;
  v_active jsonb := '[]'::jsonb;
  r record;
  v_seed text;
  v_dealer int;
  v_first_pk text;
  v_ps jsonb := '{}'::jsonb;
  v_turn text;
  v_si int;
  v_meta jsonb;
  v_n int;
  v_di int;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and host_participant_key required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.product_game_id IS DISTINCT FROM 'ov2_rummy51' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a Rummy51 room');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ov2_room_members m WHERE m.room_id = p_room_id AND m.participant_key = v_pk) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Not a room member');
  END IF;
  IF v_room.host_participant_key IS DISTINCT FROM v_pk THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_HOST', 'message', 'Only host can open session');
  END IF;
  IF v_room.lifecycle_phase IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_ACTIVE', 'message', 'Room must be active');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL AND m.wallet_state IS DISTINCT FROM 'committed'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEATED_STAKES_NOT_COMMITTED', 'message', 'All seated players must commit stakes');
  END IF;

  IF v_room.active_session_id IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.ov2_rummy51_sessions s
    WHERE s.id = v_room.active_session_id AND s.room_id = p_room_id;
    IF FOUND AND v_existing.phase = 'playing' AND v_existing.match_seq IS NOT DISTINCT FROM v_room.match_seq THEN
      RETURN jsonb_build_object('ok', true, 'idempotent', true, 'snapshot', public.ov2_rummy51_build_snapshot(v_room, v_existing));
    END IF;
    IF FOUND AND v_existing.phase = 'finished' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'SESSION_FINISHED',
        'message', 'Match finished; use rematch flow and start_next_match before opening a new session.'
      );
    END IF;
  END IF;

  SELECT count(*)::int INTO v_seated
  FROM public.ov2_room_members
  WHERE room_id = p_room_id AND seat_index IS NOT NULL;
  IF v_seated < 2 OR v_seated > 4 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_SEAT_COUNT', 'message', 'Need 2-4 seated players');
  END IF;

  SELECT array_agg(m.participant_key ORDER BY m.seat_index ASC)
  INTO v_keys
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL;

  v_seed := 'ov2r51:' || p_room_id::text || ':' || coalesce(v_room.match_seq, 0)::text || ':' || extract(epoch from now())::bigint::text;
  v_deck := public._ov2_r51_build_deck();
  v_shuf := public._ov2_r51_shuffle_deck(v_seed, v_deck);
  SELECT d.hands, d.stock_out INTO v_hands, v_stock FROM public._ov2_r51_deal_hands(v_shuf, v_keys, 14) AS d;

  SELECT pl.elem, pl.rest INTO v_top, v_rest FROM public._ov2_r51_jsonb_pop_last(v_stock) AS pl;
  v_disc := public._ov2_r51_jsonb_push('[]'::jsonb, v_top);
  v_stock := v_rest;

  FOR r IN SELECT m.participant_key, m.seat_index, m.display_name
           FROM public.ov2_room_members m
           WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL
           ORDER BY m.seat_index ASC
  LOOP
    v_active := v_active || jsonb_build_object('seat', r.seat_index, 'participantKey', r.participant_key);
    v_ps := jsonb_set(
      v_ps,
      ARRAY[r.participant_key],
      jsonb_build_object(
        'hasOpenedThisHand', false,
        'hasEverOpened', false,
        'isEliminated', false,
        'scoreTotal', 0,
        'roundPenalty', 0,
        'seatIndex', r.seat_index,
        'displayName', coalesce(nullif(trim(r.display_name), ''), r.participant_key)
      ),
      true
    );
  END LOOP;

  v_n := coalesce(cardinality(v_keys), 0);
  v_di := 1 + (abs(hashtext(v_seed)) % v_n);
  v_dealer := (
    SELECT (v_active -> (v_di - 1) ->> 'seat')::int
  );
  v_first_pk := (
    SELECT v_active -> ((v_di % v_n)) ->> 'participantKey'
  );
  v_turn := coalesce(v_first_pk, v_keys[1]);

  v_meta := jsonb_build_object(
    'stakePerSeat', v_room.stake_per_seat,
    'seatCount', v_seated,
    'participantKeys', to_jsonb(v_keys)
  );

  INSERT INTO public.ov2_rummy51_sessions (
    room_id, match_seq, phase, revision, turn_index, turn_participant_key,
    dealer_seat_index, active_seats, seed, stock, discard, hands, table_melds,
    player_state, taken_discard_card_id, pending_draw_source, round_number, match_meta
  ) VALUES (
    p_room_id,
    coalesce(v_room.match_seq, 0),
    'playing',
    0,
    0,
    v_turn,
    v_dealer,
    v_active,
    v_seed,
    v_stock,
    v_disc,
    v_hands,
    '[]'::jsonb,
    v_ps,
    NULL,
    NULL,
    1,
    v_meta
  )
  RETURNING * INTO v_sess;

  UPDATE public.ov2_rooms SET active_session_id = v_sess.id, updated_at = now() WHERE id = p_room_id;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;

  RETURN jsonb_build_object('ok', true, 'idempotent', false, 'snapshot', public.ov2_rummy51_build_snapshot(v_room, v_sess));
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_rummy51_open_session(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_rummy51_open_session(uuid, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ov2_rummy51_draw_from_stock(
  p_room_id uuid,
  p_participant_key text,
  p_expected_revision integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_sess public.ov2_rummy51_sessions%ROWTYPE;
  v_hand jsonb;
  v_top jsonb;
  v_rest jsonb;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Arguments required');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_rummy51' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SESSION', 'message', 'No session');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_rummy51_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_PLAYING', 'message', 'Not playing');
  END IF;
  IF v_sess.turn_participant_key IS DISTINCT FROM v_pk THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_YOUR_TURN', 'message', 'Not your turn');
  END IF;
  IF p_expected_revision IS NOT NULL AND p_expected_revision IS DISTINCT FROM v_sess.revision THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STALE_REVISION', 'revision', v_sess.revision);
  END IF;
  IF v_sess.pending_draw_source IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_DREW', 'message', 'Already drew this turn');
  END IF;
  SELECT pl.elem, pl.rest INTO v_top, v_rest FROM public._ov2_r51_jsonb_pop_last(v_sess.stock) AS pl;
  IF v_top IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STOCK_EMPTY', 'message', 'Stock empty');
  END IF;
  v_hand := coalesce(v_sess.hands -> v_pk, '[]'::jsonb) || jsonb_build_array(v_top);
  UPDATE public.ov2_rummy51_sessions
  SET
    stock = v_rest,
    hands = jsonb_set(coalesce(hands, '{}'::jsonb), ARRAY[v_pk], v_hand, true),
    pending_draw_source = 'stock',
    taken_discard_card_id = NULL,
    revision = revision + 1
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_rummy51_build_snapshot(v_room, v_sess));
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_rummy51_draw_from_discard(
  p_room_id uuid,
  p_participant_key text,
  p_expected_revision integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_sess public.ov2_rummy51_sessions%ROWTYPE;
  v_hand jsonb;
  v_top jsonb;
  v_rest jsonb;
  v_opened boolean;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Arguments required');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_rummy51' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SESSION', 'message', 'No session');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_rummy51_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_PLAYING', 'message', 'Not playing');
  END IF;
  IF v_sess.turn_participant_key IS DISTINCT FROM v_pk THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_YOUR_TURN', 'message', 'Not your turn');
  END IF;
  IF p_expected_revision IS NOT NULL AND p_expected_revision IS DISTINCT FROM v_sess.revision THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STALE_REVISION', 'revision', v_sess.revision);
  END IF;
  IF v_sess.pending_draw_source IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_DREW', 'message', 'Already drew this turn');
  END IF;
  SELECT pl.elem, pl.rest INTO v_top, v_rest FROM public._ov2_r51_jsonb_pop_last(v_sess.discard) AS pl;
  IF v_top IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'DISCARD_EMPTY', 'message', 'Discard empty');
  END IF;
  v_opened := coalesce((v_sess.player_state -> v_pk ->> 'hasOpenedThisHand')::boolean, false);
  v_hand := coalesce(v_sess.hands -> v_pk, '[]'::jsonb) || jsonb_build_array(v_top);
  UPDATE public.ov2_rummy51_sessions
  SET
    discard = v_rest,
    hands = jsonb_set(coalesce(hands, '{}'::jsonb), ARRAY[v_pk], v_hand, true),
    pending_draw_source = 'discard',
    taken_discard_card_id = CASE WHEN NOT v_opened THEN v_top ->> 'id' ELSE NULL END,
    revision = revision + 1
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_rummy51_build_snapshot(v_room, v_sess));
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_rummy51_draw_from_stock(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_rummy51_draw_from_stock(uuid, text, integer) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_rummy51_draw_from_discard(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_rummy51_draw_from_discard(uuid, text, integer) TO anon, authenticated, service_role;


CREATE OR REPLACE FUNCTION public.ov2_rummy51_submit_turn(
  p_room_id uuid,
  p_participant_key text,
  p_turn_payload jsonb,
  p_expected_revision integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_sess public.ov2_rummy51_sessions%ROWTYPE;
  v_hand jsonb;
  v_new jsonb;
  v_adds jsonb;
  v_disc_id text;
  v_i int;
  v_j int;
  v_meld jsonb;
  v_tid text;
  v_cards jsonb;
  v_ok boolean;
  v_merged jsonb;
  v_tm jsonb;
  v_played text[] := ARRAY[]::text[];
  v_id text;
  v_opening_score int;
  v_has_run boolean;
  v_hand_open boolean;
  v_pick text;
  v_need_pick boolean;
  v_next_pk text;
  v_ns int;
  r jsonb;
  v_owner int;
  v_nm jsonb;
  v_hand_after jsonb;
  v_ps jsonb;
  v_pk2 text;
  v_penalty int;
  v_disc_card jsonb;
  v_found boolean;
  v_h2 jsonb;
  v_k text;
  v_c jsonb;
  v_round_winner text;
  v_keys text[];
  v_deck jsonb;
  v_shuf jsonb;
  v_stock jsonb;
  v_disc jsonb;
  v_top jsonb;
  v_rest jsonb;
  v_hands jsonb;
  v_active_left int;
  v_rn int;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 OR p_turn_payload IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Arguments required');
  END IF;

  v_new := coalesce(p_turn_payload -> 'new_melds', '[]'::jsonb);
  v_adds := coalesce(p_turn_payload -> 'table_additions', '[]'::jsonb);
  v_disc_id := nullif(trim(p_turn_payload ->> 'discard_card_id'), '');

  IF v_disc_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'MISSING_DISCARD', 'message', 'discard_card_id required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_rummy51' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SESSION', 'message', 'No session');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_rummy51_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_PLAYING', 'message', 'Not playing');
  END IF;
  IF v_sess.turn_participant_key IS DISTINCT FROM v_pk THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_YOUR_TURN', 'message', 'Not your turn');
  END IF;
  IF p_expected_revision IS NOT NULL AND p_expected_revision IS DISTINCT FROM v_sess.revision THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STALE_REVISION', 'revision', v_sess.revision);
  END IF;
  IF v_sess.pending_draw_source IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_DRAW', 'message', 'Draw before submitting turn');
  END IF;

  v_hand := coalesce(v_sess.hands -> v_pk, '[]'::jsonb);
  v_hand_open := coalesce((v_sess.player_state -> v_pk ->> 'hasOpenedThisHand')::boolean, false);
  v_pick := v_sess.taken_discard_card_id;
  v_need_pick := v_sess.pending_draw_source = 'discard' AND NOT v_hand_open AND v_pick IS NOT NULL;

  IF jsonb_typeof(v_new) <> 'array' OR jsonb_typeof(v_adds) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_PAYLOAD', 'message', 'new_melds and table_additions must be arrays');
  END IF;

  IF jsonb_array_length(v_new) > 0 AND NOT v_hand_open THEN
    FOR v_i IN 0..(jsonb_array_length(v_new) - 1) LOOP
      v_meld := v_new -> v_i;
      IF jsonb_typeof(v_meld) <> 'array' OR public._ov2_r51_classify_meld(v_meld) = 'invalid' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'INVALID_MELD', 'message', 'Illegal new meld');
      END IF;
      FOR v_j IN 0..(jsonb_array_length(v_meld) - 1) LOOP
        v_id := v_meld -> v_j ->> 'id';
        IF NOT public._ov2_r51_card_id_valid(v_id) THEN
          RETURN jsonb_build_object('ok', false, 'code', 'BAD_CARD', 'message', 'Invalid card id');
        END IF;
        v_played := array_append(v_played, v_id);
      END LOOP;
    END LOOP;
    v_opening_score := public._ov2_r51_score_opening_melds(v_new);
    v_has_run := public._ov2_r51_opening_has_run(v_new);
    IF NOT v_has_run OR v_opening_score < 51 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'OPENING_RULES', 'message', 'Initial open needs ≥51 points and a run');
    END IF;
  ELSIF jsonb_array_length(v_new) > 0 AND v_hand_open THEN
    FOR v_i IN 0..(jsonb_array_length(v_new) - 1) LOOP
      v_meld := v_new -> v_i;
      IF jsonb_typeof(v_meld) <> 'array' OR public._ov2_r51_classify_meld(v_meld) = 'invalid' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'INVALID_MELD', 'message', 'Illegal new meld');
      END IF;
      FOR v_j IN 0..(jsonb_array_length(v_meld) - 1) LOOP
        v_played := array_append(v_played, (v_meld -> v_j ->> 'id'));
      END LOOP;
    END LOOP;
  END IF;

  v_tm := coalesce(v_sess.table_melds, '[]'::jsonb);

  IF jsonb_array_length(v_adds) > 0 THEN
    IF NOT v_hand_open AND jsonb_array_length(v_new) = 0 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'TABLE_ADD_BLOCKED', 'message', 'Table adds require opening this hand or a new meld in the same turn');
    END IF;
    FOR v_i IN 0..(jsonb_array_length(v_adds) - 1) LOOP
      r := v_adds -> v_i;
      v_tid := r ->> 'meld_id';
      v_cards := r -> 'cards_from_hand';
      IF v_tid IS NULL OR v_cards IS NULL OR jsonb_typeof(v_cards) <> 'array' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'BAD_ADDITION', 'message', 'Invalid table_addition');
      END IF;
      v_found := false;
      FOR v_j IN 0..(jsonb_array_length(v_tm) - 1) LOOP
        IF (v_tm -> v_j ->> 'meldId') = v_tid THEN
          SELECT ok, merged INTO v_ok, v_merged
          FROM public._ov2_r51_apply_add_to_meld(v_tm -> v_j -> 'cards', v_cards);
          IF NOT v_ok THEN
            RETURN jsonb_build_object('ok', false, 'code', 'ILLEGAL_ADD', 'message', 'Cannot extend meld');
          END IF;
          v_tm := jsonb_set(v_tm, ARRAY[v_j::text, 'cards'], v_merged, true);
          v_found := true;
          EXIT;
        END IF;
      END LOOP;
      IF NOT v_found THEN
        RETURN jsonb_build_object('ok', false, 'code', 'MELD_NOT_FOUND', 'message', 'meld_id not on table');
      END IF;
      FOR v_j IN 0..(jsonb_array_length(v_cards) - 1) LOOP
        v_played := array_append(v_played, (v_cards -> v_j ->> 'id'));
      END LOOP;
    END LOOP;
  END IF;

  IF v_need_pick AND NOT (v_pick = ANY (v_played)) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PICKED_DISCARD_UNUSED', 'message', 'Picked discard must be played');
  END IF;

  SELECT ok, rest INTO v_ok, v_hand_after FROM public._ov2_r51_hand_remove_many(v_hand, v_played);
  IF NOT v_ok THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CARDS_NOT_IN_HAND', 'message', 'Played cards must be in hand');
  END IF;
  v_hand := v_hand_after;

  v_disc_card := NULL;
  FOR v_j IN 0..(jsonb_array_length(v_hand) - 1) LOOP
    IF (v_hand -> v_j ->> 'id') = v_disc_id THEN
      v_disc_card := v_hand -> v_j;
      EXIT;
    END IF;
  END LOOP;
  IF v_disc_card IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'DISCARD_NOT_IN_HAND', 'message', 'Discard not in hand after melds');
  END IF;

  SELECT ok, rest INTO v_ok, v_hand_after FROM public._ov2_r51_hand_remove_one(v_hand, v_disc_id);
  IF NOT v_ok THEN
    RETURN jsonb_build_object('ok', false, 'code', 'DISCARD_FAIL', 'message', 'Could not remove discard');
  END IF;
  v_hand := v_hand_after;

  IF jsonb_array_length(v_new) > 0 THEN
    v_owner := (v_sess.player_state -> v_pk ->> 'seatIndex')::int;
    FOR v_i IN 0..(jsonb_array_length(v_new) - 1) LOOP
      v_nm := jsonb_build_object(
        'meldId', gen_random_uuid()::text,
        'ownerSeat', v_owner,
        'ownerParticipantKey', v_pk,
        'kind', public._ov2_r51_classify_meld(v_new -> v_i),
        'cards', v_new -> v_i
      );
      v_tm := v_tm || jsonb_build_array(v_nm);
    END LOOP;
  END IF;

  v_ps := v_sess.player_state;
  IF jsonb_array_length(v_new) > 0 OR jsonb_array_length(v_adds) > 0 THEN
    v_ps := jsonb_set(
      v_ps,
      ARRAY[v_pk, 'hasOpenedThisHand'],
      to_jsonb(true),
      true
    );
    v_ps := jsonb_set(
      v_ps,
      ARRAY[v_pk, 'hasEverOpened'],
      to_jsonb(true),
      true
    );
  END IF;

  v_sess.hands := jsonb_set(coalesce(v_sess.hands, '{}'::jsonb), ARRAY[v_pk], v_hand, true);
  v_sess.table_melds := v_tm;
  v_sess.discard := public._ov2_r51_jsonb_push(coalesce(v_sess.discard, '[]'::jsonb), v_disc_card);
  v_sess.player_state := v_ps;
  v_sess.pending_draw_source := NULL;
  v_sess.taken_discard_card_id := NULL;
  v_sess.revision := v_sess.revision + 1;
  v_sess.turn_index := coalesce(v_sess.turn_index, 0) + 1;

  IF jsonb_array_length(v_hand) = 0 THEN
    v_round_winner := v_pk;
    v_h2 := v_sess.hands;
    v_penalty := 0;
    v_ps := jsonb_set(v_ps, ARRAY[v_round_winner, 'roundPenalty'], to_jsonb(0), true);

    FOR v_pk2 IN SELECT jsonb_object_keys(v_sess.player_state) LOOP
      IF v_pk2 = v_round_winner THEN
        CONTINUE;
      END IF;
      IF coalesce((v_sess.player_state -> v_pk2 ->> 'isEliminated')::boolean, false) THEN
        CONTINUE;
      END IF;
      IF NOT coalesce((v_sess.player_state -> v_pk2 ->> 'hasOpenedThisHand')::boolean, false) THEN
        v_penalty := 100;
      ELSE
        v_penalty := 0;
        FOR v_j IN 0..(jsonb_array_length(coalesce(v_h2 -> v_pk2, '[]'::jsonb)) - 1) LOOP
          v_c := v_h2 -> v_pk2 -> v_j;
          v_penalty := v_penalty + public._ov2_r51_hand_penalty_card(v_c);
        END LOOP;
      END IF;
      v_ps := jsonb_set(
        v_ps,
        ARRAY[v_pk2, 'scoreTotal'],
        to_jsonb(coalesce((v_ps -> v_pk2 ->> 'scoreTotal')::int, 0) + v_penalty),
        true
      );
      v_ps := jsonb_set(v_ps, ARRAY[v_pk2, 'roundPenalty'], to_jsonb(v_penalty), true);
      IF coalesce((v_ps -> v_pk2 ->> 'scoreTotal')::int, 0) >= 251 THEN
        v_ps := jsonb_set(v_ps, ARRAY[v_pk2, 'isEliminated'], to_jsonb(true), true);
      END IF;
    END LOOP;

    v_tm := '{}'::jsonb;
    v_nm := '{}'::jsonb;
    FOR v_pk2 IN SELECT jsonb_object_keys(v_ps) LOOP
      v_tm := v_tm || jsonb_build_object(v_pk2, coalesce((v_ps -> v_pk2 ->> 'roundPenalty')::int, 0));
      v_nm := v_nm || jsonb_build_object(v_pk2, coalesce((v_ps -> v_pk2 ->> 'scoreTotal')::int, 0));
    END LOOP;

    v_hands := '[]'::jsonb;
    FOR v_pk2 IN SELECT jsonb_object_keys(v_ps) LOOP
      IF coalesce((v_ps -> v_pk2 ->> 'isEliminated')::boolean, false)
         AND NOT coalesce((v_sess.player_state -> v_pk2 ->> 'isEliminated')::boolean, false) THEN
        v_hands := v_hands || to_jsonb(v_pk2);
      END IF;
    END LOOP;

    INSERT INTO public.ov2_rummy51_round_history (
      session_id, room_id, match_seq, round_number, winner_participant_key,
      penalties, totals_after, eliminated_this_round
    ) VALUES (
      v_sess.id,
      p_room_id,
      v_sess.match_seq,
      v_sess.round_number,
      v_round_winner,
      v_tm,
      v_nm,
      v_hands
    );

    v_active_left := 0;
    FOR v_pk2 IN SELECT jsonb_object_keys(v_ps) LOOP
      IF NOT coalesce((v_ps -> v_pk2 ->> 'isEliminated')::boolean, false) THEN
        v_active_left := v_active_left + 1;
      END IF;
    END LOOP;

    IF v_active_left <= 1 THEN
      v_sess.phase := 'finished';
      v_sess.finished_at := now();
      SELECT jj INTO v_sess.winner_participant_key
      FROM (SELECT jsonb_object_keys(v_ps) AS jj) z
      WHERE NOT coalesce((v_ps -> z.jj ->> 'isEliminated')::boolean, false)
      LIMIT 1;
      v_sess.winner_name := coalesce(
        nullif(trim(v_ps -> v_sess.winner_participant_key ->> 'displayName'), ''),
        v_sess.winner_participant_key
      );
      v_sess.player_state := v_ps;
    ELSE
      SELECT array_agg(e.key ORDER BY (v_ps -> e.key ->> 'seatIndex')::int)
      INTO v_keys
      FROM jsonb_each(v_ps) e
      WHERE NOT coalesce((v_ps -> e.key ->> 'isEliminated')::boolean, false);

      v_rn := v_sess.round_number + 1;
      v_deck := public._ov2_r51_build_deck();
      v_shuf := public._ov2_r51_shuffle_deck(v_sess.seed || ':r' || v_rn::text, v_deck);
      SELECT d.hands, d.stock_out INTO v_hands, v_stock FROM public._ov2_r51_deal_hands(v_shuf, v_keys, 14) AS d;
      SELECT pl.elem, pl.rest INTO v_top, v_rest FROM public._ov2_r51_jsonb_pop_last(v_stock) AS pl;
      v_disc := public._ov2_r51_jsonb_push('[]'::jsonb, v_top);
      v_stock := v_rest;

      FOR v_k IN SELECT jsonb_object_keys(v_ps) LOOP
        IF coalesce((v_ps -> v_k ->> 'isEliminated')::boolean, false) THEN
          v_hands := jsonb_set(coalesce(v_hands, '{}'::jsonb), ARRAY[v_k], '[]'::jsonb, true);
        ELSE
          v_ps := jsonb_set(v_ps, ARRAY[v_k, 'hasOpenedThisHand'], to_jsonb(false), true);
          v_ps := jsonb_set(v_ps, ARRAY[v_k, 'roundPenalty'], to_jsonb(0), true);
        END IF;
      END LOOP;

      v_sess.round_number := v_rn;
      v_sess.stock := v_stock;
      v_sess.discard := v_disc;
      v_sess.hands := v_hands;
      v_sess.table_melds := '[]'::jsonb;
      v_sess.player_state := v_ps;
      v_sess.turn_participant_key := v_round_winner;
    END IF;
  ELSE
    v_ns := jsonb_array_length(v_sess.active_seats);
    v_next_pk := NULL;
    FOR v_i IN 0..(v_ns - 1) LOOP
      IF (v_sess.active_seats -> v_i ->> 'participantKey') = v_pk THEN
        FOR v_j IN 1..v_ns LOOP
          v_k := (v_sess.active_seats -> ((v_i + v_j) % v_ns) ->> 'participantKey');
          IF NOT coalesce((v_sess.player_state -> v_k ->> 'isEliminated')::boolean, false) THEN
            v_next_pk := v_k;
            EXIT;
          END IF;
        END LOOP;
        EXIT;
      END IF;
    END LOOP;
    IF v_next_pk IS NULL THEN
      v_next_pk := v_pk;
    END IF;
    v_sess.turn_participant_key := v_next_pk;
  END IF;

  UPDATE public.ov2_rummy51_sessions
  SET
    hands = v_sess.hands,
    discard = v_sess.discard,
    stock = v_sess.stock,
    table_melds = v_sess.table_melds,
    player_state = v_sess.player_state,
    turn_participant_key = v_sess.turn_participant_key,
    phase = v_sess.phase,
    finished_at = v_sess.finished_at,
    winner_participant_key = v_sess.winner_participant_key,
    winner_name = v_sess.winner_name,
    round_number = v_sess.round_number,
    revision = v_sess.revision,
    turn_index = v_sess.turn_index,
    pending_draw_source = v_sess.pending_draw_source,
    taken_discard_card_id = v_sess.taken_discard_card_id,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_rummy51_build_snapshot(v_room, v_sess));
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_rummy51_submit_turn(uuid, text, jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_rummy51_submit_turn(uuid, text, jsonb, integer) TO anon, authenticated, service_role;

COMMIT;
