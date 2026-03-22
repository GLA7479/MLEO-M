-- Fix: "missing FROM-clause entry for table v_row" in miners_get_state
-- Run this in Supabase SQL Editor (or your DB client) so miners state fetch works.

DROP FUNCTION IF EXISTS public.miners_softcut_factor(bigint, bigint);
DROP FUNCTION IF EXISTS public.miners_softcut_factor(numeric, bigint);
CREATE OR REPLACE FUNCTION public.miners_softcut_factor(
  p_used numeric,
  p_cap bigint
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg jsonb;
  v_ratio numeric := 0;
  v_result numeric := 1;
  v_elem record;
BEGIN
  IF p_cap IS NULL OR p_cap <= 0 THEN
    RETURN 1;
  END IF;

  SELECT mec.softcut_json INTO v_cfg
  FROM public.miners_economy_config mec
  WHERE mec.id = 1;

  v_ratio := greatest(0, coalesce(p_used, 0)::numeric) / p_cap::numeric;

  FOR v_elem IN
    SELECT x FROM jsonb_array_elements(coalesce(v_cfg, '[]'::jsonb)) AS x
  LOOP
    IF v_ratio <= coalesce((v_elem.x->>'upto')::numeric, 999999) THEN
      v_result := coalesce((v_elem.x->>'factor')::numeric, 1);
      RETURN greatest(0, v_result);
    END IF;
  END LOOP;

  RETURN greatest(0, v_result);
END;
$$;
