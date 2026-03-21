-- BASE: raise daily MLEO production cap to 3200 (gain mult and softcut unchanged).
BEGIN;

UPDATE public.base_economy_config
SET
  daily_mleo_cap = 3200,
  updated_at = now()
WHERE id = 1;

COMMIT;
