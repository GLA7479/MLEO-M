// pages/api/poker/leave.js
export const config = { runtime: "nodejs" };
import { q } from "../../../lib/db";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { table_id, seat_index } = req.body || {};
  if (!table_id || seat_index == null) {
    return res.status(400).json({ error: "bad_request", details: "Missing table_id or seat_index" });
  }
  try {
    // אל תמחק רשומת מושב — רק נקה אותה.
    const up = await q(`
      UPDATE poker.poker_seats
      SET player_name = NULL,
          stack_live  = 0,
          sat_out     = false
      WHERE table_id=$1 AND seat_index=$2
      RETURNING seat_index
    `, [table_id, seat_index]);

    if (!up.rowCount) {
      return res.status(404).json({ error: "seat_not_found" });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error("API /poker/leave error:", e);
    res.status(500).json({ error: "server_error", details: String(e?.message || e) });
  }
}
