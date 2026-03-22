BEGIN;

CREATE OR REPLACE FUNCTION public.base_offline_factor_for_seconds(p_seconds numeric)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_seconds numeric := greatest(0, coalesce(p_seconds, 0));
  v_weighted numeric := 0;
  v_consumed numeric := 0;
  v_take numeric := 0;
BEGIN
  -- 0 .. 2h => 55%
  v_take := least(v_seconds, 7200);
  IF v_take > 0 THEN
    v_weighted := v_weighted + (v_take * 0.55);
    v_consumed := v_consumed + v_take;
    v_seconds := v_seconds - v_take;
  END IF;

  -- 2h .. 6h => 35%  (next 4h)
  v_take := least(v_seconds, 14400);
  IF v_take > 0 THEN
    v_weighted := v_weighted + (v_take * 0.35);
    v_consumed := v_consumed + v_take;
    v_seconds := v_seconds - v_take;
  END IF;

  -- 6h .. 12h => 18% (next 6h)
  v_take := least(v_seconds, 21600);
  IF v_take > 0 THEN
    v_weighted := v_weighted + (v_take * 0.18);
    v_consumed := v_consumed + v_take;
    v_seconds := v_seconds - v_take;
  END IF;

  IF v_consumed <= 0 THEN
    RETURN 0;
  END IF;

  RETURN v_weighted / v_consumed;
END;
$$;

CREATE OR REPLACE FUNCTION public.base_effective_offline_seconds(p_seconds numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    least(greatest(coalesce(p_seconds, 0), 0), 43200)
    * public.base_offline_factor_for_seconds(least(greatest(coalesce(p_seconds, 0), 0), 43200));
$$;

COMMIT;
