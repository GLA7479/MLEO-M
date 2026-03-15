-- sql/base_atomic_rpc.sql
-- Atomic RPC functions for BASE actions
-- These functions ensure atomicity by doing everything in a single transaction

BEGIN;

-- ============================================================================
-- 1) base_ship_to_vault - Ship banked MLEO to shared vault (ATOMIC)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.base_ship_to_vault(
  p_device_id text
)
RETURNS TABLE(
  shipped bigint,
  consumed bigint,
  new_banked_mleo bigint,
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
  v_banked_mleo bigint;
  v_sent_today bigint;
  v_blueprint_level integer;
  v_ship_cap bigint;
  v_room bigint;
  v_factor numeric;
  v_bank_bonus numeric;
  v_shipped bigint;
  v_consumed bigint;
  v_new_banked_mleo bigint;
  v_new_sent_today bigint;
  v_new_total_banked bigint;
  v_commander_xp bigint;
  v_vault_balance bigint;
  v_stats jsonb;
  v_softcut_steps jsonb := '[
    {"upto": 0.60, "factor": 1.00},
    {"upto": 0.85, "factor": 0.72},
    {"upto": 1.00, "factor": 0.50},
    {"upto": 1.15, "factor": 0.30},
    {"upto": 9.99, "factor": 0.16}
  ]'::jsonb;
  v_step record;
  v_daily_ship_cap bigint := 12000;
  v_vault_delta_result record;
BEGIN
  -- Get and lock state
  v_state := public.base_get_or_create_state(p_device_id);
  
  SELECT *
  INTO v_state
  FROM public.base_device_state
  WHERE device_id = p_device_id
  FOR UPDATE;

  v_banked_mleo := coalesce(v_state.banked_mleo, 0);
  v_sent_today := coalesce(v_state.sent_today, 0);
  v_blueprint_level := coalesce(v_state.blueprint_level, 0);
  v_stats := coalesce(v_state.stats, '{}'::jsonb);

  -- Validation: must have banked MLEO
  IF v_banked_mleo <= 0 THEN
    RAISE EXCEPTION 'Nothing ready to ship yet';
  END IF;

  -- Calculate ship cap
  v_ship_cap := v_daily_ship_cap + (v_blueprint_level * 5000);
  v_room := greatest(0, v_ship_cap - v_sent_today);
  
  IF v_room <= 0 THEN
    RAISE EXCEPTION 'Today''s shipping cap is already full';
  END IF;

  -- Calculate softcut factor
  v_factor := 0.16; -- default
  IF v_ship_cap > 0 THEN
    FOR v_step IN SELECT * FROM jsonb_array_elements(v_softcut_steps)
    LOOP
      IF (v_sent_today::numeric / v_ship_cap::numeric) <= (v_step->>'upto')::numeric THEN
        v_factor := (v_step->>'factor')::numeric;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  -- Calculate bank bonus
  v_bank_bonus := 1 + (v_blueprint_level * 0.08);

  -- Calculate shipped amount
  v_shipped := least(
    floor(v_banked_mleo::numeric * v_factor * v_bank_bonus)::bigint,
    v_room
  );

  IF v_shipped <= 0 THEN
    RAISE EXCEPTION 'Shipment too small after softcut';
  END IF;

  -- Calculate consumed
  v_consumed := least(
    v_banked_mleo,
    greatest(1, ceil(v_shipped::numeric / greatest(0.01, v_factor * v_bank_bonus))::bigint)
  );

  -- Update vault (atomic)
  SELECT * INTO v_vault_delta_result
  FROM public.sync_vault_delta(
    'mleo-base-ship',
    v_shipped,
    p_device_id,
    NULL,
    md5(random()::text || clock_timestamp()::text)::text
  );

  v_vault_balance := coalesce((v_vault_delta_result.new_balance), 0);

  -- Update state
  v_new_banked_mleo := greatest(0, v_banked_mleo - v_consumed);
  v_new_sent_today := v_sent_today + v_shipped;
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

  RETURN QUERY
  SELECT
    v_shipped,
    v_consumed,
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
  p_spend_type text,
  p_energy_cap integer DEFAULT NULL
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
  v_blueprint_base_cost bigint := 2500;
  v_blueprint_growth numeric := 1.85;
  v_overclock_cost bigint := 900;
  v_overclock_duration_ms bigint := 480000; -- 8 minutes
  v_refill_cost bigint := 300;
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
  v_energy_cap := coalesce(p_energy_cap, 120);

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
    IF coalesce((v_resources->>'DATA')::integer, 0) < 12 THEN
      RAISE EXCEPTION 'Need 12 DATA';
    END IF;
    v_cost := v_overclock_cost;
    v_new_blueprint_level := v_blueprint_level;
    v_new_overclock_until := now() + (v_overclock_duration_ms || ' milliseconds')::interval;
    v_new_resources := jsonb_set(
      v_resources,
      '{DATA}',
      to_jsonb(greatest(0, coalesce((v_resources->>'DATA')::integer, 0) - 12))
    );
    
  ELSIF p_spend_type = 'refill' THEN
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
  new_banked_mleo bigint,
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
  v_new_banked_mleo bigint;
  v_new_expedition_ready_at timestamptz;
  v_commander_xp bigint;
  v_stats jsonb;
  v_expedition_cost integer := 36;
  v_expedition_data_cost integer := 4;
  v_expedition_cooldown_ms bigint := 120000;
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

  v_loot := jsonb_build_object(
    'ore', v_ore,
    'gold', v_gold,
    'scrap', v_scrap,
    'data', v_data,
    'bankedMleo', v_banked_mleo
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

  v_new_banked_mleo := coalesce(v_state.banked_mleo, 0) + v_banked_mleo;
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
    expedition_ready_at = v_new_expedition_ready_at,
    stats = v_stats,
    commander_xp = v_commander_xp,
    updated_at = now()
  WHERE device_id = p_device_id
  RETURNING * INTO v_state;

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
-- 4) base_build_upgrade - Build/upgrade building (ATOMIC)
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
  kv record;
BEGIN
  -- Building configurations (must match client)
  v_building_config := '{
    "hq": {"baseCost": {"GOLD": 80, "ORE": 40}, "growth": 1.18, "maxLevel": null},
    "quarry": {"baseCost": {"GOLD": 60}, "growth": 1.18, "maxLevel": null},
    "tradeHub": {"baseCost": {"GOLD": 100, "ORE": 30}, "growth": 1.2, "maxLevel": null},
    "salvage": {"baseCost": {"GOLD": 150, "ORE": 90}, "growth": 1.22, "maxLevel": null},
    "refinery": {"baseCost": {"GOLD": 280, "ORE": 180, "SCRAP": 35}, "growth": 1.25, "maxLevel": null},
    "powerCell": {"baseCost": {"GOLD": 240, "SCRAP": 45}, "growth": 1.24, "maxLevel": null},
    "minerControl": {"baseCost": {"GOLD": 320, "ORE": 120, "SCRAP": 40}, "growth": 1.22, "maxLevel": null},
    "arcadeHub": {"baseCost": {"GOLD": 360, "ORE": 90, "SCRAP": 50}, "growth": 1.24, "maxLevel": null},
    "expeditionBay": {"baseCost": {"GOLD": 500, "ORE": 180, "SCRAP": 85}, "growth": 1.26, "maxLevel": null},
    "logisticsCenter": {"baseCost": {"ORE": 220, "GOLD": 180, "SCRAP": 90}, "growth": 1.7, "maxLevel": 15},
    "researchLab": {"baseCost": {"ORE": 180, "GOLD": 240, "SCRAP": 110}, "growth": 1.75, "maxLevel": 15},
    "repairBay": {"baseCost": {"ORE": 160, "GOLD": 160, "SCRAP": 140}, "growth": 1.7, "maxLevel": 15}
  }'::jsonb;

  -- Validate building_key
  IF NOT (v_building_config ? p_building_key) THEN
    RAISE EXCEPTION 'Invalid building key: %', p_building_key;
  END IF;

  -- Get building config
  v_base_cost := v_building_config->p_building_key->'baseCost';
  v_growth := (v_building_config->p_building_key->>'growth')::numeric;
  v_max_level := CASE 
    WHEN (v_building_config->p_building_key->>'maxLevel') IS NULL THEN NULL
    ELSE (v_building_config->p_building_key->>'maxLevel')::integer
  END;

  -- Get and lock state
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

  -- Check max level
  IF v_max_level IS NOT NULL AND v_current_level >= v_max_level THEN
    RAISE EXCEPTION 'Building is at max level';
  END IF;

  -- Calculate cost
  v_cost := '{}'::jsonb;
  FOR kv IN SELECT key, value FROM jsonb_each(v_base_cost)
  LOOP
    v_cost := jsonb_set(
      v_cost,
      ARRAY[kv.key],
      to_jsonb(floor((kv.value::text::numeric) * power(v_growth, v_current_level))::bigint)
    );
  END LOOP;

  -- Validate resources
  FOR kv IN SELECT key, value FROM jsonb_each(v_cost)
  LOOP
    IF coalesce((v_resources->>kv.key)::integer, 0) < (kv.value::text::bigint) THEN
      RAISE EXCEPTION 'Insufficient resources';
    END IF;
  END LOOP;

  -- Calculate new resources
  v_new_resources := v_resources;
  FOR kv IN SELECT key, value FROM jsonb_each(v_cost)
  LOOP
    v_new_resources := jsonb_set(
      v_new_resources,
      ARRAY[kv.key],
      to_jsonb(greatest(0, coalesce((v_resources->>kv.key)::integer, 0) - (kv.value::text::bigint)))
    );
  END LOOP;

  -- Update building level
  v_new_level := v_current_level + 1;
  v_new_buildings := jsonb_set(v_buildings, ARRAY[p_building_key], to_jsonb(v_new_level));

  -- Update stats and XP
  v_stats := jsonb_set(
    v_stats,
    '{upgradesToday}',
    to_jsonb(coalesce((v_stats->>'upgradesToday')::bigint, 0) + 1)
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
-- Security: Revoke from anon/authenticated, grant to service_role
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.base_ship_to_vault(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.base_spend_shared_vault(text, text, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.base_launch_expedition(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.base_build_upgrade(text, text) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.base_ship_to_vault(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.base_spend_shared_vault(text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.base_launch_expedition(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.base_build_upgrade(text, text) TO service_role;

COMMIT;
