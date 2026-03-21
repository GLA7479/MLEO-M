-- Shared Vault debug: zero balances
select
  device_id,
  balance
from public.vault_balances
where coalesce(balance, 0) = 0
order by device_id asc;
