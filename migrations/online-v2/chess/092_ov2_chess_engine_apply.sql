-- OV2 Chess engine (part 2): PLACEHOLDER — full apply + mate/stalemate must land in a follow-up migration
-- before enabling `ov2_chess` in shared-room active products.
-- Core attack helpers live in 091_ov2_chess_engine_core.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_ch_move_is_legal(p_board jsonb, p_from int, p_to int, p_promo text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT false;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ch_apply_move(p_board jsonb, p_from int, p_to int, p_promo text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'ok', false,
    'code', 'CHESS_ENGINE_PENDING',
    'message', 'Implement ov2_ch_apply_move (replace this stub) before running chess RPC migrations.'
  );
$$;

COMMIT;
