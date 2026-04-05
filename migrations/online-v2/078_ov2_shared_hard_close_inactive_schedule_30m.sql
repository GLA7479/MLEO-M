-- Schedule shared-room 6h inactivity hard-close (ov2_shared_hard_close_inactive_rooms).
-- Apply after 077. Requires pg_cron. Run manually after review.

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
        'ov2_shared_hard_close_6h_every30m'
      )
    LOOP
      PERFORM cron.unschedule(r.jobid);
    END LOOP;

    PERFORM cron.schedule(
      'ov2_shared_hard_close_6h_every30m',
      '*/30 * * * *',
      $cmd$SELECT public.ov2_shared_hard_close_inactive_rooms();$cmd$
    );
  END IF;
END $$;

COMMIT;
