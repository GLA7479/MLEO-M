-- Tile Rush Duel: deterministic layout, Mahjong-style horizontal freedom, scoring helpers.
-- Apply after 132_ov2_tile_rush_duel_schema.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_trd_const_rows()
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT 6; $$;

CREATE OR REPLACE FUNCTION public.ov2_trd_const_cols()
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT 4; $$;

CREATE OR REPLACE FUNCTION public.ov2_trd_duel_duration_ms()
RETURNS bigint
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT 300000::bigint; $$;

CREATE OR REPLACE FUNCTION public.ov2_trd_inactivity_forfeit_ms()
RETURNS bigint
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT 120000::bigint; $$;

CREATE OR REPLACE FUNCTION public.ov2_trd_cell_occupied(p_tiles jsonb, p_r int, p_c int)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(coalesce(p_tiles, '[]'::jsonb)) AS t(x)
    WHERE (x ->> 'r')::int = p_r
      AND (x ->> 'c')::int = p_c
      AND coalesce((x ->> 'removed')::boolean, false) IS NOT TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.ov2_trd_tile_active_at(p_tiles jsonb, p_r int, p_c int)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(coalesce(p_tiles, '[]'::jsonb)) AS t(x)
    WHERE (x ->> 'r')::int = p_r
      AND (x ->> 'c')::int = p_c
      AND coalesce((x ->> 'removed')::boolean, false) IS NOT TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.ov2_trd_tile_free_at(p_tiles jsonb, p_cols int, p_r int, p_c int)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_lo boolean;
  v_ro boolean;
BEGIN
  IF NOT public.ov2_trd_tile_active_at(p_tiles, p_r, p_c) THEN
    RETURN false;
  END IF;
  v_lo := (p_c = 0) OR NOT public.ov2_trd_cell_occupied(p_tiles, p_r, p_c - 1);
  v_ro := (p_c = p_cols - 1) OR NOT public.ov2_trd_cell_occupied(p_tiles, p_r, p_c + 1);
  RETURN v_lo OR v_ro;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_trd_remaining_tile_count(p_tiles jsonb)
RETURNS int
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT count(*)::int
  FROM jsonb_array_elements(coalesce(p_tiles, '[]'::jsonb)) AS t(x)
  WHERE coalesce((x ->> 'removed')::boolean, false) IS NOT TRUE;
$$;

CREATE OR REPLACE FUNCTION public.ov2_trd_lcg_advance(p_state bigint)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT ((coalesce(p_state, 0)::bigint * 1103515245 + 12345) & 2147483647);
$$;

CREATE OR REPLACE FUNCTION public.ov2_trd_build_tiles_from_seed(p_seed_hex text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_rows int := public.ov2_trd_const_rows();
  v_cols int := public.ov2_trd_const_cols();
  v_n int := v_rows * v_cols;
  v_state bigint;
  v_kinds int[] := ARRAY[]::int[];
  v_i int;
  v_j int;
  v_tmp int;
  v_r int;
  v_c int;
  v_tiles jsonb := '[]'::jsonb;
  v_slot int;
BEGIN
  IF p_seed_hex IS NULL OR length(trim(p_seed_hex)) < 8 THEN
    RETURN '[]'::jsonb;
  END IF;
  BEGIN
    v_state := ('x' || substr(replace(lower(trim(p_seed_hex)), '-', ''), 1, 15))::bit(60)::bigint;
  EXCEPTION
    WHEN OTHERS THEN
      v_state := 1;
  END;
  IF v_state IS NULL OR v_state = 0 THEN
    v_state := 1;
  END IF;
  FOR v_i IN 0..11 LOOP
    v_kinds := array_append(v_kinds, v_i);
    v_kinds := array_append(v_kinds, v_i);
  END LOOP;
  FOR v_i IN REVERSE v_n..2 LOOP
    v_state := public.ov2_trd_lcg_advance(v_state);
    v_j := (v_state % v_i) + 1;
    v_tmp := v_kinds[v_i];
    v_kinds[v_i] := v_kinds[v_j];
    v_kinds[v_j] := v_tmp;
  END LOOP;
  FOR v_slot IN 0..(v_n - 1) LOOP
    v_r := v_slot / v_cols;
    v_c := v_slot % v_cols;
    v_tiles := v_tiles || jsonb_build_array(
      jsonb_build_object(
        'id', v_slot,
        'kind', v_kinds[v_slot + 1],
        'r', v_r,
        'c', v_c,
        'removed', false
      )
    );
  END LOOP;
  RETURN v_tiles;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_trd_layout_seed(p_session_id uuid, p_match_seq int)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT md5(coalesce(p_session_id::text, '') || ':' || coalesce(p_match_seq::text, '0'));
$$;

COMMIT;
