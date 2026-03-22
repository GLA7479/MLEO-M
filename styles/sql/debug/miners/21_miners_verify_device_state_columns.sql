-- MINERS debug: סוגי עמודות עיקריים ב-miners_device_state (קריאה בלבד)
select
  column_name,
  data_type,
  udt_name,
  numeric_precision,
  numeric_scale
from information_schema.columns
where table_schema = 'public'
  and table_name = 'miners_device_state'
  and column_name in (
    'balance',
    'mined_today',
    'score_today',
    'vault',
    'claimed_total',
    'claimed_to_wallet'
  )
order by column_name asc;
