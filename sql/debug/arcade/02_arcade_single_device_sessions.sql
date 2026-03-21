-- Arcade debug: all sessions for one device (newest first)
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
where device_id = 'PUT-DEVICE-ID-HERE'
order by started_at desc
limit 500;
