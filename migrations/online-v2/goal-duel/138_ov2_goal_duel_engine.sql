-- Goal Duel: arcade constants + single-step simulation (server-authoritative).
-- Apply after 137_ov2_goal_duel_schema.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_gd_match_duration_ms()
RETURNS bigint
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT 60000::bigint; $$;

CREATE OR REPLACE FUNCTION public.ov2_gd_min_step_interval_ms()
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT 20; $$;

CREATE OR REPLACE FUNCTION public.ov2_gd_inactivity_forfeit_ms()
RETURNS bigint
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT 120000::bigint; $$;

CREATE OR REPLACE FUNCTION public.ov2_gd_arena_w()
RETURNS float8
LANGUAGE sql IMMUTABLE SET search_path = public AS $$ SELECT 800::float8; $$;

CREATE OR REPLACE FUNCTION public.ov2_gd_arena_h()
RETURNS float8
LANGUAGE sql IMMUTABLE SET search_path = public AS $$ SELECT 400::float8; $$;

CREATE OR REPLACE FUNCTION public.ov2_gd_goal_margin()
RETURNS float8
LANGUAGE sql IMMUTABLE SET search_path = public AS $$ SELECT 48::float8; $$;

-- One simulation step. Inputs: p_in0/p_in1 jsonb { "l","r","j","k" } booleans.
-- Returns { public_state, parity_state } merged (caller updates scores on goal inside parity).
CREATE OR REPLACE FUNCTION public.ov2_gd_sim_step(
  p_pub jsonb,
  p_ps jsonb,
  p_in0 jsonb,
  p_in1 jsonb,
  p_dt_ms int,
  p_now_ms bigint
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_dt float8;
  v_aw float8 := public.ov2_gd_arena_w();
  v_ah float8 := public.ov2_gd_arena_h();
  v_gm float8 := public.ov2_gd_goal_margin(); -- goal mouth x-offset from sides
  v_grav float8 := 2200.0;
  v_p_accel float8 := 5200.0;
  v_p_max_x float8 := 420.0;
  v_jump float8 := 680.0;
  v_ball_fric float8 := 0.988;
  v_rest float8 := 0.62;
  v_kick_x float8 := 420.0;
  v_kick_y float8 := 240.0;
  v_kick_cd int := 220;
  v_hw float8 := 14.0;
  v_hh float8 := 22.0;
  v_br float8;
  v_bx float8; v_by float8; v_bvx float8; v_bvy float8;
  v_p0x float8; v_p0y float8; v_p0vx float8; v_p0vy float8; v_p0f float8;
  v_p1x float8; v_p1y float8; v_p1vx float8; v_p1vy float8; v_p1f float8;
  v_gy float8 := 360.0;
  v_ax0 float8 := 0; v_ax1 float8 := 0;
  v_l boolean; v_r boolean; v_j boolean; v_k boolean;
  v_d float8;
  v_ox float8; v_oy float8;
  v_sep float8;
  v_k0 bigint; v_k1 bigint;
  i int;
BEGIN
  v_dt := least(greatest(coalesce(p_dt_ms, 16)::float8 / 1000.0, 0.004), 0.12);
  v_br := coalesce((p_pub -> 'ball' ->> 'r')::float8, 11.0);
  v_bx := coalesce((p_pub -> 'ball' ->> 'x')::float8, v_aw / 2.0);
  v_by := coalesce((p_pub -> 'ball' ->> 'y')::float8, 220.0);
  v_bvx := coalesce((p_pub -> 'ball' ->> 'vx')::float8, 0.0);
  v_bvy := coalesce((p_pub -> 'ball' ->> 'vy')::float8, 0.0);

  v_p0x := coalesce((p_pub -> 'p0' ->> 'x')::float8, 180.0);
  v_p0y := coalesce((p_pub -> 'p0' ->> 'y')::float8, 338.0);
  v_p0vx := coalesce((p_pub -> 'p0' ->> 'vx')::float8, 0.0);
  v_p0vy := coalesce((p_pub -> 'p0' ->> 'vy')::float8, 0.0);
  v_p0f := coalesce((p_pub -> 'p0' ->> 'face')::float8, 1.0);

  v_p1x := coalesce((p_pub -> 'p1' ->> 'x')::float8, 620.0);
  v_p1y := coalesce((p_pub -> 'p1' ->> 'y')::float8, 338.0);
  v_p1vx := coalesce((p_pub -> 'p1' ->> 'vx')::float8, 0.0);
  v_p1vy := coalesce((p_pub -> 'p1' ->> 'vy')::float8, 0.0);
  v_p1f := coalesce((p_pub -> 'p1' ->> 'face')::float8, -1.0);

  v_k0 := coalesce((p_ps ->> 'last_kick_ms_0')::bigint, 0);
  v_k1 := coalesce((p_ps ->> 'last_kick_ms_1')::bigint, 0);

  -- inputs seat 0
  v_l := coalesce(p_in0 ->> 'l', '') IN ('true', 't', '1');
  v_r := coalesce(p_in0 ->> 'r', '') IN ('true', 't', '1');
  v_j := coalesce(p_in0 ->> 'j', '') IN ('true', 't', '1');
  v_k := coalesce(p_in0 ->> 'k', '') IN ('true', 't', '1');
  v_ax0 := 0;
  IF v_l AND NOT v_r THEN v_ax0 := -v_p_accel; END IF;
  IF v_r AND NOT v_l THEN v_ax0 := v_p_accel; END IF;
  IF v_j AND (v_p0y + v_hh >= v_gy - 0.5) THEN
    v_p0vy := -v_jump;
  END IF;
  IF v_k AND (p_now_ms - v_k0) >= v_kick_cd THEN
    v_d := sqrt((v_bx - v_p0x) * (v_bx - v_p0x) + (v_by - v_p0y) * (v_by - v_p0y));
    IF v_d < 52 THEN
      v_p0f := CASE WHEN abs(v_p0vx) > 40 THEN sign(v_p0vx) ELSE 1.0 END;
      v_bvx := v_bvx + v_p0f * v_kick_x;
      v_bvy := v_bvy - v_kick_y;
      v_k0 := p_now_ms;
    END IF;
  END IF;

  -- inputs seat 1
  v_l := coalesce(p_in1 ->> 'l', '') IN ('true', 't', '1');
  v_r := coalesce(p_in1 ->> 'r', '') IN ('true', 't', '1');
  v_j := coalesce(p_in1 ->> 'j', '') IN ('true', 't', '1');
  v_k := coalesce(p_in1 ->> 'k', '') IN ('true', 't', '1');
  v_ax1 := 0;
  IF v_l AND NOT v_r THEN v_ax1 := -v_p_accel; END IF;
  IF v_r AND NOT v_l THEN v_ax1 := v_p_accel; END IF;
  IF v_j AND (v_p1y + v_hh >= v_gy - 0.5) THEN
    v_p1vy := -v_jump;
  END IF;
  IF v_k AND (p_now_ms - v_k1) >= v_kick_cd THEN
    v_d := sqrt((v_bx - v_p1x) * (v_bx - v_p1x) + (v_by - v_p1y) * (v_by - v_p1y));
    IF v_d < 52 THEN
      v_p1f := CASE WHEN abs(v_p1vx) > 40 THEN sign(v_p1vx) ELSE -1.0 END;
      v_bvx := v_bvx + v_p1f * v_kick_x;
      v_bvy := v_bvy - v_kick_y;
      v_k1 := p_now_ms;
    END IF;
  END IF;

  v_p0vx := v_p0vx + v_ax0 * v_dt;
  v_p1vx := v_p1vx + v_ax1 * v_dt;
  v_p0vx := greatest(least(v_p0vx, v_p_max_x), -v_p_max_x);
  v_p1vx := greatest(least(v_p1vx, v_p_max_x), -v_p_max_x);

  v_p0vy := v_p0vy + v_grav * v_dt;
  v_p1vy := v_p1vy + v_grav * v_dt;
  v_bvy := v_bvy + v_grav * v_dt;

  v_p0x := v_p0x + v_p0vx * v_dt;
  v_p1x := v_p1x + v_p1vx * v_dt;
  v_p0y := v_p0y + v_p0vy * v_dt;
  v_p1y := v_p1y + v_p1vy * v_dt;
  v_bx := v_bx + v_bvx * v_dt;
  v_by := v_by + v_bvy * v_dt;

  v_bvx := v_bvx * v_ball_fric;
  v_bvy := v_bvy * 0.995;

  -- ground players
  IF v_p0y + v_hh > v_gy THEN
    v_p0y := v_gy - v_hh;
    v_p0vy := 0;
  END IF;
  IF v_p1y + v_hh > v_gy THEN
    v_p1y := v_gy - v_hh;
    v_p1vy := 0;
  END IF;

  -- arena horizontal clamp players
  v_p0x := greatest(v_hw, least(v_aw - v_hw, v_p0x));
  v_p1x := greatest(v_hw, least(v_aw - v_hw, v_p1x));

  -- ball floor
  IF v_by + v_br > v_gy THEN
    v_by := v_gy - v_br;
    v_bvy := -abs(v_bvy) * v_rest;
    v_bvx := v_bvx * 0.94;
  END IF;

  -- side walls (not goal mouths): simplified top/bottom walls
  IF v_bx - v_br < 0 THEN
    v_bx := v_br;
    v_bvx := abs(v_bvx) * v_rest;
  END IF;
  IF v_bx + v_br > v_aw THEN
    v_bx := v_aw - v_br;
    v_bvx := -abs(v_bvx) * v_rest;
  END IF;
  IF v_by - v_br < 80 THEN
    v_by := 80 + v_br;
    v_bvy := abs(v_bvy) * v_rest;
  END IF;

  -- circle vs AABB separation (one iteration each)
  FOR i IN 1..2 LOOP
    v_ox := greatest(-v_hw, least(v_hw, v_bx - v_p0x));
    v_oy := greatest(-v_hh, least(v_hh, v_by - v_p0y));
    v_d := sqrt(v_ox * v_ox + v_oy * v_oy);
    IF v_d > 0 AND v_d < v_br + 0.01 THEN
      v_sep := (v_br + 0.01 - v_d) / v_d;
      v_bx := v_bx + v_ox * v_sep * 1.05;
      v_by := v_by + v_oy * v_sep * 1.05;
    END IF;
    v_ox := greatest(-v_hw, least(v_hw, v_bx - v_p1x));
    v_oy := greatest(-v_hh, least(v_hh, v_by - v_p1y));
    v_d := sqrt(v_ox * v_ox + v_oy * v_oy);
    IF v_d > 0 AND v_d < v_br + 0.01 THEN
      v_sep := (v_br + 0.01 - v_d) / v_d;
      v_bx := v_bx + v_ox * v_sep * 1.05;
      v_by := v_by + v_oy * v_sep * 1.05;
    END IF;
  END LOOP;

  IF abs(v_p0vx) > 10 THEN v_p0f := sign(v_p0vx); END IF;
  IF abs(v_p1vx) > 10 THEN v_p1f := sign(v_p1vx); END IF;

  RETURN jsonb_build_object(
    'public_state', jsonb_build_object(
      'v', 1,
      'ball', jsonb_build_object('x', v_bx, 'y', v_by, 'vx', v_bvx, 'vy', v_bvy, 'r', v_br),
      'p0', jsonb_build_object('x', v_p0x, 'y', v_p0y, 'vx', v_p0vx, 'vy', v_p0vy, 'face', v_p0f, 'hw', v_hw, 'hh', v_hh),
      'p1', jsonb_build_object('x', v_p1x, 'y', v_p1y, 'vx', v_p1vx, 'vy', v_p1vy, 'face', v_p1f, 'hw', v_hw, 'hh', v_hh),
      'arena', jsonb_build_object('w', v_aw, 'h', v_ah, 'groundY', v_gy, 'goalMargin', v_gm)
    ),
    'kick_ms', jsonb_build_object('0', v_k0, '1', v_k1)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_gd_initial_public_state()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'v', 1,
    'ball', jsonb_build_object('x', 400::float8, 'y', 220::float8, 'vx', 0::float8, 'vy', 0::float8, 'r', 11::float8),
    'p0', jsonb_build_object('x', 180::float8, 'y', 338::float8, 'vx', 0::float8, 'vy', 0::float8, 'face', 1::float8, 'hw', 14::float8, 'hh', 22::float8),
    'p1', jsonb_build_object('x', 620::float8, 'y', 338::float8, 'vx', 0::float8, 'vy', 0::float8, 'face', -1::float8, 'hw', 14::float8, 'hh', 22::float8),
    'arena', jsonb_build_object(
      'w', public.ov2_gd_arena_w(),
      'h', public.ov2_gd_arena_h(),
      'groundY', 360::float8,
      'goalMargin', public.ov2_gd_goal_margin()
    )
  );
$$;

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
BEGIN
  v_bx := coalesce((p_pub -> 'ball' ->> 'x')::float8, 0);
  v_by := coalesce((p_pub -> 'ball' ->> 'y')::float8, 0);
  v_br := coalesce((p_pub -> 'ball' ->> 'r')::float8, 11);
  -- vertical band for goal mouth (arcade)
  IF v_by < 140 OR v_by > 300 THEN
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

CREATE OR REPLACE FUNCTION public.ov2_gd_reset_after_goal(p_pub jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT public.ov2_gd_initial_public_state();
$$;

COMMIT;
