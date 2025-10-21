// pages/api/poker/table.js
export const config = { runtime: "nodejs" };
import { q } from "../../../lib/db";

export default async function handler(req, res) {
  try {
    const { name, id } = req.query || {};
    if (!name && !id) return res.status(400).json({ error: "bad_request", details: "Missing name or id" });

    let table;
    if (id) {
      const t = await q(`SELECT id, name, stake_min FROM poker.poker_tables WHERE id=$1`, [id]);
      if (!t.rowCount) return res.status(404).json({ error: "table_not_found" });
      table = t.rows[0];
    } else {
      // upsert by name
      const t = await q(`
        INSERT INTO poker.poker_tables(name, stake_min)
        VALUES ($1, 20)
        ON CONFLICT (name) DO UPDATE SET stake_min = poker.poker_tables.stake_min
        RETURNING id, name, stake_min
      `, [name]);
      table = t.rows[0];
    }

    // ensure 9 seats exist
    await q(`
      INSERT INTO poker.poker_seats(table_id, seat_index)
      SELECT $1, i FROM generate_series(0,8) g(i)
      ON CONFLICT (table_id, seat_index) DO NOTHING
    `, [table.id]);

    const s = await q(`
      SELECT seat_index, player_name, stack_live, sat_out
      FROM poker.poker_seats
      WHERE table_id=$1
      ORDER BY seat_index
    `, [table.id]);

    return res.status(200).json({ table, seats: s.rows });
  } catch (e) {
    console.error("API /poker/table error:", e);
    return res.status(500).json({ error: "server_error", details: String(e?.message || e) });
  }
}
