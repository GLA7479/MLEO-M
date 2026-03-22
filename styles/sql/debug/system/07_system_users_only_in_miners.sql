-- System debug: users that exist only in MINERS
select
  m.device_id,
  round(coalesce(m.balance, 0), 2) as miners_balance_now,
  round(coalesce(m.mined_today, 0), 2) as miners_mined_today,
  coalesce(m.vault, 0) as miners_internal_vault,
  m.updated_at
from public.miners_device_state m
left join public.base_device_state b
  on b.device_id = m.device_id
left join public.vault_balances v
  on v.device_id = m.device_id
where b.device_id is null
  and v.device_id is null
order by m.updated_at desc;
