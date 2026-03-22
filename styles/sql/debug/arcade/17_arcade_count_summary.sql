-- Arcade debug: row counts and status breakdown
select
  count(*) as total_sessions,
  count(*) filter (where status = 'started') as started_count,
  count(*) filter (where status = 'finished') as finished_count,
  count(*) filter (where status = 'cancelled') as cancelled_count,
  count(*) filter (where mode = 'freeplay') as freeplay_count,
  count(*) filter (where mode = 'paid') as paid_count
from public.arcade_device_sessions;
