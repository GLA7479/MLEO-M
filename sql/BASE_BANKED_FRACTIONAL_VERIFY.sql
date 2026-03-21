-- Run in Supabase SQL Editor after: migration 015 (column numeric), deploy base_server_authority.sql + base_atomic_rpc.sql

-- 1) Column type
SELECT
  column_name,
  data_type,
  udt_name,
  numeric_precision,
  numeric_scale
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'base_device_state'
  AND column_name = 'banked_mleo';

-- 2) Reconcile body (expect: banked_mleo = round(v_banked_now, 4) — not floor)
SELECT pg_get_functiondef('public.base_reconcile_state(text)'::regprocedure);

-- 3) Direct write test (replace device_id)
/*
UPDATE public.base_device_state
SET banked_mleo = 1.2345
WHERE device_id = 'YOUR-DEVICE-UUID';

SELECT device_id, banked_mleo, mleo_produced_today, last_tick_at, updated_at
FROM public.base_device_state
WHERE device_id = 'YOUR-DEVICE-UUID';
*/
