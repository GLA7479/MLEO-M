-- הוספת עמודות למניעת מרוץ
ALTER TABLE public.bj_sessions
  ADD COLUMN IF NOT EXISTS last_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS dealer_revealed_at timestamptz,
  ADD COLUMN IF NOT EXISTS leader_client_id uuid;
