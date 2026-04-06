-- OV2 FlipGrid engine: legality, flips, auto-pass turn resolution. Apply after 112_ov2_flipgrid_schema.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_fg_empty_cells()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT jsonb_agg(to_jsonb(NULL::int) ORDER BY g) FROM generate_series(0, 63) AS g),
    '[]'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION public.ov2_fg_initial_cells()
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_b jsonb;
  v_path text[];
BEGIN
  v_b := public.ov2_fg_empty_cells();
  -- Standard center four: (3,3)=0 (3,4)=1 (4,3)=1 (4,4)=0  row-major idx = r*8+c
  v_path := ARRAY[(3 * 8 + 3)::text];
  v_b := jsonb_set(v_b, v_path, to_jsonb(0), true);
  v_path := ARRAY[(3 * 8 + 4)::text];
  v_b := jsonb_set(v_b, v_path, to_jsonb(1), true);
  v_path := ARRAY[(4 * 8 + 3)::text];
  v_b := jsonb_set(v_b, v_path, to_jsonb(1), true);
  v_path := ARRAY[(4 * 8 + 4)::text];
  v_b := jsonb_set(v_b, v_path, to_jsonb(0), true);
  RETURN v_b;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_fg_parity_stake_mult(p_parity jsonb)
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

CREATE OR REPLACE FUNCTION public.ov2_fg_cell_value(p_cells jsonb, p_idx int)
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
  IF p_idx < 0 OR p_idx >= v_n OR p_idx >= 64 THEN
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

CREATE OR REPLACE FUNCTION public.ov2_fg_disc_count(p_cells jsonb, p_seat int)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_i int;
  v_n int;
  v_c int := 0;
BEGIN
  IF p_cells IS NULL OR jsonb_typeof(p_cells) <> 'array' THEN
    RETURN 0;
  END IF;
  v_n := least(64, jsonb_array_length(p_cells));
  FOR v_i IN 0..(v_n - 1) LOOP
    IF public.ov2_fg_cell_value(p_cells, v_i) IS NOT DISTINCT FROM p_seat THEN
      v_c := v_c + 1;
    END IF;
  END LOOP;
  RETURN v_c;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_fg_line_flip_indices(
  p_cells jsonb,
  p_r int,
  p_c int,
  p_seat int,
  p_dr int,
  p_dc int
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_opp int;
  v_rr int;
  v_cc int;
  v_idx int;
  v_v int;
  v_acc jsonb := '[]'::jsonb;
BEGIN
  IF p_seat IS NULL OR p_seat NOT IN (0, 1) THEN
    RETURN '[]'::jsonb;
  END IF;
  v_opp := 1 - p_seat;
  v_rr := p_r + p_dr;
  v_cc := p_c + p_dc;
  WHILE v_rr >= 0 AND v_rr <= 7 AND v_cc >= 0 AND v_cc <= 7 LOOP
    v_idx := v_rr * 8 + v_cc;
    v_v := public.ov2_fg_cell_value(p_cells, v_idx);
    IF v_v IS NULL THEN
      RETURN '[]'::jsonb;
    END IF;
    IF v_v IS NOT DISTINCT FROM v_opp THEN
      v_acc := v_acc || to_jsonb(v_idx);
      v_rr := v_rr + p_dr;
      v_cc := v_cc + p_dc;
      CONTINUE;
    END IF;
    IF v_v IS NOT DISTINCT FROM p_seat THEN
      RETURN v_acc;
    END IF;
    RETURN '[]'::jsonb;
  END LOOP;
  RETURN '[]'::jsonb;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_fg_all_flip_indices(
  p_cells jsonb,
  p_r int,
  p_c int,
  p_seat int
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_dr int;
  v_dc int;
  v_part jsonb;
  v_i int;
  v_n int;
  v_idx int;
  v_seen boolean[] := array_fill(false, ARRAY[64]);
  v_out jsonb := '[]'::jsonb;
BEGIN
  IF public.ov2_fg_cell_value(p_cells, p_r * 8 + p_c) IS NOT NULL THEN
    RETURN '[]'::jsonb;
  END IF;
  FOR v_dr, v_dc IN
    SELECT x, y
    FROM (VALUES (-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1)) AS t(x,y)
  LOOP
    v_part := public.ov2_fg_line_flip_indices(p_cells, p_r, p_c, p_seat, v_dr, v_dc);
    IF jsonb_typeof(v_part) = 'array' THEN
      v_n := jsonb_array_length(v_part);
      FOR v_i IN 0..(v_n - 1) LOOP
        v_idx := (v_part ->> v_i)::int;
        IF v_idx >= 0 AND v_idx < 64 AND NOT v_seen[v_idx + 1] THEN
          v_seen[v_idx + 1] := true;
          v_out := v_out || to_jsonb(v_idx);
        END IF;
      END LOOP;
    END IF;
  END LOOP;
  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_fg_has_legal_move(p_cells jsonb, p_seat int)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_r int;
  v_c int;
  v_idx int;
  v_fl jsonb;
BEGIN
  IF p_seat IS NULL OR p_seat NOT IN (0, 1) THEN
    RETURN false;
  END IF;
  FOR v_r IN 0..7 LOOP
    FOR v_c IN 0..7 LOOP
      v_idx := v_r * 8 + v_c;
      IF public.ov2_fg_cell_value(p_cells, v_idx) IS NOT NULL THEN
        CONTINUE;
      END IF;
      v_fl := public.ov2_fg_all_flip_indices(p_cells, v_r, v_c, p_seat);
      IF jsonb_array_length(v_fl) > 0 THEN
        RETURN true;
      END IF;
    END LOOP;
  END LOOP;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_fg_apply_move(
  p_cells jsonb,
  p_r int,
  p_c int,
  p_seat int,
  OUT ok boolean,
  OUT new_cells jsonb,
  OUT flip_count int,
  OUT err text
)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_fl jsonb;
  v_n int;
  v_i int;
  v_idx int;
  v_path text[];
  v_place int;
BEGIN
  ok := false;
  new_cells := COALESCE(p_cells, public.ov2_fg_empty_cells());
  flip_count := 0;
  err := NULL;
  IF p_r < 0 OR p_r > 7 OR p_c < 0 OR p_c > 7 THEN
    err := 'BAD_COORD';
    RETURN;
  END IF;
  IF p_seat IS NULL OR p_seat NOT IN (0, 1) THEN
    err := 'BAD_SEAT';
    RETURN;
  END IF;
  v_place := p_r * 8 + p_c;
  IF public.ov2_fg_cell_value(new_cells, v_place) IS NOT NULL THEN
    err := 'OCCUPIED';
    RETURN;
  END IF;
  v_fl := public.ov2_fg_all_flip_indices(new_cells, p_r, p_c, p_seat);
  v_n := jsonb_array_length(v_fl);
  IF v_n <= 0 THEN
    err := 'NO_FLIPS';
    RETURN;
  END IF;
  FOR v_i IN 0..(v_n - 1) LOOP
    v_idx := (v_fl ->> v_i)::int;
    v_path := ARRAY[v_idx::text];
    new_cells := jsonb_set(new_cells, v_path, to_jsonb(p_seat), true);
  END LOOP;
  v_path := ARRAY[v_place::text];
  new_cells := jsonb_set(new_cells, v_path, to_jsonb(p_seat), true);
  flip_count := v_n;
  ok := true;
EXCEPTION
  WHEN invalid_text_representation THEN
    ok := false;
    err := 'BAD_INDEX';
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_flipgrid_parity_autopass_deadline(
  p_parity jsonb,
  p_next_turn_seat int
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_ps jsonb;
  v_deadline bigint;
BEGIN
  IF p_next_turn_seat IS NULL OR p_next_turn_seat NOT IN (0, 1) THEN
    RETURN COALESCE(p_parity, '{}'::jsonb);
  END IF;
  v_ps := COALESCE(p_parity, '{}'::jsonb);
  v_deadline := (extract(epoch from now()) * 1000)::bigint + 30000;
  v_ps := v_ps - 'pending_double';
  v_ps := jsonb_set(v_ps, '{turn_deadline_at}', to_jsonb(v_deadline), true);
  v_ps := jsonb_set(v_ps, '{turn_deadline_seat}', to_jsonb(p_next_turn_seat), true);
  RETURN v_ps;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_flipgrid_parity_bump_timer(
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

CREATE OR REPLACE FUNCTION public.ov2_flipgrid_finalize_turn_state(
  p_board jsonb,
  p_parity jsonb,
  p_just_moved int,
  OUT o_board jsonb,
  OUT o_parity jsonb,
  OUT o_turn int,
  OUT o_finished boolean,
  OUT o_winner int
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_cells jsonb;
  v_turn int;
  v_other int;
  v_i int;
  v_c0 int;
  v_c1 int;
  v_ps jsonb;
  v_bb jsonb;
BEGIN
  o_finished := false;
  o_winner := NULL;
  v_cells := COALESCE(p_board -> 'cells', public.ov2_fg_empty_cells());
  IF jsonb_typeof(v_cells) <> 'array' OR jsonb_array_length(v_cells) < 64 THEN
    v_cells := public.ov2_fg_empty_cells();
  END IF;
  v_ps := COALESCE(p_parity, '{}'::jsonb);
  v_bb := COALESCE(p_board, '{}'::jsonb);

  IF p_just_moved IS NULL THEN
    BEGIN
      v_turn := (v_bb ->> 'turnSeat')::int;
    EXCEPTION
      WHEN invalid_text_representation THEN
        v_turn := 0;
    END;
  ELSE
    v_turn := 1 - p_just_moved;
  END IF;

  FOR v_i IN 1..128 LOOP
    IF public.ov2_fg_has_legal_move(v_cells, v_turn) THEN
      v_bb := jsonb_set(v_bb, '{cells}', to_jsonb(v_cells), true);
      v_bb := jsonb_set(v_bb, '{turnSeat}', to_jsonb(v_turn), true);
      IF p_just_moved IS NULL THEN
        o_parity := public.ov2_flipgrid_parity_bump_timer(v_ps, v_turn, NULL);
      ELSE
        o_parity := public.ov2_flipgrid_parity_bump_timer(v_ps, v_turn, p_just_moved);
      END IF;
      o_board := v_bb;
      o_turn := v_turn;
      RETURN;
    END IF;

    v_other := 1 - v_turn;
    IF NOT public.ov2_fg_has_legal_move(v_cells, v_other) THEN
      v_c0 := public.ov2_fg_disc_count(v_cells, 0);
      v_c1 := public.ov2_fg_disc_count(v_cells, 1);
      v_bb := jsonb_set(v_bb, '{cells}', to_jsonb(v_cells), true);
      v_bb := jsonb_set(v_bb, '{turnSeat}', to_jsonb(v_turn), true);
      o_board := v_bb;
      o_parity := v_ps;
      o_finished := true;
      IF v_c0 > v_c1 THEN
        o_winner := 0;
      ELSIF v_c1 > v_c0 THEN
        o_winner := 1;
      ELSE
        o_winner := NULL;
      END IF;
      RETURN;
    END IF;

    v_turn := v_other;
    v_ps := public.ov2_flipgrid_parity_autopass_deadline(v_ps, v_turn);
    v_bb := jsonb_set(v_bb, '{turnSeat}', to_jsonb(v_turn), true);
  END LOOP;

  o_board := v_bb;
  o_parity := v_ps;
  o_turn := v_turn;
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_fg_empty_cells() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_fg_empty_cells() TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_fg_initial_cells() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_fg_initial_cells() TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_fg_parity_stake_mult(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_fg_parity_stake_mult(jsonb) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_fg_cell_value(jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_fg_cell_value(jsonb, integer) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_fg_disc_count(jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_fg_disc_count(jsonb, integer) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_fg_line_flip_indices(jsonb, integer, integer, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_fg_line_flip_indices(jsonb, integer, integer, integer, integer, integer) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_fg_all_flip_indices(jsonb, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_fg_all_flip_indices(jsonb, integer, integer, integer) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_fg_has_legal_move(jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_fg_has_legal_move(jsonb, integer) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_fg_apply_move(jsonb, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_fg_apply_move(jsonb, integer, integer, integer) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_flipgrid_parity_autopass_deadline(jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_flipgrid_parity_autopass_deadline(jsonb, integer) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_flipgrid_parity_bump_timer(jsonb, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_flipgrid_parity_bump_timer(jsonb, integer, integer) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_flipgrid_finalize_turn_state(jsonb, jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_flipgrid_finalize_turn_state(jsonb, jsonb, integer) TO anon, authenticated, service_role;

COMMIT;
