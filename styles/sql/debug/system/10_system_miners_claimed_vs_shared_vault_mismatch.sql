-- System debug: compare MINERS claimed counters vs shared vault current balance
select
  m.device_id,
  coalesce(m.claimed_total, 0) as miners_claimed_total,
  coalesce(m.claimed_to_wallet, 0) as miners_claimed_to_wallet,
  coalesce(v.balance, 0) as shared_vault_balance
from public.miners_device_state m
left join public.vault_balances v
  on v.device_id = m.device_id
order by m.updated_at desc;
