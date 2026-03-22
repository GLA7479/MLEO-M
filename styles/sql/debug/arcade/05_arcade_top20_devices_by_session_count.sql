-- Arcade debug: top 20 devices by total session count
select
  device_id,
  count(*) as sessions_count,
  count(*) filter (where status = 'finished') as finished_count,
  count(*) filter (where status = 'started') as started_count,
  count(*) filter (where status = 'cancelled') as cancelled_count
from public.arcade_device_sessions
group by device_id
order by sessions_count desc, device_id asc
limit 20;
