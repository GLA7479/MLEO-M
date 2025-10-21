export const config = { runtime: "nodejs" };

import { q } from "../../../lib/db";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  
  let { hand_id, seat_index, action, amount, raise_to } = req.body || {};
  
  // Log request for debugging
  console.log('REQ /api/poker/action:', { hand_id, seat_index, action, amount, raise_to });
  
  if (!hand_id || seat_index==null || !action) {
    console.log('ERROR: Missing required fields');
    return res.status(400).json({ error:"bad_request", details: "Missing hand_id, seat_index, or action" });
  }

  try {
    // For now, just return success without database operations
    console.log('Action received:', { hand_id, seat_index, action, amount, raise_to });
    return res.json({ ok: true, action, seat_index, amount });
  } catch(e){
    console.error("API /poker/action error:", e);
    res.status(500).json({ error:"server_error", details: String(e.message||e) });
  }
}