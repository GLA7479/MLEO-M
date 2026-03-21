-- System debug: review devices inactive 30+ days anywhere
with all_devices as (
  select device_id, updated_at as seen_at, 'base' as source from public.base_device_state
  union all
  select device_id, updated_at as seen_at, 'miners' as source from public.miners_device_state
),
latest_seen as (
  select
    device_id,
    max(seen_at) as last_seen_at
  from all_devices
  group by device_id
)
select
  l.device_id,
  l.last_seen_at,
  now() - l.last_seen_at as idle_for,
  coalesce(v.balance, 0) as shared_vault_balance
from latest_seen l
left join public.vault_balances v
  on v.device_id = l.device_id
where l.last_seen_at < now() - interval '30 days'
order by l.last_seen_at asc;
