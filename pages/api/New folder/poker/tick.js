export const config = { runtime: "nodejs" };

import { q } from "../../../lib/db";

async function nextActiveSeatAfter(hand_id, fromSeat) {
  const r = await q(`
    SELECT seat_index
    FROM poker_hand_players
    WHERE hand_id=$1 AND folded=false AND all_in=false AND stack_live>0
    ORDER BY seat_index
  `, [hand_id]);
  const order = r.rows.map(x=>x.seat_index);
  if (!order.length) return null;
  const idx = order.findIndex(s => s > fromSeat);
  return (idx >= 0 ? order[idx] : order[0]) ?? null;
}

export default async function handler(req,res){
  const { hand_id } = req.query || {};
  
  // Log request for debugging
  console.log('REQ /api/poker/tick:', { hand_id });
  
  if (!hand_id) {
    console.log('ERROR: Missing hand_id');
    return res.status(400).json({ error:"bad_request", details: "Missing hand_id" });
  }

  try {
    // For now, just return success without database checks
    console.log('Tick called for hand_id:', hand_id);
    return res.json({ ok:true, no_turn:true });
  } catch(e){
    console.error("API /poker/tick error:", e);
    res.status(500).json({ error:"server_error", details: String(e.message||e) });
  }
}