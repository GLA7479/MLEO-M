-- Forward patch: goal = position + direction + depth + vertical band (matches canvas).
-- Deep-inside OR avoids missed goals when vx flips after bounce.
-- Run on DBs that already have 138/142/143; does NOT modify ov2_gd_sim_step.

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
  v_bx float8;
  v_by float8;
  v_br float8;
  v_vx float8;
  v_left_edge float8;
  v_right_edge float8;
  v_goal_line_left float8;
  v_goal_line_right float8;
  v_goal_depth float8 := 6.0;
  v_goal_top float8 := 160.0;
  v_goal_bottom float8 := 350.0;
BEGIN
  v_bx := coalesce((p_pub -> 'ball' ->> 'x')::float8, 0);
  v_by := coalesce((p_pub -> 'ball' ->> 'y')::float8, 0);
  v_br := coalesce((p_pub -> 'ball' ->> 'r')::float8, 11);
  v_vx := coalesce((p_pub -> 'ball' ->> 'vx')::float8, 0);

  v_left_edge := v_bx - v_br;
  v_right_edge := v_bx + v_br;
  v_goal_line_left := v_gm;
  v_goal_line_right := v_aw - v_gm;

  -- MUST match canvas goal opening (see ov2GoalDuelCanvasDraw drawStadiumGoal)
  IF v_by < v_goal_top OR v_by > v_goal_bottom THEN
    RETURN NULL;
  END IF;

  -- Left goal: depth + entry direction, or already deep inside (vx may flip after post/bounce)
  IF (v_goal_line_left - v_left_edge) >= v_goal_depth
     AND (
       v_vx < 0
       OR v_left_edge < v_goal_line_left - v_goal_depth * 0.5
     )
  THEN
    RETURN 1;
  END IF;

  -- Right goal: same
  IF (v_right_edge - v_goal_line_right) >= v_goal_depth
     AND (
       v_vx > 0
       OR v_right_edge > v_goal_line_right + v_goal_depth * 0.5
     )
  THEN
    RETURN 0;
  END IF;

  RETURN NULL;
END;
$$;

COMMIT;
