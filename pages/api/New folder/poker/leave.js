// pages/api/poker/leave.js
export const config = { runtime: "nodejs" };

// POST { table_id, seat_index }
import { q } from "../../../lib/db";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { table_id, seat_index } = req.body || {};
  
  // Log request for debugging
  console.log('REQ /api/poker/leave:', { table_id, seat_index });
  
  if (!table_id || seat_index==null) {
    console.log('ERROR: Missing required fields');
    return res.status(400).json({ error:"bad_request", details: "Missing table_id or seat_index" });
  }
  try {
    const del = await q(
      `DELETE FROM poker_seats WHERE table_id=$1 AND seat_index=$2 RETURNING stack`,
      [table_id, seat_index]
    );
    res.json({ ok:true, stackReturned: del.rows[0]?.stack || 0 });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error:"server_error" });
  }
}
