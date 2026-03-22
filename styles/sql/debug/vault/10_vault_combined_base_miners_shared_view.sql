-- Shared Vault debug: combined cross-system view
select
  coalesce(v.device_id, b.device_id, m.device_id) as device_id,
  coalesce(v.balance, 0) as shared_vault_balance,
  round(coalesce(b.banked_mleo, 0), 4) as base_banked_now,
  coalesce(b.total_banked, 0) as base_shipped_total,
  round(coalesce(b.mleo_produced_today, 0), 4) as base_produced_today,
  round(coalesce(m.balance, 0), 2) as miners_balance_now,
  coalesce(m.vault, 0) as miners_internal_vault,
  coalesce(m.claimed_total, 0) as miners_claimed_total,
  coalesce(m.claimed_to_wallet, 0) as miners_claimed_to_wallet,
  b.updated_at as base_updated_at,
  m.updated_at as miners_updated_at
from public.vault_balances v
full outer join public.base_device_state b
  on b.device_id = v.device_id
full outer join public.miners_device_state m
  on m.device_id = coalesce(v.device_id, b.device_id)
order by shared_vault_balance desc, device_id asc;
