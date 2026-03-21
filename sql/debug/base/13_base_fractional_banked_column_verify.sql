-- BASE debug: אימות סוג עמודת banked_mleo (numeric + scale) — קריאה בלבד
select
  column_name,
  data_type,
  udt_name,
  numeric_precision,
  numeric_scale
from information_schema.columns
where table_schema = 'public'
  and table_name = 'base_device_state'
  and column_name = 'banked_mleo';
