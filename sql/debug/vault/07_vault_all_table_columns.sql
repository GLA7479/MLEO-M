-- Shared Vault debug: show all vault_balances columns
select
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default,
  numeric_precision,
  numeric_scale
from information_schema.columns
where table_schema = 'public'
  and table_name = 'vault_balances'
order by ordinal_position asc;
