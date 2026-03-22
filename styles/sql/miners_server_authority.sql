-- ============================================================================
-- MINERS Server-Authoritative Economy
-- Configurable caps / multipliers / hourly gifts / claim flows
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) Config Tables (editable by admin)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.miners_economy_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  base_stage_v1 numeric(20,8) NOT NULL DEFAULT 0.20,
  daily_cap bigint NOT NULL DEFAULT 2500,
  offline_factor numeric(10,6) NOT NULL DEFAULT 0.35,
  gift_cooldown_seconds integer NOT NULL DEFAULT 3600,
  softcut_json jsonb NOT NULL DEFAULT '[
    {"upto":0.55, "factor":1.00},
    {"upto":0.75, "factor":0.55},
    {"upto":0.90, "factor":0.30},
    {"upto":1.00, "factor":0.15},
    {"upto":9.99, "factor":0.06}
  ]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.miners_economy_config (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

UPDATE public.miners_economy_config
SET
  base_stage_v1 = 0.20,
  daily_cap = 2500,
  offline_factor = 0.35,
  softcut_json = '[
    {"upto":0.55, "factor":1.00},
    {"upto":0.75, "factor":0.55},
    {"upto":0.90, "factor":0.30},
    {"upto":1.00, "factor":0.15},
    {"upto":9.99, "factor":0.06}
  ]'::jsonb,
  updated_at = now()
WHERE id = 1;

CREATE TABLE IF NOT EXISTS public.miners_stage_multipliers (
  id bigserial PRIMARY KEY,
  start_stage integer NOT NULL CHECK (start_stage >= 1),
  end_stage integer NOT NULL CHECK (end_stage >= start_stage),
  r numeric(20,10) NOT NULL CHECK (r > 0),
  UNIQUE (start_stage, end_stage)
);

-- Default stage ratio table (same spirit as current client model)
INSERT INTO public.miners_stage_multipliers (start_stage, end_stage, r)
SELECT *
FROM (
  VALUES
    (1, 10, 1.32::numeric),
    (11, 20, 1.18::numeric),
    (21, 30, 1.11::numeric),
    (31, 40, 1.06::numeric),
    (41, 50, 1.025::numeric),
    (51, 1000, 1.0004::numeric)
) AS defaults(start_stage, end_stage, r)
ON CONFLICT (start_stage, end_stage) DO NOTHING;

UPDATE public.miners_stage_multipliers
SET r = CASE
  WHEN start_stage = 1 AND end_stage = 10 THEN 1.32
  WHEN start_stage = 11 AND end_stage = 20 THEN 1.18
  WHEN start_stage = 21 AND end_stage = 30 THEN 1.11
  WHEN start_stage = 31 AND end_stage = 40 THEN 1.06
  WHEN start_stage = 41 AND end_stage = 50 THEN 1.025
  WHEN start_stage = 51 AND end_stage = 1000 THEN 1.0004
  ELSE r
END
WHERE (start_stage, end_stage) IN (
  (1, 10),
  (11, 20),
  (21, 30),
  (31, 40),
  (41, 50),
  (51, 1000)
);

CREATE TABLE IF NOT EXISTS public.miners_gift_rewards (
  reward_key text PRIMARY KEY,
  weight numeric(20,8) NOT NULL CHECK (weight > 0),
  coins_pct numeric(20,8) NOT NULL DEFAULT 0,
  dps_multiplier numeric(20,8) NOT NULL DEFAULT 1,
  gold_multiplier numeric(20,8) NOT NULL DEFAULT 1,
  diamonds integer NOT NULL DEFAULT 0,
  mleo_bonus bigint NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true
);

INSERT INTO public.miners_gift_rewards (reward_key, weight, coins_pct, dps_multiplier, gold_multiplier, diamonds, mleo_bonus, enabled)
VALUES
  ('coins20', 70, 0.10, 1, 1, 0, 0, true),
  ('coins40', 8, 0.20, 1, 1, 0, 0, true),
  ('dps', 8, 0, 1.1, 1, 0, 0, true),
  ('gold', 8, 0, 1, 1.1, 0, 0, true),
  ('diamond', 6, 0, 1, 1, 1, 0, true)
ON CONFLICT (reward_key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2) Device State
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.miners_device_state (
  device_id text PRIMARY KEY,
  balance numeric(20,2) NOT NULL DEFAULT 0,
  mined_today numeric(20,2) NOT NULL DEFAULT 0,
  score_today numeric(20,2) NOT NULL DEFAULT 0,
  last_day date NOT NULL DEFAULT current_date,
  vault bigint NOT NULL DEFAULT 0,
  claimed_total bigint NOT NULL DEFAULT 0,
  claimed_to_wallet bigint NOT NULL DEFAULT 0,
  last_gift_claim_at timestamptz,
  gift_next_claim_at timestamptz,
  gift_claim_count bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.miners_device_state
  ALTER COLUMN balance TYPE numeric(20,2) USING round(balance::numeric, 2),
  ALTER COLUMN mined_today TYPE numeric(20,2) USING round(mined_today::numeric, 2),
  ALTER COLUMN score_today TYPE numeric(20,2) USING round(score_today::numeric, 2);

CREATE INDEX IF NOT EXISTS idx_miners_device_state_updated_at
  ON public.miners_device_state(updated_at DESC);

CREATE OR REPLACE FUNCTION public.miners_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_miners_device_state_updated_at ON public.miners_device_state;
CREATE TRIGGER trg_miners_device_state_updated_at
BEFORE UPDATE ON public.miners_device_state
FOR EACH ROW EXECUTE FUNCTION public.miners_set_updated_at();

ALTER TABLE public.miners_device_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.miners_device_state FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3) Helper Functions
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.miners_softcut_factor(bigint, bigint);
DROP FUNCTION IF EXISTS public.miners_softcut_factor(numeric, bigint);
CREATE OR REPLACE FUNCTION public.miners_softcut_factor(
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

  SELECT mec.softcut_json INTO v_cfg
  FROM public.miners_economy_config mec
  WHERE mec.id = 1;

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

CREATE OR REPLACE FUNCTION public.miners_stage_ratio(p_stage integer)
RETURNS numeric
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((
    SELECT msm.r
    FROM public.miners_stage_multipliers msm
    WHERE p_stage BETWEEN msm.start_stage AND msm.end_stage
    ORDER BY msm.start_stage
    LIMIT 1
  ), 1.001::numeric);
$$;

CREATE OR REPLACE FUNCTION public.miners_stage_base(p_stage integer)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stage integer := greatest(1, coalesce(p_stage, 1));
  v_base numeric(30,12);
  i integer;
BEGIN
  SELECT mec.base_stage_v1
  INTO v_base
  FROM public.miners_economy_config mec
  WHERE mec.id = 1;

  v_base := coalesce(v_base, 0.20);
  IF v_stage <= 1 THEN
    RETURN v_base;
  END IF;

  FOR i IN 1..(v_stage - 1) LOOP
    v_base := v_base * public.miners_stage_ratio(i);
  END LOOP;

  RETURN v_base;
END;
$$;

CREATE OR REPLACE FUNCTION public.miners_get_or_create_state(
  p_device_id text
)
RETURNS public.miners_device_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.miners_device_state%ROWTYPE;
BEGIN
  IF coalesce(trim(p_device_id), '') = '' THEN
    RAISE EXCEPTION 'device_id is required';
  END IF;

  INSERT INTO public.miners_device_state (device_id)
  VALUES (p_device_id)
  ON CONFLICT (device_id) DO NOTHING;

  SELECT *
  INTO v_state
  FROM public.miners_device_state mds
  WHERE mds.device_id = p_device_id
  FOR UPDATE;

  IF v_state.last_day <> current_date THEN
    v_state.mined_today := 0;
    v_state.score_today := 0;
    v_state.last_day := current_date;

    UPDATE public.miners_device_state mds
    SET mined_today = 0,
        score_today = 0,
        last_day = current_date
    WHERE mds.device_id = p_device_id
    RETURNING * INTO v_state;
  END IF;

  RETURN v_state;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4) Public RPCs (called from server API only)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.miners_get_config()
RETURNS TABLE(
  base_stage_v1 numeric,
  daily_cap bigint,
  offline_factor numeric,
  gift_cooldown_seconds integer,
  softcut_json jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    mec.base_stage_v1,
    mec.daily_cap,
    mec.offline_factor,
    mec.gift_cooldown_seconds,
    mec.softcut_json
  FROM public.miners_economy_config mec
  WHERE mec.id = 1
  LIMIT 1;
$$;

DROP FUNCTION IF EXISTS public.miners_get_state(text);
CREATE OR REPLACE FUNCTION public.miners_get_state(
  p_device_id text
)
RETURNS TABLE(
  device_id text,
  balance numeric,
  mined_today numeric,
  score_today numeric,
  last_day date,
  vault bigint,
  claimed_total bigint,
  claimed_to_wallet bigint,
  last_gift_claim_at timestamptz,
  gift_next_claim_at timestamptz,
  gift_claim_count bigint,
  daily_cap bigint,
  softcut_factor numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.miners_device_state%ROWTYPE;
  v_daily_cap bigint;
BEGIN
  v_state := public.miners_get_or_create_state(p_device_id);

  SELECT mec.daily_cap INTO v_daily_cap
  FROM public.miners_economy_config mec
  WHERE mec.id = 1;

  RETURN QUERY
  SELECT
    v_state.device_id,
    v_state.balance,
    v_state.mined_today,
    v_state.score_today,
    v_state.last_day,
    v_state.vault,
    v_state.claimed_total,
    v_state.claimed_to_wallet,
    v_state.last_gift_claim_at,
    v_state.gift_next_claim_at,
    v_state.gift_claim_count,
    coalesce(v_daily_cap, 0),
    public.miners_softcut_factor(v_state.mined_today, coalesce(v_daily_cap, 0));
END;
$$;

DROP FUNCTION IF EXISTS public.miners_apply_breaks(text, jsonb, boolean);
CREATE OR REPLACE FUNCTION public.miners_apply_breaks(
  p_device_id text,
  p_stage_counts jsonb,
  p_offline boolean DEFAULT false
)
RETURNS TABLE(
  added numeric,
  balance numeric,
  mined_today numeric,
  daily_cap bigint,
  softcut_factor numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.miners_device_state%ROWTYPE;
  v_daily_cap bigint;
  v_offline_factor numeric;
  v_raw numeric(30,12) := 0;
  v_effective numeric(30,12) := 0;
  v_room numeric(20,2) := 0;
  v_add numeric(20,2) := 0;
  v_softcut numeric := 1;
  v_stage integer;
  v_count integer;
  kv record;
BEGIN
  v_state := public.miners_get_or_create_state(p_device_id);

  SELECT mec.daily_cap, mec.offline_factor
  INTO v_daily_cap, v_offline_factor
  FROM public.miners_economy_config mec
  WHERE mec.id = 1;

  v_daily_cap := coalesce(v_daily_cap, 0);
  v_offline_factor := coalesce(v_offline_factor, 0.35);

  FOR kv IN SELECT key, value FROM jsonb_each(coalesce(p_stage_counts, '{}'::jsonb))
  LOOP
    v_stage := greatest(1, coalesce(kv.key::integer, 1));
    v_count := greatest(0, coalesce((kv.value)::text::integer, 0));
    IF v_count > 0 THEN
      v_raw := v_raw + (public.miners_stage_base(v_stage) * v_count);
    END IF;
  END LOOP;

  IF p_offline THEN
    v_raw := v_raw * v_offline_factor;
  END IF;

  v_softcut := public.miners_softcut_factor(v_state.mined_today, v_daily_cap);
  v_effective := v_raw * v_softcut;
  v_add := greatest(0, round(v_effective::numeric, 2));

  v_room := greatest(0::numeric, (v_daily_cap::numeric - v_state.mined_today));
  v_add := least(v_add, v_room);

  IF v_add > 0 THEN
    UPDATE public.miners_device_state mds
    SET balance = mds.balance + v_add,
        mined_today = mds.mined_today + v_add,
        score_today = mds.score_today + v_add
    WHERE mds.device_id = p_device_id
    RETURNING * INTO v_state;
  END IF;

  RETURN QUERY
  SELECT
    v_add,
    v_state.balance,
    v_state.mined_today,
    v_daily_cap,
    v_softcut;
END;
$$;

DROP FUNCTION IF EXISTS public.miners_claim_hourly_gift(text);
CREATE OR REPLACE FUNCTION public.miners_claim_hourly_gift(
  p_device_id text
)
RETURNS TABLE(
  reward_key text,
  coins_pct numeric,
  dps_multiplier numeric,
  gold_multiplier numeric,
  diamonds integer,
  mleo_bonus numeric,
  next_claim_at timestamptz,
  balance numeric,
  mined_today numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.miners_device_state%ROWTYPE;
  v_now timestamptz := now();
  v_cooldown integer := 3600;
  v_pick numeric := 0;
  v_total numeric := 0;
  v_acc numeric := 0;
  v_row record;
  v_daily_cap bigint := 0;
  v_add numeric(20,2) := 0;
BEGIN
  v_state := public.miners_get_or_create_state(p_device_id);

  SELECT mec.gift_cooldown_seconds, mec.daily_cap
  INTO v_cooldown, v_daily_cap
  FROM public.miners_economy_config mec
  WHERE mec.id = 1;

  v_cooldown := greatest(1, coalesce(v_cooldown, 3600));

  IF v_state.gift_next_claim_at IS NOT NULL AND v_state.gift_next_claim_at > v_now THEN
    RAISE EXCEPTION 'Gift is not ready yet';
  END IF;

  SELECT coalesce(sum(mgr.weight), 0)
  INTO v_total
  FROM public.miners_gift_rewards mgr
  WHERE mgr.enabled = true;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'No enabled gift rewards configured';
  END IF;

  v_pick := random() * v_total;

  FOR v_row IN
    SELECT *
    FROM public.miners_gift_rewards mgr
    WHERE mgr.enabled = true
    ORDER BY mgr.reward_key
  LOOP
    v_acc := v_acc + v_row.weight;
    IF v_pick <= v_acc THEN
      v_add := greatest(0::numeric, coalesce(v_row.mleo_bonus, 0)::numeric);

      IF v_add > 0 THEN
        v_add := least(v_add, greatest(0::numeric, (v_daily_cap::numeric - v_state.mined_today)));
      END IF;

      UPDATE public.miners_device_state mds
      SET last_gift_claim_at = v_now,
          gift_next_claim_at = v_now + make_interval(secs => v_cooldown),
          gift_claim_count = mds.gift_claim_count + 1,
          balance = mds.balance + v_add,
          mined_today = mds.mined_today + v_add,
          score_today = mds.score_today + v_add
      WHERE mds.device_id = p_device_id
      RETURNING * INTO v_state;

      RETURN QUERY
      SELECT
        v_row.reward_key,
        v_row.coins_pct,
        v_row.dps_multiplier,
        v_row.gold_multiplier,
        v_row.diamonds,
        v_add,
        v_state.gift_next_claim_at,
        v_state.balance,
        v_state.mined_today;
      RETURN;
    END IF;
  END LOOP;

  RAISE EXCEPTION 'Gift draw failed';
END;
$$;

DROP FUNCTION IF EXISTS public.miners_move_balance_to_vault(text, bigint);
CREATE OR REPLACE FUNCTION public.miners_move_balance_to_vault(
  p_device_id text,
  p_amount bigint DEFAULT NULL
)
RETURNS TABLE(
  moved bigint,
  balance numeric,
  vault bigint,
  claimed_total bigint,
  shared_vault_balance bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.miners_device_state%ROWTYPE;
  v_move bigint := 0;
  v_sync record;
BEGIN
  v_state := public.miners_get_or_create_state(p_device_id);

  v_move := CASE
    WHEN p_amount IS NULL OR p_amount <= 0 THEN floor(v_state.balance)::bigint
    ELSE least(floor(v_state.balance)::bigint, p_amount)
  END;

  v_move := greatest(0, v_move);

  IF v_move > 0 THEN
    SELECT *
    INTO v_sync
    FROM public.sync_vault_delta(
      p_game_id => 'miners-claim-to-vault',
      p_delta => v_move,
      p_device_id => p_device_id,
      p_prev_nonce => null,
      p_next_nonce => gen_random_uuid()::text
    );

    UPDATE public.miners_device_state mds
    SET balance = mds.balance - v_move,
        vault = mds.vault + v_move,
        claimed_total = mds.claimed_total + v_move
    WHERE mds.device_id = p_device_id
    RETURNING * INTO v_state;
  ELSE
    SELECT coalesce(vb.balance, 0) AS new_balance
    INTO v_sync
    FROM public.vault_balances vb
    WHERE vb.device_id = p_device_id;
  END IF;

  RETURN QUERY
  SELECT
    v_move,
    v_state.balance,
    v_state.vault,
    v_state.claimed_total,
    coalesce((v_sync.new_balance)::bigint, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.miners_claim_to_wallet(
  p_device_id text,
  p_amount bigint
)
RETURNS TABLE(
  claimed bigint,
  vault bigint,
  claimed_to_wallet bigint,
  shared_vault_balance bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.miners_device_state%ROWTYPE;
  v_claim bigint := greatest(0, coalesce(p_amount, 0));
  v_sync record;
BEGIN
  IF v_claim <= 0 THEN
    RAISE EXCEPTION 'claim amount must be positive';
  END IF;

  v_state := public.miners_get_or_create_state(p_device_id);

  IF v_state.vault < v_claim THEN
    RAISE EXCEPTION 'Insufficient miners vault balance';
  END IF;

  SELECT *
  INTO v_sync
  FROM public.sync_vault_delta(
    p_game_id => 'miners-wallet-claim',
    p_delta => -v_claim,
    p_device_id => p_device_id,
    p_prev_nonce => null,
    p_next_nonce => gen_random_uuid()::text
  );

  UPDATE public.miners_device_state mds
  SET vault = mds.vault - v_claim,
      claimed_to_wallet = mds.claimed_to_wallet + v_claim
  WHERE mds.device_id = p_device_id
  RETURNING * INTO v_state;

  RETURN QUERY
  SELECT
    v_claim,
    v_state.vault,
    v_state.claimed_to_wallet,
    coalesce((v_sync.new_balance)::bigint, 0);
END;
$$;

-- ----------------------------------------------------------------------------
-- 5) Security posture: server-only APIs call these with service role
-- ----------------------------------------------------------------------------

REVOKE ALL ON public.miners_economy_config FROM anon, authenticated;
REVOKE ALL ON public.miners_stage_multipliers FROM anon, authenticated;
REVOKE ALL ON public.miners_gift_rewards FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.miners_get_config() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.miners_get_state(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.miners_apply_breaks(text, jsonb, boolean) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.miners_claim_hourly_gift(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.miners_move_balance_to_vault(text, bigint) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.miners_claim_to_wallet(text, bigint) FROM anon, authenticated;

COMMIT;
