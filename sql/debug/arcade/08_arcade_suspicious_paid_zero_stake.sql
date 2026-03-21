-- Arcade debug: paid sessions with zero stake (unusual)
select
  id,
  device_id,
  game_id,
  status,
  stake,
  approved_reward,
  started_at,
  finished_at
from public.arcade_device_sessions
where mode = 'paid'
  and coalesce(stake, 0) = 0
order by started_at desc;
