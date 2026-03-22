-- System debug: users that exist only in BASE
select
  b.device_id,
  round(coalesce(b.banked_mleo, 0), 4) as base_banked_now,
  coalesce(b.total_banked, 0) as base_shipped_total,
  round(coalesce(b.mleo_produced_today, 0), 4) as base_produced_today,
  b.updated_at
from public.base_device_state b
left join public.miners_device_state m
  on m.device_id = b.device_id
left join public.vault_balances v
  on v.device_id = b.device_id
where m.device_id is null
  and v.device_id is null
order by b.updated_at desc;
