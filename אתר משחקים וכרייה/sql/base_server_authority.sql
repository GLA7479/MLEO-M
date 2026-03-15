BEGIN;

CREATE TABLE IF NOT EXISTS public.base_device_state (
  device_id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
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
    jsonb_build_object(
      'ORE', 0,
      'GOLD', 140,
      'SCRAP', 0,
      'ENERGY', 120,
      'DATA', 0
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

COMMIT;
