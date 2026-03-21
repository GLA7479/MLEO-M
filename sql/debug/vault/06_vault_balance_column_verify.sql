-- Shared Vault debug: verify vault_balances.balance column type
select
  column_name,
  data_type,
  udt_name,
  numeric_precision,
  numeric_scale
from information_schema.columns
where table_schema = 'public'
  and table_name = 'vault_balances'
  and column_name = 'balance';
