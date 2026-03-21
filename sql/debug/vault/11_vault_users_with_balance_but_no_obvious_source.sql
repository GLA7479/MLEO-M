-- Shared Vault debug: users with shared balance but no obvious BASE/MINERS source counters
select
  v.device_id,
  coalesce(v.balance, 0) as shared_vault_balance,
  coalesce(b.total_banked, 0) as base_shipped_total,
  coalesce(m.claimed_total, 0) as miners_claimed_total,
  coalesce(m.claimed_to_wallet, 0) as miners_claimed_to_wallet
from public.vault_balances v
left join public.base_device_state b
  on b.device_id = v.device_id
left join public.miners_device_state m
  on m.device_id = v.device_id
where coalesce(v.balance, 0) > 0
  and coalesce(b.total_banked, 0) = 0
  and coalesce(m.claimed_total, 0) = 0
  and coalesce(m.claimed_to_wallet, 0) = 0
order by v.balance desc, v.device_id asc;
