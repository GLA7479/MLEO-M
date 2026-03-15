// pages/api/poker/chat.js
export const config = { runtime: "nodejs" };

// POST { table_id, player_name, message } | GET ?table_id
import { q } from "../../../lib/db";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const { table_id } = req.query;
      const r = await q(`SELECT id, player_id, message, system, ts FROM chat_messages WHERE table_id=$1 ORDER BY ts DESC LIMIT 100`, [table_id]);
      return res.json({ messages: r.rows });
    }
    if (req.method === "POST") {
      const { table_id, player_name, seat_token, message } = req.body || {};
      
      // Log request for debugging
      console.log('REQ /api/poker/chat:', { table_id, player_name, message: message?.substring(0, 50) + '...' });
      
      if (!table_id || !player_name || !message) {
        console.log('ERROR: Missing required fields');
        return res.status(400).json({ error:"bad_request", details: "Missing table_id, player_name, or message" });
      }
      
      // Validate seat_token matches player_name
      if (seat_token && String(seat_token).trim()) {
        const seatCheck = await q(
          `SELECT seat_index
           FROM poker.poker_seats
           WHERE table_id=$1 AND player_name=$2 AND seat_token=$3`,
          [table_id, player_name, String(seat_token).trim()]
        );
        if (!seatCheck.rowCount) {
          return res.status(403).json({ error: "invalid_seat_token" });
        }
      }
      
      await q(
        `INSERT INTO chat_messages (table_id, player_id, message, system) VALUES ($1, NULL, $2, false)`,
        [table_id, `${player_name}: ${message}`]
      );
      return res.json({ ok:true });
    }
    return res.status(405).end();
  } catch(e) {
    console.error(e);
    res.status(500).json({ error:"server_error" });
  }
}
