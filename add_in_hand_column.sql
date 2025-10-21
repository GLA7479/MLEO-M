-- הוספת עמודת in_hand לטבלת poker_hand_players
-- הרץ את הפקודה הזו ב-Supabase SQL Editor

ALTER TABLE poker_hand_players 
ADD COLUMN IF NOT EXISTS in_hand BOOLEAN DEFAULT false;

-- עדכון כל הרשומות הקיימות
UPDATE poker_hand_players 
SET in_hand = true 
WHERE in_hand IS NULL;

-- בדיקה שהעמודה נוספה
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'poker_hand_players' 
AND column_name = 'in_hand';
