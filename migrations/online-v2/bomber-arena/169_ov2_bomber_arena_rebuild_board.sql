-- OV2 Bomber Arena — rebuild v2 board factory (plan §11): 3-step Manhattan spawn bubbles,
-- interior lane cross (no breakables), locked numerics. Apply after 168.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_bomber_arena_initial_board_json()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH wall_cells AS (
    SELECT DISTINCT gx, gy
    FROM (
      SELECT gx::int AS gx, gy::int AS gy
      FROM generate_series(0, 8) gx
      CROSS JOIN generate_series(0, 8) gy
      WHERE gx = 0 OR gx = 8 OR gy = 0 OR gy = 8
      UNION
      SELECT gx::int, gy::int
      FROM generate_series(2, 6, 2) gx
      CROSS JOIN generate_series(2, 6, 2) gy
    ) u
  ),
  walls_agg AS (
    SELECT coalesce(jsonb_agg(jsonb_build_array(gx, gy) ORDER BY gy, gx), '[]'::jsonb) AS walls
    FROM wall_cells
  ),
  brk AS (
    SELECT bx::int AS x, by::int AS y
    FROM generate_series(1, 7) bx
    CROSS JOIN generate_series(1, 7) by
    WHERE NOT EXISTS (SELECT 1 FROM wall_cells w WHERE w.gx = bx AND w.gy = by)
      AND NOT (bx = 1 AND by = 1)
      AND NOT (bx = 7 AND by = 7)
      -- 3-step Manhattan open bubbles from each spawn (symmetric under 180°).
      AND NOT ((bx - 1) + (by - 1) <= 3)
      AND NOT ((7 - bx) + (7 - by) <= 3)
      -- Interior cross lanes (structured paths toward mid).
      AND NOT (bx = 4 AND by IN (2, 3, 5, 6))
      AND NOT (by = 4 AND bx IN (2, 3, 5, 6))
  ),
  brk_agg AS (
    SELECT coalesce(jsonb_agg(jsonb_build_array(x, y) ORDER BY y, x), '[]'::jsonb) AS breakables
    FROM brk
  )
  SELECT jsonb_build_object(
    'w', 9,
    'h', 9,
    'bombRadius', 1,
    'fuseTicksDefault', 6,
    'maxBombsPerPlayer', 2,
    'maxSimTicks', 200,
    'suddenDeathStartTick', 140,
    'suddenDeathBombRadius', 2,
    'rulesPhase', 'normal',
    'turnSeat', 0,
    'players', jsonb_build_object(
      '0', jsonb_build_object('x', 1, 'y', 1),
      '1', jsonb_build_object('x', 7, 'y', 7)
    ),
    'bombs', '[]'::jsonb,
    'walls', (SELECT walls FROM walls_agg),
    'breakables', (SELECT breakables FROM brk_agg),
    'meta', '{}'::jsonb
  );
$$;

COMMENT ON FUNCTION public.ov2_bomber_arena_initial_board_json() IS
  'Rebuild v2: 9×9, spawn bubbles (Manhattan≤3), lane cross, fuse=6, max bombs=2, anti-stall meta on board.';

REVOKE ALL ON FUNCTION public.ov2_bomber_arena_initial_board_json() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_bomber_arena_initial_board_json() TO anon, authenticated, service_role;

COMMIT;
