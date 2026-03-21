-- MINERS debug: בדיקת accrual breaks אונליין — משנה state! דוגמה: 5 breaks בשלב 1
select *
from public.miners_apply_breaks(
  'PUT-DEVICE-ID-HERE',
  '{"1":5}'::jsonb,
  false
);
