-- פונקציות לחלוקת לוח אוטומטית
-- הרץ את זה ב-Supabase SQL Editor

-- מוציא N קלפים מראש הדק ומעדכן את deck_remaining
DROP FUNCTION IF EXISTS draw_from_deck(uuid,int);
CREATE OR REPLACE FUNCTION draw_from_deck(p_hand uuid, p_n int)
RETURNS text[] LANGUAGE plpgsql AS $$
DECLARE
  d text[]; drawn text[]; rest text[]; n int := greatest(0, p_n);
BEGIN
  SELECT deck_remaining INTO d FROM poker_hands WHERE id = p_hand;
  IF d IS NULL THEN d := '{}'::text[]; END IF;

  IF array_length(d,1) IS NULL OR array_length(d,1) = 0 OR n = 0 THEN
    RETURN '{}'::text[];
  END IF;

  IF n >= array_length(d,1) THEN
    drawn := d;
    rest  := '{}'::text[];
  ELSE
    drawn := d[1:n];
    rest  := d[(n+1):array_length(d,1)];
  END IF;

  UPDATE poker_hands SET deck_remaining = rest WHERE id = p_hand;
  RETURN drawn;
END $$;

-- מאחד לוח קיים עם קלפים חדשים
DROP FUNCTION IF EXISTS append_board(uuid,text[]);
CREATE OR REPLACE FUNCTION append_board(p_hand uuid, p_cards text[])
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  b text[];
BEGIN
  SELECT board INTO b FROM poker_hands WHERE id = p_hand;
  IF b IS NULL THEN b := '{}'::text[]; END IF;
  UPDATE poker_hands SET board = b || coalesce(p_cards, '{}'::text[]) WHERE id = p_hand;
END $$;

-- פונקציה לקבלת המושב הפעיל הבא
DROP FUNCTION IF EXISTS next_active_seat(uuid, int);
CREATE OR REPLACE FUNCTION next_active_seat(p_hand uuid, p_from int)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  seats int[];
  idx int;
BEGIN
  SELECT array_agg(seat_index ORDER BY seat_index) INTO seats
  FROM poker_hand_players
  WHERE hand_id = p_hand AND NOT folded AND NOT all_in;
  
  IF seats IS NULL OR array_length(seats, 1) = 0 THEN
    RETURN NULL;
  END IF;
  
  -- Find first seat after p_from
  FOR idx IN 1..array_length(seats, 1) LOOP
    IF seats[idx] > p_from THEN
      RETURN seats[idx];
    END IF;
  END LOOP;
  
  -- Wrap around to first seat
  RETURN seats[1];
END $$;

-- פונקציה פשוטה לשואודאון (MVP)
DROP FUNCTION IF EXISTS perform_showdown_split(uuid);
CREATE OR REPLACE FUNCTION perform_showdown_split(p_hand uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  pot bigint;
  winners int;
  share bigint;
BEGIN
  SELECT pot_total INTO pot FROM poker_hands WHERE id = p_hand;
  SELECT count(*) INTO winners FROM poker_hand_players WHERE hand_id = p_hand AND NOT folded;
  
  IF winners > 0 THEN
    share := pot / winners;
    UPDATE poker_hand_players 
    SET stack_live = stack_live + share
    WHERE hand_id = p_hand AND NOT folded;
  END IF;
END $$;

-- עדכון advance_street עם חלוקת לוח אוטומטית
DROP FUNCTION IF EXISTS advance_street(uuid);
CREATE OR REPLACE FUNCTION advance_street(p_hand uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  cur text; nxt text; start_turn int; draw text[];
BEGIN
  SELECT stage INTO cur FROM poker_hands WHERE id = p_hand;
  IF cur IS NULL THEN RAISE EXCEPTION 'Hand not found'; END IF;

  IF cur = 'preflop' THEN      nxt := 'flop';
  ELSIF cur = 'flop' THEN      nxt := 'turn';
  ELSIF cur = 'turn' THEN      nxt := 'river';
  ELSE                         nxt := 'showdown';
  END IF;

  -- איפוס הימורי רחוב
  UPDATE poker_hand_players SET bet_street = 0, acted_street = false WHERE hand_id = p_hand;

  IF nxt IN ('flop','turn','river') THEN
    -- חלוקת לוח: 3/1/1 מהדק
    draw := draw_from_deck(p_hand, CASE WHEN nxt='flop' THEN 3 ELSE 1 END);
    PERFORM append_board(p_hand, draw);

    -- תור ראשון: פשוט - הנמוך החי
    SELECT next_active_seat(p_hand, -1) INTO start_turn;
    UPDATE poker_hands 
    SET stage = nxt, 
        current_turn = start_turn,
        turn_deadline = CASE WHEN start_turn IS NOT NULL THEN now() + interval '30 seconds' ELSE NULL END
    WHERE id = p_hand;

  ELSE
    -- שואודאון MVP
    PERFORM perform_showdown_split(p_hand);
    UPDATE poker_hands SET stage = 'showdown', current_turn = NULL, turn_deadline = NULL WHERE id = p_hand;
  END IF;

  RETURN nxt;
END $$;
