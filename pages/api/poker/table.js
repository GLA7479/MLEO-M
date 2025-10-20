// pages/api/poker/table.js
export const config = { runtime: "nodejs" };

// GET /api/poker/table?name=TEST  or ?id=<uuid>
import { q } from "../../../lib/db";

export default async function handler(req, res) {
  try {
    const { name, id } = req.query || {};
    if (!name && !id) return res.status(400).json({ error: "bad_request" });

    const tableSql = id
      ? `SELECT id, name, small_blind, big_blind, max_players FROM poker_tables WHERE id = $1`
      : `SELECT id, name, small_blind, big_blind, max_players FROM poker_tables WHERE name = $1`;
    const tv = id ? [id] : [name];

    const t = await q(tableSql, tv);
    if (!t.rows.length) return res.status(404).json({ error: "table_not_found" });
    const table = t.rows[0];

    const s = await q(
      `SELECT seat_index, player_name, stack, is_sitting_out
       FROM poker_seats WHERE table_id=$1 ORDER BY seat_index`,
      [table.id]
    );

    return res.status(200).json({ table, seats: s.rows });
  } catch (e) {
    console.error("API /poker/table error:", e);
    return res.status(500).json({ error: "server_error", details: String(e?.message || e) });
  }
}
