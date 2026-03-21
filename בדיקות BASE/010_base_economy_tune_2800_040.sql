-- BASE economy tuning: daily cap + gain mult (softcut curve unchanged).
BEGIN;

UPDATE public.base_economy_config
SET
  daily_mleo_cap = 2800,
  mleo_gain_mult = 0.40,
  updated_at = now()
WHERE id = 1;

COMMIT;
