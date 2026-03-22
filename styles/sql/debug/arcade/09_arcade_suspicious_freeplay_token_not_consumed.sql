-- Arcade debug: freeplay rows where consumed_token is false
select
  id,
  device_id,
  game_id,
  status,
  consumed_token,
  stake,
  started_at,
  finished_at
from public.arcade_device_sessions
where mode = 'freeplay'
  and consumed_token = false
order by started_at desc;
