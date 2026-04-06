-- OV2 Dominoes engine helpers (Draw, double-six). Apply after 097_ov2_dominoes_schema.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_dom_tile_norm(p_a int, p_b int)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object('a', least(p_a, p_b), 'b', greatest(p_a, p_b));
$$;

CREATE OR REPLACE FUNCTION public.ov2_dom_full_deck_jsonb()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT coalesce(
    jsonb_agg(public.ov2_dom_tile_norm(a, b) ORDER BY a, b),
    '[]'::jsonb
  )
  FROM generate_series(0, 6) AS a
  CROSS JOIN generate_series(0, 6) AS b
  WHERE b >= a;
$$;

CREATE OR REPLACE FUNCTION public.ov2_dom_shuffle_deck(p_deck jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(
    jsonb_agg(elem ORDER BY random()),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(COALESCE(p_deck, '[]'::jsonb)) AS elem;
$$;

CREATE OR REPLACE FUNCTION public.ov2_dom_parity_stake_mult(p_parity jsonb)
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

CREATE OR REPLACE FUNCTION public.ov2_dom_line_len(p_line jsonb)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_line IS NULL OR jsonb_typeof(p_line) <> 'array' THEN 0
    ELSE jsonb_array_length(p_line)
  END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_dom_line_opens(p_line jsonb, OUT o_left int, OUT o_right int)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_n int;
  v_first jsonb;
  v_last jsonb;
BEGIN
  o_left := NULL;
  o_right := NULL;
  v_n := public.ov2_dom_line_len(p_line);
  IF v_n <= 0 THEN
    RETURN;
  END IF;
  v_first := p_line -> 0;
  v_last := p_line -> (v_n - 1);
  BEGIN
    o_left := (v_first ->> 'lo')::int;
    o_right := (v_last ->> 'hi')::int;
  EXCEPTION
    WHEN invalid_text_representation THEN
      o_left := NULL;
      o_right := NULL;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_dom_tile_pip_sum(p_tile jsonb)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_a int;
  v_b int;
BEGIN
  IF p_tile IS NULL OR jsonb_typeof(p_tile) <> 'object' THEN
    RETURN 0;
  END IF;
  v_a := (p_tile ->> 'a')::int;
  v_b := (p_tile ->> 'b')::int;
  RETURN coalesce(v_a, 0) + coalesce(v_b, 0);
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_dom_hand_total_pips(p_hand jsonb)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_i int;
  v_n int;
  v_t int := 0;
BEGIN
  IF p_hand IS NULL OR jsonb_typeof(p_hand) <> 'array' THEN
    RETURN 0;
  END IF;
  v_n := jsonb_array_length(p_hand);
  FOR v_i IN 0..(v_n - 1) LOOP
    v_t := v_t + public.ov2_dom_tile_pip_sum(p_hand -> v_i);
  END LOOP;
  RETURN v_t;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_dom_hand_has_legal_on_line(p_line jsonb, p_hand jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_n int;
  v_i int;
  v_tile jsonb;
  v_a int;
  v_b int;
  v_ol int;
  v_or int;
  v_ln int;
BEGIN
  IF p_hand IS NULL OR jsonb_typeof(p_hand) <> 'array' OR jsonb_array_length(p_hand) = 0 THEN
    RETURN false;
  END IF;
  v_ln := public.ov2_dom_line_len(p_line);
  IF v_ln = 0 THEN
    RETURN true;
  END IF;
  SELECT o_left, o_right INTO v_ol, v_or FROM public.ov2_dom_line_opens(p_line);
  IF v_ol IS NULL OR v_or IS NULL THEN
    RETURN false;
  END IF;
  v_n := jsonb_array_length(p_hand);
  FOR v_i IN 0..(v_n - 1) LOOP
    v_tile := p_hand -> v_i;
    v_a := (v_tile ->> 'a')::int;
    v_b := (v_tile ->> 'b')::int;
    IF v_a = v_ol OR v_b = v_ol OR v_a = v_or OR v_b = v_or THEN
      RETURN true;
    END IF;
  END LOOP;
  RETURN false;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_dom_remove_hand_index(p_hand jsonb, p_idx int)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_n int;
  v_out jsonb := '[]'::jsonb;
  v_i int;
BEGIN
  IF p_hand IS NULL OR jsonb_typeof(p_hand) <> 'array' THEN
    RETURN '[]'::jsonb;
  END IF;
  v_n := jsonb_array_length(p_hand);
  IF p_idx < 0 OR p_idx >= v_n THEN
    RETURN p_hand;
  END IF;
  FOR v_i IN 0..(v_n - 1) LOOP
    IF v_i IS DISTINCT FROM p_idx THEN
      v_out := v_out || jsonb_build_array(p_hand -> v_i);
    END IF;
  END LOOP;
  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_dom_apply_tile_play(
  p_line jsonb,
  p_tile jsonb,
  p_side text,
  OUT ok boolean,
  OUT new_line jsonb,
  OUT err text
)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_side text := lower(trim(coalesce(p_side, '')));
  v_ln int;
  v_a int;
  v_b int;
  v_ol int;
  v_or int;
  v_seg jsonb;
  v_rest jsonb;
  v_i int;
  v_n int;
BEGIN
  ok := false;
  new_line := coalesce(p_line, '[]'::jsonb);
  err := NULL;
  IF p_tile IS NULL OR jsonb_typeof(p_tile) <> 'object' THEN
    err := 'BAD_TILE';
    RETURN;
  END IF;
  v_a := (p_tile ->> 'a')::int;
  v_b := (p_tile ->> 'b')::int;
  v_ln := public.ov2_dom_line_len(p_line);

  IF v_ln = 0 THEN
    IF v_side IS NOT NULL AND v_side <> '' AND v_side <> 'any' THEN
      err := 'BAD_SIDE_OPENING';
      RETURN;
    END IF;
    v_seg := jsonb_build_object('lo', v_a, 'hi', v_b);
    new_line := jsonb_build_array(v_seg);
    ok := true;
    RETURN;
  END IF;

  SELECT o_left, o_right INTO v_ol, v_or FROM public.ov2_dom_line_opens(p_line);
  IF v_ol IS NULL OR v_or IS NULL THEN
    err := 'BAD_LINE';
    RETURN;
  END IF;

  IF v_side = 'left' THEN
    IF v_a = v_ol THEN
      v_seg := jsonb_build_object('lo', v_b, 'hi', v_a);
    ELSIF v_b = v_ol THEN
      v_seg := jsonb_build_object('lo', v_a, 'hi', v_b);
    ELSE
      err := 'NO_MATCH_LEFT';
      RETURN;
    END IF;
    new_line := jsonb_build_array(v_seg);
    v_n := jsonb_array_length(p_line);
    FOR v_i IN 0..(v_n - 1) LOOP
      new_line := new_line || jsonb_build_array(p_line -> v_i);
    END LOOP;
    ok := true;
    RETURN;
  END IF;

  IF v_side = 'right' THEN
    IF v_a = v_or THEN
      v_seg := jsonb_build_object('lo', v_a, 'hi', v_b);
    ELSIF v_b = v_or THEN
      v_seg := jsonb_build_object('lo', v_b, 'hi', v_a);
    ELSE
      err := 'NO_MATCH_RIGHT';
      RETURN;
    END IF;
    new_line := p_line || jsonb_build_array(v_seg);
    ok := true;
    RETURN;
  END IF;

  err := 'BAD_SIDE';
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_dominoes_parity_bump_timer(
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

REVOKE ALL ON FUNCTION public.ov2_dom_tile_norm(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_dom_tile_norm(integer, integer) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_dom_full_deck_jsonb() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_dom_full_deck_jsonb() TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_dom_shuffle_deck(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_dom_shuffle_deck(jsonb) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_dom_parity_stake_mult(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_dom_parity_stake_mult(jsonb) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_dom_line_len(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_dom_line_len(jsonb) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_dom_line_opens(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_dom_line_opens(jsonb) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_dom_tile_pip_sum(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_dom_tile_pip_sum(jsonb) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_dom_hand_total_pips(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_dom_hand_total_pips(jsonb) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_dom_hand_has_legal_on_line(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_dom_hand_has_legal_on_line(jsonb, jsonb) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_dom_remove_hand_index(jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_dom_remove_hand_index(jsonb, integer) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_dom_apply_tile_play(jsonb, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_dom_apply_tile_play(jsonb, jsonb, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_dominoes_parity_bump_timer(jsonb, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_dominoes_parity_bump_timer(jsonb, integer, integer) TO anon, authenticated, service_role;

COMMIT;
