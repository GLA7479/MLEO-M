-- Shared Vault debug: suspicious negative balances
select
  device_id,
  balance
from public.vault_balances
where coalesce(balance, 0) < 0
order by balance asc, device_id asc;
