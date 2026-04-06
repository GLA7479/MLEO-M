-- Color Clash engine: deck, legality, turn order, reshuffle, timer parity (no doubles in v1).
-- Apply after 122_ov2_colorclash_schema.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_cc_jsonb_len(p jsonb)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p IS NULL OR jsonb_typeof(p) <> 'array' THEN 0
    ELSE jsonb_array_length(p)
  END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_cc_shuffle_jsonb_array(p_arr jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT jsonb_agg(e ORDER BY random()) FROM jsonb_array_elements(p_arr) AS t(e)),
    '[]'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION public.ov2_cc_build_deck()
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_deck jsonb := '[]'::jsonb;
  v_c int;
  v_v int;
  v_k int;
BEGIN
  FOR v_c IN 0..3 LOOP
    v_deck := v_deck || jsonb_build_array(jsonb_build_object('t', 'n', 'c', v_c, 'v', 0));
    FOR v_v IN 1..9 LOOP
      FOR v_k IN 1..2 LOOP
        v_deck := v_deck || jsonb_build_array(jsonb_build_object('t', 'n', 'c', v_c, 'v', v_v));
      END LOOP;
    END LOOP;
    FOR v_k IN 1..2 LOOP
      v_deck := v_deck || jsonb_build_array(jsonb_build_object('t', 's', 'c', v_c));
      v_deck := v_deck || jsonb_build_array(jsonb_build_object('t', 'r', 'c', v_c));
      v_deck := v_deck || jsonb_build_array(jsonb_build_object('t', 'd', 'c', v_c));
    END LOOP;
  END LOOP;
  FOR v_k IN 1..4 LOOP
    v_deck := v_deck || jsonb_build_array(jsonb_build_object('t', 'w'));
    v_deck := v_deck || jsonb_build_array(jsonb_build_object('t', 'f'));
  END LOOP;
  RETURN v_deck;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_cc_card_type(p_card jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(trim(coalesce(p_card ->> 't', '')));
$$;

CREATE OR REPLACE FUNCTION public.ov2_cc_card_color(p_card jsonb)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_raw text;
BEGIN
  IF p_card IS NULL OR jsonb_typeof(p_card) <> 'object' THEN
    RETURN NULL;
  END IF;
  v_raw := p_card ->> 'c';
  IF v_raw IS NULL OR length(trim(v_raw)) = 0 THEN
    RETURN NULL;
  END IF;
  RETURN v_raw::int;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_cc_card_num(p_card jsonb)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_raw text;
BEGIN
  IF p_card IS NULL OR jsonb_typeof(p_card) <> 'object' THEN
    RETURN NULL;
  END IF;
  v_raw := p_card ->> 'v';
  IF v_raw IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN v_raw::int;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_cc_top_discard(p_disc jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_disc IS NULL OR jsonb_typeof(p_disc) <> 'array' OR jsonb_array_length(p_disc) <= 0 THEN NULL::jsonb
    ELSE p_disc -> (jsonb_array_length(p_disc) - 1)
  END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_cc_clash_cap()
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT 4;
$$;

-- Wild Lock V2: when non-null, non-wild cards must have this color (wilds still escape).
CREATE OR REPLACE FUNCTION public.ov2_cc_wild_lock_color_for_turn(p_pub jsonb, p_turn_seat int)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_lfs int;
BEGIN
  IF p_pub IS NULL OR NOT (p_pub ? 'lockForSeat') OR p_pub -> 'lockForSeat' IS NULL OR jsonb_typeof(p_pub -> 'lockForSeat') = 'null' THEN
    RETURN NULL;
  END IF;
  BEGIN
    v_lfs := (p_pub ->> 'lockForSeat')::int;
  EXCEPTION
    WHEN OTHERS THEN
      RETURN NULL;
  END;
  IF v_lfs IS DISTINCT FROM p_turn_seat THEN
    RETURN NULL;
  END IF;
  IF NOT (p_pub ? 'lockedColor') OR p_pub -> 'lockedColor' IS NULL OR jsonb_typeof(p_pub -> 'lockedColor') = 'null' THEN
    RETURN NULL;
  END IF;
  BEGIN
    RETURN (p_pub ->> 'lockedColor')::int;
  EXCEPTION
    WHEN OTHERS THEN
      RETURN NULL;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_cc_pub_clear_wild_lock_on_turn_end(p_pub jsonb, p_leaving_seat int)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_lock_seat int;
  v_out jsonb;
BEGIN
  v_out := coalesce(p_pub, '{}'::jsonb);
  IF NOT (v_out ? 'lockForSeat') OR v_out -> 'lockForSeat' IS NULL THEN
    RETURN v_out;
  END IF;
  BEGIN
    v_lock_seat := (v_out ->> 'lockForSeat')::int;
  EXCEPTION
    WHEN OTHERS THEN
      RETURN v_out;
  END;
  IF v_lock_seat IS DISTINCT FROM p_leaving_seat THEN
    RETURN v_out;
  END IF;
  v_out := jsonb_set(v_out, '{lockedColor}', 'null'::jsonb, true);
  v_out := jsonb_set(v_out, '{lockForSeat}', 'null'::jsonb, true);
  v_out := jsonb_set(v_out, '{lockExpiresAfterNextTurn}', 'false'::jsonb, true);
  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_cc_clash_update_after_play(p_pub jsonb, p_card jsonb, p_current_color int)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_pt text;
  v_c int;
  v_prev int;
  v_cap int;
BEGIN
  v_pt := public.ov2_cc_card_type(p_card);
  IF v_pt IN ('w', 'f') THEN
    RETURN 0;
  END IF;
  v_c := public.ov2_cc_card_color(p_card);
  IF v_c IS NULL OR v_c IS DISTINCT FROM p_current_color THEN
    RETURN 0;
  END IF;
  v_prev := coalesce(nullif((p_pub ->> 'clashCount'), '')::int, 0);
  IF v_prev < 0 THEN
    v_prev := 0;
  END IF;
  v_cap := public.ov2_cc_clash_cap();
  v_prev := v_prev + 1;
  IF v_prev > v_cap THEN
    v_prev := v_cap;
  END IF;
  RETURN v_prev;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_cc_is_playable_on(
  p_card jsonb,
  p_top jsonb,
  p_current_color int,
  p_wild_lock_color int DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_tt text;
  v_ct text;
  v_cc int;
  v_tc int;
  v_nv int;
  v_tv int;
BEGIN
  IF p_card IS NULL OR jsonb_typeof(p_card) <> 'object' OR p_top IS NULL OR jsonb_typeof(p_top) <> 'object' THEN
    RETURN false;
  END IF;
  v_tt := public.ov2_cc_card_type(p_top);
  v_ct := public.ov2_cc_card_type(p_card);
  IF p_wild_lock_color IS NOT NULL AND v_ct NOT IN ('w', 'f') THEN
    v_cc := public.ov2_cc_card_color(p_card);
    IF v_cc IS NULL OR v_cc IS DISTINCT FROM p_wild_lock_color THEN
      RETURN false;
    END IF;
  END IF;
  IF v_ct IN ('w', 'f') THEN
    RETURN true;
  END IF;
  v_cc := public.ov2_cc_card_color(p_card);
  IF v_cc IS NULL OR v_cc < 0 OR v_cc > 3 THEN
    RETURN false;
  END IF;
  IF v_tt IN ('w', 'f') THEN
    RETURN v_cc IS NOT DISTINCT FROM p_current_color;
  END IF;
  IF v_tt = 'n' THEN
    v_tv := public.ov2_cc_card_num(p_top);
    v_nv := public.ov2_cc_card_num(p_card);
    v_tc := public.ov2_cc_card_color(p_top);
    IF v_nv IS NOT NULL AND v_tv IS NOT NULL AND v_nv IS NOT DISTINCT FROM v_tv THEN
      RETURN true;
    END IF;
    IF v_tc IS NOT NULL AND v_cc IS NOT DISTINCT FROM v_tc THEN
      RETURN true;
    END IF;
    RETURN false;
  END IF;
  v_tc := public.ov2_cc_card_color(p_top);
  RETURN v_tc IS NOT NULL AND v_cc IS NOT DISTINCT FROM v_tc;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_cc_hand_get(p_eng public.ov2_colorclash_engine, p_seat int)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_seat
    WHEN 0 THEN p_eng.hand0
    WHEN 1 THEN p_eng.hand1
    WHEN 2 THEN p_eng.hand2
    WHEN 3 THEN p_eng.hand3
    ELSE '[]'::jsonb
  END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_cc_hand_set(
  p_eng public.ov2_colorclash_engine,
  p_seat int,
  p_hand jsonb
)
RETURNS public.ov2_colorclash_engine
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_out public.ov2_colorclash_engine%ROWTYPE;
BEGIN
  v_out := p_eng;
  CASE p_seat
    WHEN 0 THEN v_out.hand0 := coalesce(p_hand, '[]'::jsonb);
    WHEN 1 THEN v_out.hand1 := coalesce(p_hand, '[]'::jsonb);
    WHEN 2 THEN v_out.hand2 := coalesce(p_hand, '[]'::jsonb);
    WHEN 3 THEN v_out.hand3 := coalesce(p_hand, '[]'::jsonb);
    ELSE NULL;
  END CASE;
  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_cc_remove_one_card(p_hand jsonb, p_card jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_n int;
  v_i int;
  v_x jsonb;
  v_found boolean := false;
  v_out jsonb := '[]'::jsonb;
BEGIN
  v_n := public.ov2_cc_jsonb_len(p_hand);
  FOR v_i IN 0..(v_n - 1) LOOP
    v_x := p_hand -> v_i;
    IF NOT v_found AND v_x = p_card THEN
      v_found := true;
    ELSE
      v_out := v_out || v_x;
    END IF;
  END LOOP;
  IF NOT v_found THEN
    RETURN NULL;
  END IF;
  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_cc_has_legal_play(
  p_hand jsonb,
  p_top jsonb,
  p_current_color int,
  p_wild_lock_color int DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_n int;
  v_i int;
BEGIN
  v_n := public.ov2_cc_jsonb_len(p_hand);
  FOR v_i IN 0..(v_n - 1) LOOP
    IF public.ov2_cc_is_playable_on(p_hand -> v_i, p_top, p_current_color, p_wild_lock_color) THEN
      RETURN true;
    END IF;
  END LOOP;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_cc_pending_draw_contains(p_pending jsonb, p_card jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_n int;
  v_i int;
BEGIN
  IF p_pending IS NULL OR p_card IS NULL THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(p_pending) = 'array' THEN
    v_n := public.ov2_cc_jsonb_len(p_pending);
    FOR v_i IN 0..(v_n - 1) LOOP
      IF (p_pending -> v_i) = p_card THEN
        RETURN true;
      END IF;
    END LOOP;
    RETURN false;
  END IF;
  RETURN p_pending = p_card;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_cc_surge_used_get(p_parity jsonb, p_seat int)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_su jsonb;
BEGIN
  v_su := p_parity -> 'surgeUsed';
  IF v_su IS NULL OR jsonb_typeof(v_su) <> 'object' THEN
    RETURN false;
  END IF;
  RETURN coalesce((v_su ->> p_seat::text) IN ('true', 't', '1'), false);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_cc_surge_used_set(p_parity jsonb, p_seat int, p_val boolean)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_set(
    coalesce(p_parity, '{}'::jsonb),
    ARRAY['surgeUsed', p_seat::text],
    to_jsonb(coalesce(p_val, false)),
    true
  );
$$;

CREATE OR REPLACE FUNCTION public.ov2_cc_eliminated_get(p_pub jsonb, p_seat int)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT coalesce((p_pub -> 'eliminated' ->> p_seat::text)::boolean, false)
     OR coalesce((p_pub -> 'eliminated' ->> (p_seat::text))::text = 'true', false);
$$;

-- Robust eliminated read (jsonb object keys as text)
CREATE OR REPLACE FUNCTION public.ov2_cc_is_eliminated(p_pub jsonb, p_seat int)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_e jsonb;
BEGIN
  IF p_pub IS NULL OR NOT (p_pub ? 'eliminated') THEN
    RETURN false;
  END IF;
  v_e := p_pub -> 'eliminated';
  IF v_e IS NULL OR jsonb_typeof(v_e) <> 'object' THEN
    RETURN false;
  END IF;
  RETURN coalesce((v_e ->> p_seat::text) IN ('true', 't', '1'), false);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_cc_set_eliminated(p_pub jsonb, p_seat int, p_val boolean)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_set(
    coalesce(p_pub, '{}'::jsonb),
    ARRAY['eliminated', p_seat::text],
    to_jsonb(coalesce(p_val, false)),
    true
  );
$$;

CREATE OR REPLACE FUNCTION public.ov2_cc_active_non_eliminated(p_active int[], p_pub jsonb)
RETURNS int[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_out int[] := ARRAY[]::int[];
  v_s int;
BEGIN
  IF p_active IS NULL THEN
    RETURN v_out;
  END IF;
  FOREACH v_s IN ARRAY p_active LOOP
    IF NOT public.ov2_cc_is_eliminated(p_pub, v_s) THEN
      v_out := array_append(v_out, v_s);
    END IF;
  END LOOP;
  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_cc_next_in_order(
  p_active int[],
  p_from int,
  p_steps int,
  p_direction int
)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_n int;
  v_i int;
  v_idx int;
  v_dir int;
BEGIN
  v_dir := CASE WHEN coalesce(p_direction, 1) < 0 THEN -1 ELSE 1 END;
  v_n := coalesce(array_length(p_active, 1), 0);
  IF v_n <= 0 THEN
    RETURN NULL;
  END IF;
  v_idx := array_position(p_active, p_from);
  IF v_idx IS NULL THEN
    RETURN NULL;
  END IF;
  v_i := v_idx - 1;
  v_i := v_i + v_dir * greatest(1, coalesce(p_steps, 1));
  v_i := ((v_i % v_n) + v_n) % v_n;
  RETURN p_active[v_i + 1];
END;
$$;

COMMENT ON FUNCTION public.ov2_cc_next_in_order IS 'Circular index on p_active sorted array; steps=2 skips one player.';

CREATE OR REPLACE FUNCTION public.ov2_cc_count_survivors(p_active int[], p_pub jsonb)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT coalesce(cardinality(public.ov2_cc_active_non_eliminated(p_active, p_pub)), 0);
$$;

CREATE OR REPLACE FUNCTION public.ov2_cc_reshuffle_stock_from_discard(
  p_eng public.ov2_colorclash_engine
)
RETURNS public.ov2_colorclash_engine
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_top jsonb;
  v_rest jsonb := '[]'::jsonb;
  v_n int;
  v_i int;
BEGIN
  v_n := public.ov2_cc_jsonb_len(p_eng.discard);
  IF v_n <= 1 THEN
    RETURN p_eng;
  END IF;
  v_top := p_eng.discard -> (v_n - 1);
  FOR v_i IN 0..(v_n - 2) LOOP
    v_rest := v_rest || (p_eng.discard -> v_i);
  END LOOP;
  p_eng.discard := jsonb_build_array(v_top);
  p_eng.stock := public.ov2_cc_shuffle_jsonb_array(v_rest) || p_eng.stock;
  RETURN p_eng;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_cc_draw_one_from_stock(
  p_eng public.ov2_colorclash_engine
)
RETURNS TABLE (eng public.ov2_colorclash_engine, card jsonb)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_len int;
  v_eng public.ov2_colorclash_engine;
  v_card jsonb;
BEGIN
  v_eng := p_eng;
  v_len := public.ov2_cc_jsonb_len(v_eng.stock);

  IF v_len = 0 THEN
    SELECT * INTO v_eng
    FROM public.ov2_cc_reshuffle_stock_from_discard(v_eng);

    v_len := public.ov2_cc_jsonb_len(v_eng.stock);

    IF v_len = 0 THEN
      RETURN QUERY SELECT v_eng, NULL::jsonb;
      RETURN;
    END IF;
  END IF;

  v_card := v_eng.stock -> 0;
  IF v_len = 1 THEN
    v_eng.stock := '[]'::jsonb;
  ELSE
    v_eng.stock := (
      SELECT coalesce(jsonb_agg(v_eng.stock -> i ORDER BY i), '[]'::jsonb)
      FROM generate_series(1, v_len - 1) AS g(i)
    );
  END IF;

  RETURN QUERY SELECT v_eng, v_card;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_cc_draw_n_to_hand(
  p_eng public.ov2_colorclash_engine,
  p_seat int,
  p_n int
)
RETURNS public.ov2_colorclash_engine
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_k int;
  v_card jsonb;
  v_hand jsonb;
  v_e public.ov2_colorclash_engine%ROWTYPE;
  v_draw record;
BEGIN
  v_e := p_eng;
  v_hand := public.ov2_cc_hand_get(v_e, p_seat);
  FOR v_k IN 1..greatest(0, coalesce(p_n, 0)) LOOP
    SELECT * INTO v_draw
    FROM public.ov2_cc_draw_one_from_stock(v_e);

    v_e := v_draw.eng;
    v_card := v_draw.card;
    EXIT WHEN v_card IS NULL;
    v_hand := v_hand || v_card;
  END LOOP;
  v_e := public.ov2_cc_hand_set(v_e, p_seat, v_hand);
  RETURN v_e;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_cc_initial_current_color(p_top jsonb)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_tt text;
  v_c int;
BEGIN
  v_tt := public.ov2_cc_card_type(p_top);
  IF v_tt IN ('w', 'f') THEN
    RETURN 0;
  END IF;
  v_c := public.ov2_cc_card_color(p_top);
  IF v_c IS NULL THEN
    RETURN 0;
  END IF;
  RETURN v_c;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_cc_parity_bump_timer(
  p_parity jsonb,
  p_next_turn_seat int,
  p_reset_miss_seat int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_ps jsonb;
  v_deadline bigint;
  v_missed jsonb;
  v_k text;
BEGIN
  IF p_next_turn_seat IS NULL OR p_next_turn_seat NOT IN (0, 1, 2, 3) THEN
    RETURN coalesce(p_parity, '{}'::jsonb);
  END IF;
  v_ps := coalesce(p_parity, '{}'::jsonb);
  v_deadline := (extract(epoch from now()) * 1000)::bigint + 30000;
  v_ps := jsonb_set(v_ps, '{turn_deadline_at}', to_jsonb(v_deadline), true);
  v_ps := jsonb_set(v_ps, '{turn_deadline_seat}', to_jsonb(p_next_turn_seat), true);
  v_missed := coalesce(v_ps -> 'missed_turns', '{}'::jsonb);
  IF p_reset_miss_seat IS NOT NULL AND p_reset_miss_seat IN (0, 1, 2, 3) THEN
    v_k := p_reset_miss_seat::text;
    v_missed := jsonb_set(v_missed, ARRAY[v_k], to_jsonb(0), true);
  END IF;
  v_ps := jsonb_set(v_ps, '{missed_turns}', v_missed, true);
  RETURN v_ps;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_cc_compute_public_core(
  p_eng public.ov2_colorclash_engine,
  p_pub jsonb,
  p_active int[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_top jsonb;
  v_counts jsonb;
  v_s int;
  v_hand jsonb;
BEGIN
  v_top := public.ov2_cc_top_discard(p_eng.discard);
  v_counts := '{}'::jsonb;
  FOREACH v_s IN ARRAY coalesce(p_active, ARRAY[]::int[]) LOOP
    v_hand := public.ov2_cc_hand_get(p_eng, v_s);
    v_counts := jsonb_set(v_counts, ARRAY[v_s::text], to_jsonb(public.ov2_cc_jsonb_len(v_hand)), true);
  END LOOP;
  RETURN coalesce(p_pub, '{}'::jsonb)
    || jsonb_build_object(
      'topDiscard', coalesce(to_jsonb(v_top), 'null'::jsonb),
      'stockCount', to_jsonb(public.ov2_cc_jsonb_len(p_eng.stock)),
      'discardCount', to_jsonb(public.ov2_cc_jsonb_len(p_eng.discard)),
      'handCounts', v_counts
    );
END;
$$;

COMMIT;
