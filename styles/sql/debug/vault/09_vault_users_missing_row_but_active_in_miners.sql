-- Shared Vault debug: MINERS users with no vault_balances row
select
  m.device_id,
  round(coalesce(m.balance, 0), 2) as miners_balance_now,
  coalesce(m.vault, 0) as miners_internal_vault,
  coalesce(m.claimed_total, 0) as miners_claimed_total,
  coalesce(m.claimed_to_wallet, 0) as miners_claimed_to_wallet,
  m.updated_at as miners_updated_at
from public.miners_device_state m
left join public.vault_balances v
  on v.device_id = m.device_id
where v.device_id is null
order by m.updated_at desc;
