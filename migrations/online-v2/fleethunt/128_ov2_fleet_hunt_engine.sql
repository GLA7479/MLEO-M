-- Fleet Hunt: validation, random fleet, shot resolution, parity timers.
-- Apply after 127_ov2_fleet_hunt_schema.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_fh_parity_stake_mult(p_ps jsonb)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT greatest(1, least(16, coalesce(nullif((p_ps ->> 'stake_multiplier'), '')::int, 1)));
$$;

CREATE OR REPLACE FUNCTION public.ov2_fh_jsonb_len(p jsonb)
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

CREATE OR REPLACE FUNCTION public.ov2_fh_cell_key(p_r int, p_c int)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_r::text || ',' || p_c::text;
$$;

CREATE OR REPLACE FUNCTION public.ov2_fh_ship_is_straight_line(p_cells jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_n int;
  v_i int;
  v_r int;
  v_c int;
  v_rs int[] := ARRAY[]::int[];
  v_cs int[] := ARRAY[]::int[];
  v_minr int;
  v_maxr int;
  v_minc int;
  v_maxc int;
  v_dr int;
  v_dc int;
BEGIN
  v_n := public.ov2_fh_jsonb_len(p_cells);
  IF v_n < 1 THEN
    RETURN false;
  END IF;
  FOR v_i IN 0..(v_n - 1) LOOP
    v_r := (p_cells -> v_i ->> 'r')::int;
    v_c := (p_cells -> v_i ->> 'c')::int;
    IF v_r IS NULL OR v_c IS NULL OR v_r < 0 OR v_r > 9 OR v_c < 0 OR v_c > 9 THEN
      RETURN false;
    END IF;
    v_rs := v_rs || v_r;
    v_cs := v_cs || v_c;
  END LOOP;
  SELECT min(x), max(x) INTO v_minr, v_maxr FROM unnest(v_rs) AS t(x);
  SELECT min(x), max(x) INTO v_minc, v_maxc FROM unnest(v_cs) AS t(x);
  v_dr := v_maxr - v_minr;
  v_dc := v_maxc - v_minc;
  IF v_dr > 0 AND v_dc > 0 THEN
    RETURN false;
  END IF;
  IF v_dr = 0 AND v_dc = 0 THEN
    RETURN v_n = 1;
  END IF;
  IF v_n <> greatest(v_dr, v_dc) + 1 THEN
    RETURN false;
  END IF;
  IF v_dr > 0 THEN
    RETURN NOT EXISTS (
      SELECT 1 FROM generate_series(v_minr, v_maxr) AS g(x)
      WHERE NOT (x = ANY (v_rs))
    );
  END IF;
  RETURN NOT EXISTS (
    SELECT 1 FROM generate_series(v_minc, v_maxc) AS g(x)
    WHERE NOT (x = ANY (v_cs))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_fh_validate_fleet(p_ships jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_n int;
  v_i int;
  v_j int;
  v_cells jsonb;
  v_len int;
  v_seen jsonb := '{}'::jsonb;
  v_k text;
  v_lens int[] := ARRAY[]::int[];
  v_need int[] := ARRAY[5, 4, 3, 3, 2];
  v_sorted int[];
  v_need_sorted int[];
  v_ci int;
  v_cj int;
BEGIN
  IF p_ships IS NULL OR jsonb_typeof(p_ships) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_SHAPE', 'message', 'ships must be a JSON array');
  END IF;
  v_n := public.ov2_fh_jsonb_len(p_ships);
  IF v_n <> 5 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_COUNT', 'message', 'Exactly five ships required');
  END IF;
  FOR v_i IN 0..4 LOOP
    v_cells := p_ships -> v_i -> 'cells';
    IF v_cells IS NULL OR jsonb_typeof(v_cells) <> 'array' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'BAD_SHIP', 'message', 'Each ship needs a cells array');
    END IF;
    v_len := public.ov2_fh_jsonb_len(v_cells);
    IF v_len < 2 OR v_len > 5 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'BAD_LEN', 'message', 'Invalid ship length');
    END IF;
    IF NOT public.ov2_fh_ship_is_straight_line(v_cells) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'NOT_LINE', 'message', 'Ship cells must form one straight line');
    END IF;
    v_lens := v_lens || v_len;
    FOR v_j IN 0..(v_len - 1) LOOP
      v_ci := (v_cells -> v_j ->> 'r')::int;
      v_cj := (v_cells -> v_j ->> 'c')::int;
      v_k := public.ov2_fh_cell_key(v_ci, v_cj);
      IF coalesce((v_seen ->> v_k)::boolean, false) OR (v_seen ? v_k) THEN
        RETURN jsonb_build_object('ok', false, 'code', 'OVERLAP', 'message', 'Ships overlap');
      END IF;
      v_seen := jsonb_set(v_seen, ARRAY[v_k], 'true'::jsonb, true);
    END LOOP;
  END LOOP;
  SELECT array_agg(x ORDER BY x DESC) INTO v_sorted FROM unnest(v_lens) AS t(x);
  SELECT array_agg(x ORDER BY x DESC) INTO v_need_sorted FROM unnest(v_need) AS t(x);
  IF v_sorted IS DISTINCT FROM v_need_sorted THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_LENGTHS', 'message', 'Ship lengths must be 5,4,3,3,2');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_fh_try_place_ship(
  p_occ boolean[][],
  p_len int,
  p_horizontal boolean,
  p_r int,
  p_c int
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_i int;
  v_cells jsonb := '[]'::jsonb;
BEGIN
  IF p_horizontal THEN
    IF p_c + p_len > 10 THEN
      RETURN NULL;
    END IF;
    FOR v_i IN 0..(p_len - 1) LOOP
      IF p_occ[p_r + 1][p_c + v_i + 1] THEN
        RETURN NULL;
      END IF;
    END LOOP;
    FOR v_i IN 0..(p_len - 1) LOOP
      v_cells := v_cells || jsonb_build_array(jsonb_build_object('r', p_r, 'c', p_c + v_i));
    END LOOP;
  ELSE
    IF p_r + p_len > 10 THEN
      RETURN NULL;
    END IF;
    FOR v_i IN 0..(p_len - 1) LOOP
      IF p_occ[p_r + v_i + 1][p_c + 1] THEN
        RETURN NULL;
      END IF;
    END LOOP;
    FOR v_i IN 0..(p_len - 1) LOOP
      v_cells := v_cells || jsonb_build_array(jsonb_build_object('r', p_r + v_i, 'c', p_c));
    END LOOP;
  END IF;
  RETURN jsonb_build_object('cells', v_cells);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_fh_random_fleet()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_lens int[] := ARRAY[5, 4, 3, 3, 2];
  v_occ boolean[][];
  v_attempt int;
  v_ships jsonb;
  v_li int;
  v_len int;
  v_h bool;
  v_r int;
  v_c int;
  v_pl jsonb;
  v_i int;
  v_j int;
BEGIN
  FOR v_attempt IN 1..8000 LOOP
    v_ships := '[]'::jsonb;
    v_occ := array_fill(false, ARRAY[10, 10]);
    FOR v_li IN 1..5 LOOP
      v_len := v_lens[v_li];
      v_pl := NULL;
      FOR v_i IN 1..200 LOOP
        v_h := random() < 0.5;
        v_r := floor(random() * 10)::int;
        v_c := floor(random() * 10)::int;
        v_pl := public.ov2_fh_try_place_ship(v_occ, v_len, v_h, v_r, v_c);
        EXIT WHEN v_pl IS NOT NULL;
      END LOOP;
      IF v_pl IS NULL THEN
        v_ships := NULL;
        EXIT;
      END IF;
      v_ships := v_ships || jsonb_build_array(v_pl);
      FOR v_j IN 0..(public.ov2_fh_jsonb_len(v_pl -> 'cells') - 1) LOOP
        v_r := ((v_pl -> 'cells' -> v_j) ->> 'r')::int;
        v_c := ((v_pl -> 'cells' -> v_j) ->> 'c')::int;
        v_occ[v_r + 1][v_c + 1] := true;
      END LOOP;
    END LOOP;
    IF v_ships IS NOT NULL AND public.ov2_fh_jsonb_len(v_ships) = 5 THEN
      IF coalesce((public.ov2_fh_validate_fleet(v_ships) ->> 'ok')::boolean, false) THEN
        RETURN v_ships;
      END IF;
    END IF;
  END LOOP;
  RETURN '[]'::jsonb;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_fh_shot_exists(p_shots jsonb, p_r int, p_c int)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(coalesce(p_shots, '[]'::jsonb)) AS s(x)
    WHERE (x ->> 'r')::int = p_r AND (x ->> 'c')::int = p_c
  );
$$;

CREATE OR REPLACE FUNCTION public.ov2_fh_cell_has_hit(p_shots jsonb, p_r int, p_c int)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(coalesce(p_shots, '[]'::jsonb)) AS s(x)
    WHERE (x ->> 'r')::int = p_r
      AND (x ->> 'c')::int = p_c
      AND coalesce(x ->> 'k', '') IN ('hit', 'sunk')
  );
$$;

CREATE OR REPLACE FUNCTION public.ov2_fh_all_fleet_cells_hit(p_ships jsonb, p_shots jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(coalesce(p_ships, '[]'::jsonb)) AS sh(ship)
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(ship -> 'cells', '[]'::jsonb)) AS ce(cell)
    WHERE NOT public.ov2_fh_cell_has_hit(
      p_shots,
      (cell ->> 'r')::int,
      (cell ->> 'c')::int
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.ov2_fh_apply_shot(
  p_ships jsonb,
  p_shots jsonb,
  p_r int,
  p_c int
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_si int;
  v_cells jsonb;
  v_ci int;
  v_cj int;
  v_hit boolean := false;
  v_hit_ship int := NULL;
  v_all_hit boolean;
  v_shot jsonb;
  v_k int;
  v_ext jsonb;
  v_won boolean;
BEGIN
  IF p_r < 0 OR p_r > 9 OR p_c < 0 OR p_c > 9 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'OOB', 'message', 'Out of bounds');
  END IF;
  IF public.ov2_fh_shot_exists(p_shots, p_r, p_c) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'DUPLICATE', 'message', 'Already fired here');
  END IF;
  FOR v_si IN 0..(public.ov2_fh_jsonb_len(p_ships) - 1) LOOP
    v_cells := p_ships -> v_si -> 'cells';
    FOR v_k IN 0..(public.ov2_fh_jsonb_len(v_cells) - 1) LOOP
      v_ci := (v_cells -> v_k ->> 'r')::int;
      v_cj := (v_cells -> v_k ->> 'c')::int;
      IF v_ci = p_r AND v_cj = p_c THEN
        v_hit := true;
        v_hit_ship := v_si;
        EXIT;
      END IF;
    END LOOP;
    EXIT WHEN v_hit;
  END LOOP;
  IF NOT v_hit THEN
    v_shot := jsonb_build_object('r', p_r, 'c', p_c, 'k', 'miss');
    RETURN jsonb_build_object(
      'ok', true,
      'shot', v_shot,
      'all_opponent_sunk', false
    );
  END IF;
  v_shot := jsonb_build_object('r', p_r, 'c', p_c, 'k', 'hit');
  v_cells := p_ships -> v_hit_ship -> 'cells';
  v_all_hit := NOT EXISTS (
    SELECT 1
    FROM generate_series(0, public.ov2_fh_jsonb_len(v_cells) - 1) AS g(i)
    WHERE NOT (
      ((v_cells -> g.i ->> 'r')::int = p_r AND (v_cells -> g.i ->> 'c')::int = p_c)
      OR public.ov2_fh_cell_has_hit(p_shots, (v_cells -> g.i ->> 'r')::int, (v_cells -> g.i ->> 'c')::int)
    )
  );
  IF v_all_hit THEN
    v_shot := jsonb_build_object(
      'r', p_r,
      'c', p_c,
      'k', 'sunk',
      'sunkLen', public.ov2_fh_jsonb_len(v_cells)
    );
  END IF;
  v_ext := coalesce(p_shots, '[]'::jsonb) || jsonb_build_array(v_shot);
  v_won := public.ov2_fh_all_fleet_cells_hit(p_ships, v_ext);
  RETURN jsonb_build_object(
    'ok', true,
    'shot', v_shot,
    'all_opponent_sunk', coalesce(v_won, false)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_fh_bump_battle_timer(p_ps jsonb, p_next_seat int, p_reset_miss_seat int DEFAULT NULL)
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
  IF p_next_seat IS NULL OR p_next_seat NOT IN (0, 1) THEN
    RETURN coalesce(p_ps, '{}'::jsonb);
  END IF;
  v_ps := coalesce(p_ps, '{}'::jsonb);
  v_deadline := (extract(epoch from now()) * 1000)::bigint + 30000;
  v_ps := jsonb_set(v_ps, '{turn_deadline_at}', to_jsonb(v_deadline), true);
  v_ps := jsonb_set(v_ps, '{turn_deadline_seat}', to_jsonb(p_next_seat), true);
  v_missed := coalesce(v_ps -> 'missed_turns', jsonb_build_object('0', 0, '1', 0));
  IF p_reset_miss_seat IS NOT NULL AND p_reset_miss_seat IN (0, 1) THEN
    v_k := p_reset_miss_seat::text;
    v_missed := jsonb_set(v_missed, ARRAY[v_k], to_jsonb(0), true);
  END IF;
  v_ps := jsonb_set(v_ps, '{missed_turns}', v_missed, true);
  RETURN v_ps;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_fh_init_placement_deadlines(p_ps jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_ms bigint;
BEGIN
  v_ms := (extract(epoch from now()) * 1000)::bigint + 30000;
  RETURN coalesce(p_ps, '{}'::jsonb)
    || jsonb_build_object(
      'placement_dl', jsonb_build_object('0', v_ms, '1', v_ms),
      'placement_missed', jsonb_build_object('0', 0, '1', 0)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_fh_bump_placement_for_seat(p_ps jsonb, p_seat int)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_ps jsonb;
  v_ms bigint;
  v_k text;
  v_pm jsonb;
BEGIN
  IF p_seat NOT IN (0, 1) THEN
    RETURN p_ps;
  END IF;
  v_ps := coalesce(p_ps, '{}'::jsonb);
  v_ms := (extract(epoch from now()) * 1000)::bigint + 30000;
  v_k := p_seat::text;
  v_ps := jsonb_set(
    coalesce(v_ps, '{}'::jsonb),
    ARRAY['placement_dl', v_k],
    to_jsonb(v_ms),
    true
  );
  v_pm := coalesce(v_ps -> 'placement_missed', jsonb_build_object('0', 0, '1', 0));
  v_pm := jsonb_set(v_pm, ARRAY[v_k], to_jsonb(0), true);
  v_ps := jsonb_set(v_ps, '{placement_missed}', v_pm, true);
  RETURN v_ps;
END;
$$;

-- Classify placement strike counts after a timeout tick (both seats evaluated; no seat-order bias).
-- Returns: NULL = not terminal; -2 = both >=3 (mutual cancel / draw refund); 0/1 = winning seat.
CREATE OR REPLACE FUNCTION public.ov2_fh_classify_placement_terminal(p_m0 int, p_m1 int)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_m0 >= 3 AND p_m1 >= 3 THEN -2
    WHEN p_m0 >= 3 THEN 1
    WHEN p_m1 >= 3 THEN 0
    ELSE NULL
  END;
$$;

COMMIT;
