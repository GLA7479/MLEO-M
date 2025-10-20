export const config = { runtime: "nodejs" };

import { q } from "../../../lib/db";

function leftOfButton(order, dealerSeat) {
  if (!order.length) return null;
  const idx = order.findIndex(s => s > dealerSeat);
  return (idx>=0 ? order[idx] : order[0]) ?? null;
}

export default async function handler(req,res){
  if (req.method!=='POST') return res.status(405).end();
  const { hand_id } = req.body||{};
  if (!hand_id) return res.status(400).json({ error:"bad_request" });

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

    await q(`UPDATE poker_hands
             SET stage=$2, board=$3::jsonb, deck_remaining=$4::jsonb, current_turn=$5, turn_deadline=$6
             WHERE id=$1`,
      [hand_id, stage, JSON.stringify(board), JSON.stringify(deck_remaining), first, ddl]);

    res.json({ ok:true, stage, board, current_turn:first });
  } catch(e){
    console.error("API /poker/advance-street error:", e);
    res.status(500).json({ error:"server_error", details: String(e.message||e) });
  }
}