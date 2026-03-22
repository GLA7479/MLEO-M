-- Shared Vault debug: all users overview
select
  device_id,
  balance
from public.vault_balances
order by balance desc, device_id asc;
