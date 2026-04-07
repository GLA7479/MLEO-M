-- Goal detection uses ball edges (x ± r), not ball center — matches full-ball rendering.
-- Forward patch: run on DBs that already have 138/142; replaces ov2_gd_detect_goal_event in place.

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
  v_left_edge float8;
  v_right_edge float8;
  v_goal_line_left float8;
  v_goal_line_right float8;
BEGIN
  v_bx := coalesce((p_pub -> 'ball' ->> 'x')::float8, 0);
  v_by := coalesce((p_pub -> 'ball' ->> 'y')::float8, 0);
  v_br := coalesce((p_pub -> 'ball' ->> 'r')::float8, 11);

  v_left_edge := v_bx - v_br;
  v_right_edge := v_bx + v_br;
  v_goal_line_left := v_gm;
  v_goal_line_right := v_aw - v_gm;

  -- Vertical band: crosses + low drives + ground-line goals
  IF v_by < 140 OR v_by > v_gy - v_br THEN
    RETURN NULL;
  END IF;

  -- Left goal (scorer seat 1): left edge crosses inner goal mouth from the field
  IF v_left_edge <= v_goal_line_left THEN
    RETURN 1;
  END IF;

  -- Right goal (scorer seat 0): right edge crosses inner goal mouth from the field
  IF v_right_edge >= v_goal_line_right THEN
    RETURN 0;
  END IF;

  RETURN NULL;
END;
$$;

COMMIT;
