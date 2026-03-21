-- Arcade debug: last 100 sessions by start time
select
  id,
  device_id,
  game_id,
  mode,
  status,
  stake,
  approved_reward,
  (approved_reward - stake) as net_result,
  consumed_token,
  started_at,
  finished_at,
  updated_at
from public.arcade_device_sessions
order by started_at desc
limit 100;
