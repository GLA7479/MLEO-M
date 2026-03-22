-- Shared Vault debug: total rows and total balance
select
  count(*) as users_count,
  coalesce(sum(balance), 0) as total_shared_vault_balance,
  coalesce(avg(balance), 0) as avg_shared_vault_balance,
  coalesce(max(balance), 0) as max_shared_vault_balance,
  coalesce(min(balance), 0) as min_shared_vault_balance
from public.vault_balances;
