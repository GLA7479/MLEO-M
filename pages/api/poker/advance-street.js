export const config = { runtime: "nodejs" };

import { q } from "../../../lib/db";
import { supabase } from "../../../lib/supabase";

function leftOfButton(order, dealerSeat) {
  if (!order.length) return null;
  const idx = order.findIndex(s => s > dealerSeat);
  return (idx>=0 ? order[idx] : order[0]) ?? null;
}

export default async function handler(req,res){
  if (req.method!=='POST') return res.status(405).end();
  const { hand_id } = req.body||{};
  
  // Log request for debugging
  console.log('REQ /api/poker/advance-street:', { hand_id });
  
  if (!hand_id) {
    console.log('ERROR: Missing hand_id');
    return res.status(400).json({ error:"bad_request", details: "Missing hand_id" });
  }

  try {
    const h = await q(`SELECT stage, dealer_seat, board, deck_remaining FROM poker_hands WHERE id=$1`, [hand_id]);
    if (!h.rows.length) return res.status(404).json({ error:"hand_not_found" });
    let { stage, dealer_seat, board, deck_remaining } = h.rows[0];

    board = Array.isArray(board) ? [...board] : [];
    deck_remaining = Array.isArray(deck_remaining) ? [...deck_remaining] : [];

    // burn
    deck_remaining.pop();

    if (stage==='preflop') {
      // deal 3
      board.push(deck_remaining.pop(), deck_remaining.pop(), deck_remaining.pop());
      stage='flop';
    } else if (stage==='flop') {
      board.push(deck_remaining.pop());
      stage='turn';
    } else if (stage==='turn') {
      board.push(deck_remaining.pop());
      stage='river';
    } else {
      return res.status(400).json({ error:"already_river" });
    }

    // reset per-street
    await q(`UPDATE poker_hand_players
             SET bet_street=0, acted_street=false
             WHERE hand_id=$1`, [hand_id]);

    // קבע שחקן ראשון משמאל לדילר
    const actives = await q(`
      SELECT seat_index
      FROM poker_hand_players
      WHERE hand_id=$1 AND folded=false AND all_in=false AND stack_live>0
      ORDER BY seat_index`, [hand_id]);
    const order = actives.rows.map(r=>r.seat_index);
    const first = leftOfButton(order, dealer_seat);
    const ddl = first ? new Date(Date.now()+30_000) : null;

    // Update hand stage and turn info
    await q(`UPDATE poker_hands
             SET stage=$2, current_turn=$3, turn_deadline=$4
             WHERE id=$1`,
      [hand_id, stage, first, ddl]);

    // Update board and deck using Supabase RPC functions
    await supabase.rpc('set_board', { p_hand: hand_id, p_cards: board });
    await supabase.rpc('set_deck_remaining', { p_hand: hand_id, p_cards: deck_remaining });

    res.json({ ok:true, stage, board, current_turn:first });
  } catch(e){
    console.error("API /poker/advance-street error:", e);
    res.status(500).json({ error:"server_error", details: String(e.message||e) });
  }
}