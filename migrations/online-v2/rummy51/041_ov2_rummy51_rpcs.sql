-- OV2 Rummy51: deck/meld helpers, RPCs, settlement trigger, room allowlist + seat 0..3.
-- Apply after 040_ov2_rummy51_schema.sql. Meld rules mirror lib/online-v2/rummy51/ov2Rummy51Engine.js.

BEGIN;

-- -----------------------------------------------------------------------------
-- JSON helpers: last element = top (stock / discard)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._ov2_r51_jsonb_pop_last(p_arr jsonb, OUT elem jsonb, OUT rest jsonb)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  IF p_arr IS NULL OR jsonb_typeof(p_arr) <> 'array' OR jsonb_array_length(p_arr) < 1 THEN
    elem := NULL;
    rest := '[]'::jsonb;
    RETURN;
  END IF;
  n := jsonb_array_length(p_arr);
  elem := p_arr -> (n - 1);
  IF n = 1 THEN
    rest := '[]'::jsonb;
    RETURN;
  END IF;
  SELECT jsonb_agg(p_arr -> (i - 1) ORDER BY i) INTO rest FROM generate_series(1, n - 1) i;
END;
$$;

CREATE OR REPLACE FUNCTION public._ov2_r51_jsonb_push(p_arr jsonb, p_elem jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_arr IS NULL OR jsonb_typeof(p_arr) <> 'array' THEN jsonb_build_array(p_elem)
    ELSE p_arr || jsonb_build_array(p_elem)
  END;
$$;

-- -----------------------------------------------------------------------------
-- Deck (106 cards) — ids align with ov2Rummy51Engine.js
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._ov2_r51_build_deck()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH suits AS (SELECT unnest(ARRAY['S', 'H', 'D', 'C']) AS s),
  decks AS (SELECT generate_series(0, 1) AS d),
  ranks AS (SELECT generate_series(1, 13) AS r)
  SELECT COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', format('d%s:%s:%s', d, s, r),
          'rank', r,
          'suit', s,
          'isJoker', false,
          'deckIndex', d
        )
        ORDER BY d, s, r
      )
      FROM decks, suits, ranks
    )
    || jsonb_build_array(
      jsonb_build_object('id', 'J:0', 'rank', 0, 'suit', NULL, 'isJoker', true, 'deckIndex', 0),
      jsonb_build_object('id', 'J:1', 'rank', 0, 'suit', NULL, 'isJoker', true, 'deckIndex', 1)
    ),
    '[]'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION public._ov2_r51_shuffle_deck(p_seed text, p_deck jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT jsonb_agg(elem ORDER BY md5(COALESCE(p_seed, '') || (elem ->> 'id')))
      FROM jsonb_array_elements(p_deck) elem
    ),
    '[]'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION public._ov2_r51_card_id_valid(p_id text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_id ~ '^d[01]:[SHDC]:(?:[1-9]|1[0-3])$' OR p_id ~ '^J:[01]$';
$$;

-- -----------------------------------------------------------------------------
-- Meld: runs (ace low / high) + sets; min 3 cards
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._ov2_r51_run_ok_mode(p_cards jsonb, p_low boolean)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  n int;
  i int;
  c jsonb;
  nj int := 0;
  vals int[] := ARRAY[]::int[];
  v int;
  span int;
  mn int;
  mx int;
  need int;
  suit0 text;
  su text;
BEGIN
  IF p_cards IS NULL OR jsonb_typeof(p_cards) <> 'array' THEN
    RETURN false;
  END IF;
  n := jsonb_array_length(p_cards);
  IF n < 3 THEN
    RETURN false;
  END IF;
  suit0 := NULL;
  FOR i IN 0..(n - 1) LOOP
    c := p_cards -> i;
    IF coalesce((c ->> 'isJoker')::boolean, false) THEN
      nj := nj + 1;
      CONTINUE;
    END IF;
    su := c ->> 'suit';
    IF suit0 IS NULL THEN
      suit0 := su;
    ELSIF suit0 IS DISTINCT FROM su THEN
      RETURN false;
    END IF;
    v := (c ->> 'rank')::int;
    IF p_low THEN
      vals := array_append(vals, v);
    ELSE
      IF v = 1 THEN
        v := 14;
      END IF;
      vals := array_append(vals, v);
    END IF;
  END LOOP;
  IF nj = n THEN
    RETURN n >= 3;
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(vals) x GROUP BY x HAVING count(*) > 1) THEN
    RETURN false;
  END IF;
  SELECT min(x), max(x) INTO mn, mx FROM unnest(vals) x;
  span := mx - mn + 1;
  IF span <> n THEN
    RETURN false;
  END IF;
  need := span - cardinality(vals);
  IF need <> nj THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public._ov2_r51_is_legal_run(p_cards jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT public._ov2_r51_run_ok_mode(p_cards, true) OR public._ov2_r51_run_ok_mode(p_cards, false);
$$;

CREATE OR REPLACE FUNCTION public._ov2_r51_is_legal_set(p_cards jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  n int;
  i int;
  c jsonb;
  tr int;
  suits text[] := ARRAY[]::text[];
  su text;
BEGIN
  IF p_cards IS NULL OR jsonb_typeof(p_cards) <> 'array' THEN
    RETURN false;
  END IF;
  n := jsonb_array_length(p_cards);
  IF n < 3 OR n > 4 THEN
    RETURN false;
  END IF;
  tr := NULL;
  FOR i IN 0..(n - 1) LOOP
    c := p_cards -> i;
    IF coalesce((c ->> 'isJoker')::boolean, false) THEN
      CONTINUE;
    END IF;
    IF tr IS NULL THEN
      tr := (c ->> 'rank')::int;
    ELSIF tr <> (c ->> 'rank')::int THEN
      RETURN false;
    END IF;
    su := c ->> 'suit';
    IF su IS NULL THEN
      RETURN false;
    END IF;
    IF su = ANY (suits) THEN
      RETURN false;
    END IF;
    suits := array_append(suits, su);
  END LOOP;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public._ov2_r51_classify_meld(p_cards jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN public._ov2_r51_is_legal_set(p_cards) THEN 'set'
    WHEN public._ov2_r51_is_legal_run(p_cards) THEN 'run'
    ELSE 'invalid'
  END;
$$;

CREATE OR REPLACE FUNCTION public._ov2_r51_meld_point_card(p_card jsonb, p_rank int)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  r int;
BEGIN
  IF coalesce((p_card ->> 'isJoker')::boolean, false) THEN
    IF p_rank IS NULL OR p_rank < 1 OR p_rank > 13 THEN
      RETURN 0;
    END IF;
    IF p_rank = 1 THEN
      RETURN 11;
    END IF;
    IF p_rank >= 11 THEN
      RETURN 10;
    END IF;
    RETURN p_rank;
  END IF;
  r := (p_card ->> 'rank')::int;
  IF r = 1 THEN
    RETURN 11;
  END IF;
  IF r >= 11 THEN
    RETURN 10;
  END IF;
  RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION public._ov2_r51_score_meld(p_cards jsonb)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  k text;
  tr int;
  i int;
  c jsonb;
  mode_low boolean;
  vals int[];
  nj int;
  mn int;
  mx int;
  span int;
  v int;
  ji int := 0;
  jr int[];
  s int := 0;
  jix int;
BEGIN
  k := public._ov2_r51_classify_meld(p_cards);
  IF k = 'invalid' THEN
    RETURN 0;
  END IF;
  IF k = 'set' THEN
    tr := NULL;
    FOR i IN 0..(jsonb_array_length(p_cards) - 1) LOOP
      c := p_cards -> i;
      IF NOT coalesce((c ->> 'isJoker')::boolean, false) THEN
        tr := (c ->> 'rank')::int;
        EXIT;
      END IF;
    END LOOP;
    IF tr IS NULL THEN
      tr := 1;
    END IF;
    FOR i IN 0..(jsonb_array_length(p_cards) - 1) LOOP
      s := s + public._ov2_r51_meld_point_card(p_cards -> i, tr);
    END LOOP;
    RETURN s;
  END IF;
  mode_low := public._ov2_r51_run_ok_mode(p_cards, true);
  vals := ARRAY[]::int[];
  nj := 0;
  FOR i IN 0..(jsonb_array_length(p_cards) - 1) LOOP
    c := p_cards -> i;
    IF coalesce((c ->> 'isJoker')::boolean, false) THEN
      nj := nj + 1;
      CONTINUE;
    END IF;
    v := (c ->> 'rank')::int;
    IF mode_low THEN
      vals := array_append(vals, v);
    ELSE
      IF v = 1 THEN
        v := 14;
      END IF;
      vals := array_append(vals, v);
    END IF;
  END LOOP;
  IF cardinality(vals) = 0 THEN
    mn := 2;
    mx := 2 + nj - 1;
  ELSE
    SELECT min(x), max(x) INTO mn, mx FROM unnest(vals) x;
  END IF;
  span := mx - mn + 1;
  jr := ARRAY[]::int[];
  FOR v IN mn..mx LOOP
    IF NOT v = ANY (vals) THEN
      IF mode_low THEN
        jr := array_append(jr, v);
      ELSE
        jr := array_append(jr, CASE WHEN v = 14 THEN 1 ELSE v END);
      END IF;
    END IF;
  END LOOP;
  jix := 1;
  FOR i IN 0..(jsonb_array_length(p_cards) - 1) LOOP
    c := p_cards -> i;
    IF coalesce((c ->> 'isJoker')::boolean, false) THEN
      s := s + public._ov2_r51_meld_point_card(c, jr[jix]);
      jix := jix + 1;
    ELSE
      s := s + public._ov2_r51_meld_point_card(c, NULL);
    END IF;
  END LOOP;
  RETURN s;
END;
$$;

CREATE OR REPLACE FUNCTION public._ov2_r51_score_opening_melds(p_melds jsonb)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  t int := 0;
  i int;
BEGIN
  IF p_melds IS NULL OR jsonb_typeof(p_melds) <> 'array' THEN
    RETURN 0;
  END IF;
  FOR i IN 0..(jsonb_array_length(p_melds) - 1) LOOP
    t := t + public._ov2_r51_score_meld(p_melds -> i);
  END LOOP;
  RETURN t;
END;
$$;

CREATE OR REPLACE FUNCTION public._ov2_r51_opening_has_run(p_melds jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  i int;
BEGIN
  IF p_melds IS NULL OR jsonb_typeof(p_melds) <> 'array' THEN
    RETURN false;
  END IF;
  FOR i IN 0..(jsonb_array_length(p_melds) - 1) LOOP
    IF public._ov2_r51_classify_meld(p_melds -> i) = 'run' THEN
      RETURN true;
    END IF;
  END LOOP;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public._ov2_r51_apply_add_to_meld(p_existing jsonb, p_add jsonb, OUT ok boolean, OUT merged jsonb)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  cur jsonb;
  i int;
  n int;
  c jsonb;
BEGIN
  cur := p_existing;
  IF p_add IS NULL OR jsonb_typeof(p_add) <> 'array' THEN
    ok := false;
    merged := NULL;
    RETURN;
  END IF;
  n := jsonb_array_length(p_add);
  FOR i IN 0..(n - 1) LOOP
    c := p_add -> i;
    cur := cur || jsonb_build_array(c);
    IF public._ov2_r51_classify_meld(cur) = 'invalid' THEN
      ok := false;
      merged := NULL;
      RETURN;
    END IF;
  END LOOP;
  ok := true;
  merged := cur;
END;
$$;

CREATE OR REPLACE FUNCTION public._ov2_r51_hand_penalty_card(p_card jsonb)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  r int;
BEGIN
  IF coalesce((p_card ->> 'isJoker')::boolean, false) THEN
    RETURN 20;
  END IF;
  r := (p_card ->> 'rank')::int;
  IF r = 1 THEN
    RETURN 11;
  END IF;
  IF r >= 11 THEN
    RETURN 10;
  END IF;
  RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION public._ov2_r51_hand_remove_one(p_hand jsonb, p_id text, OUT ok boolean, OUT rest jsonb)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  n int;
  i int;
  c jsonb;
  found boolean := false;
  outa jsonb := '[]'::jsonb;
BEGIN
  IF p_hand IS NULL OR jsonb_typeof(p_hand) <> 'array' THEN
    ok := false;
    rest := NULL;
    RETURN;
  END IF;
  n := jsonb_array_length(p_hand);
  FOR i IN 0..(n - 1) LOOP
    c := p_hand -> i;
    IF NOT found AND (c ->> 'id') = p_id THEN
      found := true;
      CONTINUE;
    END IF;
    outa := outa || jsonb_build_array(c);
  END LOOP;
  ok := found;
  rest := outa;
END;
$$;

CREATE OR REPLACE FUNCTION public._ov2_r51_hand_remove_many(p_hand jsonb, p_ids text[], OUT ok boolean, OUT rest jsonb)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  h jsonb;
  id text;
  o boolean;
  r jsonb;
BEGIN
  h := p_hand;
  FOREACH id IN ARRAY p_ids LOOP
    SELECT * INTO o, r FROM public._ov2_r51_hand_remove_one(h, id);
    IF NOT o THEN
      ok := false;
      rest := NULL;
      RETURN;
    END IF;
    h := r;
  END LOOP;
  ok := true;
  rest := h;
END;
$$;

CREATE OR REPLACE FUNCTION public._ov2_r51_count_ids_in_hand(p_hand jsonb, p_id text)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT count(*)::int
  FROM jsonb_array_elements(COALESCE(p_hand, '[]'::jsonb)) e
  WHERE e ->> 'id' = p_id;
$$;

-- -----------------------------------------------------------------------------
-- Rematch flags (member.meta.rummy51.rematch_requested)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._ov2_r51_member_rematch_requested(p_meta jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT coalesce(
    (CASE WHEN jsonb_typeof(p_meta) = 'object' THEN p_meta -> 'rummy51' ELSE NULL END) ->> 'rematch_requested',
    ''
  ) IN ('true', 't', '1');
$$;

-- -----------------------------------------------------------------------------
-- Deal: round-robin from top (array tail), n_per hand
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

-- -----------------------------------------------------------------------------
-- Snapshot
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ov2_rummy51_build_snapshot(p_room public.ov2_rooms, p_sess public.ov2_rummy51_sessions)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'sessionId', p_sess.id,
    'roomId', p_room.id,
    'matchSeq', p_sess.match_seq,
    'phase', p_sess.phase,
    'revision', p_sess.revision,
    'turnIndex', p_sess.turn_index,
    'turnParticipantKey', p_sess.turn_participant_key,
    'dealerSeatIndex', p_sess.dealer_seat_index,
    'activeSeats', p_sess.active_seats,
    'seed', p_sess.seed,
    'stockCount', jsonb_array_length(COALESCE(p_sess.stock, '[]'::jsonb)),
    'discardCount', jsonb_array_length(COALESCE(p_sess.discard, '[]'::jsonb)),
    'discardTop', p_sess.discard -> (jsonb_array_length(COALESCE(p_sess.discard, '[]'::jsonb)) - 1),
    'hands', p_sess.hands,
    'tableMelds', p_sess.table_melds,
    'playerState', p_sess.player_state,
    'takenDiscardCardId', p_sess.taken_discard_card_id,
    'pendingDrawSource', p_sess.pending_draw_source,
    'roundNumber', p_sess.round_number,
    'winnerParticipantKey', p_sess.winner_participant_key,
    'winnerName', p_sess.winner_name,
    'matchMeta', COALESCE(p_sess.match_meta, '{}'::jsonb),
    'startedAt', p_sess.started_at,
    'finishedAt', p_sess.finished_at,
    'updatedAt', p_sess.updated_at
  );
$$;

CREATE OR REPLACE FUNCTION public.ov2_rummy51_get_snapshot(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_sess public.ov2_rummy51_sessions%ROWTYPE;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id required');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.product_game_id IS DISTINCT FROM 'ov2_rummy51' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a Rummy51 room');
  END IF;
  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'room', public.ov2_room_to_public_jsonb(v_room),
      'members', public.ov2_members_to_public_jsonb(p_room_id),
      'session', NULL,
      'snapshot', NULL
    );
  END IF;
  SELECT * INTO v_sess
  FROM public.ov2_rummy51_sessions
  WHERE id = v_room.active_session_id AND room_id = p_room_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'room', public.ov2_room_to_public_jsonb(v_room),
      'members', public.ov2_members_to_public_jsonb(p_room_id),
      'session', NULL,
      'snapshot', NULL
    );
  END IF;
  RETURN jsonb_build_object(
    'ok', true,
    'room', public.ov2_room_to_public_jsonb(v_room),
    'members', public.ov2_members_to_public_jsonb(p_room_id),
    'session', public.ov2_rummy51_build_snapshot(v_room, v_sess),
    'snapshot', public.ov2_rummy51_build_snapshot(v_room, v_sess)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_rummy51_get_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_rummy51_get_snapshot(uuid) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- open_session
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- draw_from_stock / draw_from_discard
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- submit_turn — payload: { new_melds, table_additions, discard_card_id }
-- new_melds: jsonb array of melds (each meld = jsonb array of card objects)
-- table_additions: [{ "meld_id": "...", "cards_from_hand": [ cards ] }]
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- Settlement on match end (Ludo-style pot → winner credit)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ov2_rummy51_after_finish_emit_settlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_winner text;
  v_room_id uuid := NEW.room_id;
  v_match_seq int := NEW.match_seq;
  v_sess_id uuid := NEW.id;
  v_entry bigint;
  v_seats int;
  v_prize bigint;
  v_loss bigint;
  v_credit bigint;
  v_idem text;
  r_loss record;
BEGIN
  IF NEW.phase IS DISTINCT FROM 'finished' THEN
    RETURN NULL;
  END IF;
  v_winner := nullif(trim(COALESCE(NEW.winner_participant_key, '')), '');
  IF v_winner IS NULL OR length(v_winner) = 0 THEN
    RETURN NULL;
  END IF;

  v_entry := COALESCE((NEW.match_meta ->> 'stakePerSeat')::bigint, 0);
  v_seats := COALESCE((NEW.match_meta ->> 'seatCount')::int, 0);
  IF v_seats IS NULL OR v_seats < 1 THEN
    v_seats := 1;
  END IF;
  v_loss := v_entry;
  v_prize := v_loss * v_seats;
  v_credit := v_prize - v_loss;
  IF v_credit < 0 THEN
    v_credit := 0;
  END IF;

  v_idem := 'ov2:settle:' || v_room_id::text || ':' || v_sess_id::text || ':' || v_winner || ':rummy51_win:';
  INSERT INTO public.ov2_settlement_lines (
    room_id, match_seq, recipient_participant_key, line_kind, amount, idempotency_key, game_session_id, meta
  ) VALUES (
    v_room_id,
    v_match_seq,
    v_winner,
    'rummy51_win',
    v_credit,
    v_idem,
    v_sess_id,
    jsonb_build_object('gameId', 'ov2_rummy51', 'sessionId', v_sess_id, 'prize', v_prize, 'lossPerSeat', v_loss, 'credit', v_credit)
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  FOR r_loss IN
    SELECT key AS pk FROM jsonb_each(COALESCE(NEW.player_state, '{}'::jsonb))
    WHERE trim(key) IS DISTINCT FROM v_winner
  LOOP
    IF r_loss.pk IS NULL OR length(trim(r_loss.pk)) = 0 THEN
      CONTINUE;
    END IF;
    v_idem := 'ov2:settle:' || v_room_id::text || ':' || v_sess_id::text || ':' || r_loss.pk || ':rummy51_loss:';
    INSERT INTO public.ov2_settlement_lines (
      room_id, match_seq, recipient_participant_key, line_kind, amount, idempotency_key, game_session_id, meta
    ) VALUES (
      v_room_id,
      v_match_seq,
      r_loss.pk,
      'rummy51_loss',
      0,
      v_idem,
      v_sess_id,
      jsonb_build_object('gameId', 'ov2_rummy51', 'sessionId', v_sess_id)
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END LOOP;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_ov2_rummy51_finish_settlement ON public.ov2_rummy51_sessions;
CREATE TRIGGER trg_ov2_rummy51_finish_settlement
  AFTER UPDATE OF phase ON public.ov2_rummy51_sessions
  FOR EACH ROW
  WHEN (NEW.phase IS NOT DISTINCT FROM 'finished' AND OLD.phase IS DISTINCT FROM 'finished')
  EXECUTE FUNCTION public.ov2_rummy51_after_finish_emit_settlement();

CREATE OR REPLACE FUNCTION public.ov2_rummy51_claim_settlement(
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
  v_has_any boolean;
  v_has_undelivered boolean;
  v_lines jsonb;
  v_total bigint;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_rummy51' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.ov2_room_members m WHERE m.room_id = p_room_id AND trim(m.participant_key) = v_pk) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Not a member');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.ov2_settlement_lines sl
    WHERE sl.room_id = p_room_id AND trim(sl.recipient_participant_key) = v_pk
      AND sl.line_kind LIKE 'rummy51_%'
  ) INTO v_has_any;

  IF NOT v_has_any THEN
    RETURN jsonb_build_object('ok', true, 'lines', '[]'::jsonb, 'total', 0, 'idempotent', true);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.ov2_settlement_lines sl
    WHERE sl.room_id = p_room_id AND trim(sl.recipient_participant_key) = v_pk
      AND sl.line_kind LIKE 'rummy51_%'
      AND COALESCE((sl.meta ->> 'delivered')::boolean, false) = false
  ) INTO v_has_undelivered;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', sl.id,
    'line_kind', sl.line_kind,
    'amount', sl.amount,
    'idempotency_key', sl.idempotency_key
  )), '[]'::jsonb)
  INTO v_lines
  FROM public.ov2_settlement_lines sl
  WHERE sl.room_id = p_room_id
    AND trim(sl.recipient_participant_key) = v_pk
    AND sl.line_kind LIKE 'rummy51_%'
    AND COALESCE((sl.meta ->> 'delivered')::boolean, false) = false;

  SELECT COALESCE(sum(sl.amount), 0::bigint)
  INTO v_total
  FROM public.ov2_settlement_lines sl
  WHERE sl.room_id = p_room_id
    AND trim(sl.recipient_participant_key) = v_pk
    AND sl.line_kind LIKE 'rummy51_%'
    AND COALESCE((sl.meta ->> 'delivered')::boolean, false) = false;

  UPDATE public.ov2_settlement_lines sl
  SET meta = COALESCE(sl.meta, '{}'::jsonb) || jsonb_build_object('delivered', true, 'delivered_at', to_jsonb(now()::text))
  WHERE sl.room_id = p_room_id
    AND trim(sl.recipient_participant_key) = v_pk
    AND sl.line_kind LIKE 'rummy51_%'
    AND COALESCE((sl.meta ->> 'delivered')::boolean, false) = false;

  RETURN jsonb_build_object(
    'ok', true,
    'lines', COALESCE(v_lines, '[]'::jsonb),
    'total', COALESCE(v_total, 0),
    'idempotent', NOT v_has_undelivered
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_rummy51_claim_settlement(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_rummy51_claim_settlement(uuid, text) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Rematch (bingo-style): member.meta.rummy51.rematch_requested
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ov2_rummy51_request_rematch(p_room_id uuid, p_participant_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_sess public.ov2_rummy51_sessions%ROWTYPE;
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_member public.ov2_room_members%ROWTYPE;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Arguments required');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_rummy51' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.lifecycle_phase IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_ACTIVE', 'message', 'Room must be active');
  END IF;
  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No session');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_rummy51_sessions WHERE id = v_room.active_session_id;
  IF NOT FOUND OR v_sess.phase IS DISTINCT FROM 'finished' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REMATCH_NOT_ALLOWED', 'message', 'Rematch only after match ends');
  END IF;
  IF v_sess.match_seq IS DISTINCT FROM v_room.match_seq THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STALE_SESSION', 'message', 'Stale session');
  END IF;
  SELECT * INTO v_member FROM public.ov2_room_members WHERE room_id = p_room_id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Not a member');
  END IF;
  IF v_member.wallet_state IS DISTINCT FROM 'committed' OR v_member.seat_index IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_SEATED_COMMITTED', 'message', 'Must be seated and committed');
  END IF;
  IF public._ov2_r51_member_rematch_requested(v_member.meta) THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;
  UPDATE public.ov2_room_members
  SET
    meta = jsonb_set(
      CASE WHEN jsonb_typeof(meta) = 'object' THEN meta ELSE '{}'::jsonb END,
      '{rummy51}',
      COALESCE(
        CASE WHEN jsonb_typeof((CASE WHEN jsonb_typeof(meta) = 'object' THEN meta ELSE '{}'::jsonb END) -> 'rummy51') = 'object'
          THEN (CASE WHEN jsonb_typeof(meta) = 'object' THEN meta ELSE '{}'::jsonb END) -> 'rummy51'
        END,
        '{}'::jsonb
      ) || jsonb_build_object('rematch_requested', true, 'rematch_at', to_jsonb(now()::text)),
      true
    ),
    updated_at = now()
  WHERE room_id = p_room_id AND participant_key = v_pk;
  RETURN jsonb_build_object('ok', true, 'idempotent', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_rummy51_cancel_rematch(p_room_id uuid, p_participant_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_sess public.ov2_rummy51_sessions%ROWTYPE;
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_member public.ov2_room_members%ROWTYPE;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Arguments required');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_rummy51' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No session');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_rummy51_sessions WHERE id = v_room.active_session_id;
  IF NOT FOUND OR v_sess.phase IS DISTINCT FROM 'finished' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REMATCH_NOT_ALLOWED', 'message', 'Not in rematch window');
  END IF;
  SELECT * INTO v_member FROM public.ov2_room_members WHERE room_id = p_room_id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Not a member');
  END IF;
  IF NOT public._ov2_r51_member_rematch_requested(v_member.meta) THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;
  UPDATE public.ov2_room_members
  SET
    meta = CASE
      WHEN (CASE WHEN jsonb_typeof(meta) = 'object' THEN meta ELSE '{}'::jsonb END) ? 'rummy51'
        AND jsonb_typeof((CASE WHEN jsonb_typeof(meta) = 'object' THEN meta ELSE '{}'::jsonb END) -> 'rummy51') = 'object' THEN
        jsonb_set(
          CASE WHEN jsonb_typeof(meta) = 'object' THEN meta ELSE '{}'::jsonb END,
          '{rummy51}',
          ((CASE WHEN jsonb_typeof(meta) = 'object' THEN meta ELSE '{}'::jsonb END) -> 'rummy51') - 'rematch_requested' - 'rematch_at',
          true
        )
      ELSE CASE WHEN jsonb_typeof(meta) = 'object' THEN meta ELSE '{}'::jsonb END
    END,
    updated_at = now()
  WHERE room_id = p_room_id AND participant_key = v_pk;
  RETURN jsonb_build_object('ok', true, 'idempotent', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_rummy51_start_next_match(
  p_room_id uuid,
  p_host_participant_key text,
  p_expected_match_seq integer DEFAULT NULL
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
  v_next_ms int;
  v_eligible int;
  v_ready int;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Arguments required');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_rummy51' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.host_participant_key IS DISTINCT FROM v_pk THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_HOST', 'message', 'Only host can start next match');
  END IF;
  IF p_expected_match_seq IS NOT NULL AND p_expected_match_seq IS DISTINCT FROM v_room.match_seq THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STALE_MATCH_SEQ', 'match_seq', v_room.match_seq);
  END IF;
  IF v_room.lifecycle_phase IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_ACTIVE', 'message', 'Room must be active');
  END IF;
  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No session');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_rummy51_sessions WHERE id = v_room.active_session_id;
  IF NOT FOUND OR v_sess.phase IS DISTINCT FROM 'finished' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FINISHED', 'message', 'Match must be finished');
  END IF;
  IF v_sess.match_seq IS DISTINCT FROM v_room.match_seq THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STALE_SESSION', 'message', 'Session mismatch');
  END IF;

  SELECT count(*)::int INTO v_eligible
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL AND m.wallet_state = 'committed';
  IF v_eligible < 2 OR v_eligible > 4 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_SEAT_COUNT', 'message', 'Need 2-4 seated committed');
  END IF;

  SELECT count(*)::int INTO v_ready
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id
    AND m.seat_index IS NOT NULL
    AND m.wallet_state = 'committed'
    AND public._ov2_r51_member_rematch_requested(m.meta);
  IF v_ready < v_eligible THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_ALL_REMATCH_READY', 'ready', v_ready, 'eligible', v_eligible);
  END IF;

  v_next_ms := COALESCE(v_room.match_seq, 0) + 1;

  UPDATE public.ov2_room_members m
  SET
    meta = CASE
      WHEN (CASE WHEN jsonb_typeof(m.meta) = 'object' THEN m.meta ELSE '{}'::jsonb END) ? 'rummy51'
        AND jsonb_typeof((CASE WHEN jsonb_typeof(m.meta) = 'object' THEN m.meta ELSE '{}'::jsonb END) -> 'rummy51') = 'object' THEN
        jsonb_set(
          CASE WHEN jsonb_typeof(m.meta) = 'object' THEN m.meta ELSE '{}'::jsonb END,
          '{rummy51}',
          ((CASE WHEN jsonb_typeof(m.meta) = 'object' THEN m.meta ELSE '{}'::jsonb END) -> 'rummy51') - 'rematch_requested' - 'rematch_at',
          true
        )
      ELSE CASE WHEN jsonb_typeof(m.meta) = 'object' THEN m.meta ELSE '{}'::jsonb END
    END,
    wallet_state = CASE WHEN m.seat_index IS NOT NULL THEN 'none' ELSE m.wallet_state END,
    amount_locked = CASE WHEN m.seat_index IS NOT NULL THEN 0 ELSE m.amount_locked END,
    updated_at = now()
  WHERE m.room_id = p_room_id;

  UPDATE public.ov2_rooms
  SET
    match_seq = v_next_ms,
    active_session_id = NULL,
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

REVOKE ALL ON FUNCTION public.ov2_rummy51_request_rematch(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_rummy51_request_rematch(uuid, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_rummy51_cancel_rematch(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_rummy51_cancel_rematch(uuid, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_rummy51_start_next_match(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_rummy51_start_next_match(uuid, text, integer) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- ov2_create_room allow ov2_rummy51; default max_seats 4 for this product
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ov2_create_room(
  p_product_game_id text,
  p_title text,
  p_stake_per_seat bigint,
  p_host_participant_key text,
  p_display_name text,
  p_is_private boolean DEFAULT false,
  p_passcode text DEFAULT NULL,
  p_max_seats integer DEFAULT 8
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game text;
  v_stake bigint;
  v_cap int;
  v_host text;
  v_title text;
  v_room public.ov2_rooms%ROWTYPE;
BEGIN
  v_game := trim(COALESCE(p_product_game_id, ''));
  IF v_game NOT IN ('ov2_board_path', 'ov2_mark_grid', 'ov2_ludo', 'ov2_bingo', 'ov2_rummy51') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_GAME_ID',
      'message', 'Unknown or invalid OV2 game id.'
    );
  END IF;

  v_stake := p_stake_per_seat;
  IF v_stake IS NULL OR v_stake < 100 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'STAKE_BELOW_MINIMUM',
      'message', 'Stake per seat must be at least 100.'
    );
  END IF;

  v_cap := COALESCE(p_max_seats, 8);
  IF v_game = 'ov2_rummy51' THEN
    IF v_cap > 4 THEN
      v_cap := 4;
    END IF;
  END IF;
  IF v_cap < 2 OR v_cap > 16 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_CAPACITY',
      'message', 'Room capacity must be between 2 and 16 seats.'
    );
  END IF;

  v_host := trim(COALESCE(p_host_participant_key, ''));
  IF length(v_host) = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_ARGUMENT',
      'message', 'Host participant is required.'
    );
  END IF;

  v_title := COALESCE(NULLIF(trim(COALESCE(p_title, '')), ''), 'Table');

  INSERT INTO public.ov2_rooms (
    product_game_id,
    title,
    lifecycle_phase,
    stake_per_seat,
    host_participant_key,
    is_private,
    passcode,
    max_seats
  ) VALUES (
    v_game,
    v_title,
    'lobby',
    v_stake,
    v_host,
    COALESCE(p_is_private, false),
    NULLIF(trim(COALESCE(p_passcode, '')), ''),
    v_cap
  )
  RETURNING * INTO v_room;

  INSERT INTO public.ov2_room_members (
    room_id,
    participant_key,
    display_name,
    wallet_state,
    is_ready
  ) VALUES (
    v_room.id,
    v_host,
    NULLIF(trim(COALESCE(p_display_name, '')), ''),
    'none',
    false
  );

  RETURN jsonb_build_object(
    'ok', true,
    'room', public.ov2_room_to_public_jsonb(v_room),
    'members', public.ov2_members_to_public_jsonb(v_room.id)
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- Seat claim 0..3 for rummy51 (unified RPC)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ov2_room_claim_seat(
  p_room_id uuid,
  p_participant_key text,
  p_seat_index integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_upd int;
  v_hi int;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'participant_key required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;

  IF v_room.product_game_id IS DISTINCT FROM 'ov2_ludo'
     AND v_room.product_game_id IS DISTINCT FROM 'ov2_bingo'
     AND v_room.product_game_id IS DISTINCT FROM 'ov2_rummy51' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'This room does not use manual seat claims');
  END IF;

  v_hi := CASE
    WHEN v_room.product_game_id = 'ov2_ludo' THEN 3
    WHEN v_room.product_game_id = 'ov2_rummy51' THEN 3
    ELSE 7
  END;

  IF p_seat_index IS NULL OR p_seat_index < 0 OR p_seat_index > v_hi THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_SEAT',
      'message', format('Seat must be 0..%s', v_hi)
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id
      AND m.participant_key <> v_pk
      AND m.seat_index = p_seat_index
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEAT_TAKEN', 'message', 'Seat taken');
  END IF;

  UPDATE public.ov2_room_members
  SET seat_index = p_seat_index, updated_at = now()
  WHERE room_id = p_room_id AND participant_key = v_pk;

  GET DIAGNOSTICS v_upd = ROW_COUNT;
  IF v_upd = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Not a room member');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'room', public.ov2_room_to_public_jsonb(v_room),
    'members', public.ov2_members_to_public_jsonb(p_room_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_room_leave_seat(
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
  v_upd int;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'participant_key required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;

  IF v_room.product_game_id IS DISTINCT FROM 'ov2_ludo'
     AND v_room.product_game_id IS DISTINCT FROM 'ov2_bingo'
     AND v_room.product_game_id IS DISTINCT FROM 'ov2_rummy51' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'This room does not use manual seat claims');
  END IF;

  UPDATE public.ov2_room_members
  SET seat_index = NULL, updated_at = now()
  WHERE room_id = p_room_id AND participant_key = v_pk;

  GET DIAGNOSTICS v_upd = ROW_COUNT;
  IF v_upd = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Not a room member');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'room', public.ov2_room_to_public_jsonb(v_room),
    'members', public.ov2_members_to_public_jsonb(p_room_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_rummy51_claim_seat(
  p_room_id uuid,
  p_participant_key text,
  p_seat_index integer
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.ov2_room_claim_seat(p_room_id, p_participant_key, p_seat_index);
$$;

CREATE OR REPLACE FUNCTION public.ov2_rummy51_leave_seat(
  p_room_id uuid,
  p_participant_key text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.ov2_room_leave_seat(p_room_id, p_participant_key);
$$;

REVOKE ALL ON FUNCTION public.ov2_rummy51_claim_seat(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_rummy51_claim_seat(uuid, text, integer) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_rummy51_leave_seat(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_rummy51_leave_seat(uuid, text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.ov2_rummy51_open_session IS 'Rummy51: host opens match; deals 14; requires active room + committed stakes.';
COMMENT ON FUNCTION public.ov2_rummy51_get_snapshot IS 'Rummy51: room + members + session (null if none).';
COMMENT ON FUNCTION public.ov2_rummy51_submit_turn IS 'Rummy51: full meld+discard after draw; server validates melds.';

REVOKE ALL ON FUNCTION public.ov2_create_room(text, text, bigint, text, text, boolean, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_create_room(text, text, bigint, text, text, boolean, text, integer) TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.ov2_create_room IS
  'OV2: create lobby room + host member; allowlisted ids include ov2_board_path, ov2_mark_grid, ov2_ludo, ov2_bingo, ov2_rummy51; rummy51 caps max_seats at 4.';

COMMIT;
