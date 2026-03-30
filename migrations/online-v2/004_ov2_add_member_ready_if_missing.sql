-- Optional additive patch if `001_ov2_core.sql` was applied before `is_ready` existed.
-- Safe to run after 001; no-op when column already present.

BEGIN;

ALTER TABLE public.ov2_room_members
  ADD COLUMN IF NOT EXISTS is_ready boolean NOT NULL DEFAULT false;

COMMIT;
