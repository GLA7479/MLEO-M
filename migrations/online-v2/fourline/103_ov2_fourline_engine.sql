-- OV2 FourLine engine helpers. Apply after 102_ov2_fourline_schema.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_fl_empty_board()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT jsonb_agg(to_jsonb(NULL::int) ORDER BY g) FROM generate_series(0, 41) AS g),
    '[]'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION public.ov2_fl_parity_stake_mult(p_parity jsonb)
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

CREATE OR REPLACE FUNCTION public.ov2_fl_cell_value(p_cells jsonb, p_idx int)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_el jsonb;
  v_n int;
BEGIN
  IF p_cells IS NULL OR jsonb_typeof(p_cells) <> 'array' THEN
    RETURN NULL;
  END IF;
  v_n := jsonb_array_length(p_cells);
  IF p_idx < 0 OR p_idx >= v_n OR p_idx >= 42 THEN
    RETURN NULL;
  END IF;
  v_el := p_cells -> p_idx;
  IF v_el IS NULL OR jsonb_typeof(v_el) = 'null' THEN
    RETURN NULL;
  END IF;
  RETURN (v_el #>> '{}')::int;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_fl_board_full(p_cells jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_i int;
BEGIN
  IF p_cells IS NULL OR jsonb_typeof(p_cells) <> 'array' OR jsonb_array_length(p_cells) < 42 THEN
    RETURN false;
  END IF;
  FOR v_i IN 0..41 LOOP
    IF public.ov2_fl_cell_value(p_cells, v_i) IS NULL THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_fl_count_dir(
  p_cells jsonb,
  p_r int,
  p_c int,
  p_dr int,
  p_dc int,
  p_seat int
)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_n int := 0;
  v_rr int;
  v_cc int;
  v_idx int;
  v_v int;
BEGIN
  v_rr := p_r + p_dr;
  v_cc := p_c + p_dc;
  WHILE v_rr >= 0 AND v_rr <= 5 AND v_cc >= 0 AND v_cc <= 6 LOOP
    v_idx := v_rr * 7 + v_cc;
    v_v := public.ov2_fl_cell_value(p_cells, v_idx);
    IF v_v IS NULL OR v_v IS DISTINCT FROM p_seat THEN
      EXIT;
    END IF;
    v_n := v_n + 1;
    v_rr := v_rr + p_dr;
    v_cc := v_cc + p_dc;
  END LOOP;
  RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_fl_has_four_connected(
  p_cells jsonb,
  p_r int,
  p_c int,
  p_seat int
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_t int;
BEGIN
  v_t := 1
    + public.ov2_fl_count_dir(p_cells, p_r, p_c, 0, 1, p_seat)
    + public.ov2_fl_count_dir(p_cells, p_r, p_c, 0, -1, p_seat);
  IF v_t >= 4 THEN
    RETURN true;
  END IF;
  v_t := 1
    + public.ov2_fl_count_dir(p_cells, p_r, p_c, 1, 0, p_seat)
    + public.ov2_fl_count_dir(p_cells, p_r, p_c, -1, 0, p_seat);
  IF v_t >= 4 THEN
    RETURN true;
  END IF;
  v_t := 1
    + public.ov2_fl_count_dir(p_cells, p_r, p_c, 1, 1, p_seat)
    + public.ov2_fl_count_dir(p_cells, p_r, p_c, -1, -1, p_seat);
  IF v_t >= 4 THEN
    RETURN true;
  END IF;
  v_t := 1
    + public.ov2_fl_count_dir(p_cells, p_r, p_c, 1, -1, p_seat)
    + public.ov2_fl_count_dir(p_cells, p_r, p_c, -1, 1, p_seat);
  IF v_t >= 4 THEN
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_fl_apply_drop(
  p_cells jsonb,
  p_col int,
  p_seat int,
  OUT ok boolean,
  OUT new_cells jsonb,
  OUT placed_row int,
  OUT err text
)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_r int;
  v_idx int;
  v_path text[];
BEGIN
  ok := false;
  new_cells := COALESCE(p_cells, public.ov2_fl_empty_board());
  placed_row := NULL;
  err := NULL;
  IF p_col < 0 OR p_col > 6 THEN
    err := 'BAD_COLUMN';
    RETURN;
  END IF;
  IF p_seat IS NULL OR p_seat NOT IN (0, 1) THEN
    err := 'BAD_SEAT';
    RETURN;
  END IF;
  IF new_cells IS NULL OR jsonb_typeof(new_cells) <> 'array' OR jsonb_array_length(new_cells) < 42 THEN
    new_cells := public.ov2_fl_empty_board();
  END IF;
  v_r := 5;
  WHILE v_r >= 0 LOOP
    v_idx := v_r * 7 + p_col;
    IF public.ov2_fl_cell_value(new_cells, v_idx) IS NULL THEN
      v_path := ARRAY[v_idx::text];
      new_cells := jsonb_set(new_cells, v_path, to_jsonb(p_seat), true);
      placed_row := v_r;
      ok := true;
      RETURN;
    END IF;
    v_r := v_r - 1;
  END LOOP;
  err := 'COLUMN_FULL';
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_fourline_parity_bump_timer(
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

REVOKE ALL ON FUNCTION public.ov2_fl_empty_board() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_fl_empty_board() TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_fl_parity_stake_mult(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_fl_parity_stake_mult(jsonb) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_fl_cell_value(jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_fl_cell_value(jsonb, integer) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_fl_board_full(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_fl_board_full(jsonb) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_fl_count_dir(jsonb, integer, integer, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_fl_count_dir(jsonb, integer, integer, integer, integer, integer) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_fl_has_four_connected(jsonb, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_fl_has_four_connected(jsonb, integer, integer, integer) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_fl_apply_drop(jsonb, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_fl_apply_drop(jsonb, integer, integer) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_fourline_parity_bump_timer(jsonb, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_fourline_parity_bump_timer(jsonb, integer, integer) TO anon, authenticated, service_role;

COMMIT;
