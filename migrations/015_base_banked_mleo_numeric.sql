-- BASE: store fractional banked_mleo (matches sql/base_server_authority.sql + reconcile round(...,4)).
-- Run once in Supabase SQL Editor (or via migration runner) after deploying updated RPCs.

BEGIN;

ALTER TABLE public.base_device_state
  ALTER COLUMN banked_mleo TYPE numeric(20,4)
  USING round(banked_mleo::numeric, 4);

ALTER TABLE public.base_device_state
  ALTER COLUMN banked_mleo SET DEFAULT 0;

COMMIT;
