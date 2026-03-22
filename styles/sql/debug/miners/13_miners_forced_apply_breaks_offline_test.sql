-- MINERS debug: בדיקת accrual breaks אופליין (עם offline_factor) — משנה state!
select *
from public.miners_apply_breaks(
  'PUT-DEVICE-ID-HERE',
  '{"1":5}'::jsonb,
  true
);
