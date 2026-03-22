-- System debug: users present in BASE or MINERS but missing shared vault row
select
  coalesce(b.device_id, m.device_id) as device_id,
  round(coalesce(b.banked_mleo, 0), 4) as base_banked_now,
  coalesce(b.total_banked, 0) as base_shipped_total,
  round(coalesce(m.balance, 0), 2) as miners_balance_now,
  coalesce(m.vault, 0) as miners_internal_vault,
  coalesce(m.claimed_total, 0) as miners_claimed_total,
  b.updated_at as base_updated_at,
  m.updated_at as miners_updated_at
from public.base_device_state b
full outer join public.miners_device_state m
  on m.device_id = b.device_id
left join public.vault_balances v
  on v.device_id = coalesce(b.device_id, m.device_id)
where v.device_id is null
order by coalesce(b.updated_at, m.updated_at) desc;
