-- System debug: users active anywhere in the last 24 hours
select
  coalesce(b.device_id, m.device_id, v.device_id) as device_id,
  b.updated_at as base_updated_at,
  m.updated_at as miners_updated_at,
  coalesce(v.balance, 0) as shared_vault_balance,
  round(coalesce(b.mleo_produced_today, 0), 4) as base_produced_today,
  round(coalesce(m.mined_today, 0), 2) as miners_mined_today
from public.base_device_state b
full outer join public.miners_device_state m
  on m.device_id = b.device_id
full outer join public.vault_balances v
  on v.device_id = coalesce(b.device_id, m.device_id)
where
  (b.updated_at is not null and b.updated_at >= now() - interval '24 hours')
  or
  (m.updated_at is not null and m.updated_at >= now() - interval '24 hours')
order by greatest(
  coalesce(extract(epoch from b.updated_at), 0),
  coalesce(extract(epoch from m.updated_at), 0)
) desc;
