-- sql/base_atomic_rpc.sql
-- Atomic RPC functions for BASE actions
-- These functions ensure atomicity by doing everything in a single transaction

BEGIN;

-- Needed when OUT types change (fractional banked_mleo on device vs whole MLEO to vault).
DROP FUNCTION IF EXISTS public.base_ship_to_vault(text);
DROP FUNCTION IF EXISTS public.base_launch_expedition(text);

-- ============================================================================
-- 1) base_ship_to_vault - Ship banked MLEO to shared vault (ATOMIC)
-- ============================================================================
-- Vault delta is whole MLEO (bigint). Fractional banked stays on device after ship.

CREATE OR REPLACE FUNCTION public.base_ship_to_vault(
  p_device_id text
)
RETURNS TABLE(
  shipped bigint,
  consumed bigint,
  new_banked_mleo numeric,
  new_sent_today bigint,
  new_total_banked bigint,
  new_commander_xp bigint,
  vault_balance bigint,
  state jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.base_device_state%ROWTYPE;
  v_banked_mleo numeric;
  v_sent_today bigint;
  v_blueprint_level integer;
  v_logistics_level integer;
  v_ship_whole bigint;
  v_shipped bigint;
  v_new_banked_mleo numeric;
  v_new_sent_today bigint;
  v_new_total_banked bigint;
  v_commander_xp bigint;
  v_vault_balance bigint;
  v_stats jsonb;
  v_vault_delta_result record;
BEGIN
  -- Get and lock state
  v_state := public.base_get_or_create_state(p_device_id);
  
  SELECT *
  INTO v_state
  FROM public.base_device_state
  WHERE device_id = p_device_id
  FOR UPDATE;

  v_banked_mleo := round(coalesce(v_state.banked_mleo, 0::numeric), 4);
  v_sent_today := coalesce(v_state.sent_today, 0);
  v_blueprint_level := coalesce(v_state.blueprint_level, 0);
  v_logistics_level := coalesce((coalesce(v_state.buildings, '{}'::jsonb)->>'logisticsCenter')::integer, 0);
  v_stats := coalesce(v_state.stats, '{}'::jsonb);

  IF v_banked_mleo <= 0 THEN
    RAISE EXCEPTION 'Nothing ready to ship yet';
  END IF;

  v_ship_whole := floor(v_banked_mleo)::bigint;
  IF v_ship_whole < 1 THEN
    RAISE EXCEPTION 'Nothing ready to ship yet';
  END IF;

  v_shipped := v_ship_whole;

  SELECT * INTO v_vault_delta_result
  FROM public.sync_vault_delta(
    'mleo-base-ship',
    v_shipped,
    p_device_id,
    NULL,
    md5(random()::text || clock_timestamp()::text)::text
  );

  v_vault_balance := coalesce((v_vault_delta_result.new_balance), 0);

  v_new_banked_mleo := round(v_banked_mleo - v_ship_whole::numeric, 4);
  v_new_sent_today := v_sent_today;
  v_new_total_banked := coalesce(v_state.total_banked, 0) + v_shipped;
  v_commander_xp := coalesce(v_state.commander_xp, 0) + greatest(10, floor(v_shipped / 50));

  v_stats := jsonb_set(
    v_stats,
    '{shippedToday}',
    to_jsonb(coalesce((v_stats->>'shippedToday')::bigint, 0) + v_shipped)
  );

  UPDATE public.base_device_state
  SET
    banked_mleo = v_new_banked_mleo,
    sent_today = v_new_sent_today,
    total_banked = v_new_total_banked,
    stats = v_stats,
    commander_xp = v_commander_xp,
    updated_at = now()
  WHERE device_id = p_device_id
  RETURNING * INTO v_state;

  PERFORM public.base_write_audit(
    p_device_id,
    'ship',
    jsonb_build_object(
      'shipped', v_shipped,
      'consumed', v_shipped,
      'mode', 'full_banked_transfer',
      'sent_today_before', v_sent_today,
      'sent_today_after', v_new_sent_today,
      'banked_before', v_banked_mleo,
      'banked_after', v_new_banked_mleo,
      'blueprint_level', v_blueprint_level,
      'logistics_level', coalesce((coalesce(v_state.buildings, '{}'::jsonb)->>'logisticsCenter')::integer, 0),
      'commander_xp_after', v_commander_xp,
      'vault_balance_after', v_vault_balance
    ),
    0,
    '[]'::jsonb
  );

  RETURN QUERY
  SELECT
    v_shipped,
    v_shipped,
    v_new_banked_mleo,
    v_new_sent_today,
    v_new_total_banked,
    v_commander_xp,
    v_vault_balance,
    to_jsonb(v_state);
END;
$$;

-- ============================================================================
-- 2) base_spend_shared_vault - Spend from shared vault (ATOMIC)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.base_spend_shared_vault(
  p_device_id text,
  p_spend_type text
)
RETURNS TABLE(
  cost bigint,
  new_blueprint_level integer,
  new_overclock_until timestamptz,
  new_resources jsonb,
  new_commander_xp bigint,
  new_total_shared_spent bigint,
  vault_balance bigint,
  state jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.base_device_state%ROWTYPE;
  v_resources jsonb;
  v_blueprint_level integer;
  v_cost bigint;
  v_data_cost integer;
  v_new_resources jsonb;
  v_new_blueprint_level integer;
  v_new_overclock_until timestamptz;
  v_commander_xp bigint;
  v_new_total_shared_spent bigint;
  v_stats jsonb;
  v_vault_balance bigint;
  v_vault_delta_result record;
  v_blueprint_base_cost bigint := 1800;
  v_blueprint_growth numeric := 1.65;
  v_overclock_cost bigint := 900;
  v_overclock_duration_ms bigint := 480000; -- 8 minutes
  v_overclock_energy_boost numeric := 0.18;
  v_refill_cost bigint := 160;
  v_energy_cap integer;
BEGIN
  -- Validate spend_type
  IF p_spend_type NOT IN ('blueprint', 'overclock', 'refill') THEN
    RAISE EXCEPTION 'Invalid spend_type: %', p_spend_type;
  END IF;

  -- Get and lock state
  v_state := public.base_get_or_create_state(p_device_id);
  
  SELECT *
  INTO v_state
  FROM public.base_device_state
  WHERE device_id = p_device_id
  FOR UPDATE;

  v_resources := coalesce(v_state.resources, '{}'::jsonb);
  v_blueprint_level := coalesce(v_state.blueprint_level, 0);
  v_stats := coalesce(v_state.stats, '{}'::jsonb);
  v_energy_cap := 148
  + (coalesce((coalesce(v_state.buildings, '{}'::jsonb)->>'powerCell')::integer, 0) * 42)
  + CASE
      WHEN coalesce((coalesce(v_state.research, '{}'::jsonb)->>'coolant')::boolean, false)
      THEN 22
      ELSE 0
    END;

  -- Calculate cost and validate resources based on spend_type
  IF p_spend_type = 'blueprint' THEN
    v_data_cost := 20 + (v_blueprint_level * 6);
    IF coalesce((v_resources->>'DATA')::integer, 0) < v_data_cost THEN
      RAISE EXCEPTION 'Need % DATA', v_data_cost;
    END IF;
    v_cost := floor(v_blueprint_base_cost * power(v_blueprint_growth, v_blueprint_level))::bigint;
    v_new_blueprint_level := v_blueprint_level + 1;
    v_new_resources := jsonb_set(
      v_resources,
      '{DATA}',
      to_jsonb(greatest(0, coalesce((v_resources->>'DATA')::integer, 0) - v_data_cost))
    );
    v_new_overclock_until := NULL;
    
  ELSIF p_spend_type = 'overclock' THEN
    v_data_cost := 12;

    IF coalesce((v_resources->>'DATA')::integer, 0) < v_data_cost THEN
      RAISE EXCEPTION 'Need 12 DATA';
    END IF;

    v_cost := v_overclock_cost;
    v_new_blueprint_level := v_blueprint_level;
    v_new_overclock_until := now() + (v_overclock_duration_ms || ' milliseconds')::interval;

    v_new_resources := jsonb_set(
      jsonb_set(
        v_resources,
        '{DATA}',
        to_jsonb(greatest(0, coalesce((v_resources->>'DATA')::integer, 0) - v_data_cost))
      ),
      '{ENERGY}',
      to_jsonb(
        least(
          v_energy_cap,
          coalesce((v_resources->>'ENERGY')::integer, 0)
          + ceil(v_energy_cap * v_overclock_energy_boost)::integer
        )
      ),
      true
    );
    
  ELSIF p_spend_type = 'refill' THEN
    v_data_cost := 5;
    IF coalesce((v_resources->>'ENERGY')::integer, 0) >= (v_energy_cap - 1) THEN
      RAISE EXCEPTION 'Energy is already near full';
    END IF;
    IF coalesce((v_resources->>'DATA')::integer, 0) < 5 THEN
      RAISE EXCEPTION 'Need 5 DATA';
    END IF;
    v_cost := v_refill_cost;
    v_new_blueprint_level := v_blueprint_level;
    v_new_overclock_until := v_state.overclock_until;
    v_new_resources := jsonb_set(
      jsonb_set(
        v_resources,
        '{ENERGY}',
        to_jsonb(v_energy_cap)
      ),
      '{DATA}',
      to_jsonb(greatest(0, coalesce((v_resources->>'DATA')::integer, 0) - 5))
    );
  END IF;

  IF v_cost <= 0 THEN
    RAISE EXCEPTION 'Invalid spend type configuration';
  END IF;

  -- Update vault (atomic) - subtract cost
  SELECT * INTO v_vault_delta_result
  FROM public.sync_vault_delta(
    'mleo-base-spend',
    -v_cost,
    p_device_id,
    NULL,
    md5(random()::text || clock_timestamp()::text)::text
  );

  v_vault_balance := coalesce((v_vault_delta_result.new_balance), 0);

  -- Update state
  v_commander_xp := coalesce(v_state.commander_xp, 0) + greatest(5, floor(v_cost / 40));
  v_new_total_shared_spent := coalesce(v_state.total_shared_spent, 0) + v_cost;
  
  v_stats := jsonb_set(
    v_stats,
    '{vaultSpentToday}',
    to_jsonb(coalesce((v_stats->>'vaultSpentToday')::bigint, 0) + v_cost)
  );

  UPDATE public.base_device_state
  SET
    resources = v_new_resources,
    blueprint_level = v_new_blueprint_level,
    overclock_until = v_new_overclock_until,
    commander_xp = v_commander_xp,
    total_shared_spent = v_new_total_shared_spent,
    stats = v_stats,
    updated_at = now()
  WHERE device_id = p_device_id
  RETURNING * INTO v_state;

  PERFORM public.base_write_audit(
    p_device_id,
    'spend',
    jsonb_build_object(
      'spend_type', p_spend_type,
      'cost', v_cost,
      'data_cost', coalesce(v_data_cost, 0),
      'blueprint_level_before', v_blueprint_level,
      'blueprint_level_after', coalesce(v_new_blueprint_level, v_blueprint_level),
      'vault_balance_after', v_vault_balance,
      'energy_after', coalesce((v_new_resources->>'ENERGY')::numeric, null),
      'data_after', coalesce((v_new_resources->>'DATA')::numeric, null),
      'total_shared_spent_after', v_new_total_shared_spent
    ),
    CASE
      WHEN p_spend_type = 'overclock' THEN 1
      ELSE 0
    END,
    CASE
      WHEN p_spend_type = 'overclock'
        THEN jsonb_build_array('overclock_used')
      ELSE '[]'::jsonb
    END
  );

  RETURN QUERY
  SELECT
    v_cost,
    v_new_blueprint_level,
    v_new_overclock_until,
    v_new_resources,
    v_commander_xp,
    v_new_total_shared_spent,
    v_vault_balance,
    to_jsonb(v_state);
END;
$$;

-- ============================================================================
-- 3) base_launch_expedition - Launch expedition (ATOMIC)
-- Note: Loot rolling is done in SQL using random()
-- ============================================================================

CREATE OR REPLACE FUNCTION public.base_launch_expedition(
  p_device_id text
)
RETURNS TABLE(
  loot jsonb,
  xp_gain integer,
  new_resources jsonb,
  new_banked_mleo numeric,
  new_expedition_ready_at timestamptz,
  new_commander_xp bigint,
  state jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.base_device_state%ROWTYPE;
  v_resources jsonb;
  v_buildings jsonb;
  v_research jsonb;
  v_expedition_ready_at timestamptz;
  v_bay_level integer;
  v_has_arcade_ops boolean;
  v_has_deep_scan boolean;
  v_rare_bonus numeric;
  v_base numeric;
  v_loot jsonb;
  v_ore integer;
  v_gold integer;
  v_scrap integer;
  v_data integer;
  v_banked_mleo integer;
  v_mleo_chance numeric;
  v_xp_gain integer;
  v_new_resources jsonb;
  v_new_banked_mleo numeric;
  v_new_expedition_ready_at timestamptz;
  v_commander_xp bigint;
  v_stats jsonb;
  v_expedition_cost integer := 36;
  v_expedition_data_cost integer := 4;
  v_expedition_cooldown_ms bigint := 120000;
  v_mleo_produced_today numeric := 0;
  v_daily_cap bigint := 3400;
  v_mleo_gain_mult numeric := 0.4;
  v_softcut numeric := 1;
  v_banked_add numeric := 0;
  v_raw_mleo numeric := 0;
BEGIN
  -- Get and lock state
  v_state := public.base_get_or_create_state(p_device_id);
  
  SELECT *
  INTO v_state
  FROM public.base_device_state
  WHERE device_id = p_device_id
  FOR UPDATE;

  v_resources := coalesce(v_state.resources, '{}'::jsonb);
  v_buildings := coalesce(v_state.buildings, '{}'::jsonb);
  v_research := coalesce(v_state.research, '{}'::jsonb);
  v_expedition_ready_at := v_state.expedition_ready_at;
  v_stats := coalesce(v_state.stats, '{}'::jsonb);

  -- Check cooldown
  IF v_expedition_ready_at IS NOT NULL AND v_expedition_ready_at > now() THEN
    RAISE EXCEPTION 'Expedition team is still out in the field';
  END IF;

  -- Check resources
  IF coalesce((v_resources->>'ENERGY')::integer, 0) < v_expedition_cost THEN
    RAISE EXCEPTION 'Not enough energy for an expedition';
  END IF;

  IF coalesce((v_resources->>'DATA')::integer, 0) < v_expedition_data_cost THEN
    RAISE EXCEPTION 'Need 4 DATA to launch expedition';
  END IF;

  -- Calculate loot
  v_bay_level := coalesce((v_buildings->>'expeditionBay')::integer, 0);
  v_has_arcade_ops := coalesce((v_research->>'arcadeOps')::boolean, false);
  v_has_deep_scan := coalesce((v_research->>'deepScan')::boolean, false);
  
  v_rare_bonus := CASE 
    WHEN v_has_arcade_ops THEN 1.12 
    ELSE 1.0 
  END * CASE 
    WHEN v_has_deep_scan THEN 1.18 
    ELSE 1.0 
  END;
  
  v_base := 1 + (v_bay_level * 0.12);
  
  v_ore := floor((35 + (random() * 65)) * v_base)::integer;
  v_gold := floor((20 + (random() * 45)) * v_base)::integer;
  v_scrap := floor((12 + (random() * 28)) * v_base)::integer;
  v_data := floor((6 + (random() * 14)) * v_rare_bonus)::integer;
  
  v_mleo_chance := 0.08 + (v_bay_level * 0.01) + CASE WHEN v_has_deep_scan THEN 0.02 ELSE 0.0 END;
  v_banked_mleo := CASE 
    WHEN random() < v_mleo_chance THEN floor(4 + (random() * 8))::integer 
    ELSE 0 
  END;

  v_mleo_produced_today := greatest(0, coalesce(v_state.mleo_produced_today, 0));
  SELECT bec.daily_mleo_cap, bec.mleo_gain_mult
  INTO v_daily_cap, v_mleo_gain_mult
  FROM public.base_economy_config bec
  WHERE bec.id = 1;
  v_daily_cap := coalesce(v_daily_cap, 3400);
  v_mleo_gain_mult := coalesce(v_mleo_gain_mult, 0.4);
  v_raw_mleo := v_banked_mleo::numeric * v_mleo_gain_mult;
  v_softcut := public.base_softcut_factor(v_mleo_produced_today, v_daily_cap);
  v_banked_add := round(
    least(
      v_raw_mleo * v_softcut,
      greatest(0::numeric, v_daily_cap::numeric - v_mleo_produced_today)
    ),
    4
  );
  v_mleo_produced_today := v_mleo_produced_today + v_banked_add;

  v_loot := jsonb_build_object(
    'ore', v_ore,
    'gold', v_gold,
    'scrap', v_scrap,
    'data', v_data,
    'bankedMleo', v_banked_add
  );

  -- Calculate XP gain
  v_xp_gain := CASE WHEN v_has_arcade_ops THEN 24 ELSE 20 END;

  -- Update resources
  v_new_resources := jsonb_build_object(
    'ORE', coalesce((v_resources->>'ORE')::integer, 0) + v_ore,
    'GOLD', coalesce((v_resources->>'GOLD')::integer, 0) + v_gold,
    'SCRAP', coalesce((v_resources->>'SCRAP')::integer, 0) + v_scrap,
    'ENERGY', greatest(0, coalesce((v_resources->>'ENERGY')::integer, 0) - v_expedition_cost),
    'DATA', greatest(0, coalesce((v_resources->>'DATA')::integer, 0) - v_expedition_data_cost) + v_data
  );

  v_new_banked_mleo := round(coalesce(v_state.banked_mleo, 0::numeric) + v_banked_add, 4);
  v_new_expedition_ready_at := now() + (v_expedition_cooldown_ms || ' milliseconds')::interval;
  v_commander_xp := coalesce(v_state.commander_xp, 0) + v_xp_gain;

  v_stats := jsonb_set(
    v_stats,
    '{expeditionsToday}',
    to_jsonb(coalesce((v_stats->>'expeditionsToday')::bigint, 0) + 1)
  );

  UPDATE public.base_device_state
  SET
    resources = v_new_resources,
    banked_mleo = v_new_banked_mleo,
    mleo_produced_today = round(v_mleo_produced_today, 4),
    expedition_ready_at = v_new_expedition_ready_at,
    stats = v_stats,
    commander_xp = v_commander_xp,
    updated_at = now()
  WHERE device_id = p_device_id
  RETURNING * INTO v_state;

  PERFORM public.base_write_audit(
    p_device_id,
    'expedition',
    jsonb_build_object(
      'loot', coalesce(v_loot, '{}'::jsonb),
      'xp_gain', coalesce(v_xp_gain, 0),
      'energy_after', coalesce((v_new_resources->>'ENERGY')::numeric, null),
      'data_after', coalesce((v_new_resources->>'DATA')::numeric, null),
      'cooldown_until', v_new_expedition_ready_at,
      'total_expeditions_after', coalesce((v_stats->>'expeditionsToday')::bigint, 0)
    ),
    0,
    '[]'::jsonb
  );

  RETURN QUERY
  SELECT
    v_loot,
    v_xp_gain,
    v_new_resources,
    v_new_banked_mleo,
    v_new_expedition_ready_at,
    v_commander_xp,
    to_jsonb(v_state);
END;
$$;

-- ============================================================================
-- 4) base_build_upgrade - Build/upgrade building (ATOMIC) with prerequisites
-- ============================================================================

CREATE OR REPLACE FUNCTION public.base_build_upgrade(
  p_device_id text,
  p_building_key text
)
RETURNS TABLE(
  new_level integer,
  cost jsonb,
  new_resources jsonb,
  new_buildings jsonb,
  new_commander_xp bigint,
  state jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.base_device_state%ROWTYPE;
  v_resources jsonb;
  v_buildings jsonb;
  v_stats jsonb;
  v_current_level integer;
  v_new_level integer;
  v_cost jsonb;
  v_base_cost jsonb;
  v_growth numeric;
  v_max_level integer;
  v_new_resources jsonb;
  v_new_buildings jsonb;
  v_commander_xp bigint;
  v_building_config jsonb;
  v_requires jsonb;
  v_req jsonb;
  v_early_discount numeric;
  kv record;
BEGIN
  v_building_config := '{
    "hq": {"baseCost": {"GOLD": 80, "ORE": 40}, "growth": 1.18, "maxLevel": null, "requires": []},
    "quarry": {"baseCost": {"GOLD": 60}, "growth": 1.18, "maxLevel": null, "requires": []},
    "tradeHub": {"baseCost": {"GOLD": 100, "ORE": 30}, "growth": 1.2, "maxLevel": null, "requires": [{"key":"quarry","lvl":1}]},
    "salvage": {"baseCost": {"GOLD": 150, "ORE": 90}, "growth": 1.22, "maxLevel": null, "requires": [{"key":"quarry","lvl":2}]},
    "refinery": {"baseCost": {"GOLD": 280, "ORE": 180, "SCRAP": 35}, "growth": 1.25, "maxLevel": null, "requires": [{"key":"salvage","lvl":1},{"key":"tradeHub","lvl":1}]},
    "powerCell": {"baseCost": {"GOLD": 190, "ORE": 70, "SCRAP": 55}, "growth": 1.22, "maxLevel": null, "requires": [{"key":"tradeHub","lvl":1}]},
    "minerControl": {"baseCost": {"GOLD": 320, "ORE": 120, "SCRAP": 40}, "growth": 1.22, "maxLevel": null, "requires": [{"key":"hq","lvl":2}]},
    "arcadeHub": {"baseCost": {"GOLD": 360, "ORE": 90, "SCRAP": 50}, "growth": 1.24, "maxLevel": null, "requires": [{"key":"hq","lvl":2}]},
    "expeditionBay": {"baseCost": {"GOLD": 500, "ORE": 180, "SCRAP": 85}, "growth": 1.26, "maxLevel": null, "requires": [{"key":"hq","lvl":3},{"key":"salvage","lvl":2}]},
    "logisticsCenter": {"baseCost": {"ORE": 240, "GOLD": 140, "SCRAP": 95}, "growth": 1.36, "maxLevel": 15, "requires": [{"key":"hq","lvl":2},{"key":"tradeHub","lvl":2}]},
    "researchLab": {"baseCost": {"ORE": 220, "GOLD": 170, "SCRAP": 105}, "growth": 1.38, "maxLevel": 15, "requires": [{"key":"hq","lvl":2},{"key":"minerControl","lvl":1}]},
    "repairBay": {"baseCost": {"ORE": 190, "GOLD": 120, "SCRAP": 130}, "growth": 1.34, "maxLevel": 15, "requires": [{"key":"hq","lvl":2},{"key":"powerCell","lvl":1}]}
  }'::jsonb;

  IF NOT (v_building_config ? p_building_key) THEN
    RAISE EXCEPTION 'Invalid building key: %', p_building_key;
  END IF;

  v_base_cost := v_building_config->p_building_key->'baseCost';
  v_growth := (v_building_config->p_building_key->>'growth')::numeric;
  v_requires := coalesce(v_building_config->p_building_key->'requires', '[]'::jsonb);

  v_max_level := CASE
    WHEN (v_building_config->p_building_key->>'maxLevel') IS NULL THEN NULL
    ELSE (v_building_config->p_building_key->>'maxLevel')::integer
  END;

  v_state := public.base_get_or_create_state(p_device_id);

  SELECT *
  INTO v_state
  FROM public.base_device_state
  WHERE device_id = p_device_id
  FOR UPDATE;

  v_resources := coalesce(v_state.resources, '{}'::jsonb);
  v_buildings := coalesce(v_state.buildings, '{}'::jsonb);
  v_stats := coalesce(v_state.stats, '{}'::jsonb);
  v_current_level := coalesce((v_buildings->>p_building_key)::integer, 0);
  v_early_discount := CASE
    WHEN v_current_level = 0 THEN 0.82
    WHEN v_current_level = 1 THEN 0.88
    WHEN v_current_level = 2 THEN 0.92
    ELSE 1
  END;

  IF v_max_level IS NOT NULL AND v_current_level >= v_max_level THEN
    IF p_building_key IN ('logisticsCenter', 'researchLab', 'repairBay') THEN
      RAISE EXCEPTION 'Building requires tier advancement';
    END IF;
    RAISE EXCEPTION 'Building is at max level';
  END IF;

  FOR v_req IN SELECT * FROM jsonb_array_elements(v_requires)
  LOOP
    IF coalesce((v_buildings->>(v_req->>'key'))::integer, 0) < coalesce((v_req->>'lvl')::integer, 0) THEN
      RAISE EXCEPTION 'Missing prerequisite: % lvl %',
        (v_req->>'key'),
        (v_req->>'lvl');
    END IF;
  END LOOP;

  v_cost := '{}'::jsonb;
  FOR kv IN SELECT key, value FROM jsonb_each(v_base_cost)
  LOOP
    v_cost := jsonb_set(
      v_cost,
      ARRAY[kv.key],
      to_jsonb(ceil((kv.value::text::numeric) * power(v_growth, v_current_level) * v_early_discount)::bigint),
      true
    );
  END LOOP;

  v_new_resources := v_resources;
  FOR kv IN SELECT key, value FROM jsonb_each(v_cost)
  LOOP
    IF coalesce((v_new_resources->>kv.key)::bigint, 0) < (kv.value::text::bigint) THEN
      RAISE EXCEPTION 'Insufficient resources';
    END IF;

    v_new_resources := jsonb_set(
      v_new_resources,
      ARRAY[kv.key],
      to_jsonb(greatest(0, coalesce((v_new_resources->>kv.key)::bigint, 0) - (kv.value::text::bigint))),
      true
    );
  END LOOP;

  v_new_level := v_current_level + 1;
  v_new_buildings := jsonb_set(v_buildings, ARRAY[p_building_key], to_jsonb(v_new_level), true);

  v_stats := jsonb_set(
    v_stats,
    '{upgradesToday}',
    to_jsonb(coalesce((v_stats->>'upgradesToday')::bigint, 0) + 1),
    true
  );

  v_commander_xp := coalesce(v_state.commander_xp, 0) + 18;

  UPDATE public.base_device_state
  SET
    resources = v_new_resources,
    buildings = v_new_buildings,
    stats = v_stats,
    commander_xp = v_commander_xp,
    updated_at = now()
  WHERE device_id = p_device_id
  RETURNING * INTO v_state;

  PERFORM public.base_write_audit(
    p_device_id,
    'build',
    jsonb_build_object(
      'building_key', p_building_key,
      'new_level', v_new_level,
      'hq_level', coalesce((coalesce(v_state.buildings, '{}'::jsonb)->>'hq')::integer, 1),
      'cost', coalesce(v_cost, '{}'::jsonb),
      'resources_after', v_new_resources
    ),
    CASE
      WHEN p_building_key = 'hq' THEN 1
      ELSE 0
    END,
    CASE
      WHEN p_building_key = 'hq'
        THEN jsonb_build_array('hq_upgrade')
      ELSE '[]'::jsonb
    END
  );

  RETURN QUERY
  SELECT
    v_new_level,
    v_cost,
    v_new_resources,
    v_new_buildings,
    v_commander_xp,
    to_jsonb(v_state);
END;
$$;

-- ============================================================================
-- 4b) base_advance_building_tier - Tier up support buildings at Lv 15 (ATOMIC)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.base_advance_building_tier(
  p_device_id text,
  p_building_key text
)
RETURNS TABLE(
  new_tier integer,
  new_level integer,
  cost jsonb,
  new_resources jsonb,
  new_buildings jsonb,
  new_commander_xp bigint,
  state jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.base_device_state%ROWTYPE;
  v_resources jsonb;
  v_buildings jsonb;
  v_tiers jsonb;
  v_current_tier integer;
  v_new_tier integer;
  v_current_level integer;
  v_base_cost jsonb;
  v_cost jsonb;
  v_growth numeric := 1.85;
  kv record;
  v_new_resources jsonb;
  v_new_buildings jsonb;
  v_new_tiers jsonb;
  v_commander_xp bigint;
  v_xp_gain bigint;
BEGIN
  IF p_building_key IS NULL OR p_building_key NOT IN ('logisticsCenter', 'researchLab', 'repairBay') THEN
    RAISE EXCEPTION 'Tier advancement is only available for logisticsCenter, researchLab, or repairBay';
  END IF;

  v_state := public.base_get_or_create_state(p_device_id);

  SELECT *
  INTO v_state
  FROM public.base_device_state
  WHERE device_id = p_device_id
  FOR UPDATE;

  v_resources := coalesce(v_state.resources, '{}'::jsonb);
  v_buildings := coalesce(v_state.buildings, '{}'::jsonb);
  v_tiers := coalesce(v_state.building_tiers, '{}'::jsonb);

  v_current_level := coalesce((v_buildings->>p_building_key)::integer, 0);
  IF v_current_level <> 15 THEN
    RAISE EXCEPTION 'Building must be level 15 before tier advancement (current level %)', v_current_level;
  END IF;

  v_current_tier := public.base_building_tier(v_tiers, p_building_key);
  IF v_current_tier >= 4 THEN
    RAISE EXCEPTION 'Building tier is already at maximum';
  END IF;

  v_base_cost := CASE p_building_key
    WHEN 'logisticsCenter' THEN '{"ORE": 2200, "GOLD": 1700, "SCRAP": 950, "DATA": 80}'::jsonb
    WHEN 'researchLab' THEN '{"ORE": 2100, "GOLD": 1850, "SCRAP": 980, "DATA": 90}'::jsonb
    WHEN 'repairBay' THEN '{"ORE": 1800, "GOLD": 1500, "SCRAP": 1200, "DATA": 65}'::jsonb
    ELSE '{}'::jsonb
  END;

  v_cost := '{}'::jsonb;
  FOR kv IN SELECT key, value FROM jsonb_each(v_base_cost)
  LOOP
    v_cost := jsonb_set(
      v_cost,
      ARRAY[kv.key],
      to_jsonb(ceil(kv.value::text::numeric * power(v_growth, v_current_tier - 1))::bigint),
      true
    );
  END LOOP;

  v_new_resources := v_resources;
  FOR kv IN SELECT key, value FROM jsonb_each(v_cost)
  LOOP
    IF coalesce((v_new_resources->>kv.key)::bigint, 0) < (kv.value::text::bigint) THEN
      RAISE EXCEPTION 'Insufficient resources';
    END IF;

    v_new_resources := jsonb_set(
      v_new_resources,
      ARRAY[kv.key],
      to_jsonb(greatest(0, coalesce((v_new_resources->>kv.key)::bigint, 0) - (kv.value::text::bigint))),
      true
    );
  END LOOP;

  v_new_tier := v_current_tier + 1;
  v_new_tiers := jsonb_set(v_tiers, ARRAY[p_building_key], to_jsonb(v_new_tier), true);
  v_new_buildings := jsonb_set(v_buildings, ARRAY[p_building_key], to_jsonb(1), true);

  v_xp_gain := 100 + 35 * v_current_tier;
  v_commander_xp := coalesce(v_state.commander_xp, 0) + v_xp_gain;

  UPDATE public.base_device_state
  SET
    resources = v_new_resources,
    buildings = v_new_buildings,
    building_tiers = v_new_tiers,
    commander_xp = v_commander_xp,
    updated_at = now()
  WHERE device_id = p_device_id
  RETURNING * INTO v_state;

  PERFORM public.base_write_audit(
    p_device_id,
    'building_tier',
    jsonb_build_object(
      'building_key', p_building_key,
      'previous_tier', v_current_tier,
      'new_tier', v_new_tier,
      'new_level', 1,
      'cost', coalesce(v_cost, '{}'::jsonb),
      'resources_after', v_new_resources,
      'commander_xp_gain', v_xp_gain
    ),
    0,
    '[]'::jsonb
  );

  RETURN QUERY
  SELECT
    v_new_tier,
    1,
    v_cost,
    v_new_resources,
    v_new_buildings,
    v_commander_xp,
    to_jsonb(v_state);
END;
$$;

-- ============================================================================
-- 4c) base_unlock_support_program - Unlock specialization (support buildings)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.base_unlock_support_program(
  p_device_id text,
  p_building_key text,
  p_program_key text
)
RETURNS TABLE(
  building_key text,
  program_key text,
  cost jsonb,
  new_resources jsonb,
  support_program_unlocks jsonb,
  support_program_active jsonb,
  new_commander_xp bigint,
  state jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.base_device_state%ROWTYPE;
  v_resources jsonb;
  v_buildings jsonb;
  v_tiers jsonb;
  v_unlocks jsonb;
  v_active jsonb;
  v_def jsonb;
  v_build_unlocks jsonb;
  v_cost jsonb;
  v_new_resources jsonb;
  v_cur_tier integer;
  v_min_tier integer;
  v_prog text;
  kv record;
  v_xp bigint;
BEGIN
  v_prog := trim(coalesce(p_program_key, ''));

  IF p_building_key IS NULL OR p_building_key NOT IN ('logisticsCenter', 'researchLab', 'repairBay') THEN
    RAISE EXCEPTION 'Support specialization invalid: building';
  END IF;

  IF v_prog = '' OR lower(v_prog) = 'none' THEN
    RAISE EXCEPTION 'Support specialization invalid: program';
  END IF;

  v_state := public.base_get_or_create_state(p_device_id);

  SELECT *
  INTO v_state
  FROM public.base_device_state
  WHERE device_id = p_device_id
  FOR UPDATE;

  v_resources := coalesce(v_state.resources, '{}'::jsonb);
  v_buildings := coalesce(v_state.buildings, '{}'::jsonb);
  v_tiers := coalesce(v_state.building_tiers, '{}'::jsonb);
  v_unlocks := coalesce(v_state.support_program_unlocks, public.base_default_support_program_unlocks());
  v_active := coalesce(v_state.support_program_active, public.base_default_support_program_active());

  IF coalesce((v_buildings->>p_building_key)::integer, 0) < 1 THEN
    RAISE EXCEPTION 'Support specialization invalid: building not constructed';
  END IF;

  v_def := public.base_support_program_definition(p_building_key, v_prog);
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'Support specialization invalid: program';
  END IF;

  v_cur_tier := public.base_building_tier(v_tiers, p_building_key);
  v_min_tier := coalesce((v_def->>'minTier')::integer, 99);
  IF v_cur_tier < v_min_tier THEN
    RAISE EXCEPTION 'Support specialization tier requirement not met';
  END IF;

  v_build_unlocks := coalesce(v_unlocks->p_building_key, '{}'::jsonb);
  IF coalesce((v_build_unlocks->>v_prog)::boolean, false) THEN
    RAISE EXCEPTION 'Support specialization already unlocked';
  END IF;

  v_cost := coalesce(v_def->'cost', '{}'::jsonb);
  v_new_resources := v_resources;

  FOR kv IN SELECT key, value FROM jsonb_each(v_cost)
  LOOP
    IF coalesce((v_new_resources->>kv.key)::bigint, 0) < (kv.value::text::bigint) THEN
      RAISE EXCEPTION 'Insufficient resources';
    END IF;

    v_new_resources := jsonb_set(
      v_new_resources,
      ARRAY[kv.key],
      to_jsonb(greatest(0, coalesce((v_new_resources->>kv.key)::bigint, 0) - (kv.value::text::bigint))),
      true
    );
  END LOOP;

  v_build_unlocks := jsonb_set(v_build_unlocks, ARRAY[v_prog], 'true'::jsonb, true);
  v_unlocks := jsonb_set(v_unlocks, ARRAY[p_building_key], v_build_unlocks, true);

  IF public.base_active_support_program(v_active, p_building_key) IS NULL THEN
    v_active := jsonb_set(v_active, ARRAY[p_building_key], to_jsonb(v_prog), true);
  END IF;

  v_xp := coalesce(v_state.commander_xp, 0) + 55;

  UPDATE public.base_device_state
  SET
    resources = v_new_resources,
    support_program_unlocks = v_unlocks,
    support_program_active = v_active,
    commander_xp = v_xp,
    updated_at = now()
  WHERE device_id = p_device_id
  RETURNING * INTO v_state;

  PERFORM public.base_write_audit(
    p_device_id,
    'unlock_support_program',
    jsonb_build_object(
      'building_key', p_building_key,
      'program_key', v_prog,
      'cost', coalesce(v_cost, '{}'::jsonb),
      'resources_after', v_new_resources,
      'support_program_unlocks', v_unlocks,
      'support_program_active', v_active,
      'commander_xp_after', v_xp
    ),
    0,
    '[]'::jsonb
  );

  RETURN QUERY
  SELECT
    p_building_key,
    v_prog,
    v_cost,
    v_new_resources,
    v_unlocks,
    v_active,
    v_xp,
    to_jsonb(v_state);
END;
$$;

-- ============================================================================
-- 4d) base_set_support_program - Set active specialization (support buildings)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.base_set_support_program(
  p_device_id text,
  p_building_key text,
  p_program_key text
)
RETURNS TABLE(
  building_key text,
  program_key text,
  support_program_active jsonb,
  state jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.base_device_state%ROWTYPE;
  v_unlocks jsonb;
  v_active jsonb;
  v_prog text;
  v_norm text;
BEGIN
  IF p_building_key IS NULL OR p_building_key NOT IN ('logisticsCenter', 'researchLab', 'repairBay') THEN
    RAISE EXCEPTION 'Support specialization invalid: building';
  END IF;

  v_state := public.base_get_or_create_state(p_device_id);

  SELECT *
  INTO v_state
  FROM public.base_device_state
  WHERE device_id = p_device_id
  FOR UPDATE;

  v_unlocks := coalesce(v_state.support_program_unlocks, public.base_default_support_program_unlocks());
  v_active := coalesce(v_state.support_program_active, public.base_default_support_program_active());

  v_norm := nullif(trim(lower(coalesce(p_program_key, ''))), '');
  IF v_norm IS NULL OR v_norm = 'none' THEN
    v_active := jsonb_set(v_active, ARRAY[p_building_key], 'null'::jsonb, true);

    UPDATE public.base_device_state
    SET
      support_program_active = v_active,
      updated_at = now()
    WHERE device_id = p_device_id
    RETURNING * INTO v_state;

    PERFORM public.base_write_audit(
      p_device_id,
      'set_support_program',
      jsonb_build_object(
        'building_key', p_building_key,
        'program_key', null,
        'support_program_active', v_active
      ),
      0,
      '[]'::jsonb
    );

    RETURN QUERY
    SELECT
      p_building_key,
      NULL::text,
      v_active,
      to_jsonb(v_state);
    RETURN;
  END IF;

  v_prog := trim(p_program_key);

  IF public.base_support_program_definition(p_building_key, v_prog) IS NULL THEN
    RAISE EXCEPTION 'Support specialization invalid: program';
  END IF;

  IF NOT coalesce((coalesce(v_unlocks->p_building_key, '{}'::jsonb)->>v_prog)::boolean, false) THEN
    RAISE EXCEPTION 'Support specialization not unlocked';
  END IF;

  v_active := jsonb_set(v_active, ARRAY[p_building_key], to_jsonb(v_prog), true);

  UPDATE public.base_device_state
  SET
    support_program_active = v_active,
    updated_at = now()
  WHERE device_id = p_device_id
  RETURNING * INTO v_state;

  PERFORM public.base_write_audit(
    p_device_id,
    'set_support_program',
    jsonb_build_object(
      'building_key', p_building_key,
      'program_key', v_prog,
      'support_program_active', v_active
    ),
    0,
    '[]'::jsonb
  );

  RETURN QUERY
  SELECT
    p_building_key,
    v_prog,
    v_active,
    to_jsonb(v_state);
END;
$$;

-- ============================================================================
-- 5) base_hire_crew - Hire crew (ATOMIC)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.base_hire_crew(
  p_device_id text
)
RETURNS TABLE(
  new_crew integer,
  cost jsonb,
  new_resources jsonb,
  state jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.base_device_state%ROWTYPE;
  v_resources jsonb;
  v_crew integer;
  v_cost jsonb;
  kv record;
BEGIN
  v_state := public.base_get_or_create_state(p_device_id);

  SELECT *
  INTO v_state
  FROM public.base_device_state
  WHERE device_id = p_device_id
  FOR UPDATE;

  v_resources := coalesce(v_state.resources, '{}'::jsonb);
  v_crew := coalesce(v_state.crew, 0);

  v_cost := jsonb_build_object(
    'GOLD', ceil(120 * power(1.16, v_crew))::bigint,
    'ORE', ceil(55 * power(1.14, v_crew))::bigint,
    'SCRAP', ceil(18 * power(1.16, v_crew))::bigint
  );

  FOR kv IN SELECT key, value FROM jsonb_each(v_cost)
  LOOP
    IF coalesce((v_resources->>kv.key)::bigint, 0) < (kv.value::text::bigint) THEN
      RAISE EXCEPTION 'Insufficient resources';
    END IF;
  END LOOP;

  FOR kv IN SELECT key, value FROM jsonb_each(v_cost)
  LOOP
    v_resources := jsonb_set(
      v_resources,
      ARRAY[kv.key],
      to_jsonb(greatest(0, coalesce((v_resources->>kv.key)::bigint, 0) - (kv.value::text::bigint))),
      true
    );
  END LOOP;

  UPDATE public.base_device_state
  SET
    crew = v_crew + 1,
    resources = v_resources,
    updated_at = now()
  WHERE device_id = p_device_id
  RETURNING * INTO v_state;

  PERFORM public.base_write_audit(
    p_device_id,
    'hire_crew',
    jsonb_build_object(
      'crew_after', coalesce(v_state.crew, 0),
      'crew_role_after', coalesce(v_state.crew_role, 'engineer'),
      'resources_after', v_resources,
      'commander_xp_after', coalesce(v_state.commander_xp, 0)
    ),
    0,
    '[]'::jsonb
  );

  RETURN QUERY
  SELECT
    coalesce(v_state.crew, 0),
    v_cost,
    v_resources,
    to_jsonb(v_state);
END;
$$;

-- ============================================================================
-- 6) base_perform_maintenance - Maintenance (ATOMIC)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.base_perform_maintenance(
  p_device_id text
)
RETURNS TABLE(
  stability_gain integer,
  new_stability numeric,
  cost jsonb,
  new_resources jsonb,
  new_commander_xp bigint,
  state jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.base_device_state%ROWTYPE;
  v_resources jsonb;
  v_stats jsonb;
  v_cost jsonb := jsonb_build_object('GOLD', 42, 'SCRAP', 22, 'DATA', 4);
  v_stability_gain integer := 34;
  v_xp_gain bigint := 20;
  v_new_stability numeric;
  v_repair_level integer := 0;
  v_maintenance_due_reduction numeric := 0;
  v_new_maintenance_due numeric := 0;
  v_new_commander_xp bigint;
  kv record;
BEGIN
  v_state := public.base_get_or_create_state(p_device_id);

  SELECT *
  INTO v_state
  FROM public.base_device_state
  WHERE device_id = p_device_id
  FOR UPDATE;

  v_resources := coalesce(v_state.resources, '{}'::jsonb);
  v_stats := coalesce(v_state.stats, '{}'::jsonb);
  v_repair_level := greatest(0, public.base_jsonb_int(coalesce(v_state.buildings, '{}'::jsonb), 'repairBay', 0));
  v_maintenance_due_reduction := 70 + (v_repair_level * 8);
  v_new_maintenance_due := greatest(0, coalesce(v_state.maintenance_due, 0) - v_maintenance_due_reduction);

  FOR kv IN SELECT key, value FROM jsonb_each(v_cost)
  LOOP
    IF coalesce((v_resources->>kv.key)::bigint, 0) < (kv.value::text::bigint) THEN
      RAISE EXCEPTION 'Insufficient resources';
    END IF;
  END LOOP;

  FOR kv IN SELECT key, value FROM jsonb_each(v_cost)
  LOOP
    v_resources := jsonb_set(
      v_resources,
      ARRAY[kv.key],
      to_jsonb(greatest(0, coalesce((v_resources->>kv.key)::bigint, 0) - (kv.value::text::bigint))),
      true
    );
  END LOOP;

  v_new_stability := least(100, greatest(72, coalesce(v_state.stability, 100) + v_stability_gain));
  v_new_commander_xp := coalesce(v_state.commander_xp, 0) + v_xp_gain;

  v_stats := jsonb_set(
    v_stats,
    '{maintenanceToday}',
    to_jsonb(coalesce((v_stats->>'maintenanceToday')::bigint, 0) + 1),
    true
  );

  UPDATE public.base_device_state
  SET
    resources = v_resources,
    stability = v_new_stability,
    maintenance_due = v_new_maintenance_due,
    stats = v_stats,
    commander_xp = v_new_commander_xp,
    updated_at = now()
  WHERE device_id = p_device_id
  RETURNING * INTO v_state;

  PERFORM public.base_write_audit(
    p_device_id,
    'maintenance',
    jsonb_build_object(
      'cost', v_cost,
      'vault_balance_after', null,
      'maintenance_due_after', v_new_maintenance_due,
      'stability_after', v_new_stability,
      'total_shared_spent_after', null
    ),
    0,
    '[]'::jsonb
  );

  RETURN QUERY
  SELECT
    v_stability_gain,
    v_new_stability,
    v_cost,
    v_resources,
    v_new_commander_xp,
    to_jsonb(v_state);
END;
$$;

-- ============================================================================
-- 7) base_install_module - Install module (ATOMIC)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.base_install_module(
  p_device_id text,
  p_module_key text
)
RETURNS TABLE(
  module_key text,
  cost jsonb,
  new_resources jsonb,
  new_modules jsonb,
  state jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.base_device_state%ROWTYPE;
  v_resources jsonb;
  v_modules jsonb;
  v_module_config jsonb;
  v_cost jsonb;
  kv record;
BEGIN
  v_module_config := '{
    "servoDrill": {"cost": {"GOLD": 320, "SCRAP": 50}},
    "vaultCompressor": {"cost": {"GOLD": 420, "ORE": 120, "SCRAP": 70}},
    "arcadeRelay": {"cost": {"GOLD": 520, "ORE": 160, "SCRAP": 90}},
    "minerLink": {"cost": {"GOLD": 700, "ORE": 260, "SCRAP": 110}}
  }'::jsonb;

  IF NOT (v_module_config ? p_module_key) THEN
    RAISE EXCEPTION 'Invalid module key: %', p_module_key;
  END IF;

  v_state := public.base_get_or_create_state(p_device_id);

  SELECT *
  INTO v_state
  FROM public.base_device_state
  WHERE device_id = p_device_id
  FOR UPDATE;

  v_resources := coalesce(v_state.resources, '{}'::jsonb);
  v_modules := coalesce(v_state.modules, '{}'::jsonb);
  v_cost := v_module_config->p_module_key->'cost';

  IF coalesce((v_modules->>p_module_key)::boolean, false) THEN
    RAISE EXCEPTION 'Module already installed';
  END IF;

  FOR kv IN SELECT key, value FROM jsonb_each(v_cost)
  LOOP
    IF coalesce((v_resources->>kv.key)::bigint, 0) < (kv.value::text::bigint) THEN
      RAISE EXCEPTION 'Insufficient resources';
    END IF;
  END LOOP;

  FOR kv IN SELECT key, value FROM jsonb_each(v_cost)
  LOOP
    v_resources := jsonb_set(
      v_resources,
      ARRAY[kv.key],
      to_jsonb(greatest(0, coalesce((v_resources->>kv.key)::bigint, 0) - (kv.value::text::bigint))),
      true
    );
  END LOOP;

  v_modules := jsonb_set(v_modules, ARRAY[p_module_key], 'true'::jsonb, true);

  UPDATE public.base_device_state
  SET
    resources = v_resources,
    modules = v_modules,
    updated_at = now()
  WHERE device_id = p_device_id
  RETURNING * INTO v_state;

  PERFORM public.base_write_audit(
    p_device_id,
    'install_module',
    jsonb_build_object(
      'module_key', p_module_key,
      'modules_after', v_modules,
      'resources_after', v_resources,
      'commander_xp_after', coalesce(v_state.commander_xp, 0)
    ),
    0,
    '[]'::jsonb
  );

  RETURN QUERY
  SELECT
    p_module_key,
    v_cost,
    v_resources,
    v_modules,
    to_jsonb(v_state);
END;
$$;

-- ============================================================================
-- 8) base_unlock_research - Unlock research (ATOMIC)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.base_unlock_research(
  p_device_id text,
  p_research_key text
)
RETURNS TABLE(
  research_key text,
  cost jsonb,
  new_resources jsonb,
  new_research jsonb,
  state jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.base_device_state%ROWTYPE;
  v_resources jsonb;
  v_research jsonb;
  v_research_config jsonb;
  v_cost jsonb;
  v_requires jsonb;
  v_req text;
  kv record;
BEGIN
  v_research_config := '{
    "coolant": {"cost": {"ORE": 240, "SCRAP": 70}, "requires": []},
    "routing": {"cost": {"ORE": 400, "GOLD": 260, "SCRAP": 120}, "requires": ["coolant"]},
    "fieldOps": {"cost": {"ORE": 650, "GOLD": 420, "SCRAP": 180}, "requires": ["routing"]},
    "minerSync": {"cost": {"ORE": 520, "GOLD": 300, "SCRAP": 130, "DATA": 20}, "requires": ["routing"]},
    "arcadeOps": {"cost": {"ORE": 600, "GOLD": 420, "SCRAP": 180, "DATA": 30}, "requires": ["fieldOps"]},
    "logistics": {"cost": {"ORE": 700, "GOLD": 460, "SCRAP": 220, "DATA": 40}, "requires": ["routing"]},
    "predictiveMaintenance": {"cost": {"ORE": 620, "GOLD": 420, "SCRAP": 260, "DATA": 36}, "requires": ["fieldOps"]},
    "deepScan": {"cost": {"ORE": 760, "GOLD": 520, "SCRAP": 240, "DATA": 48}, "requires": ["arcadeOps"]},
    "tokenDiscipline": {"cost": {"ORE": 820, "GOLD": 560, "SCRAP": 280, "DATA": 60}, "requires": ["logistics", "deepScan"]}
  }'::jsonb;

  IF NOT (v_research_config ? p_research_key) THEN
    RAISE EXCEPTION 'Invalid research key: %', p_research_key;
  END IF;

  v_state := public.base_get_or_create_state(p_device_id);

  SELECT *
  INTO v_state
  FROM public.base_device_state
  WHERE device_id = p_device_id
  FOR UPDATE;

  v_resources := coalesce(v_state.resources, '{}'::jsonb);
  v_research := coalesce(v_state.research, '{}'::jsonb);
  v_cost := v_research_config->p_research_key->'cost';
  v_requires := coalesce(v_research_config->p_research_key->'requires', '[]'::jsonb);

  IF coalesce((v_research->>p_research_key)::boolean, false) THEN
    RAISE EXCEPTION 'Research already completed';
  END IF;

  FOR v_req IN SELECT jsonb_array_elements_text(v_requires)
  LOOP
    IF NOT coalesce((v_research->>v_req)::boolean, false) THEN
      RAISE EXCEPTION 'Missing prerequisite: %', v_req;
    END IF;
  END LOOP;

  FOR kv IN SELECT key, value FROM jsonb_each(v_cost)
  LOOP
    IF coalesce((v_resources->>kv.key)::bigint, 0) < (kv.value::text::bigint) THEN
      RAISE EXCEPTION 'Insufficient resources';
    END IF;
  END LOOP;

  FOR kv IN SELECT key, value FROM jsonb_each(v_cost)
  LOOP
    v_resources := jsonb_set(
      v_resources,
      ARRAY[kv.key],
      to_jsonb(greatest(0, coalesce((v_resources->>kv.key)::bigint, 0) - (kv.value::text::bigint))),
      true
    );
  END LOOP;

  v_research := jsonb_set(v_research, ARRAY[p_research_key], 'true'::jsonb, true);

  UPDATE public.base_device_state
  SET
    resources = v_resources,
    research = v_research,
    updated_at = now()
  WHERE device_id = p_device_id
  RETURNING * INTO v_state;

  PERFORM public.base_write_audit(
    p_device_id,
    'unlock_research',
    jsonb_build_object(
      'research_key', p_research_key,
      'research_after', v_research,
      'resources_after', v_resources,
      'commander_xp_after', coalesce(v_state.commander_xp, 0)
    ),
    0,
    '[]'::jsonb
  );

  RETURN QUERY
  SELECT
    p_research_key,
    v_cost,
    v_resources,
    v_research,
    to_jsonb(v_state);
END;
$$;

-- ============================================================================
-- Audit table for base actions (ship, spend)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.base_action_audit (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  device_id text NOT NULL,
  action_type text NOT NULL,
  action_detail jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.base_action_audit
  ADD COLUMN IF NOT EXISTS suspicion_score integer NOT NULL DEFAULT 0;

ALTER TABLE public.base_action_audit
  ADD COLUMN IF NOT EXISTS suspicion_flags jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ============================================================================
-- Audit helper: base_write_audit
-- ============================================================================

CREATE OR REPLACE FUNCTION public.base_write_audit(
  p_device_id text,
  p_action_type text,
  p_action_detail jsonb DEFAULT '{}'::jsonb,
  p_suspicion_score integer DEFAULT 0,
  p_suspicion_flags jsonb DEFAULT '[]'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.base_action_audit (
    device_id,
    action_type,
    action_detail,
    suspicion_score,
    suspicion_flags
  )
  VALUES (
    p_device_id,
    p_action_type,
    coalesce(p_action_detail, '{}'::jsonb),
    greatest(0, coalesce(p_suspicion_score, 0)),
    coalesce(p_suspicion_flags, '[]'::jsonb)
  );
END;
$$;

-- ============================================================================
-- Security: Revoke from PUBLIC and anon/authenticated, grant to service_role
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.base_ship_to_vault(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.base_spend_shared_vault(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.base_launch_expedition(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.base_build_upgrade(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.base_advance_building_tier(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.base_unlock_support_program(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.base_set_support_program(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.base_hire_crew(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.base_perform_maintenance(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.base_install_module(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.base_unlock_research(text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.base_ship_to_vault(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.base_spend_shared_vault(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.base_launch_expedition(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.base_build_upgrade(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.base_advance_building_tier(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.base_unlock_support_program(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.base_set_support_program(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.base_hire_crew(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.base_perform_maintenance(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.base_install_module(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.base_unlock_research(text, text) TO service_role;

REVOKE ALL ON public.base_action_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.base_action_audit TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.base_action_audit_id_seq TO service_role;

REVOKE EXECUTE ON FUNCTION public.base_write_audit(text, text, jsonb, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.base_write_audit(text, text, jsonb, integer, jsonb) TO service_role;

COMMIT;
