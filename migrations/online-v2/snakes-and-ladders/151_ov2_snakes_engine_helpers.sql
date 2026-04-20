-- OV2 Snakes & Ladders: immutable board helpers (Appendix A map). Apply after 150.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_snakes_board_edges()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'ladders',
    '{"2":"15","7":"28","22":"41","28":"55","41":"63","50":"69","57":"76","65":"82","68":"90","71":"91"}'::jsonb,
    'snakes',
    '{"99":"80","94":"71","89":"52","74":"35","62":"19","49":"12","16":"6"}'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION public._ov2_snakes_apply_edges_once(p_cell int, p_edges jsonb)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  k text;
  v2 int;
BEGIN
  IF p_cell IS NULL OR p_cell < 1 OR p_cell > 100 THEN
    RETURN p_cell;
  END IF;
  k := p_cell::text;
  IF (p_edges -> 'ladders') ? k THEN
    v2 := (p_edges -> 'ladders' ->> k)::int;
    IF v2 IS NOT NULL AND v2 BETWEEN 1 AND 100 THEN
      RETURN v2;
    END IF;
  END IF;
  IF (p_edges -> 'snakes') ? k THEN
    v2 := (p_edges -> 'snakes' ->> k)::int;
    IF v2 IS NOT NULL AND v2 BETWEEN 1 AND 100 THEN
      RETURN v2;
    END IF;
  END IF;
  RETURN p_cell;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_snakes_initial_board_json(p_active int[])
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_pos jsonb := '{}'::jsonb;
  s int;
  v_first int;
BEGIN
  IF p_active IS NULL OR cardinality(p_active) < 1 THEN
    RETURN jsonb_build_object(
      'turnSeat', NULL,
      'positions', '{}'::jsonb,
      'consecutiveSixes', 0,
      'lastRoll', NULL,
      'result', NULL
    );
  END IF;
  FOREACH s IN ARRAY p_active
  LOOP
    v_pos := v_pos || jsonb_build_object(s::text, 1);
  END LOOP;
  v_first := p_active[1];
  RETURN jsonb_build_object(
    'turnSeat', to_jsonb(v_first),
    'positions', v_pos,
    'consecutiveSixes', 0,
    'lastRoll', NULL,
    'result', NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_snakes_board_edges() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_snakes_board_edges() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._ov2_snakes_apply_edges_once(int, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._ov2_snakes_apply_edges_once(int, jsonb) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_snakes_initial_board_json(int[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_snakes_initial_board_json(int[]) TO anon, authenticated, service_role;

COMMIT;
