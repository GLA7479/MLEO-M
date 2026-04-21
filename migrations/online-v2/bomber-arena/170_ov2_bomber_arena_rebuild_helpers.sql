-- OV2 Bomber Arena — rebuild v2 helpers for legal moves / wait policy. Apply after 169.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_bomber_arena_legal_move_count(p_board jsonb, p_seat int)
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_w int;
  v_h int;
  v_px int;
  v_py int;
  v_tx int;
  v_ty int;
  v_p0x int;
  v_p0y int;
  v_p1x int;
  v_p1y int;
  v_cnt int := 0;
  v_bombs jsonb;
  v_dir int;
BEGIN
  IF p_board IS NULL OR (p_seat <> 0 AND p_seat <> 1) THEN
    RETURN 0;
  END IF;
  v_w := greatest(coalesce((p_board ->> 'w')::int, 9), 1);
  v_h := greatest(coalesce((p_board ->> 'h')::int, 9), 1);
  v_px := coalesce((p_board -> 'players' -> (p_seat::text) ->> 'x')::int, -99);
  v_py := coalesce((p_board -> 'players' -> (p_seat::text) ->> 'y')::int, -99);
  IF v_px < 0 OR v_py < 0 THEN
    RETURN 0;
  END IF;
  v_p0x := coalesce((p_board -> 'players' -> '0' ->> 'x')::int, -1);
  v_p0y := coalesce((p_board -> 'players' -> '0' ->> 'y')::int, -1);
  v_p1x := coalesce((p_board -> 'players' -> '1' ->> 'x')::int, -1);
  v_p1y := coalesce((p_board -> 'players' -> '1' ->> 'y')::int, -1);
  v_bombs := coalesce(p_board -> 'bombs', '[]'::jsonb);

  FOR v_dir IN 1..4 LOOP
    IF v_dir = 1 THEN
      v_tx := v_px + 1;
      v_ty := v_py;
    ELSIF v_dir = 2 THEN
      v_tx := v_px - 1;
      v_ty := v_py;
    ELSIF v_dir = 3 THEN
      v_tx := v_px;
      v_ty := v_py + 1;
    ELSE
      v_tx := v_px;
      v_ty := v_py - 1;
    END IF;
    IF v_tx < 0 OR v_ty < 0 OR v_tx >= v_w OR v_ty >= v_h THEN
      CONTINUE;
    END IF;
    IF public.ov2_bomber_arena_cell_in_arr(p_board -> 'walls', v_tx, v_ty) THEN
      CONTINUE;
    END IF;
    IF public.ov2_bomber_arena_cell_in_arr(p_board -> 'breakables', v_tx, v_ty) THEN
      CONTINUE;
    END IF;
    IF (v_tx = v_p0x AND v_ty = v_p0y AND p_seat <> 0) OR (v_tx = v_p1x AND v_ty = v_p1y AND p_seat <> 1) THEN
      CONTINUE;
    END IF;
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_bombs) e
      WHERE (e ->> 'x')::int = v_tx AND (e ->> 'y')::int = v_ty
    ) THEN
      CONTINUE;
    END IF;
    v_cnt := v_cnt + 1;
  END LOOP;
  RETURN v_cnt;
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_bomber_arena_legal_move_count(jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_bomber_arena_legal_move_count(jsonb, integer) TO anon, authenticated, service_role;

-- Merge cross-shaped blast from (p_bx,p_by) into hit list. Walls stop; breakables stop after hit;
-- bombs on path add hit but do not stop ray; floor/player cells add hit and continue.
CREATE OR REPLACE FUNCTION public.ov2_bomber_arena_append_cross_hits(
  p_walls jsonb,
  p_breakables jsonb,
  p_bombs jsonb,
  p_w int,
  p_h int,
  p_bx int,
  p_by int,
  p_radius int,
  p_hit jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_hit jsonb := coalesce(p_hit, '[]'::jsonb);
  v_br int;
  v_cx int;
  v_cy int;
BEGIN
  IF NOT public.ov2_bomber_arena_cell_in_arr(v_hit, p_bx, p_by) THEN
    v_hit := v_hit || jsonb_build_array(jsonb_build_array(p_bx, p_by));
  END IF;

  FOR v_br IN 1..greatest(p_radius, 1) LOOP
    v_cx := p_bx + v_br;
    v_cy := p_by;
    IF v_cx >= p_w THEN EXIT; END IF;
    IF public.ov2_bomber_arena_cell_in_arr(p_walls, v_cx, v_cy) THEN EXIT; END IF;
    IF public.ov2_bomber_arena_cell_in_arr(p_breakables, v_cx, v_cy) THEN
      IF NOT public.ov2_bomber_arena_cell_in_arr(v_hit, v_cx, v_cy) THEN
        v_hit := v_hit || jsonb_build_array(jsonb_build_array(v_cx, v_cy));
      END IF;
      EXIT;
    END IF;
    IF NOT public.ov2_bomber_arena_cell_in_arr(v_hit, v_cx, v_cy) THEN
      v_hit := v_hit || jsonb_build_array(jsonb_build_array(v_cx, v_cy));
    END IF;
  END LOOP;

  FOR v_br IN 1..greatest(p_radius, 1) LOOP
    v_cx := p_bx - v_br;
    v_cy := p_by;
    IF v_cx < 0 THEN EXIT; END IF;
    IF public.ov2_bomber_arena_cell_in_arr(p_walls, v_cx, v_cy) THEN EXIT; END IF;
    IF public.ov2_bomber_arena_cell_in_arr(p_breakables, v_cx, v_cy) THEN
      IF NOT public.ov2_bomber_arena_cell_in_arr(v_hit, v_cx, v_cy) THEN
        v_hit := v_hit || jsonb_build_array(jsonb_build_array(v_cx, v_cy));
      END IF;
      EXIT;
    END IF;
    IF NOT public.ov2_bomber_arena_cell_in_arr(v_hit, v_cx, v_cy) THEN
      v_hit := v_hit || jsonb_build_array(jsonb_build_array(v_cx, v_cy));
    END IF;
  END LOOP;

  FOR v_br IN 1..greatest(p_radius, 1) LOOP
    v_cx := p_bx;
    v_cy := p_by + v_br;
    IF v_cy >= p_h THEN EXIT; END IF;
    IF public.ov2_bomber_arena_cell_in_arr(p_walls, v_cx, v_cy) THEN EXIT; END IF;
    IF public.ov2_bomber_arena_cell_in_arr(p_breakables, v_cx, v_cy) THEN
      IF NOT public.ov2_bomber_arena_cell_in_arr(v_hit, v_cx, v_cy) THEN
        v_hit := v_hit || jsonb_build_array(jsonb_build_array(v_cx, v_cy));
      END IF;
      EXIT;
    END IF;
    IF NOT public.ov2_bomber_arena_cell_in_arr(v_hit, v_cx, v_cy) THEN
      v_hit := v_hit || jsonb_build_array(jsonb_build_array(v_cx, v_cy));
    END IF;
  END LOOP;

  FOR v_br IN 1..greatest(p_radius, 1) LOOP
    v_cx := p_bx;
    v_cy := p_by - v_br;
    IF v_cy < 0 THEN EXIT; END IF;
    IF public.ov2_bomber_arena_cell_in_arr(p_walls, v_cx, v_cy) THEN EXIT; END IF;
    IF public.ov2_bomber_arena_cell_in_arr(p_breakables, v_cx, v_cy) THEN
      IF NOT public.ov2_bomber_arena_cell_in_arr(v_hit, v_cx, v_cy) THEN
        v_hit := v_hit || jsonb_build_array(jsonb_build_array(v_cx, v_cy));
      END IF;
      EXIT;
    END IF;
    IF NOT public.ov2_bomber_arena_cell_in_arr(v_hit, v_cx, v_cy) THEN
      v_hit := v_hit || jsonb_build_array(jsonb_build_array(v_cx, v_cy));
    END IF;
  END LOOP;

  RETURN v_hit;
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_bomber_arena_append_cross_hits(jsonb, jsonb, jsonb, int, int, int, int, int, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_bomber_arena_append_cross_hits(jsonb, jsonb, jsonb, int, int, int, int, int, jsonb) TO anon, authenticated, service_role;

COMMIT;
