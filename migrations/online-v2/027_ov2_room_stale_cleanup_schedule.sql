-- =============================================================================
-- OV2 automatic stale room cleanup scheduling — 027_ov2_room_stale_cleanup_schedule.sql
-- =============================================================================
--
-- PURPOSE
-- -------
-- Schedules periodic execution of `public.ov2_admin_purge_stale_rooms(10, 'ov2_')`
-- so stale OV2 match rooms are removed without manual SQL.
--
-- SCHEDULE (when pg_cron is available)
-- ------------------------------------
-- * Frequency: every **5 minutes** (cron: `*/5 * * * *`)
-- * Threshold: rooms idle **≥ 10 minutes** are purged (first argument `10`)
-- * Product scope: unchanged — `p_room_prefix = 'ov2_'` (all `ov2_*` products)
--
-- WHAT STILL RUNS
-- ---------------
-- The same admin purge function from 024/026: **room-local** deletes only.
-- No user deletion, no global profiles, no vault balance changes, no settlement
-- or forfeit logic. Stale cleanup is housekeeping, not gameplay economics.
--
-- PRIVILEGES
-- ----------
-- The cron job runs SQL inside the database as the scheduler role (typically a
-- superuser / `postgres`). It does **not** grant EXECUTE on `ov2_admin_*` to
-- `authenticated` or `anon`. End-user permissions stay unchanged.
--
-- REQUIREMENTS
-- ------------
-- * Requires `pg_cron` extension (Supabase: enable **pg_cron** in Database →
--   Extensions if not already enabled).
-- * If `CREATE EXTENSION pg_cron` fails (e.g. local Postgres without the
--   extension), **skip this migration** or install `pg_cron` first; see
--   FALLBACK below.
--
-- FALLBACK (no pg_cron)
-- ---------------------
-- Run the same purge on a timer from a trusted backend using the **service_role**
-- key (Supabase) or a DB role that already has EXECUTE on the admin functions:
--   SELECT public.ov2_admin_purge_stale_rooms(10, 'ov2_');
-- Examples: Vercel cron, GitHub Actions, Cloud Scheduler, systemd timer, or your
-- worker process every 5 minutes. Keep threshold 10 minutes unless you change
-- the call and document it.
--
-- IDEMPOTENCY
-- -----------
-- A stable job name is used. Before scheduling, any existing job with the same
-- name is unscheduled so re-applying this migration does not duplicate jobs.
--
-- =============================================================================

BEGIN;

-- Use default schema for pg_cron; on Supabase you may enable pg_cron in Dashboard
-- and use `CREATE EXTENSION ... WITH SCHEMA extensions` if your project requires it.
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE
  r RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR r IN
      SELECT jobid FROM cron.job WHERE jobname = 'ov2_stale_room_purge_10m_every5m'
    LOOP
      PERFORM cron.unschedule(r.jobid);
    END LOOP;

    PERFORM cron.schedule(
      'ov2_stale_room_purge_10m_every5m',
      '*/5 * * * *',
      $cmd$SELECT public.ov2_admin_purge_stale_rooms(10, 'ov2_');$cmd$
    );
  END IF;
END $$;

COMMIT;
