-- Idempotent tune of Appendix A (same JSON as 151 after tune + lib ov2SnakesBoardEdges.js).
-- Run on DBs that already applied an older 151 (22→41, 28→55, 94→71, …); migration runners
-- do not re-execute 151. All ov2_snakes_* board SQL for this product lives under snakes-and-ladders/.
-- (Renamed from 156_* to avoid clashing with migrations/online-v2/156_ov2_shared_integrate_snakes.sql.)

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_snakes_board_edges()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'ladders',
    '{"2":"15","7":"28","22":"43","27":"55","41":"63","50":"69","57":"76","65":"82","68":"90","71":"91"}'::jsonb,
    'snakes',
    '{"99":"80","94":"70","89":"52","86":"53","74":"35","62":"19","56":"40","49":"12","45":"23","16":"6"}'::jsonb
  );
$$;

REVOKE ALL ON FUNCTION public.ov2_snakes_board_edges() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_snakes_board_edges() TO anon, authenticated, service_role;

COMMIT;
