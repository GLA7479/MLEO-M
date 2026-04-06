-- MeldMatch engine: card encoding 0..51 (rank = c%13 ace low, suit = c/13), meld validation, parity timers.
-- Apply after 117_ov2_meldmatch_schema.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_mm_parity_stake_mult(p_parity jsonb)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_parity IS NULL OR jsonb_typeof(p_parity) <> 'object' THEN 1
    WHEN NOT (p_parity ? 'stake_multiplier') THEN 1
    ELSE greatest(1, least(16, coalesce(nullif((p_parity ->> 'stake_multiplier'), '')::int, 1)))
  END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_mm_parity_bump_timer(
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
BEGIN
  IF p_next_turn_seat IS NULL OR p_next_turn_seat NOT IN (0, 1) THEN
    RETURN COALESCE(p_parity, '{}'::jsonb);
  END IF;
  v_ps := COALESCE(p_parity, '{}'::jsonb);
  v_deadline := (extract(epoch from now()) * 1000)::bigint + 30000;
  v_ps := v_ps - 'pending_double';
  v_ps := jsonb_set(v_ps, '{turn_deadline_at}', to_jsonb(v_deadline), true);
  v_ps := jsonb_set(v_ps, '{turn_deadline_seat}', to_jsonb(p_next_turn_seat), true);
  v_missed := COALESCE(v_ps -> 'missed_turns', jsonb_build_object('0', 0, '1', 0));
  IF p_reset_miss_seat IS NOT NULL AND p_reset_miss_seat IN (0, 1) THEN
    v_missed := jsonb_set(v_missed, ARRAY[p_reset_miss_seat::text], to_jsonb(0), true);
  END IF;
  v_ps := jsonb_set(v_ps, '{missed_turns}', v_missed, true);
  RETURN v_ps;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_mm_card_rank(p_c int)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_c IS NULL OR p_c < 0 OR p_c > 51 THEN NULL::int
    ELSE p_c % 13
  END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_mm_card_suit(p_c int)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_c IS NULL OR p_c < 0 OR p_c > 51 THEN NULL::int
    ELSE p_c / 13
  END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_mm_card_points(p_c int)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE public.ov2_mm_card_rank(p_c)
    WHEN 0 THEN 1
    WHEN 9 THEN 10
    WHEN 10 THEN 10
    WHEN 11 THEN 10
    WHEN 12 THEN 10
    ELSE greatest(2, least(9, public.ov2_mm_card_rank(p_c) + 1))
  END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_mm_jsonb_len(p jsonb)
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

CREATE OR REPLACE FUNCTION public.ov2_mm_jsonb_last_int(p jsonb)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_n int;
BEGIN
  v_n := public.ov2_mm_jsonb_len(p);
  IF v_n <= 0 THEN
    RETURN NULL;
  END IF;
  RETURN (p ->> (v_n - 1))::int;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_mm_jsonb_pop_last(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_n int;
  v_i int;
  v_acc jsonb := '[]'::jsonb;
BEGIN
  v_n := public.ov2_mm_jsonb_len(p);
  IF v_n <= 1 THEN
    RETURN '[]'::jsonb;
  END IF;
  FOR v_i IN 0..(v_n - 2) LOOP
    v_acc := v_acc || (p -> v_i);
  END LOOP;
  RETURN v_acc;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_mm_jsonb_append_int(p jsonb, p_v int)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(p, '[]'::jsonb) || to_jsonb(p_v);
$$;

CREATE OR REPLACE FUNCTION public.ov2_mm_sorted_card_signature(p_cards jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_el jsonb;
  v_n int;
  v_i int;
  v_arr int[] := ARRAY[]::int[];
  v_x int;
BEGIN
  IF p_cards IS NULL OR jsonb_typeof(p_cards) <> 'array' THEN
    RETURN '';
  END IF;
  v_n := jsonb_array_length(p_cards);
  FOR v_i IN 0..(v_n - 1) LOOP
    v_el := p_cards -> v_i;
    IF v_el IS NULL OR jsonb_typeof(v_el) = 'null' THEN
      CONTINUE;
    END IF;
    v_x := (v_el #>> '{}')::int;
    IF v_x >= 0 AND v_x <= 51 THEN
      v_arr := array_append(v_arr, v_x);
    END IF;
  END LOOP;
  IF coalesce(array_length(v_arr, 1), 0) = 0 THEN
    RETURN '';
  END IF;
  SELECT string_agg(z::text, ',' ORDER BY z) INTO v_x FROM unnest(v_arr) AS z;
  RETURN coalesce(v_x::text, '');
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN '';
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_mm_is_valid_set(p_cards jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_n int;
  v_i int;
  v_c int;
  v_r int;
  v_s int;
  v_seen boolean[] := array_fill(false, ARRAY[4]);
BEGIN
  v_n := public.ov2_mm_jsonb_len(p_cards);
  IF v_n < 3 OR v_n > 4 THEN
    RETURN false;
  END IF;
  v_r := NULL;
  FOR v_i IN 0..(v_n - 1) LOOP
    v_c := (p_cards ->> v_i)::int;
    IF v_c < 0 OR v_c > 51 THEN
      RETURN false;
    END IF;
    IF v_r IS NULL THEN
      v_r := public.ov2_mm_card_rank(v_c);
    ELSIF public.ov2_mm_card_rank(v_c) IS DISTINCT FROM v_r THEN
      RETURN false;
    END IF;
    v_s := public.ov2_mm_card_suit(v_c);
    IF v_s < 0 OR v_s > 3 OR v_seen[v_s + 1] THEN
      RETURN false;
    END IF;
    v_seen[v_s + 1] := true;
  END LOOP;
  RETURN true;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_mm_is_valid_run(p_cards jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_n int;
  v_i int;
  v_c int;
  v_s int;
  v_rs int[] := ARRAY[]::int[];
  v_prv int;
  v_cur int;
BEGIN
  v_n := public.ov2_mm_jsonb_len(p_cards);
  IF v_n < 3 THEN
    RETURN false;
  END IF;
  v_s := NULL;
  FOR v_i IN 0..(v_n - 1) LOOP
    v_c := (p_cards ->> v_i)::int;
    IF v_c < 0 OR v_c > 51 THEN
      RETURN false;
    END IF;
    IF v_s IS NULL THEN
      v_s := public.ov2_mm_card_suit(v_c);
    ELSIF public.ov2_mm_card_suit(v_c) IS DISTINCT FROM v_s THEN
      RETURN false;
    END IF;
    v_rs := array_append(v_rs, public.ov2_mm_card_rank(v_c));
  END LOOP;
  SELECT array_agg(x ORDER BY x) INTO v_rs FROM unnest(v_rs) AS t(x);
  IF v_rs IS NULL OR array_length(v_rs, 1) IS DISTINCT FROM v_n THEN
    RETURN false;
  END IF;
  v_prv := v_rs[1];
  FOR v_i IN 2..v_n LOOP
    v_cur := v_rs[v_i];
    IF v_cur IS DISTINCT FROM v_prv + 1 THEN
      RETURN false;
    END IF;
    v_prv := v_cur;
  END LOOP;
  RETURN true;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_mm_is_valid_meld(p_cards jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT public.ov2_mm_is_valid_set(p_cards) OR public.ov2_mm_is_valid_run(p_cards);
$$;

CREATE OR REPLACE FUNCTION public.ov2_mm_deadwood_points_sum(p_deadwood jsonb)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_n int;
  v_i int;
  v_c int;
  v_sum int := 0;
BEGIN
  v_n := public.ov2_mm_jsonb_len(p_deadwood);
  FOR v_i IN 0..(v_n - 1) LOOP
    v_c := (p_deadwood ->> v_i)::int;
    v_sum := v_sum + public.ov2_mm_card_points(v_c);
  END LOOP;
  RETURN v_sum;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN 9999;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_mm_flatten_melds_signature(p_melds jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_m jsonb;
  v_acc jsonb := '[]'::jsonb;
  v_j int;
  v_n int;
BEGIN
  IF p_melds IS NULL OR jsonb_typeof(p_melds) <> 'array' THEN
    RETURN public.ov2_mm_sorted_card_signature('[]'::jsonb);
  END IF;
  v_n := jsonb_array_length(p_melds);
  FOR v_j IN 0..(v_n - 1) LOOP
    v_m := p_melds -> v_j;
    IF v_m IS NULL OR jsonb_typeof(v_m) <> 'array' THEN
      CONTINUE;
    END IF;
    v_acc := v_acc || v_m;
  END LOOP;
  RETURN public.ov2_mm_sorted_card_signature(v_acc);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_mm_validate_finish_declaration(
  p_hand jsonb,
  p_melds jsonb,
  p_deadwood jsonb,
  p_discard int,
  p_kind text
)
RETURNS TABLE(ok boolean, err text, closer_deadwood_pts int)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_sig_hand text;
  v_sig_decl text;
  v_n_meld int;
  v_j int;
  v_m jsonb;
  v_melds jsonb;
  v_k text;
  v_dw int;
  v_all jsonb;
BEGIN
  ok := false;
  err := 'INVALID';
  closer_deadwood_pts := 0;
  v_k := lower(trim(coalesce(p_kind, '')));
  IF v_k NOT IN ('gin', 'knock') THEN
    err := 'BAD_KIND';
    RETURN NEXT;
    RETURN;
  END IF;
  IF p_discard IS NULL OR p_discard < 0 OR p_discard > 51 THEN
    err := 'BAD_DISCARD';
    RETURN NEXT;
    RETURN;
  END IF;
  IF public.ov2_mm_jsonb_len(p_hand) IS DISTINCT FROM 11 THEN
    err := 'HAND_NOT_11';
    RETURN NEXT;
    RETURN;
  END IF;
  v_melds := CASE
    WHEN p_melds IS NULL OR jsonb_typeof(p_melds) <> 'array' THEN '[]'::jsonb
    ELSE p_melds
  END;
  v_sig_hand := public.ov2_mm_sorted_card_signature(p_hand);
  v_all := '[]'::jsonb;
  IF jsonb_typeof(v_melds) = 'array' THEN
    v_n_meld := jsonb_array_length(v_melds);
    FOR v_j IN 0..(v_n_meld - 1) LOOP
      v_m := v_melds -> v_j;
      IF v_m IS NOT NULL AND jsonb_typeof(v_m) = 'array' THEN
        v_all := v_all || v_m;
      END IF;
    END LOOP;
  END IF;
  IF p_deadwood IS NOT NULL AND jsonb_typeof(p_deadwood) = 'array' THEN
    v_all := v_all || p_deadwood;
  END IF;
  v_all := v_all || to_jsonb(p_discard);
  IF public.ov2_mm_sorted_card_signature(v_all) IS DISTINCT FROM v_sig_hand THEN
    err := 'CARDS_MISMATCH';
    RETURN NEXT;
    RETURN;
  END IF;
  IF jsonb_typeof(v_melds) = 'array' THEN
    v_n_meld := jsonb_array_length(v_melds);
    FOR v_j IN 0..(v_n_meld - 1) LOOP
      v_m := v_melds -> v_j;
      IF v_m IS NULL OR jsonb_typeof(v_m) <> 'array' THEN
        err := 'BAD_MELD_SHAPE';
        RETURN NEXT;
        RETURN;
      END IF;
      IF public.ov2_mm_jsonb_len(v_m) < 3 OR NOT public.ov2_mm_is_valid_meld(v_m) THEN
        err := 'INVALID_MELD';
        RETURN NEXT;
        RETURN;
      END IF;
    END LOOP;
  END IF;
  v_dw := public.ov2_mm_deadwood_points_sum(p_deadwood);
  IF v_k = 'gin' THEN
    IF public.ov2_mm_jsonb_len(p_deadwood) > 0 THEN
      err := 'GIN_REQUIRES_NO_DEADWOOD';
      RETURN NEXT;
      RETURN;
    END IF;
  ELSE
    IF v_dw > 10 THEN
      err := 'KNOCK_DEADWOOD_TOO_HIGH';
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;
  closer_deadwood_pts := v_dw;
  ok := true;
  err := NULL;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_mm_layoff_attachment_valid(p_meld jsonb, p_card int)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_try jsonb;
BEGIN
  IF p_card IS NULL OR p_card < 0 OR p_card > 51 THEN
    RETURN false;
  END IF;
  IF public.ov2_mm_is_valid_set(p_meld) THEN
    v_try := p_meld || to_jsonb(p_card);
    RETURN public.ov2_mm_is_valid_set(v_try);
  END IF;
  IF public.ov2_mm_is_valid_run(p_meld) THEN
    v_try := p_meld || to_jsonb(p_card);
    RETURN public.ov2_mm_is_valid_run(v_try);
  END IF;
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_mm_parity_stake_mult(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_mm_parity_stake_mult(jsonb) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_mm_parity_bump_timer(jsonb, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_mm_parity_bump_timer(jsonb, integer, integer) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_mm_validate_finish_declaration(jsonb, jsonb, jsonb, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_mm_validate_finish_declaration(jsonb, jsonb, jsonb, integer, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_mm_layoff_attachment_valid(jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_mm_layoff_attachment_valid(jsonb, integer) TO anon, authenticated, service_role;

COMMIT;
