// pages/api/poker/sit.js
export const config = { runtime: "nodejs" };

// POST { table_id, seat_index, player_name, buyin }
// returns updated seat
import { q } from "../../../lib/db";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { table_id, seat_index, player_name, buyin } = req.body || {};
  
  // Log request for debugging
  console.log('REQ /api/poker/sit:', { table_id, seat_index, player_name, buyin });
  
  if (!table_id || seat_index==null || !player_name || !buyin) {
    console.log('ERROR: Missing required fields');
    return res.status(400).json({ error:"bad_request", details: "Missing table_id, seat_index, player_name, or buyin" });
  }
  try {
    const up = await q(
      `INSERT INTO poker_seats (table_id, seat_index, player_name, stack, is_sitting_out)
       VALUES ($1,$2,$3,$4,false)
       ON CONFLICT (table_id, seat_index)
       DO UPDATE SET player_name=EXCLUDED.player_name, stack=EXCLUDED.stack, is_sitting_out=false, created_at=now()
       RETURNING seat_index, player_name, stack, is_sitting_out`,
      [table_id, seat_index, player_name, buyin]
    );
    res.json({ seat: up.rows[0] });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error:"server_error" });
  }
}
