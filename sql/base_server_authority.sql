BEGIN;

CREATE TABLE IF NOT EXISTS public.base_device_state (
  device_id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 7,
  last_day date NOT NULL DEFAULT current_date,
  banked_mleo bigint NOT NULL DEFAULT 0,
  sent_today bigint NOT NULL DEFAULT 0,
  total_banked bigint NOT NULL DEFAULT 0,
  total_shared_spent bigint NOT NULL DEFAULT 0,
  total_missions_done bigint NOT NULL DEFAULT 0,
  total_expeditions bigint NOT NULL DEFAULT 0,
  commander_level integer NOT NULL DEFAULT 1,
  commander_xp bigint NOT NULL DEFAULT 0,
  blueprint_level integer NOT NULL DEFAULT 0,
  crew integer NOT NULL DEFAULT 0,
  crew_role text NOT NULL DEFAULT 'engineer',
  commander_path text NOT NULL DEFAULT 'industry',
  overclock_until timestamptz,
  expedition_ready_at timestamptz,
  maintenance_due numeric(12,4) NOT NULL DEFAULT 0,
  stability numeric(10,4) NOT NULL DEFAULT 100,
  resources jsonb NOT NULL DEFAULT '{}'::jsonb,
  buildings jsonb NOT NULL DEFAULT '{}'::jsonb,
  paused_buildings jsonb NOT NULL DEFAULT '{}'::jsonb,
  building_power_modes jsonb NOT NULL DEFAULT '{}'::jsonb,
  modules jsonb NOT NULL DEFAULT '{}'::jsonb,
  research jsonb NOT NULL DEFAULT '{}'::jsonb,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  mission_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  contract_state jsonb NOT NULL DEFAULT '{"claimed":{}}'::jsonb,
  log jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_tick_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.base_device_state
  ADD COLUMN IF NOT EXISTS paused_buildings jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.base_device_state
  ADD COLUMN IF NOT EXISTS building_power_modes jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.base_device_state
  ADD COLUMN IF NOT EXISTS contract_state jsonb NOT NULL DEFAULT '{"claimed":{}}'::jsonb;

UPDATE public.base_device_state
SET contract_state = '{"claimed":{}}'::jsonb
WHERE contract_state IS NULL OR contract_state = '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_base_device_state_updated_at
  ON public.base_device_state(updated_at DESC);

CREATE OR REPLACE FUNCTION public.base_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_base_device_state_updated_at ON public.base_device_state;
CREATE TRIGGER trg_base_device_state_updated_at
BEFORE UPDATE ON public.base_device_state
FOR EACH ROW EXECUTE FUNCTION public.base_touch_updated_at();

ALTER TABLE public.base_device_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.base_device_state FROM anon, authenticated;
GRANT ALL ON public.base_device_state TO service_role;

CREATE OR REPLACE FUNCTION public.base_default_resources()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'ORE', 150,
    'GOLD', 332,
    'SCRAP', 34,
    'ENERGY', 140,
    'DATA', 10
  );
$$;

CREATE OR REPLACE FUNCTION public.base_default_buildings()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'hq', 1,
    'quarry', 1,
    'tradeHub', 0,
    'salvage', 0,
    'refinery', 0,
    'powerCell', 0,
    'minerControl', 0,
    'arcadeHub', 0,
    'expeditionBay', 0,
    'logisticsCenter', 0,
    'researchLab', 0,
    'repairBay', 0
  );
$$;

CREATE OR REPLACE FUNCTION public.base_default_stats()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'upgradesToday', 0,
    'shippedToday', 0,
    'expeditionsToday', 0,
    'vaultSpentToday', 0,
    'dataToday', 0,
    'maintenanceToday', 0
  );
$$;

CREATE OR REPLACE FUNCTION public.base_default_mission_state(p_day text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'dailySeed', coalesce(p_day, current_date::text),
    'completed', '{}'::jsonb,
    'claimed', '{}'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION public.base_default_contract_state()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'claimed', '{}'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION public.base_jsonb_int(j jsonb, k text, fallback integer DEFAULT 0)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce((j->>k)::integer, fallback);
$$;

CREATE OR REPLACE FUNCTION public.base_jsonb_num(j jsonb, k text, fallback numeric DEFAULT 0)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce((j->>k)::numeric, fallback);
$$;

CREATE OR REPLACE FUNCTION public.base_jsonb_bool(j jsonb, k text, fallback boolean DEFAULT false)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce((j->>k)::boolean, fallback);
$$;

CREATE OR REPLACE FUNCTION public.base_clamp_num(v numeric, vmin numeric, vmax numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT greatest(vmin, least(vmax, v));
$$;

CREATE OR REPLACE FUNCTION public.base_runtime_mode(j jsonb, k text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE coalesce((j->>k)::integer, 100)
    WHEN 0 THEN 0.00
    WHEN 25 THEN 0.25
    WHEN 50 THEN 0.50
    WHEN 75 THEN 0.75
    WHEN 100 THEN 1.00
    ELSE 1.00
  END;
$$;

CREATE OR REPLACE FUNCTION public.base_get_or_create_state(
  p_device_id text
)
RETURNS public.base_device_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.base_device_state%ROWTYPE;
BEGIN
  IF coalesce(trim(p_device_id), '') = '' THEN
    RAISE EXCEPTION 'device_id is required';
  END IF;

  INSERT INTO public.base_device_state (
    device_id,
    version,
    resources,
    buildings,
    modules,
    research,
    stats,
    mission_state,
    contract_state,
    log,
    expedition_ready_at,
    crew_role,
    commander_path
  )
  VALUES (
    p_device_id,
    7,
    public.base_default_resources(),
    public.base_default_buildings(),
    '{}'::jsonb,
    '{}'::jsonb,
    public.base_default_stats(),
    public.base_default_mission_state(current_date::text),
    public.base_default_contract_state(),
    '[]'::jsonb,
    now(),
    'engineer',
    'industry'
  )
  ON CONFLICT (device_id) DO NOTHING;

  SELECT *
  INTO v_state
  FROM public.base_device_state
  WHERE device_id = p_device_id
  FOR UPDATE;

  IF v_state.last_day <> current_date THEN
    UPDATE public.base_device_state
    SET
      last_day = current_date,
      sent_today = 0,
      stats = public.base_default_stats(),
      mission_state = public.base_default_mission_state(current_date::text),
      updated_at = now()
    WHERE device_id = p_device_id;

    SELECT *
    INTO v_state
    FROM public.base_device_state
    WHERE device_id = p_device_id
    FOR UPDATE;
  END IF;

  RETURN v_state;
END;
$$;

CREATE OR REPLACE FUNCTION public.base_reconcile_state(
  p_device_id text
)
RETURNS public.base_device_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.base_device_state%ROWTYPE;
  v_now timestamptz := now();
  v_elapsed_seconds numeric := 0;
  v_effective_seconds numeric := 0;
  v_pressure_seconds numeric := 0;
  v_energy_net_per_second numeric := 0;

  v_resources jsonb;
  v_buildings jsonb;
  v_modules jsonb;
  v_research jsonb;
  v_stats jsonb;
  v_mission_state jsonb;
  v_building_power_modes jsonb;

  v_hq integer := 1;
  v_quarry integer := 1;
  v_trade integer := 0;
  v_salvage integer := 0;
  v_refinery integer := 0;
  v_power integer := 0;
  v_miner integer := 0;
  v_arcade integer := 0;
  v_expedition integer := 0;
  v_logistics integer := 0;
  v_research_lab integer := 0;
  v_repair integer := 0;

  -- Power-mode multipliers for runtime-controlled buildings (0..1).
  v_quarry_mode numeric := 1.0;
  v_trade_mode numeric := 1.0;
  v_salvage_mode numeric := 1.0;
  v_refinery_mode numeric := 1.0;
  v_miner_mode numeric := 1.0;
  v_arcade_mode numeric := 1.0;
  v_logistics_mode numeric := 1.0;
  v_research_lab_mode numeric := 1.0;
  v_repair_mode numeric := 1.0;
  v_repair_support_mode numeric := 1.0;

  v_crew integer := 0;
  v_crew_role text := 'engineer';
  v_commander_path text := 'industry';
  v_blueprint integer := 0;

  v_energy_cap numeric := 140;
  v_energy_regen numeric := 6.0;
  v_stability numeric := 100;
  v_stability_factor numeric := 1.0;
  v_worker_bonus numeric := 1.0;
  v_hq_bonus numeric := 1.0;
  v_miner_bonus numeric := 1.0;
  v_arcade_bonus numeric := 1.0;
  v_overclock numeric := 1.0;
  v_overclock_drain_mult numeric := 1.0;
  v_bank_bonus numeric := 1.0;
  v_data_mult numeric := 1.0;
  v_ore_mult numeric := 1.0;
  v_gold_mult numeric := 1.0;
  v_scrap_mult numeric := 1.0;
  v_mleo_mult numeric := 1.0;
  v_maintenance_relief numeric := 1.0;
  v_ship_cap numeric := 1800;
  v_expedition_cooldown_seconds numeric := 120;

  v_energy_now numeric := 0;
  v_ore_now numeric := 0;
  v_gold_now numeric := 0;
  v_scrap_now numeric := 0;
  v_data_now numeric := 0;
  v_banked_now numeric := 0;
  v_sent_today numeric := 0;

  v_ore_gain numeric := 0;
  v_gold_gain numeric := 0;
  v_scrap_gain numeric := 0;
  v_data_gain numeric := 0;
  v_raw_banked_gain numeric := 0;

  v_ore_use numeric := 0;
  v_scrap_use numeric := 0;
  v_energy_use numeric := 0;

  v_maintenance_due numeric := 0;
BEGIN
  SELECT *
  INTO v_state
  FROM public.base_get_or_create_state(p_device_id);

  SELECT *
  INTO v_state
  FROM public.base_device_state
  WHERE device_id = p_device_id
  FOR UPDATE;

  IF v_state.version < 7 THEN
    UPDATE public.base_device_state
    SET
      version = 7,
      resources = coalesce(nullif(resources, '{}'::jsonb), public.base_default_resources()),
      buildings = coalesce(nullif(buildings, '{}'::jsonb), public.base_default_buildings()),
      stats = CASE
        WHEN stats = '{}'::jsonb THEN public.base_default_stats()
        ELSE stats
      END,
      mission_state = CASE
        WHEN mission_state = '{}'::jsonb THEN public.base_default_mission_state(current_date::text)
        ELSE mission_state
      END,
      contract_state = CASE
        WHEN contract_state IS NULL OR contract_state = '{}'::jsonb
          THEN public.base_default_contract_state()
        ELSE contract_state
      END,
      crew_role = coalesce(crew_role, 'engineer'),
      commander_path = coalesce(commander_path, 'industry'),
      last_tick_at = coalesce(last_tick_at, now())
    WHERE device_id = p_device_id;

    SELECT *
    INTO v_state
    FROM public.base_device_state
    WHERE device_id = p_device_id
    FOR UPDATE;
  END IF;

  IF v_state.last_tick_at IS NULL THEN
    UPDATE public.base_device_state
    SET last_tick_at = v_now
    WHERE device_id = p_device_id;

    SELECT *
    INTO v_state
    FROM public.base_device_state
    WHERE device_id = p_device_id
    FOR UPDATE;

    RETURN v_state;
  END IF;

  v_elapsed_seconds := extract(epoch FROM (v_now - v_state.last_tick_at));
  v_elapsed_seconds := least(greatest(v_elapsed_seconds, 0), 43200);
  IF v_elapsed_seconds <= 0 THEN
    RETURN v_state;
  END IF;
  IF v_elapsed_seconds <= 180 THEN
    v_effective_seconds := v_elapsed_seconds;
  ELSE
    v_effective_seconds := public.base_effective_offline_seconds(v_elapsed_seconds);
  END IF;

  IF v_elapsed_seconds <= 180 THEN
    v_pressure_seconds := v_elapsed_seconds;
  ELSE
    v_pressure_seconds := v_effective_seconds + ((v_elapsed_seconds - v_effective_seconds) * 0.35);
  END IF;

  v_resources := coalesce(v_state.resources, public.base_default_resources());
  v_buildings := coalesce(v_state.buildings, public.base_default_buildings());
  v_modules := coalesce(v_state.modules, '{}'::jsonb);
  v_research := coalesce(v_state.research, '{}'::jsonb);
  v_stats := coalesce(v_state.stats, public.base_default_stats());
  v_mission_state := coalesce(v_state.mission_state, public.base_default_mission_state(current_date::text));
  v_building_power_modes := coalesce(v_state.building_power_modes, '{}'::jsonb);

  IF coalesce(v_mission_state->>'dailySeed', '') <> current_date::text THEN
    v_mission_state := public.base_default_mission_state(current_date::text);
  END IF;

  v_hq := greatest(1, public.base_jsonb_int(v_buildings, 'hq', 1));
  v_quarry := greatest(0, public.base_jsonb_int(v_buildings, 'quarry', 0));
  v_trade := greatest(0, public.base_jsonb_int(v_buildings, 'tradeHub', 0));
  v_salvage := greatest(0, public.base_jsonb_int(v_buildings, 'salvage', 0));
  v_refinery := greatest(0, public.base_jsonb_int(v_buildings, 'refinery', 0));
  v_power := greatest(0, public.base_jsonb_int(v_buildings, 'powerCell', 0));
  v_miner := greatest(0, public.base_jsonb_int(v_buildings, 'minerControl', 0));
  v_arcade := greatest(0, public.base_jsonb_int(v_buildings, 'arcadeHub', 0));
  v_expedition := greatest(0, public.base_jsonb_int(v_buildings, 'expeditionBay', 0));
  v_logistics := greatest(0, public.base_jsonb_int(v_buildings, 'logisticsCenter', 0));
  v_research_lab := greatest(0, public.base_jsonb_int(v_buildings, 'researchLab', 0));
  v_repair := greatest(0, public.base_jsonb_int(v_buildings, 'repairBay', 0));

  -- Power-mode scaling: runtime-controlled passive buildings contribute proportionally.
  v_quarry_mode := CASE
    WHEN v_building_power_modes ? 'quarry' THEN public.base_runtime_mode(v_building_power_modes, 'quarry')
    WHEN public.base_jsonb_bool(v_state.paused_buildings, 'quarry', false) THEN 0.00
    ELSE 1.00
  END;
  v_trade_mode := CASE
    WHEN v_building_power_modes ? 'tradeHub' THEN public.base_runtime_mode(v_building_power_modes, 'tradeHub')
    WHEN public.base_jsonb_bool(v_state.paused_buildings, 'tradeHub', false) THEN 0.00
    ELSE 1.00
  END;
  v_salvage_mode := CASE
    WHEN v_building_power_modes ? 'salvage' THEN public.base_runtime_mode(v_building_power_modes, 'salvage')
    WHEN public.base_jsonb_bool(v_state.paused_buildings, 'salvage', false) THEN 0.00
    ELSE 1.00
  END;
  v_refinery_mode := CASE
    WHEN v_building_power_modes ? 'refinery' THEN public.base_runtime_mode(v_building_power_modes, 'refinery')
    WHEN public.base_jsonb_bool(v_state.paused_buildings, 'refinery', false) THEN 0.00
    ELSE 1.00
  END;
  v_miner_mode := CASE
    WHEN v_building_power_modes ? 'minerControl' THEN public.base_runtime_mode(v_building_power_modes, 'minerControl')
    WHEN public.base_jsonb_bool(v_state.paused_buildings, 'minerControl', false) THEN 0.00
    ELSE 1.00
  END;
  v_arcade_mode := CASE
    WHEN v_building_power_modes ? 'arcadeHub' THEN public.base_runtime_mode(v_building_power_modes, 'arcadeHub')
    WHEN public.base_jsonb_bool(v_state.paused_buildings, 'arcadeHub', false) THEN 0.00
    ELSE 1.00
  END;
  v_logistics_mode := CASE
    WHEN v_building_power_modes ? 'logisticsCenter' THEN public.base_runtime_mode(v_building_power_modes, 'logisticsCenter')
    WHEN public.base_jsonb_bool(v_state.paused_buildings, 'logisticsCenter', false) THEN 0.00
    ELSE 1.00
  END;
  v_research_lab_mode := CASE
    WHEN v_building_power_modes ? 'researchLab' THEN public.base_runtime_mode(v_building_power_modes, 'researchLab')
    WHEN public.base_jsonb_bool(v_state.paused_buildings, 'researchLab', false) THEN 0.00
    ELSE 1.00
  END;
  v_repair_mode := CASE
    WHEN v_building_power_modes ? 'repairBay' THEN public.base_runtime_mode(v_building_power_modes, 'repairBay')
    WHEN public.base_jsonb_bool(v_state.paused_buildings, 'repairBay', false) THEN 0.00
    ELSE 1.00
  END;
  v_repair_support_mode := greatest(v_repair_mode, 0.75);

  v_crew := greatest(0, coalesce(v_state.crew, 0));
  v_crew_role := coalesce(v_state.crew_role, 'engineer');
  v_commander_path := coalesce(v_state.commander_path, 'industry');
  v_blueprint := greatest(0, coalesce(v_state.blueprint_level, 0));

  v_stability := public.base_clamp_num(coalesce(v_state.stability, 100), 50, 100);
  v_stability_factor := 0.75 + (v_stability / 100.0) * 0.25;

  v_worker_bonus := 1 + v_crew * CASE
    WHEN public.base_jsonb_bool(v_research, 'fieldOps', false) THEN 0.03
    ELSE 0.02
  END;

  v_hq_bonus := 1 + v_hq * 0.03;
  v_miner_bonus := 1 + (v_miner * v_miner_mode) * 0.04;
  v_arcade_bonus := 1 + (v_arcade * v_arcade_mode) * 0.03;

  IF v_state.overclock_until IS NOT NULL AND v_state.overclock_until > v_now THEN
    v_overclock := 1.45;
    v_overclock_drain_mult := 0.78;
  ELSE
    v_overclock := 1.0;
    v_overclock_drain_mult := 1.0;
  END IF;

  v_ore_mult := v_worker_bonus * v_overclock;
  v_gold_mult := v_worker_bonus * v_overclock;
  v_scrap_mult := v_worker_bonus * v_overclock;
  v_mleo_mult := v_worker_bonus * v_overclock;
  v_data_mult := (1 + (v_research_lab * v_research_lab_mode) * 0.06) * v_arcade_bonus;
  v_bank_bonus := 1 + v_blueprint * 0.02 + (v_logistics * v_logistics_mode) * 0.025;
  v_maintenance_relief := 1 + (v_repair * v_repair_support_mode) * 0.08;

  IF v_crew_role = 'engineer' THEN
    v_maintenance_relief := v_maintenance_relief * 1.06;
  ELSIF v_crew_role = 'logistician' THEN
    v_bank_bonus := v_bank_bonus * 1.03;
  ELSIF v_crew_role = 'researcher' THEN
    v_data_mult := v_data_mult * 1.05;
  ELSIF v_crew_role = 'scout' THEN
    v_data_mult := v_data_mult * 1.02;
  ELSIF v_crew_role = 'operations' THEN
    v_gold_mult := v_gold_mult * 1.02;
    v_scrap_mult := v_scrap_mult * 1.02;
  END IF;

  IF v_commander_path = 'industry' THEN
    v_ore_mult := v_ore_mult * 1.03;
    v_maintenance_relief := v_maintenance_relief * 1.03;
  ELSIF v_commander_path = 'logistics' THEN
    v_bank_bonus := v_bank_bonus * 1.04;
  ELSIF v_commander_path = 'research' THEN
    v_data_mult := v_data_mult * 1.06;
  ELSIF v_commander_path = 'ecosystem' THEN
    v_gold_mult := v_gold_mult * 1.01;
    v_data_mult := v_data_mult * 1.02;
  END IF;

  IF public.base_jsonb_bool(v_modules, 'servoDrill', false) THEN
    v_ore_mult := v_ore_mult * 1.15;
  END IF;

  IF public.base_jsonb_bool(v_modules, 'vaultCompressor', false) THEN
    v_mleo_mult := v_mleo_mult * 1.04;
    v_bank_bonus := v_bank_bonus * 1.08;
  END IF;

  IF public.base_jsonb_bool(v_modules, 'arcadeRelay', false) THEN
    v_data_mult := v_data_mult * 1.12;
  END IF;

  IF public.base_jsonb_bool(v_modules, 'minerLink', false) THEN
    v_ore_mult := v_ore_mult * 1.08;
  END IF;

  IF public.base_jsonb_bool(v_research, 'routing', false) THEN
    v_bank_bonus := v_bank_bonus * 1.08;
  END IF;

  IF public.base_jsonb_bool(v_research, 'minerSync', false) THEN
    v_ore_mult := v_ore_mult * 1.12;
  END IF;

  IF public.base_jsonb_bool(v_research, 'arcadeOps', false) THEN
    v_data_mult := v_data_mult * 1.10;
  END IF;

  IF public.base_jsonb_bool(v_research, 'logistics', false) THEN
    v_bank_bonus := v_bank_bonus * 1.10;
  END IF;

  IF public.base_jsonb_bool(v_research, 'deepScan', false) THEN
    v_data_mult := v_data_mult * 1.18;
  END IF;

  IF public.base_jsonb_bool(v_research, 'tokenDiscipline', false) THEN
    v_data_mult := v_data_mult * 1.22;
    v_mleo_mult := v_mleo_mult * 0.88;
    v_bank_bonus := v_bank_bonus * 1.10;
  END IF;

  IF public.base_jsonb_bool(v_research, 'predictiveMaintenance', false) THEN
    v_maintenance_relief := v_maintenance_relief * 1.25;
  END IF;

  v_ore_mult := v_ore_mult * v_hq_bonus * v_miner_bonus * v_stability_factor;
  v_gold_mult := v_gold_mult * v_hq_bonus * v_stability_factor;
  v_scrap_mult := v_scrap_mult * v_hq_bonus * v_stability_factor;
  v_mleo_mult := v_mleo_mult * v_hq_bonus * v_stability_factor;
  v_data_mult := v_data_mult * v_hq_bonus * v_stability_factor;

  v_energy_cap := 140 + (v_power * 42);
  v_energy_regen := 6.0 + (v_power * 2.5);

  IF public.base_jsonb_bool(v_research, 'coolant', false) THEN
    v_energy_cap := v_energy_cap + 22;
    v_energy_regen := v_energy_regen + 1.35;
  END IF;

  v_ship_cap := 1800 + ((v_logistics * v_logistics_mode) * 320) + (v_blueprint * 90);

  v_expedition_cooldown_seconds := 120;

  v_energy_now := greatest(0, public.base_jsonb_num(v_resources, 'ENERGY', 0));
  v_ore_now := greatest(0, public.base_jsonb_num(v_resources, 'ORE', 0));
  v_gold_now := greatest(0, public.base_jsonb_num(v_resources, 'GOLD', 0));
  v_scrap_now := greatest(0, public.base_jsonb_num(v_resources, 'SCRAP', 0));
  v_data_now := greatest(0, public.base_jsonb_num(v_resources, 'DATA', 0));
  v_banked_now := greatest(0, coalesce(v_state.banked_mleo, 0));
  v_sent_today := greatest(0, coalesce(v_state.sent_today, 0));
  v_maintenance_due := greatest(0, coalesce(v_state.maintenance_due, 0));

  v_ore_gain := ((v_quarry * v_quarry_mode) * 1.35) * v_ore_mult;
  v_gold_gain := ((v_trade * v_trade_mode) * 0.60) * v_gold_mult;
  v_scrap_gain := ((v_salvage * v_salvage_mode) * 0.50) * v_scrap_mult;
  v_data_gain :=
      (((v_miner * v_miner_mode) * 0.14)
      + ((v_arcade * v_arcade_mode) * 0.11)
      + ((v_logistics * v_logistics_mode) * 0.06)
      + ((v_research_lab * v_research_lab_mode) * 0.22))
      * v_data_mult;

  v_energy_use :=
    (
        ((v_quarry * v_quarry_mode) * 0.60)
      + ((v_trade * v_trade_mode) * 0.62)
      + ((v_salvage * v_salvage_mode) * 0.62)
      + ((v_refinery * v_refinery_mode) * 0.90)
      + ((v_miner * v_miner_mode) * 0.16)
      + ((v_arcade * v_arcade_mode) * 0.18)
      + ((v_logistics * v_logistics_mode) * 0.16)
      + ((v_research_lab * v_research_lab_mode) * 0.20)
      + ((v_repair * v_repair_mode) * 0.18)
    ) * v_overclock_drain_mult;

  v_energy_net_per_second := v_energy_regen - v_energy_use;

  IF v_energy_net_per_second < 0 THEN
    v_effective_seconds := least(
      v_effective_seconds,
      greatest(0, floor(v_energy_now / abs(v_energy_net_per_second)))
    );
  END IF;

  IF v_elapsed_seconds > 0 THEN
    v_energy_now := public.base_clamp_num(
      v_energy_now + (v_energy_net_per_second * v_effective_seconds),
      0,
      v_energy_cap
    );

    v_ore_now := v_ore_now + (v_ore_gain * v_effective_seconds);
    v_gold_now := v_gold_now + (v_gold_gain * v_effective_seconds);
    v_scrap_now := v_scrap_now + (v_scrap_gain * v_effective_seconds);
    v_data_now := v_data_now + (v_data_gain * v_effective_seconds);

    v_ore_use := ((v_refinery * v_refinery_mode) * 1.8) * v_effective_seconds;
    v_scrap_use := ((v_refinery * v_refinery_mode) * 0.7) * v_effective_seconds;

    IF v_ore_now > 0 AND v_scrap_now > 0 AND (v_refinery * v_refinery_mode) > 0 THEN
      IF v_ore_now < v_ore_use THEN
        v_ore_use := v_ore_now;
      END IF;

      IF v_scrap_now < v_scrap_use THEN
        v_scrap_use := v_scrap_now;
      END IF;

      IF (v_refinery * v_refinery_mode * 1.8) > 0 AND (v_refinery * v_refinery_mode * 0.7) > 0 THEN
        v_raw_banked_gain := least(
          v_ore_use / 1.8,
          v_scrap_use / 0.7
        ) * 0.015 * v_mleo_mult * v_bank_bonus;
      ELSE
        v_raw_banked_gain := 0;
      END IF;

      v_ore_now := greatest(0, v_ore_now - (least(v_ore_use / 1.8, v_scrap_use / 0.7) * 1.8));
      v_scrap_now := greatest(0, v_scrap_now - (least(v_ore_use / 1.8, v_scrap_use / 0.7) * 0.7));
      v_banked_now := v_banked_now + v_raw_banked_gain;
    END IF;

    v_maintenance_due := v_maintenance_due + (
      (
        (v_hq * 0.022)
        + ((v_quarry * (v_quarry_mode * v_quarry_mode)) * 0.020)
        + ((v_trade * (v_trade_mode * v_trade_mode)) * 0.022)
        + ((v_salvage * (v_salvage_mode * v_salvage_mode)) * 0.024)
        + ((v_refinery * (v_refinery_mode * v_refinery_mode)) * 0.045)
        + (v_power * 0.014)
        + ((v_miner * (v_miner_mode * v_miner_mode)) * 0.015)
        + ((v_arcade * (v_arcade_mode * v_arcade_mode)) * 0.015)
        + (v_expedition * 0.014)
        + ((v_logistics * (v_logistics_mode * v_logistics_mode)) * 0.014)
        + ((v_research_lab * (v_research_lab_mode * v_research_lab_mode)) * 0.018)
        + ((v_repair * v_repair_mode) * 0.008)
      )
      / greatest(1.0, v_maintenance_relief)
    )
    * (v_pressure_seconds / 60.0);

    v_stability := public.base_clamp_num(
      v_stability - (
        (
          greatest(v_maintenance_due - 100, 0) * 0.0018
        ) + (
          (v_refinery * (v_refinery_mode * v_refinery_mode)) * CASE
            WHEN public.base_jsonb_bool(v_modules, 'minerLink', false) THEN 0.00045
            ELSE 0.00060
          END
        ) * v_pressure_seconds
      ),
      50,
      100
    );

    IF (v_repair * v_repair_support_mode) > 0 THEN
      v_stability := public.base_clamp_num(
        v_stability + (((v_repair * v_repair_support_mode) * 0.0024) * v_pressure_seconds),
        50,
        100
      );
    END IF;

    v_resources := jsonb_build_object(
      'ORE', floor(v_ore_now),
      'GOLD', floor(v_gold_now),
      'SCRAP', floor(v_scrap_now),
      'ENERGY', floor(greatest(0, least(v_energy_cap, v_energy_now))),
      'DATA', floor(v_data_now)
    );

    v_stats := jsonb_set(
      coalesce(v_stats, public.base_default_stats()),
      '{dataToday}',
      to_jsonb(coalesce((v_stats->>'dataToday')::numeric, 0) + floor(v_data_gain * v_effective_seconds)),
      true
    );

    v_mission_state := jsonb_set(
      jsonb_set(
        jsonb_set(coalesce(v_mission_state, public.base_default_mission_state(current_date::text)), '{dailySeed}', to_jsonb(current_date::text), true),
        '{completed,generate_data}',
        to_jsonb(
          least(
            coalesce((v_stats->>'dataToday')::numeric, 0),
            12
          )
        ),
        true
      ),
      '{completed,ship_mleo}',
      to_jsonb(coalesce((v_stats->>'shippedToday')::numeric, 0)),
      true
    );

    v_mission_state := jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            v_mission_state,
            '{completed,upgrade_building}',
            to_jsonb(coalesce((v_stats->>'upgradesToday')::numeric, 0)),
            true
          ),
          '{completed,run_expedition}',
          to_jsonb(coalesce((v_stats->>'expeditionsToday')::numeric, 0)),
          true
        ),
        '{completed,double_expedition}',
        to_jsonb(coalesce((v_stats->>'expeditionsToday')::numeric, 0)),
        true
      ),
      '{completed,perform_maintenance}',
      to_jsonb(coalesce((v_stats->>'maintenanceToday')::numeric, 0)),
      true
    );

    v_mission_state := jsonb_set(
      v_mission_state,
      '{completed,spend_vault}',
      to_jsonb(coalesce((v_stats->>'vaultSpentToday')::numeric, 0)),
      true
    );

    UPDATE public.base_device_state
    SET
      resources = v_resources,
      stats = v_stats,
      mission_state = v_mission_state,
      banked_mleo = floor(v_banked_now),
      maintenance_due = v_maintenance_due,
      stability = v_stability,
      last_tick_at = v_now,
      updated_at = now()
    WHERE device_id = p_device_id;
  ELSE
    UPDATE public.base_device_state
    SET
      last_tick_at = v_now,
      updated_at = now()
    WHERE device_id = p_device_id;
  END IF;

  SELECT *
  INTO v_state
  FROM public.base_device_state
  WHERE device_id = p_device_id;

  RETURN v_state;
END;
$$;

-- ============================================================================
-- Toggle passive building runtime (Pause/Resume)
-- ============================================================================
-- Runtime power mode (0/25/50/75/100) - scales passive output/drain contributions.
CREATE OR REPLACE FUNCTION public.base_set_building_power_mode(
  p_device_id text,
  p_building_key text,
  p_power_mode integer
)
RETURNS TABLE(
  power_mode integer,
  building_power_modes jsonb,
  state jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.base_device_state%ROWTYPE;
  v_building_power_modes jsonb;
  v_current_level integer;
BEGIN
  IF coalesce(trim(p_device_id), '') = '' THEN
    RAISE EXCEPTION 'device_id is required';
  END IF;

  IF coalesce(trim(p_building_key), '') = '' THEN
    RAISE EXCEPTION 'building_key is required';
  END IF;

  IF p_power_mode NOT IN (0, 25, 50, 75, 100) THEN
    RAISE EXCEPTION 'Invalid power mode';
  END IF;

  IF p_building_key NOT IN (
    'quarry',
    'tradeHub',
    'salvage',
    'refinery',
    'minerControl',
    'arcadeHub',
    'logisticsCenter',
    'researchLab',
    'repairBay'
  ) THEN
    RAISE EXCEPTION 'Invalid runtime-controlled building key';
  END IF;

  -- Reconcile first so we toggle against the latest computed state.
  PERFORM public.base_reconcile_state(p_device_id);

  SELECT *
  INTO v_state
  FROM public.base_device_state
  WHERE device_id = p_device_id
  FOR UPDATE;

  v_building_power_modes := coalesce(v_state.building_power_modes, '{}'::jsonb);
  v_current_level := coalesce((v_state.buildings->>p_building_key)::integer, 0);

  IF v_current_level <= 0 THEN
    RAISE EXCEPTION 'Building is not built yet';
  END IF;

  v_building_power_modes := jsonb_set(
    v_building_power_modes,
    ARRAY[p_building_key],
    to_jsonb(p_power_mode),
    true
  );

  UPDATE public.base_device_state
  SET
    building_power_modes = v_building_power_modes,
    updated_at = now()
  WHERE device_id = p_device_id
  RETURNING *
  INTO v_state;

  RETURN QUERY
  SELECT
    coalesce((v_state.building_power_modes->>p_building_key)::integer, 100),
    coalesce(v_state.building_power_modes, '{}'::jsonb),
    to_jsonb(v_state);
END;
$$;

CREATE OR REPLACE FUNCTION public.base_set_building_paused(
  p_device_id text,
  p_building_key text,
  p_paused boolean
)
RETURNS TABLE(
  paused boolean,
  paused_buildings jsonb,
  state jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.base_device_state%ROWTYPE;
  v_paused_buildings jsonb;
  v_current_level integer;
BEGIN
  IF coalesce(trim(p_device_id), '') = '' THEN
    RAISE EXCEPTION 'device_id is required';
  END IF;

  IF coalesce(trim(p_building_key), '') = '' THEN
    RAISE EXCEPTION 'building_key is required';
  END IF;

  IF p_building_key NOT IN (
    'quarry',
    'tradeHub',
    'salvage',
    'refinery',
    'minerControl',
    'arcadeHub',
    'logisticsCenter',
    'researchLab',
    'repairBay'
  ) THEN
    RAISE EXCEPTION 'Invalid pausable building key';
  END IF;

  -- Reconcile first so we toggle against the latest computed state.
  PERFORM public.base_reconcile_state(p_device_id);

  SELECT *
  INTO v_state
  FROM public.base_device_state
  WHERE device_id = p_device_id
  FOR UPDATE;

  v_paused_buildings := coalesce(v_state.paused_buildings, '{}'::jsonb);
  v_current_level := coalesce((v_state.buildings->>p_building_key)::integer, 0);

  IF v_current_level <= 0 THEN
    RAISE EXCEPTION 'Building is not built yet';
  END IF;

  v_paused_buildings := jsonb_set(
    v_paused_buildings,
    ARRAY[p_building_key],
    to_jsonb(coalesce(p_paused, false)),
    true
  );

  UPDATE public.base_device_state
  SET
    paused_buildings = v_paused_buildings,
    updated_at = now()
  WHERE device_id = p_device_id
  RETURNING *
  INTO v_state;

  RETURN QUERY
  SELECT
    coalesce((v_state.paused_buildings->>p_building_key)::boolean, false),
    coalesce(v_state.paused_buildings, '{}'::jsonb),
    to_jsonb(v_state);
END;
$$;

CREATE OR REPLACE FUNCTION public.base_claim_mission_reward(
  p_device_id text,
  p_mission_key text
)
RETURNS TABLE(state public.base_device_state)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.base_device_state%ROWTYPE;
  v_resources jsonb;
  v_stats jsonb;
  v_mission_state jsonb;
  v_claimed boolean := false;
  v_completed numeric := 0;
  v_target numeric := 0;
  v_xp_gain integer := 0;
BEGIN
  IF coalesce(trim(p_device_id), '') = '' THEN
    RAISE EXCEPTION 'device_id is required';
  END IF;

  IF coalesce(trim(p_mission_key), '') = '' THEN
    RAISE EXCEPTION 'mission_key is required';
  END IF;

  SELECT * INTO v_state
  FROM public.base_reconcile_state(p_device_id);

  SELECT * INTO v_state
  FROM public.base_device_state
  WHERE device_id = p_device_id
  FOR UPDATE;

  v_resources := coalesce(v_state.resources, '{}'::jsonb);
  v_stats := coalesce(v_state.stats, public.base_default_stats());
  v_mission_state := coalesce(v_state.mission_state, public.base_default_mission_state(current_date::text));

  IF coalesce(v_mission_state->>'dailySeed', '') <> current_date::text THEN
    v_mission_state := public.base_default_mission_state(current_date::text);
  END IF;

  v_claimed := coalesce((v_mission_state->'claimed'->>p_mission_key)::boolean, false);

  IF v_claimed THEN
    RAISE EXCEPTION 'Mission already claimed';
  END IF;

  IF p_mission_key = 'upgrade_building' THEN
    v_completed := coalesce((v_stats->>'upgradesToday')::numeric, 0);
    v_target := 1;
    v_resources := jsonb_set(v_resources, '{DATA}', to_jsonb(coalesce((v_resources->>'DATA')::int, 0) + 10), true);
    v_xp_gain := 30;
  ELSIF p_mission_key = 'run_expedition' THEN
    v_completed := coalesce((v_stats->>'expeditionsToday')::numeric, 0);
    v_target := 1;
    v_resources := jsonb_set(v_resources, '{SCRAP}', to_jsonb(coalesce((v_resources->>'SCRAP')::int, 0) + 24), true);
    v_xp_gain := 35;
  ELSIF p_mission_key = 'generate_data' THEN
    v_completed := coalesce((v_stats->>'dataToday')::numeric, 0);
    v_target := 12;
    v_resources := jsonb_set(v_resources, '{GOLD}', to_jsonb(coalesce((v_resources->>'GOLD')::int, 0) + 90), true);
    v_xp_gain := 30;
  ELSIF p_mission_key = 'perform_maintenance' THEN
    v_completed := coalesce((v_stats->>'maintenanceToday')::numeric, 0);
    v_target := 1;
    v_resources := jsonb_set(v_resources, '{DATA}', to_jsonb(coalesce((v_resources->>'DATA')::int, 0) + 8), true);
    v_xp_gain := 35;
  ELSIF p_mission_key = 'double_expedition' THEN
    v_completed := coalesce((v_stats->>'expeditionsToday')::numeric, 0);
    v_target := 2;
    v_resources := jsonb_set(v_resources, '{SCRAP}', to_jsonb(coalesce((v_resources->>'SCRAP')::int, 0) + 28), true);
    v_xp_gain := 40;
  ELSIF p_mission_key = 'ship_mleo' THEN
    v_completed := coalesce((v_stats->>'shippedToday')::numeric, 0);
    v_target := 60;
    v_resources := jsonb_set(v_resources, '{GOLD}', to_jsonb(coalesce((v_resources->>'GOLD')::int, 0) + 140), true);
    v_xp_gain := 45;
  ELSIF p_mission_key = 'spend_vault' THEN
    v_completed := coalesce((v_stats->>'vaultSpentToday')::numeric, 0);
    v_target := 50;
  v_resources := jsonb_set(v_resources, '{DATA}', to_jsonb(coalesce((v_resources->>'DATA')::int, 0) + 14), true);
  v_xp_gain := 55;
  ELSE
    RAISE EXCEPTION 'Invalid mission key';
  END IF;

  IF v_completed < v_target THEN
    RAISE EXCEPTION 'Mission not completed yet';
  END IF;

  v_mission_state := jsonb_set(
    jsonb_set(v_mission_state, '{dailySeed}', to_jsonb(current_date::text), true),
    ARRAY['claimed', p_mission_key],
    'true'::jsonb,
    true
  );

  UPDATE public.base_device_state
  SET
    resources = v_resources,
    mission_state = v_mission_state,
    commander_xp = coalesce(commander_xp, 0) + v_xp_gain,
    total_missions_done = coalesce(total_missions_done, 0) + 1,
    updated_at = now()
  WHERE device_id = p_device_id;

  PERFORM public.base_write_audit(
    p_device_id,
    'mission_claim',
    jsonb_build_object(
      'mission_key', p_mission_key,
      'reward', jsonb_build_object('XP', v_xp_gain),
      'resources_after', v_resources,
      'banked_mleo_after', coalesce(v_state.banked_mleo, 0),
      'commander_xp_after', coalesce(v_state.commander_xp, 0) + v_xp_gain,
      'mission_state_after', v_mission_state
    ),
    0,
    '[]'::jsonb
  );

  RETURN QUERY
  SELECT *
  FROM public.base_device_state
  WHERE device_id = p_device_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.base_set_profile(
  p_device_id text,
  p_crew_role text DEFAULT NULL,
  p_commander_path text DEFAULT NULL
)
RETURNS TABLE(state public.base_device_state)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.base_device_state%ROWTYPE;
  v_new_crew_role text;
  v_new_commander_path text;
BEGIN
  IF coalesce(trim(p_device_id), '') = '' THEN
    RAISE EXCEPTION 'device_id is required';
  END IF;

  SELECT * INTO v_state
  FROM public.base_reconcile_state(p_device_id);

  SELECT * INTO v_state
  FROM public.base_device_state
  WHERE device_id = p_device_id
  FOR UPDATE;

  v_new_crew_role := coalesce(nullif(trim(p_crew_role), ''), v_state.crew_role, 'engineer');
  v_new_commander_path := coalesce(nullif(trim(p_commander_path), ''), v_state.commander_path, 'industry');

  IF v_new_crew_role NOT IN ('engineer', 'logistician', 'researcher', 'scout', 'operations') THEN
    RAISE EXCEPTION 'Invalid crew role';
  END IF;

  IF v_new_commander_path NOT IN ('industry', 'logistics', 'research', 'ecosystem') THEN
    RAISE EXCEPTION 'Invalid commander path';
  END IF;

  UPDATE public.base_device_state
  SET
    crew_role = v_new_crew_role,
    commander_path = v_new_commander_path,
    updated_at = now()
  WHERE device_id = p_device_id
  RETURNING * INTO v_state;

  PERFORM public.base_write_audit(
    p_device_id,
    'profile_update',
    jsonb_build_object(
      'crew_role_after', v_new_crew_role,
      'commander_path_after', v_new_commander_path
    ),
    0,
    '[]'::jsonb
  );

  RETURN QUERY
  SELECT *
  FROM public.base_device_state
  WHERE device_id = p_device_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.base_claim_contract(
  p_device_id text,
  p_contract_key text
)
RETURNS TABLE(state public.base_device_state)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.base_device_state%ROWTYPE;
  v_resources jsonb;
  v_contract_state jsonb;
  v_claimed boolean := false;
  v_done boolean := false;
  v_xp_gain integer := 0;
  v_reward jsonb := '{}'::jsonb;
  v_energy_cap integer := 140;
BEGIN
  IF coalesce(trim(p_device_id), '') = '' THEN
    RAISE EXCEPTION 'device_id is required';
  END IF;

  IF coalesce(trim(p_contract_key), '') = '' THEN
    RAISE EXCEPTION 'contract_key is required';
  END IF;

  SELECT * INTO v_state
  FROM public.base_reconcile_state(p_device_id);

  SELECT * INTO v_state
  FROM public.base_device_state
  WHERE device_id = p_device_id
  FOR UPDATE;

  v_resources := coalesce(v_state.resources, '{}'::jsonb);
  v_contract_state := coalesce(v_state.contract_state, public.base_default_contract_state());
  v_claimed := coalesce((v_contract_state->'claimed'->>p_contract_key)::boolean, false);

  IF v_claimed THEN
    RAISE EXCEPTION 'Contract already claimed';
  END IF;

  v_energy_cap :=
    140
    + (coalesce((coalesce(v_state.buildings, '{}'::jsonb)->>'powerCell')::integer, 0) * 42)
    + CASE
        WHEN coalesce((coalesce(v_state.research, '{}'::jsonb)->>'coolant')::boolean, false)
        THEN 22
        ELSE 0
      END;

  IF p_contract_key = 'stability_watch' THEN
    v_done := coalesce(v_state.stability, 100) >= 85;
    v_resources := jsonb_set(
      v_resources,
      '{DATA}',
      to_jsonb(coalesce((v_resources->>'DATA')::int, 0) + 10),
      true
    );
    v_xp_gain := 20;
    v_reward := jsonb_build_object('DATA', 10, 'XP', 20);

  ELSIF p_contract_key = 'energy_ready' THEN
    v_done := coalesce((v_resources->>'ENERGY')::numeric, 0) >= (v_energy_cap * 0.45);
    v_resources := jsonb_set(
      v_resources,
      '{GOLD}',
      to_jsonb(coalesce((v_resources->>'GOLD')::int, 0) + 80),
      true
    );
    v_xp_gain := 15;
    v_reward := jsonb_build_object('GOLD', 80, 'XP', 15);

  ELSIF p_contract_key = 'banking_cycle' THEN
    v_done := coalesce(v_state.banked_mleo, 0) >= 120;
    v_resources := jsonb_set(
      jsonb_set(
        v_resources,
        '{DATA}',
        to_jsonb(coalesce((v_resources->>'DATA')::int, 0) + 8),
        true
      ),
      '{SCRAP}',
      to_jsonb(coalesce((v_resources->>'SCRAP')::int, 0) + 16),
      true
    );
    v_xp_gain := 18;
    v_reward := jsonb_build_object('DATA', 8, 'SCRAP', 16, 'XP', 18);

  ELSIF p_contract_key = 'field_readiness' THEN
    v_done :=
      coalesce(v_state.expedition_ready_at, now()) <= now()
      AND coalesce((v_resources->>'DATA')::int, 0) >= 4;

    v_resources := jsonb_set(
      v_resources,
      '{GOLD}',
      to_jsonb(coalesce((v_resources->>'GOLD')::int, 0) + 60),
      true
    );
    v_xp_gain := 18;
    v_reward := jsonb_build_object('GOLD', 60, 'XP', 18);

  ELSE
    RAISE EXCEPTION 'Invalid contract key';
  END IF;

  IF NOT v_done THEN
    RAISE EXCEPTION 'Contract not completed yet';
  END IF;

  v_contract_state := jsonb_set(
    v_contract_state,
    ARRAY['claimed', p_contract_key],
    'true'::jsonb,
    true
  );

  UPDATE public.base_device_state
  SET
    resources = v_resources,
    contract_state = v_contract_state,
    commander_xp = coalesce(commander_xp, 0) + v_xp_gain,
    updated_at = now()
  WHERE device_id = p_device_id
  RETURNING * INTO v_state;

  PERFORM public.base_write_audit(
    p_device_id,
    'contract_claim',
    jsonb_build_object(
      'contract_key', p_contract_key,
      'reward', v_reward,
      'resources_after', v_resources,
      'contract_state_after', v_contract_state,
      'commander_xp_after', coalesce(v_state.commander_xp, 0)
    ),
    0,
    '[]'::jsonb
  );

  RETURN QUERY
  SELECT *
  FROM public.base_device_state
  WHERE device_id = p_device_id;
END;
$$;

-- ============================================================================
-- Security: Revoke from PUBLIC and anon/authenticated, grant to service_role
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.base_get_or_create_state(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.base_reconcile_state(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.base_claim_mission_reward(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.base_set_profile(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.base_claim_contract(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.base_set_building_paused(text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.base_set_building_power_mode(text, text, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.base_get_or_create_state(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.base_reconcile_state(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.base_claim_mission_reward(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.base_set_profile(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.base_claim_contract(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.base_set_building_paused(text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.base_set_building_power_mode(text, text, integer) TO service_role;

COMMIT;
