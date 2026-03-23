-- FULL GLOBAL WIPE (DESTRUCTIVE)
-- Hard reset for launch:
-- - BASE state + audit
-- - MINERS state
-- - VAULT state (new + legacy table names if they exist)
--
-- NOTE:
-- 1) Run in Supabase SQL Editor with admin/service role permissions.
-- 2) Keep the app closed while running, so no new rows are recreated immediately.

BEGIN;

-- BASE
TRUNCATE TABLE public.base_action_audit RESTART IDENTITY;
TRUNCATE TABLE public.base_device_state RESTART IDENTITY;

-- MINERS
TRUNCATE TABLE public.miners_device_state RESTART IDENTITY;

-- VAULT (current table)
TRUNCATE TABLE public.vault_balances RESTART IDENTITY;

-- VAULT (legacy table, only if exists)
DO $$
BEGIN
  IF to_regclass('public.arcade_shared_vault') IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE public.arcade_shared_vault RESTART IDENTITY';
  END IF;
END $$;

COMMIT;

-- Verification snapshot (should all be 0)
SELECT
  (SELECT COUNT(*) FROM public.base_action_audit) AS base_action_audit_rows,
  (SELECT COUNT(*) FROM public.base_device_state) AS base_device_state_rows,
  (SELECT COUNT(*) FROM public.miners_device_state) AS miners_device_state_rows,
  (SELECT COUNT(*) FROM public.vault_balances) AS vault_balances_rows;

-- Optional verification for legacy table (safe if table does not exist)
DO $$
DECLARE
  v_legacy_count bigint;
BEGIN
  IF to_regclass('public.arcade_shared_vault') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*) FROM public.arcade_shared_vault' INTO v_legacy_count;
    RAISE NOTICE 'arcade_shared_vault rows: %', v_legacy_count;
  ELSE
    RAISE NOTICE 'arcade_shared_vault does not exist (ok)';
  END IF;
END $$;
