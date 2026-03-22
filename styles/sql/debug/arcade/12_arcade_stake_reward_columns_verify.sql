-- Arcade debug: verify stake / approved_reward column types
select
  column_name,
  data_type,
  udt_name,
  numeric_precision,
  numeric_scale
from information_schema.columns
where table_schema = 'public'
  and table_name = 'arcade_device_sessions'
  and column_name in ('stake', 'approved_reward')
order by column_name asc;
