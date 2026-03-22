-- System debug: top 20 by combined visible value
select
  coalesce(v.device_id, b.device_id, m.device_id) as device_id,
  (
    coalesce(v.balance, 0)::numeric
    + coalesce(b.banked_mleo, 0)
    + coalesce(b.total_banked, 0)::numeric
    + coalesce(m.balance, 0)::numeric
    + coalesce(m.vault, 0)::numeric
  ) as combined_visible_value,
  coalesce(v.balance, 0) as shared_vault_balance,
  round(coalesce(b.banked_mleo, 0), 4) as base_banked_now,
  coalesce(b.total_banked, 0) as base_shipped_total,
  round(coalesce(m.balance, 0), 2) as miners_balance_now,
  coalesce(m.vault, 0) as miners_internal_vault
from public.vault_balances v
full outer join public.base_device_state b
  on b.device_id = v.device_id
full outer join public.miners_device_state m
  on m.device_id = coalesce(v.device_id, b.device_id)
order by combined_visible_value desc, device_id asc
limit 20;
