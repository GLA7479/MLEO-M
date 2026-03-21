-- Shared Vault debug: single user balance
select
  device_id,
  balance
from public.vault_balances
where device_id = 'PUT-DEVICE-ID-HERE';
