-- System debug: compare BASE shipped total vs shared vault current balance
select
  b.device_id,
  coalesce(b.total_banked, 0) as base_shipped_total,
  coalesce(v.balance, 0) as shared_vault_balance,
  coalesce(b.total_banked, 0)::numeric - coalesce(v.balance, 0)::numeric as diff
from public.base_device_state b
left join public.vault_balances v
  on v.device_id = b.device_id
where coalesce(b.total_banked, 0) <> coalesce(v.balance, 0)
order by abs(coalesce(b.total_banked, 0)::numeric - coalesce(v.balance, 0)::numeric) desc, b.device_id asc;
