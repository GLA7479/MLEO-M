// pages/api/poker/leave.js
export const config = { runtime: "nodejs" };
import { q } from "../../../lib/db";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { table_id, seat_index, seat_token } = req.body || {};
  if (!table_id || seat_index == null) {
    return res.status(400).json({ error: "bad_request", details: "Missing table_id or seat_index" });
  }
  try {
    // אל תמחק רשומת מושב — רק נקה אותה, רק אם seat_token תואם.
    const up = await q(`
      UPDATE poker.poker_seats
      SET player_name = NULL,
          stack_live  = 0,
          sat_out     = false,
          seat_token  = NULL
      WHERE table_id=$1 AND seat_index=$2 AND seat_token=$3
      RETURNING seat_index
    `, [table_id, seat_index, String(seat_token || "")]);

    if (!up.rowCount) {
      return res.status(403).json({ error: "invalid_seat_token" });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error("API /poker/leave error:", e);
    res.status(500).json({ error: "server_error", details: String(e?.message || e) });
  }
}
