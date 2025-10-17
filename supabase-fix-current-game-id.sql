-- Fix current_game_id issue - Complete solution
-- This script adds the missing current_game_id column and fixes all related issues

-- 1. Add current_game_id column to casino_tables
ALTER TABLE public.casino_tables
  ADD COLUMN IF NOT EXISTS current_game_id UUID NULL;

-- 2. Add Foreign Key constraint (optional but recommended)
ALTER TABLE public.casino_tables
  ADD CONSTRAINT IF NOT EXISTS casino_tables_current_game_fk
  FOREIGN KEY (current_game_id) REFERENCES public.casino_games(id)
  ON DELETE SET NULL;

-- 3. Add RLS policy for updating current_game_id
CREATE POLICY IF NOT EXISTS "update current_game_id"
ON public.casino_tables
FOR UPDATE
USING (true)
WITH CHECK (true);

-- 4. Add index for better performance
CREATE INDEX IF NOT EXISTS idx_casino_tables_current_game_id
  ON public.casino_tables(current_game_id);

-- 5. Verify the column was added successfully
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default,
  character_maximum_length
FROM information_schema.columns 
WHERE table_name = 'casino_tables' 
  AND column_name = 'current_game_id';

-- 6. Verify the foreign key constraint
SELECT 
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'casino_tables'
  AND kcu.column_name = 'current_game_id';

-- 7. Verify the index was created
SELECT 
  indexname,
  tablename,
  indexdef
FROM pg_indexes 
WHERE tablename = 'casino_tables' 
  AND indexname = 'idx_casino_tables_current_game_id';
