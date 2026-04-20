-- Tune Appendix A edges: ladders 22→43, 27→55; snakes 94→70 plus 86→53, 56→40, 45→23.

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

COMMIT;
