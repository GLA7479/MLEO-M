-- OV2 Tanks V1: economy entry policy + QM allowlist + max players (shared integration slice only).
-- File: 150_ov2_tanks_v1_shared_policy_allowlist.sql (renumbered from 148 — do not reuse migration numbers).
-- Apply after 147_ov2_tanks_v1_rpcs.sql and after the migration that currently owns `ov2_shared_leave_room`
-- (today: 156_ov2_shared_integrate_snakes.sql). Re-run order: apply 156 first, then this file, OR merge manually.
-- This file intentionally does NOT replace `ov2_shared_leave_room` (Tanks mid-match forfeit wiring is a later pass).

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
    WHEN 'ov2_backgammon' THEN 'ON_HOST_START'
    WHEN 'ov2_checkers' THEN 'ON_HOST_START'
    WHEN 'ov2_chess' THEN 'ON_HOST_START'
    WHEN 'ov2_dominoes' THEN 'ON_HOST_START'
    WHEN 'ov2_fourline' THEN 'ON_HOST_START'
    WHEN 'ov2_flipgrid' THEN 'ON_HOST_START'
    WHEN 'ov2_meldmatch' THEN 'ON_HOST_START'
    WHEN 'ov2_colorclash' THEN 'ON_HOST_START'
    WHEN 'ov2_fleet_hunt' THEN 'ON_HOST_START'
    WHEN 'ov2_goal_duel' THEN 'ON_HOST_START'
    WHEN 'ov2_snakes_and_ladders' THEN 'ON_HOST_START'
    WHEN 'ov2_tanks' THEN 'ON_HOST_START'
    WHEN 'ov2_community_cards' THEN 'NONE'
    ELSE 'NONE'
  END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_qm_allowed_product(p_game text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT trim(COALESCE(p_game, '')) IN (
    'ov2_ludo',
    'ov2_rummy51',
    'ov2_bingo',
    'ov2_backgammon',
    'ov2_checkers',
    'ov2_chess',
    'ov2_dominoes',
    'ov2_fourline',
    'ov2_flipgrid',
    'ov2_meldmatch',
    'ov2_colorclash',
    'ov2_fleet_hunt',
    'ov2_goal_duel',
    'ov2_snakes_and_ladders',
    'ov2_tanks'
  );
$$;

CREATE OR REPLACE FUNCTION public.ov2_qm_max_players_for_product(p_game text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE trim(COALESCE(p_game, ''))
    WHEN 'ov2_bingo' THEN 8
    WHEN 'ov2_backgammon' THEN 2
    WHEN 'ov2_checkers' THEN 2
    WHEN 'ov2_chess' THEN 2
    WHEN 'ov2_dominoes' THEN 2
    WHEN 'ov2_fourline' THEN 2
    WHEN 'ov2_flipgrid' THEN 2
    WHEN 'ov2_meldmatch' THEN 2
    WHEN 'ov2_fleet_hunt' THEN 2
    WHEN 'ov2_goal_duel' THEN 2
    WHEN 'ov2_tanks' THEN 2
    WHEN 'ov2_colorclash' THEN 4
    WHEN 'ov2_snakes_and_ladders' THEN 4
    ELSE 4
  END;
$$;

COMMIT;
