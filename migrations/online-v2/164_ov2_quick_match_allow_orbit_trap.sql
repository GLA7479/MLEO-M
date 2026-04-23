-- OV2 Quick Match: allow Orbit Trap (QM eligibility + max table size).
-- Apply after orbit-trap shared integration (162+) and after the migration that currently defines
-- `ov2_qm_allowed_product` / `ov2_qm_max_players_for_product` with Tanks (150_ov2_tanks_v1_shared_policy_allowlist.sql).
-- This file only extends QM helpers; it does not change `ov2_shared_leave_room` or economy entry policy.

BEGIN;

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
    'ov2_tanks',
    'ov2_orbit_trap'
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
    WHEN 'ov2_orbit_trap' THEN 4
    ELSE 4
  END;
$$;

COMMIT;
