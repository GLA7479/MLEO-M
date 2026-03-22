-- Arcade debug: all columns on arcade_device_sessions
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
  and table_name = 'arcade_device_sessions'
order by ordinal_position asc;
