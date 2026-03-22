-- Shared Vault debug: manually set one user balance
update public.vault_balances
set balance = 1234
where device_id = 'PUT-DEVICE-ID-HERE';

select
  device_id,
  balance
from public.vault_balances
where device_id = 'PUT-DEVICE-ID-HERE';
