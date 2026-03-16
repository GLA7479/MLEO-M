BEGIN;

CREATE TABLE IF NOT EXISTS public.base_device_state (
  device_id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 5,
  last_day date NOT NULL DEFAULT current_date,
  banked_mleo bigint NOT NULL DEFAULT 0,
  sent_today bigint NOT NULL DEFAULT 0,
  total_banked bigint NOT NULL DEFAULT 0,
  total_shared_spent bigint NOT NULL DEFAULT 0,
  commander_level integer NOT NULL DEFAULT 1,
  commander_xp bigint NOT NULL DEFAULT 0,
  blueprint_level integer NOT NULL DEFAULT 0,
  crew integer NOT NULL DEFAULT 0,
  overclock_until timestamptz,
  expedition_ready_at timestamptz,
  maintenance_due numeric(10,2) NOT NULL DEFAULT 0,
  stability numeric(10,2) NOT NULL DEFAULT 100,
  resources jsonb NOT NULL DEFAULT '{}'::jsonb,
  buildings jsonb NOT NULL DEFAULT '{}'::jsonb,
  modules jsonb NOT NULL DEFAULT '{}'::jsonb,
  research jsonb NOT NULL DEFAULT '{}'::jsonb,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  mission_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  log jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

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
    log,
    expedition_ready_at
  )
  VALUES (
    p_device_id,
    5,
    jsonb_build_object(
      'ORE', 45,
      'GOLD', 260,
      'SCRAP', 12,
      'ENERGY', 140,
      'DATA', 6
    ),
    jsonb_build_object(
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
    ),
    '{}'::jsonb,
    '{}'::jsonb,
    jsonb_build_object(
      'upgradesToday', 0,
      'shippedToday', 0,
      'expeditionsToday', 0,
      'vaultSpentToday', 0,
      'dataToday', 0,
      'maintenanceToday', 0
    ),
    jsonb_build_object(
      'completed', '{}'::jsonb,
      'claimed', '{}'::jsonb
    ),
    '[]'::jsonb,
    now()
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
      stats = jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(coalesce(stats, '{}'::jsonb), '{upgradesToday}', '0'::jsonb, true),
                '{shippedToday}', '0'::jsonb, true
              ),
              '{expeditionsToday}', '0'::jsonb, true
            ),
            '{vaultSpentToday}', '0'::jsonb, true
          ),
          '{dataToday}', '0'::jsonb, true
        ),
        '{maintenanceToday}', '0'::jsonb, true
      ),
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

ALTER TABLE public.base_device_state
ADD COLUMN IF NOT EXISTS last_tick_at timestamptz NOT NULL DEFAULT now();

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
  v_resources jsonb;
  v_buildings jsonb;
  v_modules jsonb;
  v_research jsonb;
  v_stats jsonb;
  v_energy_cap numeric := 140;
  v_energy_regen numeric := 2.6;
  v_efficiency numeric := 1.0;
  v_hq integer := 1;
  v_quarry integer := 1;
  v_trade integer := 0;
  v_salvage integer := 0;
  v_refinery integer := 0;
  v_power integer := 0;
  v_arcade integer := 0;
  v_miner integer := 0;
  v_banked numeric := 0;
  v_ore_gain numeric := 0;
  v_gold_gain numeric := 0;
  v_scrap_gain numeric := 0;
  v_data_gain numeric := 0;
  v_energy_now numeric := 0;
  v_ore_now numeric := 0;
  v_gold_now numeric := 0;
  v_scrap_now numeric := 0;
  v_data_now numeric := 0;
  v_stability numeric := 100;
BEGIN
  SELECT *
  INTO v_state
  FROM public.base_get_or_create_state(p_device_id);

  SELECT *
  INTO v_state
  FROM public.base_device_state
  WHERE device_id = p_device_id
  FOR UPDATE;

  -- Reset old state (version < 5) to new starter pack values
  IF v_state.version < 5 THEN
    UPDATE public.base_device_state
    SET
      version = 5,
      resources = jsonb_build_object(
        'ORE', 45,
        'GOLD', 260,
        'SCRAP', 12,
        'ENERGY', 140,
        'DATA', 6
      ),
      buildings = jsonb_build_object(
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
      ),
      modules = '{}'::jsonb,
      research = '{}'::jsonb,
      crew = 0,
      crew_role = 'engineer',
      commander_level = 1,
      commander_xp = 0,
      commander_path = 'industry',
      blueprint_level = 0,
      banked_mleo = 0,
      sent_today = 0,
      total_banked = 0,
      total_shared_spent = 0,
      overclock_until = NULL,
      expedition_ready_at = now(),
      maintenance_due = 0,
      stability = 100,
      stats = jsonb_build_object(
        'upgradesToday', 0,
        'shippedToday', 0,
        'expeditionsToday', 0,
        'vaultSpentToday', 0,
        'dataToday', 0,
        'maintenanceToday', 0
      ),
      mission_state = jsonb_build_object(
        'completed', '{}'::jsonb,
        'claimed', '{}'::jsonb
      ),
      log = '[]'::jsonb,
      last_tick_at = now(),
      updated_at = now()
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

  v_elapsed_seconds := EXTRACT(EPOCH FROM (v_now - v_state.last_tick_at));
  IF v_elapsed_seconds <= 0 THEN
    RETURN v_state;
  END IF;

  v_resources := coalesce(v_state.resources, '{}'::jsonb);
  v_buildings := coalesce(v_state.buildings, '{}'::jsonb);
  v_modules := coalesce(v_state.modules, '{}'::jsonb);
  v_research := coalesce(v_state.research, '{}'::jsonb);
  v_stats := coalesce(v_state.stats, '{}'::jsonb);

  v_hq := greatest(1, coalesce((v_buildings->>'hq')::int, 1));
  v_quarry := greatest(0, coalesce((v_buildings->>'quarry')::int, 0));
  v_trade := greatest(0, coalesce((v_buildings->>'tradeHub')::int, 0));
  v_salvage := greatest(0, coalesce((v_buildings->>'salvage')::int, 0));
  v_refinery := greatest(0, coalesce((v_buildings->>'refinery')::int, 0));
  v_power := greatest(0, coalesce((v_buildings->>'powerCell')::int, 0));
  v_arcade := greatest(0, coalesce((v_buildings->>'arcadeHub')::int, 0));
  v_miner := greatest(0, coalesce((v_buildings->>'minerControl')::int, 0));

  v_energy_cap := 140 + (v_power * 24);
  v_energy_regen := 2.6 + (v_power * 0.35);
  v_efficiency := 1 + ((v_hq - 1) * 0.03);

  IF coalesce((v_modules->>'optimizer')::boolean, false) THEN
    v_efficiency := v_efficiency + 0.08;
  END IF;

  IF coalesce((v_research->>'automation')::boolean, false) THEN
    v_efficiency := v_efficiency + 0.10;
  END IF;

  IF v_state.overclock_until IS NOT NULL AND v_state.overclock_until > v_now THEN
    v_efficiency := v_efficiency + 0.18;
  END IF;

  v_stability := least(100, greatest(0, coalesce(v_state.stability, 100)));
  v_efficiency := v_efficiency * least(1.0, greatest(0.45, v_stability / 100.0));

  v_ore_gain := (v_quarry * 2.0 * v_efficiency) * (v_elapsed_seconds / 60.0);
  v_gold_gain := (v_trade * 1.0 * v_efficiency) * (v_elapsed_seconds / 60.0);
  v_scrap_gain := (v_salvage * 0.8 * v_efficiency) * (v_elapsed_seconds / 60.0);
  v_data_gain := ((v_arcade * 0.12) + (v_miner * 0.15)) * v_efficiency * (v_elapsed_seconds / 60.0);
  v_banked := (v_refinery * 0.10 * v_efficiency) * (v_elapsed_seconds / 60.0);

  v_energy_now := least(
    v_energy_cap,
    greatest(0, coalesce((v_resources->>'ENERGY')::numeric, 0) + (v_energy_regen * (v_elapsed_seconds / 60.0)))
  );

  v_ore_now := greatest(0, coalesce((v_resources->>'ORE')::numeric, 0) + v_ore_gain);
  v_gold_now := greatest(0, coalesce((v_resources->>'GOLD')::numeric, 0) + v_gold_gain);
  v_scrap_now := greatest(0, coalesce((v_resources->>'SCRAP')::numeric, 0) + v_scrap_gain);
  v_data_now := greatest(0, coalesce((v_resources->>'DATA')::numeric, 0) + v_data_gain);

  UPDATE public.base_device_state
  SET
    resources = jsonb_build_object(
      'ORE', floor(v_ore_now),
      'GOLD', floor(v_gold_now),
      'SCRAP', floor(v_scrap_now),
      'ENERGY', floor(v_energy_now),
      'DATA', floor(v_data_now)
    ),
    banked_mleo = greatest(0, coalesce(banked_mleo, 0) + floor(v_banked)::bigint),
    maintenance_due = greatest(0, coalesce(maintenance_due, 0) + ((v_elapsed_seconds / 3600.0) * 1.2)),
    stability = greatest(35, least(100, coalesce(stability, 100) - ((v_elapsed_seconds / 3600.0) * 0.35))),
    last_tick_at = v_now,
    updated_at = v_now
  WHERE device_id = p_device_id;

  SELECT *
  INTO v_state
  FROM public.base_device_state
  WHERE device_id = p_device_id;

  RETURN v_state;
END;
$$;

COMMIT;
