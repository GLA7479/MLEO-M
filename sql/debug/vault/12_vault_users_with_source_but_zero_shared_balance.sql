-- Shared Vault debug: users with BASE/MINERS source counters but zero shared balance
select
  coalesce(b.device_id, m.device_id) as device_id,
  coalesce(v.balance, 0) as shared_vault_balance,
  coalesce(b.total_banked, 0) as base_shipped_total,
  coalesce(m.claimed_total, 0) as miners_claimed_total,
  coalesce(m.claimed_to_wallet, 0) as miners_claimed_to_wallet
from public.base_device_state b
full outer join public.miners_device_state m
  on m.device_id = b.device_id
left join public.vault_balances v
  on v.device_id = coalesce(b.device_id, m.device_id)
where (
    coalesce(b.total_banked, 0) > 0
    or coalesce(m.claimed_total, 0) > 0
    or coalesce(m.claimed_to_wallet, 0) > 0
  )
  and coalesce(v.balance, 0) = 0
order by device_id asc;
