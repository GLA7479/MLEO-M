BEGIN;

CREATE TABLE IF NOT EXISTS public.base_device_state (
  device_id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 10,
  last_day date NOT NULL DEFAULT current_date,
  banked_mleo numeric(20,4) NOT NULL DEFAULT 0,
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
  ADD COLUMN IF NOT EXISTS mleo_produced_today numeric(20, 4) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.base_economy_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  daily_mleo_cap bigint NOT NULL DEFAULT 3400,
  mleo_gain_mult numeric(20, 8) NOT NULL DEFAULT 0.40,
  softcut_json jsonb NOT NULL DEFAULT '[
    {"upto":0.55, "factor":1.00},
    {"upto":0.75, "factor":0.55},
    {"upto":0.90, "factor":0.30},
    {"upto":1.00, "factor":0.15},
    {"upto":9.99, "factor":0.06}
  ]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.base_economy_config (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

UPDATE public.base_economy_config
SET
  daily_mleo_cap = 3400,
  mleo_gain_mult = 0.40,
  softcut_json = '[
    {"upto":0.55, "factor":1.00},
    {"upto":0.75, "factor":0.55},
    {"upto":0.90, "factor":0.30},
    {"upto":1.00, "factor":0.15},
    {"upto":9.99, "factor":0.06}
  ]'::jsonb,
  updated_at = now()
WHERE id = 1;

ALTER TABLE public.base_device_state
  ADD COLUMN IF NOT EXISTS paused_buildings jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.base_device_state
  ADD COLUMN IF NOT EXISTS building_power_modes jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.base_device_state
  ADD COLUMN IF NOT EXISTS contract_state jsonb NOT NULL DEFAULT '{"claimed":{}}'::jsonb;

UPDATE public.base_device_state
SET contract_state = '{"claimed":{}}'::jsonb
WHERE contract_state IS NULL OR contract_state = '{}'::jsonb;

ALTER TABLE public.base_device_state
  ADD COLUMN IF NOT EXISTS building_tiers jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.base_default_building_tiers()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'hq', 1,
    'quarry', 1,
    'tradeHub', 1,
    'salvage', 1,
    'refinery', 1,
    'powerCell', 1,
    'minerControl', 1,
    'arcadeHub', 1,
    'expeditionBay', 1,
    'logisticsCenter', 1,
    'researchLab', 1,
    'repairBay', 1
  );
$$;

CREATE OR REPLACE FUNCTION public.base_building_tier(p_tiers jsonb, p_building_key text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT greatest(1, coalesce((coalesce(p_tiers, '{}'::jsonb)->>p_building_key)::integer, 1));
$$;

UPDATE public.base_device_state
SET building_tiers = public.base_default_building_tiers()
WHERE building_tiers IS NULL OR building_tiers = '{}'::jsonb;

ALTER TABLE public.base_device_state
  ADD COLUMN IF NOT EXISTS support_program_unlocks jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.base_device_state
  ADD COLUMN IF NOT EXISTS support_program_active jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.base_default_support_program_unlocks()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'logisticsCenter', '{}'::jsonb,
    'researchLab', '{}'::jsonb,
    'repairBay', '{}'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION public.base_default_support_program_active()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'logisticsCenter', 'null'::jsonb,
    'researchLab', 'null'::jsonb,
    'repairBay', 'null'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION public.base_active_support_program(p_active jsonb, p_building_key text)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN p_active IS NULL OR NOT (p_active ? p_building_key) THEN NULL::text
    WHEN jsonb_typeof(p_active->p_building_key) = 'null' THEN NULL::text
    WHEN jsonb_typeof(p_active->p_building_key) = 'string' THEN NULLIF(trim(p_active->>p_building_key), '')
    ELSE NULL::text
  END;
$$;

-- Fixed catalog: minTier, cost, bank/data/maint multipliers (only v_bank_bonus, v_data_mult, v_maintenance_relief).
CREATE OR REPLACE FUNCTION public.base_support_program_definition(p_building text, p_program text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_building = 'logisticsCenter' AND p_program = 'routeDiscipline' THEN
      '{"minTier":2,"cost":{"ORE":900,"GOLD":750,"SCRAP":320,"DATA":45},"bank":1.06,"data":1.02,"maint":1}'::jsonb
    WHEN p_building = 'logisticsCenter' AND p_program = 'reserveBuffer' THEN
      '{"minTier":3,"cost":{"ORE":1200,"GOLD":980,"SCRAP":420,"DATA":70},"bank":0.98,"data":1,"maint":1.08}'::jsonb
    WHEN p_building = 'logisticsCenter' AND p_program = 'vaultCalibration' THEN
      '{"minTier":4,"cost":{"ORE":1500,"GOLD":1200,"SCRAP":520,"DATA":95},"bank":1.08,"data":0.97,"maint":1}'::jsonb
    WHEN p_building = 'researchLab' AND p_program = 'analysisMatrix' THEN
      '{"minTier":2,"cost":{"ORE":850,"GOLD":820,"SCRAP":340,"DATA":55},"bank":1,"data":1.08,"maint":0.97}'::jsonb
    WHEN p_building = 'researchLab' AND p_program = 'predictiveTelemetry' THEN
      '{"minTier":3,"cost":{"ORE":1100,"GOLD":1050,"SCRAP":420,"DATA":80},"bank":1.03,"data":1.06,"maint":1}'::jsonb
    WHEN p_building = 'researchLab' AND p_program = 'cleanroomProtocol' THEN
      '{"minTier":4,"cost":{"ORE":1350,"GOLD":1300,"SCRAP":500,"DATA":110},"bank":0.96,"data":1.10,"maint":1}'::jsonb
    WHEN p_building = 'repairBay' AND p_program = 'preventiveCycle' THEN
      '{"minTier":2,"cost":{"ORE":820,"GOLD":700,"SCRAP":460,"DATA":35},"bank":1,"data":0.97,"maint":1.10}'::jsonb
    WHEN p_building = 'repairBay' AND p_program = 'stabilizationMesh' THEN
      '{"minTier":3,"cost":{"ORE":1050,"GOLD":920,"SCRAP":580,"DATA":55},"bank":1.02,"data":1,"maint":1.08}'::jsonb
    WHEN p_building = 'repairBay' AND p_program = 'serviceDiscipline' THEN
      '{"minTier":4,"cost":{"ORE":1300,"GOLD":1100,"SCRAP":720,"DATA":80},"bank":0.96,"data":1,"maint":1.12}'::jsonb
    ELSE NULL::jsonb
  END;
$$;

ALTER TABLE public.base_device_state
  ALTER COLUMN support_program_unlocks SET DEFAULT public.base_default_support_program_unlocks();

ALTER TABLE public.base_device_state
  ALTER COLUMN support_program_active SET DEFAULT public.base_default_support_program_active();

UPDATE public.base_device_state
SET
  support_program_unlocks = public.base_default_support_program_unlocks(),
  support_program_active = public.base_default_support_program_active()
WHERE support_program_unlocks = '{}'::jsonb
   OR support_program_active = '{}'::jsonb
   OR NOT (support_program_unlocks ? 'logisticsCenter')
   OR NOT (support_program_active ? 'logisticsCenter');

ALTER TABLE public.base_device_state
  ADD COLUMN IF NOT EXISTS specialization_milestones_claimed jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.base_default_specialization_milestones_claimed()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'logisticsCenter', '{}'::jsonb,
    'researchLab', '{}'::jsonb,
    'repairBay', '{}'::jsonb
  );
$$;

-- Catalog: support-building specialization milestones (one-time claims).
CREATE OR REPLACE FUNCTION public.base_specialization_milestone_definition(
  p_building_key text,
  p_milestone_key text
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_building_key = 'logisticsCenter' AND p_milestone_key = 'disciplined_pipeline' THEN
      jsonb_build_object(
        'buildingKey', 'logisticsCenter',
        'milestoneKey', 'disciplined_pipeline',
        'minTier', 2,
        'requiredActiveProgram', 'routeDiscipline',
        'reward', '{"GOLD": 260, "SCRAP": 120, "DATA": 8}'::jsonb
      )
    WHEN p_building_key = 'logisticsCenter' AND p_milestone_key = 'buffer_authority' THEN
      jsonb_build_object(
        'buildingKey', 'logisticsCenter',
        'milestoneKey', 'buffer_authority',
        'minTier', 3,
        'requiredActiveProgram', 'reserveBuffer',
        'reward', '{"ENERGY": 26, "SCRAP": 200, "DATA": 10}'::jsonb
      )
    WHEN p_building_key = 'researchLab' AND p_milestone_key = 'matrix_operator' THEN
      jsonb_build_object(
        'buildingKey', 'researchLab',
        'milestoneKey', 'matrix_operator',
        'minTier', 2,
        'requiredActiveProgram', 'analysisMatrix',
        'reward', '{"DATA": 10, "GOLD": 180, "ORE": 140}'::jsonb
      )
    WHEN p_building_key = 'researchLab' AND p_milestone_key = 'telemetry_controller' THEN
      jsonb_build_object(
        'buildingKey', 'researchLab',
        'milestoneKey', 'telemetry_controller',
        'minTier', 3,
        'requiredActiveProgram', 'predictiveTelemetry',
        'reward', '{"DATA": 12, "GOLD": 240, "SCRAP": 150}'::jsonb
      )
    WHEN p_building_key = 'repairBay' AND p_milestone_key = 'preventive_standard' THEN
      jsonb_build_object(
        'buildingKey', 'repairBay',
        'milestoneKey', 'preventive_standard',
        'minTier', 2,
        'requiredActiveProgram', 'preventiveCycle',
        'reward', '{"SCRAP": 240, "ENERGY": 18, "GOLD": 170}'::jsonb
      )
    WHEN p_building_key = 'repairBay' AND p_milestone_key = 'mesh_discipline' THEN
      jsonb_build_object(
        'buildingKey', 'repairBay',
        'milestoneKey', 'mesh_discipline',
        'minTier', 3,
        'requiredActiveProgram', 'stabilizationMesh',
        'reward', '{"SCRAP": 250, "GOLD": 190, "DATA": 8}'::jsonb
      )
    ELSE NULL::jsonb
  END;
$$;

CREATE OR REPLACE FUNCTION public.base_specialization_milestone_progress(
  p_state public.base_device_state,
  p_building_key text,
  p_milestone_key text
)
RETURNS TABLE(
  eligible boolean,
  done boolean,
  claimed boolean,
  progress_text text
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_def jsonb;
  v_tier integer;
  v_blevel integer;
  v_active text;
  v_req text;
  v_resources jsonb;
  v_energy_cap integer;
  v_energy numeric;
  v_stability numeric;
  v_banked numeric;
  v_data integer;
  v_ok boolean;
  v_exp_ready boolean;
  v_sys_normal boolean;
  v_eligible boolean;
  v_done boolean;
  v_claimed boolean;
  v_progress_text text;
BEGIN
  v_def := public.base_specialization_milestone_definition(p_building_key, p_milestone_key);
  IF v_def IS NULL THEN
    RETURN QUERY SELECT false, false, false, 'Invalid milestone'::text;
    RETURN;
  END IF;

  v_resources := coalesce(p_state.resources, '{}'::jsonb);
  v_tier := public.base_building_tier(coalesce(p_state.building_tiers, '{}'::jsonb), p_building_key);
  v_blevel := greatest(0, coalesce((coalesce(p_state.buildings, '{}'::jsonb)->>p_building_key)::integer, 0));
  v_active := public.base_active_support_program(
    coalesce(p_state.support_program_active, public.base_default_support_program_active()),
    p_building_key
  );
  v_req := nullif(trim(v_def->>'requiredActiveProgram'), '');

  v_eligible :=
    v_blevel >= 1
    AND v_tier >= coalesce((v_def->>'minTier')::integer, 99)
    AND (v_req IS NULL OR coalesce(v_active, '') = v_req);

  v_claimed := coalesce(
    (
      coalesce(p_state.specialization_milestones_claimed, '{}'::jsonb)
      -> p_building_key
      ->> p_milestone_key
    )::boolean,
    false
  );

  v_energy_cap :=
    148
    + (
      greatest(0, coalesce((coalesce(p_state.buildings, '{}'::jsonb)->>'powerCell')::integer, 0)) * 42
    )
    + CASE
        WHEN coalesce((coalesce(p_state.research, '{}'::jsonb)->>'coolant')::boolean, false) THEN 22
        ELSE 0
      END;

  v_energy := coalesce((v_resources->>'ENERGY')::numeric, 0);
  v_stability := coalesce(p_state.stability, 100::numeric);
  v_banked := coalesce(p_state.banked_mleo, 0::numeric);
  v_data := coalesce((v_resources->>'DATA')::integer, 0);
  v_exp_ready := coalesce(p_state.expedition_ready_at, now()) <= now();
  v_sys_normal := v_stability >= 70::numeric;

  IF NOT v_eligible THEN
    IF v_blevel < 1 THEN
      v_progress_text := 'Build this structure first';
    ELSIF v_tier < coalesce((v_def->>'minTier')::integer, 99) THEN
      v_progress_text := 'Requires tier ' || (v_def->>'minTier');
    ELSIF v_req IS NOT NULL AND coalesce(v_active, '') <> v_req THEN
      v_progress_text := 'Activate the required program';
    ELSE
      v_progress_text := 'Locked';
    END IF;
    RETURN QUERY SELECT v_eligible, false, v_claimed, v_progress_text;
    RETURN;
  END IF;

  v_ok := false;
  v_progress_text := 'In progress';

  IF p_milestone_key = 'disciplined_pipeline' THEN
    v_ok := v_banked >= 220::numeric AND v_stability >= 84::numeric;
    IF NOT v_ok THEN
      IF v_banked < 220::numeric THEN
        v_progress_text := 'Reach 220+ banked MLEO';
      ELSIF v_stability < 84::numeric THEN
        v_progress_text := 'Raise stability to 84+';
      ELSE
        v_progress_text := 'In progress';
      END IF;
    END IF;
  ELSIF p_milestone_key = 'buffer_authority' THEN
    v_ok := v_stability >= 90::numeric AND v_energy >= (v_energy_cap::numeric * 0.55);
    IF NOT v_ok THEN
      IF v_stability < 90::numeric THEN
        v_progress_text := 'Raise stability to 90+';
      ELSIF v_energy < (v_energy_cap::numeric * 0.55) THEN
        v_progress_text := 'Reach 55%+ energy cap';
      ELSE
        v_progress_text := 'In progress';
      END IF;
    END IF;
  ELSIF p_milestone_key = 'matrix_operator' THEN
    v_ok := v_data >= 16 AND v_exp_ready;
    IF NOT v_ok THEN
      IF v_data < 16 THEN
        v_progress_text := 'Reach 16+ DATA';
      ELSIF NOT v_exp_ready THEN
        v_progress_text := 'Wait for expedition ready';
      ELSE
        v_progress_text := 'In progress';
      END IF;
    END IF;
  ELSIF p_milestone_key = 'telemetry_controller' THEN
    v_ok := v_data >= 18 AND v_banked >= 140::numeric;
    IF NOT v_ok THEN
      IF v_data < 18 THEN
        v_progress_text := 'Reach 18+ DATA';
      ELSIF v_banked < 140::numeric THEN
        v_progress_text := 'Reach 140+ banked MLEO';
      ELSE
        v_progress_text := 'In progress';
      END IF;
    END IF;
  ELSIF p_milestone_key = 'preventive_standard' THEN
    v_ok := v_stability >= 92::numeric AND v_sys_normal;
    IF NOT v_ok THEN
      v_progress_text := 'Reach 92+ stability (stable systems)';
    END IF;
  ELSIF p_milestone_key = 'mesh_discipline' THEN
    v_ok :=
      v_stability >= 88::numeric
      AND v_energy >= (v_energy_cap::numeric * 0.45)
      AND v_banked >= 100::numeric;
    IF NOT v_ok THEN
      IF v_stability < 88::numeric THEN
        v_progress_text := 'Raise stability to 88+';
      ELSIF v_energy < (v_energy_cap::numeric * 0.45) THEN
        v_progress_text := 'Reach 45%+ energy cap';
      ELSIF v_banked < 100::numeric THEN
        v_progress_text := 'Reach 100+ banked MLEO';
      ELSE
        v_progress_text := 'In progress';
      END IF;
    END IF;
  ELSE
    v_ok := false;
    v_progress_text := 'Unknown milestone';
  END IF;

  v_done := v_ok;

  IF v_claimed THEN
    v_progress_text := 'Claimed';
  ELSIF v_ok THEN
    v_progress_text := 'Ready to claim';
  END IF;

  RETURN QUERY SELECT v_eligible, v_done, v_claimed, v_progress_text;
END;
$$;

ALTER TABLE public.base_device_state
  ALTER COLUMN specialization_milestones_claimed
  SET DEFAULT public.base_default_specialization_milestones_claimed();

UPDATE public.base_device_state
SET specialization_milestones_claimed = public.base_default_specialization_milestones_claimed()
WHERE specialization_milestones_claimed IS NULL
   OR specialization_milestones_claimed = '{}'::jsonb
   OR NOT (specialization_milestones_claimed ? 'logisticsCenter');

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
    'ENERGY', 148,
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

-- Daily MLEO production softcut (same curve as MINERS; reads base_economy_config id=1).
DROP FUNCTION IF EXISTS public.base_softcut_factor(numeric, bigint);
CREATE OR REPLACE FUNCTION public.base_softcut_factor(
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

  SELECT bec.softcut_json INTO v_cfg
  FROM public.base_economy_config bec
  WHERE bec.id = 1;

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
    building_tiers,
    support_program_unlocks,
    support_program_active,
    specialization_milestones_claimed,
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
    10,
    public.base_default_resources(),
    public.base_default_buildings(),
    public.base_default_building_tiers(),
    public.base_default_support_program_unlocks(),
    public.base_default_support_program_active(),
    public.base_default_specialization_milestones_claimed(),
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

  IF v_state.version < 8 THEN
    UPDATE public.base_device_state
    SET
      version = 8,
      building_tiers = CASE
        WHEN building_tiers IS NULL OR building_tiers = '{}'::jsonb
          THEN public.base_default_building_tiers()
        ELSE building_tiers
      END
    WHERE device_id = p_device_id;

    SELECT *
    INTO v_state
    FROM public.base_device_state
    WHERE device_id = p_device_id
    FOR UPDATE;
  END IF;

  IF v_state.version < 9 THEN
    UPDATE public.base_device_state
    SET
      version = 9,
      support_program_unlocks = CASE
        WHEN support_program_unlocks IS NULL
          OR support_program_unlocks = '{}'::jsonb
          OR NOT (support_program_unlocks ? 'logisticsCenter')
          THEN public.base_default_support_program_unlocks()
        ELSE support_program_unlocks
      END,
      support_program_active = CASE
        WHEN support_program_active IS NULL
          OR support_program_active = '{}'::jsonb
          OR NOT (support_program_active ? 'logisticsCenter')
          THEN public.base_default_support_program_active()
        ELSE support_program_active
      END
    WHERE device_id = p_device_id;

    SELECT *
    INTO v_state
    FROM public.base_device_state
    WHERE device_id = p_device_id
    FOR UPDATE;
  END IF;

  IF v_state.version < 10 THEN
    UPDATE public.base_device_state
    SET
      version = 10,
      specialization_milestones_claimed = CASE
        WHEN specialization_milestones_claimed IS NULL
          OR specialization_milestones_claimed = '{}'::jsonb
          OR NOT (specialization_milestones_claimed ? 'logisticsCenter')
          THEN public.base_default_specialization_milestones_claimed()
        ELSE specialization_milestones_claimed
      END
    WHERE device_id = p_device_id;

    SELECT *
    INTO v_state
    FROM public.base_device_state
    WHERE device_id = p_device_id
    FOR UPDATE;
  END IF;

  IF v_state.last_day <> current_date THEN
    UPDATE public.base_device_state
    SET
      last_day = current_date,
      sent_today = 0,
      mleo_produced_today = 0,
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

  v_energy_cap numeric := 148;
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
  v_mleo_produced_today numeric := 0;
  v_daily_cap bigint := 3400;
  v_mleo_gain_mult numeric := 0.4;
  v_softcut numeric := 1;
  v_banked_add numeric := 0;

  v_ore_use numeric := 0;
  v_scrap_use numeric := 0;
  v_energy_use numeric := 0;

  v_maintenance_due numeric := 0;

  v_supp text;
  v_prog text;
  v_def jsonb;
  v_sp_active jsonb;
  v_sp_unlocks jsonb;
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

  IF v_state.version < 8 THEN
    UPDATE public.base_device_state
    SET
      version = 8,
      building_tiers = CASE
        WHEN building_tiers IS NULL OR building_tiers = '{}'::jsonb
          THEN public.base_default_building_tiers()
        ELSE building_tiers
      END
    WHERE device_id = p_device_id;

    SELECT *
    INTO v_state
    FROM public.base_device_state
    WHERE device_id = p_device_id
    FOR UPDATE;
  END IF;

  IF v_state.version < 9 THEN
    UPDATE public.base_device_state
    SET
      version = 9,
      support_program_unlocks = CASE
        WHEN support_program_unlocks IS NULL
          OR support_program_unlocks = '{}'::jsonb
          OR NOT (support_program_unlocks ? 'logisticsCenter')
          THEN public.base_default_support_program_unlocks()
        ELSE support_program_unlocks
      END,
      support_program_active = CASE
        WHEN support_program_active IS NULL
          OR support_program_active = '{}'::jsonb
          OR NOT (support_program_active ? 'logisticsCenter')
          THEN public.base_default_support_program_active()
        ELSE support_program_active
      END
    WHERE device_id = p_device_id;

    SELECT *
    INTO v_state
    FROM public.base_device_state
    WHERE device_id = p_device_id
    FOR UPDATE;
  END IF;

  IF v_state.version < 10 THEN
    UPDATE public.base_device_state
    SET
      version = 10,
      specialization_milestones_claimed = CASE
        WHEN specialization_milestones_claimed IS NULL
          OR specialization_milestones_claimed = '{}'::jsonb
          OR NOT (specialization_milestones_claimed ? 'logisticsCenter')
          THEN public.base_default_specialization_milestones_claimed()
        ELSE specialization_milestones_claimed
      END
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

  -- Support-building tiers (logistics / research lab / repair bay): modest multipliers on top of existing balance.
  v_bank_bonus := v_bank_bonus
    * (1 + 0.03 * greatest(0, public.base_building_tier(coalesce(v_state.building_tiers, '{}'::jsonb), 'logisticsCenter') - 1));
  v_data_mult := v_data_mult
    * (1 + 0.04 * greatest(0, public.base_building_tier(coalesce(v_state.building_tiers, '{}'::jsonb), 'researchLab') - 1));
  v_maintenance_relief := v_maintenance_relief
    * (1 + 0.05 * greatest(0, public.base_building_tier(coalesce(v_state.building_tiers, '{}'::jsonb), 'repairBay') - 1));

  -- Support specialization programs (active only, unlocked, valid catalog): bank / data / maintenance only.
  v_sp_active := coalesce(v_state.support_program_active, public.base_default_support_program_active());
  v_sp_unlocks := coalesce(v_state.support_program_unlocks, public.base_default_support_program_unlocks());

  FOR v_supp IN SELECT unnest(ARRAY['logisticsCenter', 'researchLab', 'repairBay']::text[])
  LOOP
    v_prog := public.base_active_support_program(v_sp_active, v_supp);
    CONTINUE WHEN v_prog IS NULL OR trim(v_prog) = '' OR lower(v_prog) = 'none';

    v_def := public.base_support_program_definition(v_supp, v_prog);
    CONTINUE WHEN v_def IS NULL;

    IF NOT coalesce((coalesce(v_sp_unlocks->v_supp, '{}'::jsonb)->>v_prog)::boolean, false) THEN
      CONTINUE;
    END IF;

    v_bank_bonus := v_bank_bonus * coalesce((v_def->>'bank')::numeric, 1.0);
    v_data_mult := v_data_mult * coalesce((v_def->>'data')::numeric, 1.0);
    v_maintenance_relief := v_maintenance_relief * coalesce((v_def->>'maint')::numeric, 1.0);
  END LOOP;

  v_ore_mult := v_ore_mult * v_hq_bonus * v_miner_bonus * v_stability_factor;
  v_gold_mult := v_gold_mult * v_hq_bonus * v_stability_factor;
  v_scrap_mult := v_scrap_mult * v_hq_bonus * v_stability_factor;
  v_mleo_mult := v_mleo_mult * v_hq_bonus * v_stability_factor;
  v_data_mult := v_data_mult * v_hq_bonus * v_stability_factor;

  v_energy_cap := 148 + (v_power * 42);
  v_energy_regen := 6.4 + (v_power * 2.5);

  IF public.base_jsonb_bool(v_research, 'coolant', false) THEN
    v_energy_cap := v_energy_cap + 22;
    v_energy_regen := v_energy_regen + 1.35;
  END IF;

  v_expedition_cooldown_seconds := 120;

  v_energy_now := greatest(0, public.base_jsonb_num(v_resources, 'ENERGY', 0));
  v_ore_now := greatest(0, public.base_jsonb_num(v_resources, 'ORE', 0));
  v_gold_now := greatest(0, public.base_jsonb_num(v_resources, 'GOLD', 0));
  v_scrap_now := greatest(0, public.base_jsonb_num(v_resources, 'SCRAP', 0));
  v_data_now := greatest(0, public.base_jsonb_num(v_resources, 'DATA', 0));
  v_banked_now := greatest(0, coalesce(v_state.banked_mleo, 0));
  v_sent_today := greatest(0, coalesce(v_state.sent_today, 0));
  v_mleo_produced_today := greatest(0, coalesce(v_state.mleo_produced_today, 0));
  v_maintenance_due := greatest(0, coalesce(v_state.maintenance_due, 0));

  SELECT bec.daily_mleo_cap, bec.mleo_gain_mult
  INTO v_daily_cap, v_mleo_gain_mult
  FROM public.base_economy_config bec
  WHERE bec.id = 1;

  v_daily_cap := coalesce(v_daily_cap, 3400);
  v_mleo_gain_mult := coalesce(v_mleo_gain_mult, 0.4);

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
        ) * 0.015 * v_mleo_mult * v_bank_bonus * v_mleo_gain_mult;
        v_softcut := public.base_softcut_factor(v_mleo_produced_today, v_daily_cap);
        v_banked_add := least(
          v_raw_banked_gain * v_softcut,
          greatest(0::numeric, v_daily_cap::numeric - v_mleo_produced_today)
        );
      ELSE
        v_raw_banked_gain := 0;
        v_banked_add := 0;
      END IF;

      v_ore_now := greatest(0, v_ore_now - (least(v_ore_use / 1.8, v_scrap_use / 0.7) * 1.8));
      v_scrap_now := greatest(0, v_scrap_now - (least(v_ore_use / 1.8, v_scrap_use / 0.7) * 0.7));
      v_banked_now := v_banked_now + v_banked_add;
      v_mleo_produced_today := v_mleo_produced_today + v_banked_add;
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
      banked_mleo = round(v_banked_now, 4),
      mleo_produced_today = round(v_mleo_produced_today, 4),
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
  v_energy_cap integer := 148;
  v_tiers jsonb;
  v_sp_active jsonb;
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
    148
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

  ELSIF p_contract_key = 'route_discipline_window' THEN
    v_tiers := coalesce(v_state.building_tiers, '{}'::jsonb);
    v_sp_active := coalesce(v_state.support_program_active, public.base_default_support_program_active());
    IF public.base_building_tier(v_tiers, 'logisticsCenter') < 2
      OR coalesce(public.base_active_support_program(v_sp_active, 'logisticsCenter'), '') <> 'routeDiscipline' THEN
      v_done := false;
    ELSE
      v_done := coalesce(v_state.banked_mleo, 0)::numeric >= 180
        AND coalesce(v_state.stability, 100) >= 80;
    END IF;
    v_resources := jsonb_set(
      jsonb_set(
        jsonb_set(
          v_resources,
          '{GOLD}',
          to_jsonb(coalesce((v_resources->>'GOLD')::int, 0) + 240),
          true
        ),
        '{DATA}',
        to_jsonb(coalesce((v_resources->>'DATA')::int, 0) + 6),
        true
      ),
      '{SCRAP}',
      to_jsonb(coalesce((v_resources->>'SCRAP')::int, 0) + 120),
      true
    );
    v_xp_gain := 0;
    v_reward := jsonb_build_object('GOLD', 240, 'DATA', 6, 'SCRAP', 120);

  ELSIF p_contract_key = 'reserve_buffer_hold' THEN
    v_tiers := coalesce(v_state.building_tiers, '{}'::jsonb);
    v_sp_active := coalesce(v_state.support_program_active, public.base_default_support_program_active());
    IF public.base_building_tier(v_tiers, 'logisticsCenter') < 3
      OR coalesce(public.base_active_support_program(v_sp_active, 'logisticsCenter'), '') <> 'reserveBuffer' THEN
      v_done := false;
    ELSE
      v_done := coalesce(v_state.stability, 100) >= 88
        AND coalesce((v_resources->>'ENERGY')::numeric, 0) >= (v_energy_cap * 0.5);
    END IF;
    v_resources := jsonb_set(
      jsonb_set(
        jsonb_set(
          v_resources,
          '{ENERGY}',
          to_jsonb(least(
            v_energy_cap,
            coalesce((v_resources->>'ENERGY')::int, 0) + 24
          )),
          true
        ),
        '{SCRAP}',
        to_jsonb(coalesce((v_resources->>'SCRAP')::int, 0) + 180),
        true
      ),
      '{DATA}',
      to_jsonb(coalesce((v_resources->>'DATA')::int, 0) + 8),
      true
    );
    v_xp_gain := 0;
    v_reward := jsonb_build_object('ENERGY', 24, 'SCRAP', 180, 'DATA', 8);

  ELSIF p_contract_key = 'analysis_matrix_window' THEN
    v_tiers := coalesce(v_state.building_tiers, '{}'::jsonb);
    v_sp_active := coalesce(v_state.support_program_active, public.base_default_support_program_active());
    IF public.base_building_tier(v_tiers, 'researchLab') < 2
      OR coalesce(public.base_active_support_program(v_sp_active, 'researchLab'), '') <> 'analysisMatrix' THEN
      v_done := false;
    ELSE
      v_done := coalesce((v_resources->>'DATA')::int, 0) >= 12
        AND coalesce(v_state.expedition_ready_at, now()) <= now();
    END IF;
    v_resources := jsonb_set(
      jsonb_set(
        jsonb_set(
          v_resources,
          '{DATA}',
          to_jsonb(coalesce((v_resources->>'DATA')::int, 0) + 7),
          true
        ),
        '{GOLD}',
        to_jsonb(coalesce((v_resources->>'GOLD')::int, 0) + 180),
        true
      ),
      '{ORE}',
      to_jsonb(coalesce((v_resources->>'ORE')::int, 0) + 120),
      true
    );
    v_xp_gain := 0;
    v_reward := jsonb_build_object('DATA', 7, 'GOLD', 180, 'ORE', 120);

  ELSIF p_contract_key = 'predictive_telemetry_sync' THEN
    v_tiers := coalesce(v_state.building_tiers, '{}'::jsonb);
    v_sp_active := coalesce(v_state.support_program_active, public.base_default_support_program_active());
    IF public.base_building_tier(v_tiers, 'researchLab') < 3
      OR coalesce(public.base_active_support_program(v_sp_active, 'researchLab'), '') <> 'predictiveTelemetry' THEN
      v_done := false;
    ELSE
      v_done := coalesce((v_resources->>'DATA')::int, 0) >= 14
        AND coalesce(v_state.banked_mleo, 0)::numeric >= 120;
    END IF;
    v_resources := jsonb_set(
      jsonb_set(
        jsonb_set(
          v_resources,
          '{DATA}',
          to_jsonb(coalesce((v_resources->>'DATA')::int, 0) + 10),
          true
        ),
        '{GOLD}',
        to_jsonb(coalesce((v_resources->>'GOLD')::int, 0) + 220),
        true
      ),
      '{SCRAP}',
      to_jsonb(coalesce((v_resources->>'SCRAP')::int, 0) + 140),
      true
    );
    v_xp_gain := 0;
    v_reward := jsonb_build_object('DATA', 10, 'GOLD', 220, 'SCRAP', 140);

  ELSIF p_contract_key = 'preventive_cycle_standard' THEN
    v_tiers := coalesce(v_state.building_tiers, '{}'::jsonb);
    v_sp_active := coalesce(v_state.support_program_active, public.base_default_support_program_active());
    IF public.base_building_tier(v_tiers, 'repairBay') < 2
      OR coalesce(public.base_active_support_program(v_sp_active, 'repairBay'), '') <> 'preventiveCycle' THEN
      v_done := false;
    ELSE
      v_done := coalesce(v_state.stability, 100) >= 90;
    END IF;
    v_resources := jsonb_set(
      jsonb_set(
        jsonb_set(
          v_resources,
          '{SCRAP}',
          to_jsonb(coalesce((v_resources->>'SCRAP')::int, 0) + 220),
          true
        ),
        '{ENERGY}',
        to_jsonb(least(
          v_energy_cap,
          coalesce((v_resources->>'ENERGY')::int, 0) + 18
        )),
        true
      ),
      '{GOLD}',
      to_jsonb(coalesce((v_resources->>'GOLD')::int, 0) + 160),
      true
    );
    v_xp_gain := 0;
    v_reward := jsonb_build_object('SCRAP', 220, 'ENERGY', 18, 'GOLD', 160);

  ELSIF p_contract_key = 'stabilization_mesh_balance' THEN
    v_tiers := coalesce(v_state.building_tiers, '{}'::jsonb);
    v_sp_active := coalesce(v_state.support_program_active, public.base_default_support_program_active());
    IF public.base_building_tier(v_tiers, 'repairBay') < 3
      OR coalesce(public.base_active_support_program(v_sp_active, 'repairBay'), '') <> 'stabilizationMesh' THEN
      v_done := false;
    ELSE
      v_done := coalesce(v_state.stability, 100) >= 86
        AND coalesce((v_resources->>'ENERGY')::numeric, 0) >= (v_energy_cap * 0.4)
        AND coalesce(v_state.banked_mleo, 0)::numeric >= 90;
    END IF;
    v_resources := jsonb_set(
      jsonb_set(
        jsonb_set(
          v_resources,
          '{SCRAP}',
          to_jsonb(coalesce((v_resources->>'SCRAP')::int, 0) + 240),
          true
        ),
        '{GOLD}',
        to_jsonb(coalesce((v_resources->>'GOLD')::int, 0) + 180),
        true
      ),
      '{DATA}',
      to_jsonb(coalesce((v_resources->>'DATA')::int, 0) + 6),
      true
    );
    v_xp_gain := 0;
    v_reward := jsonb_build_object('SCRAP', 240, 'GOLD', 180, 'DATA', 6);

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
