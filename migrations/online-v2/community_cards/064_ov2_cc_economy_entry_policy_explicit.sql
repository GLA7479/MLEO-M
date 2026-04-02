-- Explicit economy entry policy for Community Cards (cash live tables).
-- Apply after 063. Keeps SQL resolver self-documenting; behavior matches prior ELSE 'NONE'.
-- Community Cards must not be treated as shared-room per-round stake entry.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_shared_resolve_economy_entry_policy(p_product_game_id text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE trim(COALESCE(p_product_game_id, ''))
    WHEN 'ov2_ludo' THEN 'ON_HOST_START'
    WHEN 'ov2_bingo' THEN 'ON_HOST_START'
    WHEN 'ov2_rummy51' THEN 'ON_HOST_START'
    WHEN 'ov2_community_cards' THEN 'NONE'
    ELSE 'NONE'
  END;
$$;

COMMIT;
