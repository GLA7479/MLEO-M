-- הוספת עמודת snapshot לסשן
ALTER TABLE public.bj_sessions
  ADD COLUMN IF NOT EXISTS last_snapshot jsonb;
