-- BASE: set daily MLEO production cap to 3400 (softcut + mleo_gain_mult unchanged).
BEGIN;

UPDATE public.base_economy_config
SET
  daily_mleo_cap = 3400,
  updated_at = now()
WHERE id = 1;

COMMIT;
