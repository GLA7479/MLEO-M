-- ============================================================================
-- ARCADE SESSIONS + SERVER-SIDE COIN-FLIP PILOT
-- Run this in the Supabase SQL Editor (same project as vault/freeplay RPCs)
--
-- Then run sql/arcade_sessions_add_slots_mystery.sql for finish_arcade_session
-- (all games). Skipping it leaves no finish RPC or an outdated one.
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
  v_reclaimed_stake bigint := 0;
  v_reclaim_timeout interval := interval '5 minutes';
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

  WITH reclaimed AS (
    UPDATE public.arcade_device_sessions s
    SET status = 'finished',
        approved_reward = s.stake,
        finished_at = now(),
        client_payload = coalesce(s.client_payload, '{}'::jsonb),
        server_payload = coalesce(s.server_payload, '{}'::jsonb) || jsonb_build_object(
          'cancelled', true,
          'cancel_reason', 'expired_started_session',
          'approved_reward', s.stake
        )
    WHERE s.device_id = p_device_id
      AND s.mode = 'paid'
      AND s.status = 'started'
      AND s.started_at <= now() - v_reclaim_timeout
    RETURNING s.stake
  )
  SELECT coalesce(sum(reclaimed.stake), 0)::bigint
  INTO v_reclaimed_stake
  FROM reclaimed;

  IF v_reclaimed_stake > 0 THEN
    v_balance_before := v_balance_before + v_reclaimed_stake;
    UPDATE public.vault_balances vb
    SET balance = v_balance_before,
        last_sync_at = now()
    WHERE vb.device_id = p_device_id;
  END IF;

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
      'balance_after_start', v_balance_after,
      'reclaimed_prior_started_stake', v_reclaimed_stake,
      'reclaim_timeout_seconds', extract(epoch from v_reclaim_timeout)::integer
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
-- 4. FINISH SESSION — NOT DEFINED IN THIS FILE (intentional)
-- ============================================================================
-- A previous version of this pilot script redefined public.finish_arcade_session
-- with only coin-flip + dice. Running that overwrote the full implementation in
-- sql/arcade_sessions_add_slots_mystery.sql and caused runtime errors such as:
--   finish_arcade_session is not configured for game_id=blackjack
--
-- Deploy finish_arcade_session (all arcade games: blackjack, slots, poker, …)
-- by running sql/arcade_sessions_add_slots_mystery.sql in Supabase SQL Editor
-- AFTER this pilot script. That file also sets REVOKE/GRANT for finish_arcade_session.
--
-- If you already ran an old pilot that dropped the full function, re-run
-- arcade_sessions_add_slots_mystery.sql once to restore it.
-- ============================================================================

-- ============================================================================
-- 5. PERMISSIONS
-- ============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.start_freeplay_session(text, text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.start_paid_session(text, text, bigint) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_freeplay_session(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.start_paid_session(text, text, bigint) TO service_role;

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
-- -- Finish test (requires sql/arcade_sessions_add_slots_mystery.sql deployed)
-- -- Replace the UUID with a real session id returned from one of the start RPCs.
-- SELECT * FROM public.finish_arcade_session(
--   '00000000-0000-0000-0000-000000000000',
--   '{"choice":"heads"}'::jsonb
-- );
