-- Arcade debug: summary of finished sessions in the last 24 hours
select
  count(*) as finished_sessions_24h,
  coalesce(sum(stake), 0) as total_stake,
  coalesce(sum(approved_reward), 0) as total_approved_reward,
  coalesce(sum(approved_reward - stake), 0) as total_net
from public.arcade_device_sessions
where status = 'finished'
  and finished_at is not null
  and finished_at >= now() - interval '24 hours';
