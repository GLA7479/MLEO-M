-- System debug: quick lookup for one device everywhere
select 'base_device_state' as source, b.device_id, b.updated_at::text as updated_at
from public.base_device_state b
where b.device_id = 'PUT-DEVICE-ID-HERE'

union all

select 'miners_device_state' as source, m.device_id, m.updated_at::text as updated_at
from public.miners_device_state m
where m.device_id = 'PUT-DEVICE-ID-HERE'

union all

select 'vault_balances' as source, v.device_id, null as updated_at
from public.vault_balances v
where v.device_id = 'PUT-DEVICE-ID-HERE';
