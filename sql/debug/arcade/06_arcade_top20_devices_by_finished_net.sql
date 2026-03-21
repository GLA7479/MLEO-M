-- Arcade debug: top 20 devices by cumulative net (finished sessions only)
select
  device_id,
  coalesce(sum(approved_reward - stake), 0) as total_net,
  count(*) as finished_sessions
from public.arcade_device_sessions
where status = 'finished'
group by device_id
order by total_net desc, device_id asc
limit 20;
