-- פונקציות RPC לתיקון בעיית text[] vs jsonb
-- הרץ את הפקודות האלה ב-Supabase SQL Editor

-- פונקציה לחלוקת קלפים
CREATE OR REPLACE FUNCTION set_hole_cards(p_hand uuid, p_seat int, p_cards text[])
RETURNS void LANGUAGE sql AS $$
  UPDATE poker_hand_players
  SET hole_cards = p_cards
  WHERE hand_id = p_hand AND seat_index = p_seat;
$$;

-- פונקציה לעדכון board
CREATE OR REPLACE FUNCTION set_board(p_hand uuid, p_cards text[])
RETURNS void LANGUAGE sql AS $$
  UPDATE poker_hands
  SET board = p_cards
  WHERE id = p_hand;
$$;

-- פונקציה לעדכון deck_remaining
CREATE OR REPLACE FUNCTION set_deck_remaining(p_hand uuid, p_cards text[])
RETURNS void LANGUAGE sql AS $$
  UPDATE poker_hands
  SET deck_remaining = p_cards
  WHERE id = p_hand;
$$;

-- בדיקה שהפונקציות נוצרו
SELECT 'Functions created successfully' as status;
