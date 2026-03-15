export const config = { runtime: "nodejs" };

import { supabaseMP as supabase } from "../../../lib/supabaseClients";

function buildDeck(){
  const R = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
  const S = ["s","h","d","c"];
  const d=[]; for (const r of R) for (const s of S) d.push(r+s);
  for (let i=d.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [d[i],d[j]]=[d[j],d[i]]; }
  return d;
}

export default async function handler(req,res){
  if (req.method!=="POST") return res.status(405).end();
  const { table_id, hand_id } = req.body||{};
  
  // Log request for debugging
  console.log('REQ /api/poker/deal-init:', { table_id, hand_id });
  
  if (!table_id || !hand_id) {
    console.log('ERROR: Missing table_id or hand_id');
    return res.status(400).json({ error:"bad_request", details: "Missing table_id or hand_id" });
  }

  try {
    const t = await supabase.rpc('get_table_by_id', { p_table_id: table_id });
    if (!t.data.length) return res.status(404).json({ error:"table_not_found" });
    const { small_blind: SB, big_blind: BB } = t.data[0];

    const seats = await supabase.rpc('get_seats_by_table_id', { p_table_id: table_id });
    if (seats.data.length<2) return res.status(400).json({ error:"need_2_players" });

    const deck = buildDeck();

    // two cards to each (round-robin)
    const holeBySeat = {};
    for (let r=0;r<2;r++){
      for (const s of seats.data){
        const c = deck.pop();
        (holeBySeat[s.seat_index] ||= []).push(c);
      }
    }

    // snapshot players for this hand
    await supabase.rpc('delete_hand_players', { p_hand: hand_id });
    for (const s of seats.data){
      await supabase.rpc(
        'insert_hand_players',
        {
          p_hand: hand_id,
          p_table_id: table_id,
          p_seat: s.seat_index,
          p_player_name: s.player_name,
          p_player_id: null, // Assuming player_id is not available in this context
          p_hole_cards: holeBySeat[s.seat_index]||[],
          p_stack_start: s.stack,
          p_stack_live: s.stack, // Assuming stack_live is the same as stack_start for simplicity
          p_folded: false,
          p_all_in: false,
          p_bet_street: 0,
          p_acted_street: false,
          p_in_hand: true
        }
      );
      
      // Set hole cards using Supabase RPC
      await supabase.rpc('set_hole_cards', { 
        p_hand: hand_id, 
        p_seat: s.seat_index, 
        p_cards: holeBySeat[s.seat_index]||[] 
      });
    }

    // sb/bb relative to dealer
    const dealer = Number((await supabase.rpc('get_hand_by_id', { p_hand: hand_id })).data[0].dealer_seat);
    const order = seats.data.map(s=>s.seat_index).sort((a,b)=>a-b);
    const leftOf = (x) => {
      const idx = order.findIndex(s => s > x);
      return (idx >= 0 ? order[idx] : order[0]);
    };
    const sbSeat = leftOf(dealer);
    const bbSeat = leftOf(sbSeat);

    // post blinds into snapshot + actions
    await supabase.rpc(`UPDATE poker_hand_players
             SET bet_street = CASE seat_index WHEN $2 THEN $4 WHEN $3 THEN $5 ELSE 0 END,
                 stack_live = stack_live - CASE seat_index WHEN $2 THEN $4 WHEN $3 THEN $5 ELSE 0 END
             WHERE hand_id=$1`,
          [hand_id, sbSeat, bbSeat, SB, BB]);
    await supabase.rpc(`INSERT INTO poker_actions (hand_id, seat_index, action, amount) VALUES
             ($1,$2,'post_sb',$4), ($1,$3,'post_bb',$5)`,
          [hand_id, sbSeat, bbSeat, SB, BB]);

    // first to act (UTG): after BB
    const afterBB = leftOf(bbSeat);
    const deadline = new Date(Date.now() + 30_000);

    // Update hand stage and turn info
    await supabase.rpc(
      `UPDATE poker_hands
         SET stage='preflop',
             current_turn=$2,
             turn_deadline=$3
       WHERE id=$1`,
      [hand_id, afterBB, deadline]
    );

    // Update deck and board using Supabase RPC functions
    await supabase.rpc('set_deck_remaining', { p_hand: hand_id, p_cards: deck });
    await supabase.rpc('set_board', { p_hand: hand_id, p_cards: [] });

    res.json({ ok:true, players: seats.data.length, current_turn: afterBB, to_call: BB });
  } catch(e){
    console.error("API /poker/deal-init error:", e);
    res.status(500).json({ error:"server_error", details: String(e.message||e) });
  }
}