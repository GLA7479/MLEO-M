-- =============================================================================
-- OV2 automatic stale room cleanup scheduling — 30 minute hardened threshold
-- migrations/online-v2/029_ov2_room_stale_cleanup_schedule_30m.sql
-- =============================================================================
--
-- PURPOSE
-- -------
-- Replace the previous 10-minute stale room cron schedule with a safer 30-minute
-- schedule that works with the hardened purge logic from 028.
--
-- SCHEDULE
-- --------
-- * Frequency: every 5 minutes (cron: */5 * * * *)
-- * Threshold: rooms idle >= 30 minutes are eligible for purge
-- * Product scope: p_room_prefix = 'ov2_'
--
-- IDEMPOTENCY
-- -----------
-- Any existing old/new OV2 stale purge jobs with the known names are unscheduled
-- before the desired job is created.
--
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE
  r RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR r IN
      SELECT jobid
      FROM cron.job
      WHERE jobname IN (
        'ov2_stale_room_purge_10m_every5m',
        'ov2_stale_room_purge_30m_every5m'
      )
    LOOP
      PERFORM cron.unschedule(r.jobid);
    END LOOP;

    PERFORM cron.schedule(
      'ov2_stale_room_purge_30m_every5m',
      '*/5 * * * *',
      $cmd$SELECT public.ov2_admin_purge_stale_rooms(30, 'ov2_');$cmd$
    );
  END IF;
END $$;

COMMIT;
