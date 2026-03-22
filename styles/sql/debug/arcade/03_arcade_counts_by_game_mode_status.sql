-- Arcade debug: session counts by game, mode, and status
select
  game_id,
  mode,
  status,
  count(*) as sessions_count,
  coalesce(sum(stake), 0) as total_stake,
  coalesce(sum(approved_reward), 0) as total_approved_reward
from public.arcade_device_sessions
group by game_id, mode, status
order by sessions_count desc, game_id asc, mode asc, status asc;
