-- Add insuranceOffered column to bj_sessions
ALTER TABLE public.bj_sessions ADD COLUMN IF NOT EXISTS insuranceOffered boolean DEFAULT false;
