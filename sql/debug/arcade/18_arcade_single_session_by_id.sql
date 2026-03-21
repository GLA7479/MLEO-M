-- Arcade debug: one session row by id (full payloads)
select
  id,
  device_id,
  game_id,
  mode,
  status,
  stake,
  approved_reward,
  consumed_token,
  started_at,
  finished_at,
  client_payload,
  server_payload,
  created_at,
  updated_at
from public.arcade_device_sessions
where id = 'PUT-SESSION-ID-HERE'::uuid;
