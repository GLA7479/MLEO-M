-- ============================================================================
-- ARCADE SESSIONS + SERVER-SIDE COIN-FLIP PILOT
-- Run this in the Supabase SQL Editor (same project as vault/freeplay RPCs)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 0. SAFETY CHECKS
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'vault_balances'
  ) THEN
    RAISE EXCEPTION 'vault_balances table is missing. Run the vault schema first.';
  END IF;
END $$;

-- ============================================================================
-- 1. SESSION TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.arcade_device_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  game_id text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('freeplay', 'paid')),
  status text NOT NULL CHECK (status IN ('started', 'finished', 'cancelled')),
  stake bigint NOT NULL DEFAULT 0 CHECK (stake >= 0),
  approved_reward bigint NOT NULL DEFAULT 0 CHECK (approved_reward >= 0),
  consumed_token boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  client_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  server_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT arcade_device_sessions_finished_at_chk
    CHECK (
      (status = 'finished' AND finished_at IS NOT NULL)
      OR
      (status IN ('started', 'cancelled') AND finished_at IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_arcade_sessions_device_started_at
  ON public.arcade_device_sessions(device_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_arcade_sessions_status_started_at
  ON public.arcade_device_sessions(status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_arcade_sessions_game_status
  ON public.arcade_device_sessions(game_id, status, started_at DESC);

CREATE OR REPLACE FUNCTION public.set_arcade_session_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_arcade_device_sessions_updated_at
  ON public.arcade_device_sessions;

CREATE TRIGGER trg_arcade_device_sessions_updated_at
BEFORE UPDATE ON public.arcade_device_sessions
FOR EACH ROW
EXECUTE FUNCTION public.set_arcade_session_updated_at();

ALTER TABLE public.arcade_device_sessions ENABLE ROW LEVEL SECURITY;

-- The client should not access this table directly.
REVOKE ALL ON public.arcade_device_sessions FROM anon, authenticated;

-- ============================================================================
-- 2. START FREEPLAY SESSION
-- Depends on existing RPCs:
--   public.freeplay_device_refresh(text)
--   public.freeplay_device_consume(text, text)
-- ============================================================================

DROP FUNCTION IF EXISTS public.start_freeplay_session(text, text);

CREATE OR REPLACE FUNCTION public.start_freeplay_session(
  p_device_id text,
  p_game_id text
)
RETURNS TABLE(
  session_id uuid,
  tokens_remaining bigint,
  stake bigint,
  game_id text,
  mode text,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refresh record;
  v_consume record;
  v_session_id uuid;
  v_stake bigint;
BEGIN
  IF coalesce(trim(p_device_id), '') = '' THEN
    RAISE EXCEPTION 'device_id is required';
  END IF;

  IF coalesce(trim(p_game_id), '') = '' THEN
    RAISE EXCEPTION 'game_id is required';
  END IF;

  -- Refresh first so the token count is current before consume.
  SELECT *
  INTO v_refresh
  FROM public.freeplay_device_refresh(p_device_id);

  SELECT *
  INTO v_consume
  FROM public.freeplay_device_consume(p_device_id, p_game_id);

  v_stake := GREATEST(0, coalesce((v_consume.free_play_amount)::bigint, 0));

  INSERT INTO public.arcade_device_sessions (
    device_id,
    game_id,
    mode,
    status,
    stake,
    approved_reward,
    consumed_token,
    client_payload,
    server_payload
  )
  VALUES (
    p_device_id,
    p_game_id,
    'freeplay',
    'started',
    v_stake,
    0,
    true,
    '{}'::jsonb,
    jsonb_build_object(
      'tokens_before', coalesce((v_refresh.tokens)::bigint, null),
      'tokens_after', coalesce((v_consume.tokens_remaining)::bigint, null),
      'free_play_amount', v_stake
    )
  )
  RETURNING id INTO v_session_id;

  RETURN QUERY
  SELECT
    v_session_id,
    GREATEST(0, coalesce((v_consume.tokens_remaining)::bigint, 0)),
    v_stake,
    p_game_id,
    'freeplay'::text,
    'started'::text;
END;
$$;

-- ============================================================================
-- 3. START PAID SESSION
-- Debits vault on the server and opens a session atomically.
-- ============================================================================

DROP FUNCTION IF EXISTS public.start_paid_session(text, text, bigint);

CREATE OR REPLACE FUNCTION public.start_paid_session(
  p_device_id text,
  p_game_id text,
  p_stake bigint
)
RETURNS TABLE(
  session_id uuid,
  balance_after bigint,
  stake bigint,
  game_id text,
  mode text,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance_before bigint;
  v_balance_after bigint;
  v_session_id uuid;
BEGIN
  IF coalesce(trim(p_device_id), '') = '' THEN
    RAISE EXCEPTION 'device_id is required';
  END IF;

  IF coalesce(trim(p_game_id), '') = '' THEN
    RAISE EXCEPTION 'game_id is required';
  END IF;

  IF p_stake IS NULL OR p_stake <= 0 THEN
    RAISE EXCEPTION 'stake must be greater than 0';
  END IF;

  INSERT INTO public.vault_balances (device_id, balance, last_sync_at)
  VALUES (p_device_id, 0, now())
  ON CONFLICT (device_id) DO NOTHING;

  SELECT vb.balance
  INTO v_balance_before
  FROM public.vault_balances vb
  WHERE vb.device_id = p_device_id
  FOR UPDATE;

  v_balance_before := coalesce(v_balance_before, 0);

  IF v_balance_before < p_stake THEN
    RAISE EXCEPTION 'Insufficient vault balance';
  END IF;

  v_balance_after := v_balance_before - p_stake;

  UPDATE public.vault_balances vb
  SET balance = v_balance_after,
      last_sync_at = now()
  WHERE vb.device_id = p_device_id;

  INSERT INTO public.arcade_device_sessions (
    device_id,
    game_id,
    mode,
    status,
    stake,
    approved_reward,
    consumed_token,
    client_payload,
    server_payload
  )
  VALUES (
    p_device_id,
    p_game_id,
    'paid',
    'started',
    p_stake,
    0,
    false,
    '{}'::jsonb,
    jsonb_build_object(
      'balance_before', v_balance_before,
      'balance_after_start', v_balance_after
    )
  )
  RETURNING id INTO v_session_id;

  RETURN QUERY
  SELECT
    v_session_id,
    v_balance_after,
    p_stake,
    p_game_id,
    'paid'::text,
    'started'::text;
END;
$$;

-- ============================================================================
-- 4. FINISH SESSION
-- Server-side resolution for coin-flip and dice-over-under.
--
-- Expected payload for coin-flip:
--   { "choice": "heads" }  or  { "choice": "tails" }
--
-- Expected payload for dice-over-under:
--   { "target": 50, "isOver": true }
-- ============================================================================

DROP FUNCTION IF EXISTS public.finish_arcade_session(uuid, jsonb);

CREATE OR REPLACE FUNCTION public.finish_arcade_session(
  p_session_id uuid,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(
  session_id uuid,
  approved_reward bigint,
  balance_after bigint,
  status text,
  server_payload jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.arcade_device_sessions%ROWTYPE;
  v_choice text;
  v_coinflip_result text;
  v_dice_target integer;
  v_dice_is_over boolean;
  v_dice_roll numeric(5,2);
  v_dice_multiplier numeric;
  v_won boolean;
  v_reward bigint := 0;
  v_balance_after bigint := 0;
  v_server_payload jsonb := '{}'::jsonb;
BEGIN
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'session_id is required';
  END IF;

  SELECT *
  INTO v_session
  FROM public.arcade_device_sessions s
  WHERE s.id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found';
  END IF;

  IF v_session.status = 'cancelled' THEN
    RAISE EXCEPTION 'Session is cancelled';
  END IF;

  IF v_session.status = 'finished' THEN
    INSERT INTO public.vault_balances (device_id, balance, last_sync_at)
    VALUES (v_session.device_id, 0, now())
    ON CONFLICT (device_id) DO NOTHING;

    SELECT coalesce(vb.balance, 0)
    INTO v_balance_after
    FROM public.vault_balances vb
    WHERE vb.device_id = v_session.device_id;

    RETURN QUERY
    SELECT
      v_session.id,
      v_session.approved_reward,
      v_balance_after,
      v_session.status,
      v_session.server_payload;
    RETURN;
  END IF;

  IF coalesce(v_session.game_id, '') = 'coin-flip' THEN
    v_choice := lower(trim(coalesce(p_payload->>'choice', '')));
    IF v_choice NOT IN ('heads', 'tails') THEN
      RAISE EXCEPTION 'coin-flip payload must include choice=heads or choice=tails';
    END IF;

    v_coinflip_result := CASE WHEN random() < 0.5 THEN 'heads' ELSE 'tails' END;
    v_won := (v_coinflip_result = v_choice);
    v_reward := CASE
      WHEN v_won THEN floor(v_session.stake * 1.92)::bigint
      ELSE 0
    END;

    v_server_payload := jsonb_build_object(
      'game', 'coin-flip',
      'mode', v_session.mode,
      'stake', v_session.stake,
      'choice', v_choice,
      'result', v_coinflip_result,
      'won', v_won,
      'multiplier', 1.92,
      'approved_reward', v_reward
    );

  ELSIF coalesce(v_session.game_id, '') IN ('dice-over-under', 'dice') THEN
    v_dice_target := floor(coalesce((p_payload->>'target')::numeric, 0));
    v_dice_is_over := coalesce((p_payload->>'isOver')::boolean, true);

    IF v_dice_target < 1 OR v_dice_target > 99 THEN
      RAISE EXCEPTION 'dice payload must include target between 1 and 99';
    END IF;

    v_dice_roll := round((random() * 100)::numeric, 2);
    v_won := CASE
      WHEN v_dice_is_over THEN v_dice_roll > v_dice_target
      ELSE v_dice_roll < v_dice_target
    END;

    v_dice_multiplier := CASE
      WHEN v_dice_is_over THEN ((100 - 0.04) / (100 - v_dice_target)) * 100
      ELSE ((100 - 0.04) / v_dice_target) * 100
    END;

    v_reward := CASE
      WHEN v_won THEN floor(v_session.stake * (v_dice_multiplier / 100))::bigint
      ELSE 0
    END;

    v_server_payload := jsonb_build_object(
      'game', 'dice-over-under',
      'mode', v_session.mode,
      'stake', v_session.stake,
      'target', v_dice_target,
      'isOver', v_dice_is_over,
      'roll', v_dice_roll,
      'won', v_won,
      'multiplier', round((v_dice_multiplier / 100)::numeric, 4),
      'approved_reward', v_reward
    );

  ELSE
    RAISE EXCEPTION 'finish_arcade_session is not configured for game_id=%', v_session.game_id;
  END IF;

  INSERT INTO public.vault_balances (device_id, balance, last_sync_at)
  VALUES (v_session.device_id, 0, now())
  ON CONFLICT (device_id) DO NOTHING;

  SELECT coalesce(vb.balance, 0)
  INTO v_balance_after
  FROM public.vault_balances vb
  WHERE vb.device_id = v_session.device_id
  FOR UPDATE;

  IF v_reward > 0 THEN
    v_balance_after := v_balance_after + v_reward;

    UPDATE public.vault_balances vb
    SET balance = v_balance_after,
        last_sync_at = now()
    WHERE vb.device_id = v_session.device_id;
  END IF;

  UPDATE public.arcade_device_sessions s
  SET status = 'finished',
      approved_reward = v_reward,
      finished_at = now(),
      client_payload = coalesce(p_payload, '{}'::jsonb),
      server_payload = v_server_payload
  WHERE s.id = v_session.id;

  RETURN QUERY
  SELECT
    v_session.id,
    v_reward,
    v_balance_after,
    'finished'::text,
    v_server_payload;
END;
$$;

-- ============================================================================
-- 5. PERMISSIONS
-- ============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_freeplay_session(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_paid_session(text, text, bigint) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_arcade_session(uuid, jsonb) TO anon, authenticated;

COMMIT;

-- ============================================================================
-- 6. OPTIONAL SMOKE TESTS
-- Uncomment and run manually after the main block succeeds.
-- ============================================================================
--
-- -- Paid session test
-- -- Replace the device id with a real one that already has vault balance.
-- SELECT * FROM public.start_paid_session('test-device-id', 'coin-flip', 100);
--
-- -- Freeplay session test
-- -- Requires your existing freeplay RPCs/tables to be present and working.
-- SELECT * FROM public.start_freeplay_session('test-device-id', 'coin-flip');
--
-- -- Finish test
-- -- Replace the UUID with a real session id returned from one of the start RPCs.
-- SELECT * FROM public.finish_arcade_session(
--   '00000000-0000-0000-0000-000000000000',
--   '{"choice":"heads"}'::jsonb
-- );
