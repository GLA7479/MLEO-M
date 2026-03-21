-- Arcade debug: sessions stuck in started (older than 2 hours)
select
  id,
  device_id,
  game_id,
  mode,
  status,
  stake,
  started_at,
  now() - started_at as stuck_for
from public.arcade_device_sessions
where status = 'started'
  and started_at < now() - interval '2 hours'
order by started_at asc;
