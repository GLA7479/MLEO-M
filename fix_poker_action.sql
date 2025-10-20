-- תיקון פונקציית poker_action לטיפול נכון ב-raise_to
-- הרץ את זה ב-Supabase SQL Editor

CREATE OR REPLACE FUNCTION poker_action(
  p_hand uuid,
  p_seat int,
  p_action text,
  p_amount bigint default 0
) RETURNS jsonb LANGUAGE plpgsql AS $$
declare
  v_hand record;
  v_player record;
  v_tocall bigint := 0;
  v_maxbet bigint := 0;
  v_bb bigint := 0;
  v_delta bigint := 0;
  v_stack bigint := 0;
begin
  -- Get hand info
  select h.*, t.big_blind as bb
  into v_hand
  from poker_hands h
  join poker_tables t on t.id = h.table_id
  where h.id = p_hand;
  
  if not found then
    raise exception 'Hand not found';
  end if;
  
  -- Get player info
  select * into v_player
  from poker_hand_players
  where hand_id = p_hand and seat_index = p_seat;
  
  if not found then
    raise exception 'Player not found';
  end if;
  
  if v_player.folded or v_player.all_in then
    raise exception 'Player is inactive';
  end if;
  
  -- Calculate to_call and max_bet
  select 
    coalesce(max(bet_street), 0) as max_bet,
    coalesce(max(bet_street), 0) - v_player.bet_street as to_call
  into v_maxbet, v_tocall
  from poker_hand_players
  where hand_id = p_hand and not folded and not all_in;
  
  v_bb := v_hand.bb;
  
  -- Process action
  if lower(p_action) = 'fold' then
    update poker_hand_players
    set folded = true
    where hand_id = p_hand and seat_index = p_seat;
    
  elsif lower(p_action) = 'check' then
    if v_tocall > 0 then
      raise exception 'Cannot check; must call %', v_tocall;
    end if;
    
  elsif lower(p_action) = 'call' then
    v_delta := least(v_tocall, v_player.stack_live);
    if v_delta < v_tocall and v_delta = v_player.stack_live then
      -- All-in call
      update poker_hand_players
      set stack_live = 0,
          bet_street = bet_street + v_delta,
          all_in = true
      where hand_id = p_hand and seat_index = p_seat;
    else
      -- Regular call
      update poker_hand_players
      set stack_live = stack_live - v_delta,
          bet_street = bet_street + v_delta
      where hand_id = p_hand and seat_index = p_seat;
    end if;
    
    update poker_hands set pot_total = pot_total + v_delta where id = p_hand;
    
  elsif lower(p_action) in ('bet','raise','allin') then
    if lower(p_action) = 'bet' and v_maxbet > 0 then
      raise exception 'Cannot bet; use raise';
    end if;
    if lower(p_action) = 'bet' and p_amount < v_bb then
      raise exception 'Min bet is big blind %', v_bb;
    end if;
    if lower(p_action) = 'raise' and p_amount < (v_maxbet + v_bb) then
      raise exception 'Min raise to %', (v_maxbet + v_bb);
    end if;

    -- קבע כמה צ'יפים לשלם עכשיו (delta)
    -- bet: delta = p_amount
    -- raise: delta = v_tocall + (p_amount - v_maxbet)   -- Raise To
    -- allin: delta = כל הסטאק הנוכחי (נשלף)
    if lower(p_action) = 'allin' then
      v_delta := v_player.stack_live;
    elsif lower(p_action) = 'bet' then
      v_delta := p_amount;
    else
      v_delta := v_tocall + (p_amount - v_maxbet);  -- Raise To
    end if;

    if v_delta is null or v_delta <= 0 then
      raise exception 'Amount must be > 0';
    end if;

    if v_delta >= v_player.stack_live then
      -- All-in
      update poker_hand_players
        set stack_live = 0,
            bet_street = bet_street + v_player.stack_live,
            all_in = true
        where hand_id = p_hand and seat_index = p_seat;
      v_delta := v_player.stack_live;
    else
      -- Regular bet/raise
      update poker_hand_players
        set stack_live = stack_live - v_delta,
            bet_street = bet_street + v_delta
        where hand_id = p_hand and seat_index = p_seat;
    end if;

    update poker_hands set pot_total = pot_total + v_delta where id = p_hand;
  end if;
  
  -- Mark as acted
  update poker_hand_players
  set acted_street = true
  where hand_id = p_hand and seat_index = p_seat;
  
  -- Insert action record
  insert into poker_actions (hand_id, seat_index, action, amount)
  values (p_hand, p_seat, p_action, v_delta);
  
  return jsonb_build_object(
    'ok', true,
    'action', p_action,
    'amount', v_delta,
    'to_call', v_tocall,
    'max_bet', v_maxbet
  );
end;
$$;
