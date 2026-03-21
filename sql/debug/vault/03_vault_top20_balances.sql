-- Shared Vault debug: top 20 balances
select
  device_id,
  balance
from public.vault_balances
order by balance desc, device_id asc
limit 20;
