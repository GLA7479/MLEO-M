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

-- True if there exists at least one removable matching pair (same kind, two distinct active cells, both horizontally free).
CREATE OR REPLACE FUNCTION public.ov2_trd_has_any_legal_pair(p_tiles jsonb, p_cols int)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  t1 jsonb;
  t2 jsonb;
  r1 int;
  c1 int;
  k1 int;
  r2 int;
  c2 int;
  k2 int;
BEGIN
  FOR t1 IN
    SELECT x
    FROM jsonb_array_elements(coalesce(p_tiles, '[]'::jsonb)) AS q(x)
    WHERE coalesce((x ->> 'removed')::boolean, false) IS NOT TRUE
  LOOP
    r1 := (t1 ->> 'r')::int;
    c1 := (t1 ->> 'c')::int;
    k1 := (t1 ->> 'kind')::int;
    FOR t2 IN
      SELECT x
      FROM jsonb_array_elements(coalesce(p_tiles, '[]'::jsonb)) AS q(x)
      WHERE coalesce((x ->> 'removed')::boolean, false) IS NOT TRUE
    LOOP
      r2 := (t2 ->> 'r')::int;
      c2 := (t2 ->> 'c')::int;
      k2 := (t2 ->> 'kind')::int;
      IF r1 = r2 AND c1 = c2 THEN
        CONTINUE;
      END IF;
      IF k1 IS DISTINCT FROM k2 THEN
        CONTINUE;
      END IF;
      IF public.ov2_trd_tile_free_at(p_tiles, p_cols, r1, c1)
         AND public.ov2_trd_tile_free_at(p_tiles, p_cols, r2, c2) THEN
        RETURN true;
      END IF;
    END LOOP;
  END LOOP;
  RETURN false;
END;
$$;

-- Reassign active (non-removed) tiles to shuffled grid slots until a legal pair exists, or return original after max tries.
CREATE OR REPLACE FUNCTION public.ov2_trd_repack_remaining_tiles_valid(
  p_tiles jsonb,
  p_cols int,
  p_rows int,
  p_entropy text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_active jsonb[] := ARRAY[]::jsonb[];
  v_n int;
  v_slots int[];
  v_state bigint;
  v_try int;
  v_i int;
  v_j int;
  v_tmp int;
  v_k int;
  v_slot int;
  v_r int;
  v_c int;
  v_elem jsonb;
  v_tid int;
  v_tid_text text;
  v_pos jsonb := '{}'::jsonb;
  v_rc jsonb;
  v_out jsonb := '[]'::jsonb;
  v_total int;
BEGIN
  SELECT coalesce(array_agg(x ORDER BY (x ->> 'id')::int), ARRAY[]::jsonb[])
  INTO v_active
  FROM jsonb_array_elements(coalesce(p_tiles, '[]'::jsonb)) AS t(x)
  WHERE coalesce((x ->> 'removed')::boolean, false) IS NOT TRUE;

  v_n := coalesce(array_length(v_active, 1), 0);
  IF v_n = 0 THEN
    RETURN p_tiles;
  END IF;

  v_total := p_rows * p_cols;

  BEGIN
    v_state := ('x' || substr(replace(md5(coalesce(p_entropy, '') || ':' || v_total::text, '-', ''), 1, 15))::bit(60)::bigint;
  EXCEPTION
    WHEN OTHERS THEN
      v_state := 1;
  END;
  IF v_state IS NULL OR v_state = 0 THEN
    v_state := 1;
  END IF;

  FOR v_try IN 0..250 LOOP
    FOR v_k IN 1..(1 + v_try * 3) LOOP
      v_state := public.ov2_trd_lcg_advance(v_state);
    END LOOP;

    SELECT coalesce(array_agg(x ORDER BY (x ->> 'id')::int), ARRAY[]::jsonb[])
    INTO v_active
    FROM jsonb_array_elements(coalesce(p_tiles, '[]'::jsonb)) AS t(x)
    WHERE coalesce((x ->> 'removed')::boolean, false) IS NOT TRUE;

    SELECT coalesce(array_agg(s ORDER BY s), ARRAY[]::int[])
    INTO v_slots
    FROM generate_series(0, v_total - 1) AS g(s);

    -- Shuffle active tiles
    FOR v_i IN REVERSE v_n..2 LOOP
      v_state := public.ov2_trd_lcg_advance(v_state);
      v_j := (v_state % v_i) + 1;
      v_tmp := v_active[v_i];
      v_active[v_i] := v_active[v_j];
      v_active[v_j] := v_tmp;
    END LOOP;

    -- Shuffle slot indices
    FOR v_i IN REVERSE v_total..2 LOOP
      v_state := public.ov2_trd_lcg_advance(v_state);
      v_j := (v_state % v_i) + 1;
      v_tmp := v_slots[v_i];
      v_slots[v_i] := v_slots[v_j];
      v_slots[v_j] := v_tmp;
    END LOOP;

    v_pos := '{}'::jsonb;
    FOR v_i IN 1..v_n LOOP
      v_tid := (v_active[v_i] ->> 'id')::int;
      v_tid_text := v_tid::text;
      v_slot := v_slots[v_i];
      v_r := v_slot / p_cols;
      v_c := v_slot % p_cols;
      v_pos := v_pos || jsonb_build_object(v_tid_text, jsonb_build_object('r', v_r, 'c', v_c));
    END LOOP;

    v_out := '[]'::jsonb;
    FOR v_elem IN SELECT x FROM jsonb_array_elements(coalesce(p_tiles, '[]'::jsonb)) AS t(x) ORDER BY (x ->> 'id')::int
    LOOP
      IF coalesce((v_elem ->> 'removed')::boolean, false) THEN
        v_out := v_out || jsonb_build_array(v_elem);
      ELSE
        v_tid_text := (v_elem ->> 'id')::text;
        v_rc := v_pos -> v_tid_text;
        IF v_rc IS NULL OR jsonb_typeof(v_rc) <> 'object' THEN
          RETURN p_tiles;
        END IF;
        v_r := (v_rc ->> 'r')::int;
        v_c := (v_rc ->> 'c')::int;
        v_out := v_out
          || jsonb_build_array(
            ((v_elem - 'r'::text) - 'c'::text)
              || jsonb_build_object('r', v_r, 'c', v_c)
          );
      END IF;
    END LOOP;

    IF public.ov2_trd_has_any_legal_pair(v_out, p_cols) THEN
      RETURN v_out;
    END IF;
  END LOOP;

  RETURN p_tiles;
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
