-- Arcade debug: devices that started a session in last 24h + shared vault balance
select distinct
  s.device_id,
  coalesce(v.balance, 0) as shared_vault_balance
from public.arcade_device_sessions s
left join public.vault_balances v
  on v.device_id = s.device_id
where s.started_at >= now() - interval '24 hours'
order by shared_vault_balance desc, s.device_id asc;
