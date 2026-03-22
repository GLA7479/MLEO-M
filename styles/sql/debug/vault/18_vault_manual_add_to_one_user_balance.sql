-- Shared Vault debug: manually add to one user balance
update public.vault_balances
set balance = coalesce(balance, 0) + 100
where device_id = 'PUT-DEVICE-ID-HERE';

select
  device_id,
  balance
from public.vault_balances
where device_id = 'PUT-DEVICE-ID-HERE';
