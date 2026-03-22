-- Fix null values in rummy51_sessions (discard/stock columns)
-- Run this once to clean up broken data

-- Fix discard null values
UPDATE public.rummy51_sessions
SET discard = '{}'::text[]
WHERE discard IS NULL;

-- Fix stock null values
UPDATE public.rummy51_sessions
SET stock = '{}'::text[]
WHERE stock IS NULL;

-- Verify no nulls remain (should return 0 rows)
-- SELECT id, room_id
-- FROM public.rummy51_sessions
-- WHERE discard IS NULL OR stock IS NULL;
