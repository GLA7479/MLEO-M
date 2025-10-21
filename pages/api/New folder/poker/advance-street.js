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
    // For now, just return success without database operations
    console.log('Advance street called for hand_id:', hand_id);
    return res.json({ ok:true, stage: 'flop', board: [], current_turn: 0 });
  } catch(e){
    console.error("API /poker/advance-street error:", e);
    res.status(500).json({ error:"server_error", details: String(e.message||e) });
  }
}