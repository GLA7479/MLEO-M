-- BASE: daily cap + softcut on in-game MLEO production (banked_mleo), aligned with MINERS.
-- Removes reliance on per-day shipping cap (ship to vault is unlimited).

BEGIN;

ALTER TABLE public.base_device_state
  ADD COLUMN IF NOT EXISTS mleo_produced_today numeric(20, 4) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.base_economy_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  daily_mleo_cap bigint NOT NULL DEFAULT 2500,
  mleo_gain_mult numeric(20, 8) NOT NULL DEFAULT 0.50,
  softcut_json jsonb NOT NULL DEFAULT '[
    {"upto":0.55, "factor":1.00},
    {"upto":0.75, "factor":0.55},
    {"upto":0.90, "factor":0.30},
    {"upto":1.00, "factor":0.15},
    {"upto":9.99, "factor":0.06}
  ]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.base_economy_config (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

UPDATE public.base_economy_config
SET
  daily_mleo_cap = 2500,
  mleo_gain_mult = 0.50,
  softcut_json = '[
    {"upto":0.55, "factor":1.00},
    {"upto":0.75, "factor":0.55},
    {"upto":0.90, "factor":0.30},
    {"upto":1.00, "factor":0.15},
    {"upto":9.99, "factor":0.06}
  ]'::jsonb,
  updated_at = now()
WHERE id = 1;

COMMIT;
