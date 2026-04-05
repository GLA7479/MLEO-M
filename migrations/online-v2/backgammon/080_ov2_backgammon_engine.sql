-- Backgammon rule helpers: signed pts (+ seat0 / - seat1), bar[2], off[2], diceAvail multiset.
-- Seat 0 moves toward index 0; home 0..5. Seat 1 moves toward 23; home 18..23.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_bg_initial_board_json()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'pts', jsonb_build_array(
      -2, 0, 0, 0, 0, 5, 0, 3, 0, 0, 0, -5, 5, 0, 0, 0, -3, 0, -5, 0, 0, 0, 0, 2
    ),
    'bar', jsonb_build_array(0, 0),
    'off', jsonb_build_array(0, 0),
    'turnSeat', 0,
    'dice', NULL,
    'diceAvail', '[]'::jsonb,
    'winner', NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.ov2_bg_avail_remove_one(p_avail jsonb, p_die int)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_len int;
  v_i int;
  v_found boolean := false;
  v_new jsonb := '[]'::jsonb;
  v_x int;
BEGIN
  IF p_avail IS NULL OR jsonb_typeof(p_avail) <> 'array' THEN
    RETURN NULL;
  END IF;
  v_len := jsonb_array_length(p_avail);
  FOR v_i IN 0..(v_len - 1) LOOP
    v_x := (p_avail -> v_i)::text::int;
    IF NOT v_found AND v_x = p_die THEN
      v_found := true;
      CONTINUE;
    END IF;
    v_new := v_new || jsonb_build_array(v_x);
  END LOOP;
  IF NOT v_found THEN
    RETURN NULL;
  END IF;
  RETURN v_new;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_bg_avail_contains(p_avail jsonb, p_die int)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_len int;
  v_i int;
BEGIN
  IF p_avail IS NULL OR jsonb_typeof(p_avail) <> 'array' THEN
    RETURN false;
  END IF;
  v_len := jsonb_array_length(p_avail);
  FOR v_i IN 0..(v_len - 1) LOOP
    IF (p_avail -> v_i)::text::int = p_die THEN
      RETURN true;
    END IF;
  END LOOP;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_bg_pt_get(p_pts jsonb, p_i int)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF p_pts IS NULL OR jsonb_typeof(p_pts) <> 'array' OR p_i < 0 OR p_i > 23 THEN
    RETURN 0;
  END IF;
  RETURN COALESCE((p_pts -> p_i)::text::int, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_bg_pt_set(p_board jsonb, p_i int, p_val int)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  RETURN jsonb_set(p_board, ARRAY['pts', p_i::text], to_jsonb(p_val), true);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_bg_bar_get(p_board jsonb, p_seat int)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF p_board -> 'bar' IS NULL OR jsonb_typeof(p_board -> 'bar') <> 'array' THEN
    RETURN 0;
  END IF;
  IF p_seat < 0 OR p_seat > 1 THEN
    RETURN 0;
  END IF;
  RETURN COALESCE((p_board #>> ARRAY['bar', p_seat::text])::int, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_bg_bar_set(p_board jsonb, p_seat int, p_val int)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  RETURN jsonb_set(p_board, ARRAY['bar', p_seat::text], to_jsonb(p_val), true);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_bg_off_get(p_board jsonb, p_seat int)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF p_board -> 'off' IS NULL OR jsonb_typeof(p_board -> 'off') <> 'array' THEN
    RETURN 0;
  END IF;
  RETURN COALESCE((p_board #>> ARRAY['off', p_seat::text])::int, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_bg_off_set(p_board jsonb, p_seat int, p_val int)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  RETURN jsonb_set(p_board, ARRAY['off', p_seat::text], to_jsonb(p_val), true);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_bg_seat0_all_past_opponent_home(p_pts jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_i int;
BEGIN
  FOR v_i IN 6..23 LOOP
    IF public.ov2_bg_pt_get(p_pts, v_i) > 0 THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_bg_seat1_all_past_opponent_home(p_pts jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_i int;
BEGIN
  FOR v_i IN 0..17 LOOP
    IF public.ov2_bg_pt_get(p_pts, v_i) < 0 THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_bg_seat0_highest_home_occupied(p_pts jsonb)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_i int;
  v_hi int := -1;
BEGIN
  FOR v_i IN 0..5 LOOP
    IF public.ov2_bg_pt_get(p_pts, v_i) > 0 THEN
      v_hi := v_i;
    END IF;
  END LOOP;
  RETURN v_hi;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_bg_seat1_highest_home_occupied(p_pts jsonb)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_i int;
  v_hi int := -1;
BEGIN
  FOR v_i IN 18..23 LOOP
    IF public.ov2_bg_pt_get(p_pts, v_i) < 0 THEN
      v_hi := v_i;
    END IF;
  END LOOP;
  RETURN v_hi;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_bg_landing_ok_for_seat0(p_pts jsonb, p_to int)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_t int;
BEGIN
  IF p_to < 0 OR p_to > 23 THEN
    RETURN false;
  END IF;
  v_t := public.ov2_bg_pt_get(p_pts, p_to);
  IF v_t < -1 THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_bg_landing_ok_for_seat1(p_pts jsonb, p_to int)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_t int;
BEGIN
  IF p_to < 0 OR p_to > 23 THEN
    RETURN false;
  END IF;
  v_t := public.ov2_bg_pt_get(p_pts, p_to);
  IF v_t > 1 THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_bg_apply_landing_seat0(p_board jsonb, p_from int, p_to int)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_pts jsonb;
  v_t int;
  v_b jsonb;
  v_from_v int;
BEGIN
  v_b := p_board;
  v_pts := v_b -> 'pts';
  v_from_v := public.ov2_bg_pt_get(v_pts, p_from);
  IF v_from_v <= 0 THEN
    RETURN NULL;
  END IF;
  v_t := public.ov2_bg_pt_get(v_pts, p_to);
  v_b := public.ov2_bg_pt_set(v_b, p_from, v_from_v - 1);
  IF v_t = -1 THEN
    v_b := public.ov2_bg_bar_set(v_b, 1, public.ov2_bg_bar_get(v_b, 1) + 1);
    v_b := public.ov2_bg_pt_set(v_b, p_to, 1);
  ELSIF v_t >= 0 THEN
    v_b := public.ov2_bg_pt_set(v_b, p_to, v_t + 1);
  ELSE
    RETURN NULL;
  END IF;
  RETURN v_b;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_bg_apply_landing_seat1(p_board jsonb, p_from int, p_to int)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_pts jsonb;
  v_t int;
  v_b jsonb;
  v_from_v int;
BEGIN
  v_b := p_board;
  v_pts := v_b -> 'pts';
  v_from_v := public.ov2_bg_pt_get(v_pts, p_from);
  IF v_from_v >= 0 THEN
    RETURN NULL;
  END IF;
  v_t := public.ov2_bg_pt_get(v_pts, p_to);
  v_b := public.ov2_bg_pt_set(v_b, p_from, v_from_v + 1);
  IF v_t = 1 THEN
    v_b := public.ov2_bg_bar_set(v_b, 0, public.ov2_bg_bar_get(v_b, 0) + 1);
    v_b := public.ov2_bg_pt_set(v_b, p_to, -1);
  ELSIF v_t <= 0 THEN
    v_b := public.ov2_bg_pt_set(v_b, p_to, v_t - 1);
  ELSE
    RETURN NULL;
  END IF;
  RETURN v_b;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_bg_validate_step(
  p_board jsonb,
  p_turn int,
  p_from int,
  p_to int,
  p_die int
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_pts jsonb;
  v_b0 int;
  v_b1 int;
  v_avail jsonb;
  v_to_calc int;
  v_need int;
  v_hi int;
  v_from_v int;
  v_all_home boolean;
BEGIN
  IF p_die IS NULL OR p_die < 1 OR p_die > 6 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_DIE');
  END IF;
  v_avail := p_board -> 'diceAvail';
  IF NOT public.ov2_bg_avail_contains(v_avail, p_die) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'DIE_NOT_AVAILABLE');
  END IF;
  v_pts := p_board -> 'pts';
  v_b0 := public.ov2_bg_bar_get(p_board, 0);
  v_b1 := public.ov2_bg_bar_get(p_board, 1);

  IF p_turn = 0 THEN
    IF v_b0 > 0 THEN
      IF p_from IS DISTINCT FROM -1 THEN
        RETURN jsonb_build_object('ok', false, 'code', 'MUST_MOVE_FROM_BAR');
      END IF;
      v_to_calc := 24 - p_die;
      IF v_to_calc < 18 OR v_to_calc > 23 THEN
        RETURN jsonb_build_object('ok', false, 'code', 'BAD_BAR_ENTRY');
      END IF;
      IF p_to IS DISTINCT FROM v_to_calc THEN
        RETURN jsonb_build_object('ok', false, 'code', 'BAR_TARGET_MISMATCH');
      END IF;
      IF NOT public.ov2_bg_landing_ok_for_seat0(v_pts, v_to_calc) THEN
        RETURN jsonb_build_object('ok', false, 'code', 'BLOCKED');
      END IF;
      RETURN jsonb_build_object('ok', true, 'mode', 'bar0', 'land_to', v_to_calc);
    END IF;

    IF p_from < 0 OR p_from > 23 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'BAD_FROM');
    END IF;
    v_from_v := public.ov2_bg_pt_get(v_pts, p_from);
    IF v_from_v <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'EMPTY_FROM');
    END IF;

    v_all_home := public.ov2_bg_bar_get(p_board, 0) = 0 AND public.ov2_bg_seat0_all_past_opponent_home(v_pts);

    IF p_to = -1 THEN
      IF NOT v_all_home OR p_from > 5 OR p_from < 0 THEN
        RETURN jsonb_build_object('ok', false, 'code', 'ILLEGAL_BEAROFF');
      END IF;
      v_need := p_from + 1;
      v_hi := public.ov2_bg_seat0_highest_home_occupied(v_pts);
      IF v_hi < 0 THEN
        RETURN jsonb_build_object('ok', false, 'code', 'ILLEGAL_BEAROFF');
      END IF;
      IF p_die = v_need THEN
        RETURN jsonb_build_object('ok', true, 'mode', 'bear0', 'from_pt', p_from);
      END IF;
      IF p_die > v_need AND p_from = v_hi THEN
        RETURN jsonb_build_object('ok', true, 'mode', 'bear0', 'from_pt', p_from);
      END IF;
      RETURN jsonb_build_object('ok', false, 'code', 'ILLEGAL_BEAROFF');
    END IF;

    v_to_calc := p_from - p_die;
    IF v_all_home THEN
      IF v_to_calc < 0 THEN
        RETURN jsonb_build_object('ok', false, 'code', 'USE_BEAROFF');
      END IF;
    ELSE
      IF v_to_calc < 0 THEN
        RETURN jsonb_build_object('ok', false, 'code', 'ILLEGAL_MOVE');
      END IF;
    END IF;

    IF p_to IS DISTINCT FROM v_to_calc THEN
      RETURN jsonb_build_object('ok', false, 'code', 'TO_MISMATCH');
    END IF;
    IF NOT public.ov2_bg_landing_ok_for_seat0(v_pts, v_to_calc) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'BLOCKED');
    END IF;
    RETURN jsonb_build_object('ok', true, 'mode', 'move0', 'from_pt', p_from, 'land_to', v_to_calc);
  END IF;

  IF p_turn = 1 THEN
    IF v_b1 > 0 THEN
      IF p_from IS DISTINCT FROM -1 THEN
        RETURN jsonb_build_object('ok', false, 'code', 'MUST_MOVE_FROM_BAR');
      END IF;
      v_to_calc := p_die - 1;
      IF v_to_calc < 0 OR v_to_calc > 5 THEN
        RETURN jsonb_build_object('ok', false, 'code', 'BAD_BAR_ENTRY');
      END IF;
      IF p_to IS DISTINCT FROM v_to_calc THEN
        RETURN jsonb_build_object('ok', false, 'code', 'BAR_TARGET_MISMATCH');
      END IF;
      IF NOT public.ov2_bg_landing_ok_for_seat1(v_pts, v_to_calc) THEN
        RETURN jsonb_build_object('ok', false, 'code', 'BLOCKED');
      END IF;
      RETURN jsonb_build_object('ok', true, 'mode', 'bar1', 'land_to', v_to_calc);
    END IF;

    IF p_from < 0 OR p_from > 23 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'BAD_FROM');
    END IF;
    v_from_v := public.ov2_bg_pt_get(v_pts, p_from);
    IF v_from_v >= 0 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'EMPTY_FROM');
    END IF;

    v_all_home := public.ov2_bg_bar_get(p_board, 1) = 0 AND public.ov2_bg_seat1_all_past_opponent_home(v_pts);

    IF p_to = -1 THEN
      IF NOT v_all_home OR p_from < 18 OR p_from > 23 THEN
        RETURN jsonb_build_object('ok', false, 'code', 'ILLEGAL_BEAROFF');
      END IF;
      v_need := 24 - p_from;
      v_hi := public.ov2_bg_seat1_highest_home_occupied(v_pts);
      IF v_hi < 0 THEN
        RETURN jsonb_build_object('ok', false, 'code', 'ILLEGAL_BEAROFF');
      END IF;
      IF p_die = v_need THEN
        RETURN jsonb_build_object('ok', true, 'mode', 'bear1', 'from_pt', p_from);
      END IF;
      IF p_die > v_need AND p_from = v_hi THEN
        RETURN jsonb_build_object('ok', true, 'mode', 'bear1', 'from_pt', p_from);
      END IF;
      RETURN jsonb_build_object('ok', false, 'code', 'ILLEGAL_BEAROFF');
    END IF;

    v_to_calc := p_from + p_die;
    IF v_all_home THEN
      IF v_to_calc > 23 THEN
        RETURN jsonb_build_object('ok', false, 'code', 'USE_BEAROFF');
      END IF;
    ELSE
      IF v_to_calc > 23 THEN
        RETURN jsonb_build_object('ok', false, 'code', 'ILLEGAL_MOVE');
      END IF;
    END IF;

    IF p_to IS DISTINCT FROM v_to_calc THEN
      RETURN jsonb_build_object('ok', false, 'code', 'TO_MISMATCH');
    END IF;
    IF NOT public.ov2_bg_landing_ok_for_seat1(v_pts, v_to_calc) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'BLOCKED');
    END IF;
    RETURN jsonb_build_object('ok', true, 'mode', 'move1', 'from_pt', p_from, 'land_to', v_to_calc);
  END IF;

  RETURN jsonb_build_object('ok', false, 'code', 'BAD_TURN');
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_bg_apply_validated_step(p_board jsonb, p_meta jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_mode text;
  v_b jsonb;
  v_from int;
  v_to int;
  v_pts jsonb;
BEGIN
  v_mode := p_meta ->> 'mode';
  v_b := p_board;
  IF v_mode = 'bear0' THEN
    v_from := (p_meta ->> 'from_pt')::int;
    v_b := public.ov2_bg_pt_set(v_b, v_from, public.ov2_bg_pt_get(v_b -> 'pts', v_from) - 1);
    v_b := public.ov2_bg_off_set(v_b, 0, public.ov2_bg_off_get(v_b, 0) + 1);
    RETURN v_b;
  ELSIF v_mode = 'bear1' THEN
    v_from := (p_meta ->> 'from_pt')::int;
    v_b := public.ov2_bg_pt_set(v_b, v_from, public.ov2_bg_pt_get(v_b -> 'pts', v_from) + 1);
    v_b := public.ov2_bg_off_set(v_b, 1, public.ov2_bg_off_get(v_b, 1) + 1);
    RETURN v_b;
  ELSIF v_mode = 'bar0' THEN
    v_to := (p_meta ->> 'land_to')::int;
    v_b := public.ov2_bg_bar_set(v_b, 0, public.ov2_bg_bar_get(v_b, 0) - 1);
    RETURN public.ov2_bg_apply_landing_seat0(v_b, -999, v_to);
  ELSIF v_mode = 'bar1' THEN
    v_to := (p_meta ->> 'land_to')::int;
    v_b := public.ov2_bg_bar_set(v_b, 1, public.ov2_bg_bar_get(v_b, 1) - 1);
    RETURN public.ov2_bg_apply_landing_seat1(v_b, -999, v_to);
  ELSIF v_mode = 'move0' THEN
    v_from := (p_meta ->> 'from_pt')::int;
    v_to := (p_meta ->> 'land_to')::int;
    RETURN public.ov2_bg_apply_landing_seat0(v_b, v_from, v_to);
  ELSIF v_mode = 'move1' THEN
    v_from := (p_meta ->> 'from_pt')::int;
    v_to := (p_meta ->> 'land_to')::int;
    RETURN public.ov2_bg_apply_landing_seat1(v_b, v_from, v_to);
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_bg_fix_bar_apply(p_board jsonb, p_mode text, p_land_to int)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_b jsonb;
  v_pts jsonb;
  v_t int;
BEGIN
  v_b := p_board;
  v_pts := v_b -> 'pts';
  IF p_mode = 'bar0' THEN
    v_t := public.ov2_bg_pt_get(v_pts, p_land_to);
    v_b := public.ov2_bg_bar_set(v_b, 0, public.ov2_bg_bar_get(v_b, 0) - 1);
    IF v_t = -1 THEN
      v_b := public.ov2_bg_bar_set(v_b, 1, public.ov2_bg_bar_get(v_b, 1) + 1);
      v_b := public.ov2_bg_pt_set(v_b, p_land_to, 1);
    ELSE
      v_b := public.ov2_bg_pt_set(v_b, p_land_to, v_t + 1);
    END IF;
    RETURN v_b;
  ELSIF p_mode = 'bar1' THEN
    v_t := public.ov2_bg_pt_get(v_pts, p_land_to);
    v_b := public.ov2_bg_bar_set(v_b, 1, public.ov2_bg_bar_get(v_b, 1) - 1);
    IF v_t = 1 THEN
      v_b := public.ov2_bg_bar_set(v_b, 0, public.ov2_bg_bar_get(v_b, 0) + 1);
      v_b := public.ov2_bg_pt_set(v_b, p_land_to, -1);
    ELSE
      v_b := public.ov2_bg_pt_set(v_b, p_land_to, v_t - 1);
    END IF;
    RETURN v_b;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_bg_apply_step_full(p_board jsonb, p_turn int, p_from int, p_to int, p_die int)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_val jsonb;
  v_nb jsonb;
  v_mode text;
  v_land int;
BEGIN
  v_val := public.ov2_bg_validate_step(p_board, p_turn, p_from, p_to, p_die);
  IF coalesce((v_val ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'code', v_val ->> 'code');
  END IF;
  v_mode := v_val ->> 'mode';
  IF v_mode IN ('bar0', 'bar1') THEN
    v_land := (v_val ->> 'land_to')::int;
    v_nb := public.ov2_bg_fix_bar_apply(p_board, v_mode, v_land);
  ELSIF v_mode IN ('bear0', 'bear1') THEN
    v_nb := public.ov2_bg_apply_validated_step(p_board, v_val);
  ELSE
    v_nb := public.ov2_bg_apply_validated_step(p_board, v_val);
  END IF;
  IF v_nb IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'APPLY_FAILED');
  END IF;
  v_nb := jsonb_set(v_nb, '{diceAvail}', public.ov2_bg_avail_remove_one(p_board -> 'diceAvail', p_die), true);
  IF v_nb -> 'diceAvail' IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AVAIL_REMOVE_FAILED');
  END IF;
  RETURN jsonb_build_object('ok', true, 'board', v_nb);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_bg_any_legal_exists(p_board jsonb, p_turn int)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_avail jsonb;
  v_len int;
  v_i int;
  v_d int;
  v_seen int[] := ARRAY[]::integer[];
  v_dup boolean;
  v_s int;
  v_from int;
  v_to int;
  v_r jsonb;
BEGIN
  v_avail := p_board -> 'diceAvail';
  IF v_avail IS NULL OR jsonb_typeof(v_avail) <> 'array' OR jsonb_array_length(v_avail) = 0 THEN
    RETURN false;
  END IF;
  v_len := jsonb_array_length(v_avail);
  FOR v_i IN 0..(v_len - 1) LOOP
    v_d := (v_avail -> v_i)::text::int;
    v_dup := false;
    IF v_seen IS NOT NULL THEN
      FOREACH v_s IN ARRAY v_seen LOOP
        IF v_s = v_d THEN
          v_dup := true;
          EXIT;
        END IF;
      END LOOP;
    END IF;
    IF v_dup THEN
      CONTINUE;
    END IF;
    v_seen := array_append(v_seen, v_d);

    v_r := public.ov2_bg_validate_step(p_board, p_turn, -1, 24 - v_d, v_d);
    IF p_turn = 0 AND public.ov2_bg_bar_get(p_board, 0) > 0 AND coalesce((v_r ->> 'ok')::boolean, false) THEN
      RETURN true;
    END IF;
    v_r := public.ov2_bg_validate_step(p_board, p_turn, -1, v_d - 1, v_d);
    IF p_turn = 1 AND public.ov2_bg_bar_get(p_board, 1) > 0 AND coalesce((v_r ->> 'ok')::boolean, false) THEN
      RETURN true;
    END IF;

    IF (p_turn = 0 AND public.ov2_bg_bar_get(p_board, 0) = 0) OR (p_turn = 1 AND public.ov2_bg_bar_get(p_board, 1) = 0) THEN
      v_r := public.ov2_bg_validate_step(p_board, p_turn, -1, -1, v_d);
      IF coalesce((v_r ->> 'ok')::boolean, false) THEN
        RETURN true;
      END IF;
      FOR v_from IN 0..23 LOOP
        FOR v_to IN -1..23 LOOP
          v_r := public.ov2_bg_validate_step(p_board, p_turn, v_from, v_to, v_d);
          IF coalesce((v_r ->> 'ok')::boolean, false) THEN
            RETURN true;
          END IF;
        END LOOP;
      END LOOP;
    END IF;
  END LOOP;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_bg_finish_turn_board(p_board jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_ts int;
BEGIN
  v_ts := (p_board ->> 'turnSeat')::int;
  RETURN jsonb_set(
    jsonb_set(
      jsonb_set(p_board, '{dice}', 'null'::jsonb, true),
      '{diceAvail}',
      '[]'::jsonb,
      true
    ),
    '{turnSeat}',
    to_jsonb(CASE WHEN v_ts = 0 THEN 1 ELSE 0 END),
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_bg_check_winner(p_board jsonb)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF public.ov2_bg_off_get(p_board, 0) >= 15 THEN
    RETURN 0;
  END IF;
  IF public.ov2_bg_off_get(p_board, 1) >= 15 THEN
    RETURN 1;
  END IF;
  RETURN NULL;
END;
$$;

COMMIT;
