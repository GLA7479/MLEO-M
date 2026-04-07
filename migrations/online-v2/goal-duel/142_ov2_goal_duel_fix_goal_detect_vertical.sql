-- Fix: ground-line goals were not detected (ball y≈349 vs old cap y<=300).
-- Forward patch only: run on DBs that already applied 138 before this change.
-- Do not re-run 138 on those environments; this file replaces ov2_gd_detect_goal_event in place.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_gd_detect_goal_event(p_pub jsonb)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_aw float8 := public.ov2_gd_arena_w();
  v_gm float8 := public.ov2_gd_goal_margin();
  v_gy float8 := 360.0; -- must match ov2_gd_sim_step ground line
  v_bx float8;
  v_by float8;
  v_br float8;
BEGIN
  v_bx := coalesce((p_pub -> 'ball' ->> 'x')::float8, 0);
  v_by := coalesce((p_pub -> 'ball' ->> 'y')::float8, 0);
  v_br := coalesce((p_pub -> 'ball' ->> 'r')::float8, 11);
  IF v_by < 140 OR v_by > v_gy - v_br THEN
    RETURN NULL;
  END IF;
  IF v_bx - v_br < v_gm THEN
    RETURN 1;
  END IF;
  IF v_bx + v_br > v_aw - v_gm THEN
    RETURN 0;
  END IF;
  RETURN NULL;
END;
$$;

COMMIT;
