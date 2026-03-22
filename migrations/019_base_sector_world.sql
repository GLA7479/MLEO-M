-- BASE worlds / sectors: persistent active sector (1–6) + daily MLEO cap from sector.
-- Apply after deploying updated `sql/base_server_authority.sql` and `sql/base_atomic_rpc.sql`
-- (defines `base_sector_world_daily_cap`, `base_deploy_next_sector`, reconcile + expedition cap).

BEGIN;

ALTER TABLE public.base_device_state
  ADD COLUMN IF NOT EXISTS sector_world integer NOT NULL DEFAULT 1;

UPDATE public.base_device_state
SET
  sector_world = greatest(1, least(6, coalesce(sector_world, 1))),
  version = 11
WHERE version < 11;

COMMIT;
