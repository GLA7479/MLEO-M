-- System debug: users that exist only in shared vault
select
  v.device_id,
  v.balance as shared_vault_balance
from public.vault_balances v
left join public.base_device_state b
  on b.device_id = v.device_id
left join public.miners_device_state m
  on m.device_id = v.device_id
where b.device_id is null
  and m.device_id is null
order by v.balance desc, v.device_id asc;
