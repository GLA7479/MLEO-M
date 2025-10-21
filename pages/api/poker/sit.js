// pages/api/poker/sit.js
export const config = { runtime: "nodejs" };
import { q } from "../../../lib/db";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { table_id, seat_index, player_name, buyin } = req.body || {};
  if (!table_id || seat_index == null || !player_name || !buyin) {
    return res.status(400).json({ error: "bad_request", details: "Missing table_id/seat_index/player_name/buyin" });
  }
  try {
    await q("BEGIN");

    // ודא שהמושב קיים (נוצר ב-/table), ואם לא — צור אותו.
    await q(`
      INSERT INTO poker.poker_seats (table_id, seat_index)
      VALUES ($1,$2)
      ON CONFLICT (table_id, seat_index) DO NOTHING
    `, [table_id, seat_index]);

    // שב רק אם המושב פנוי (player_name IS NULL)
    const up = await q(`
      UPDATE poker.poker_seats
      SET player_name=$3, stack=$4, stack_live=$4, sat_out=false
      WHERE table_id=$1 AND seat_index=$2 AND (player_name IS NULL OR player_name = '')
      RETURNING seat_index, player_name, stack_live, sat_out
    `, [table_id, seat_index, player_name, Number(buyin||0)]);

    await q("COMMIT");

    if (!up.rowCount) {
      return res.status(409).json({ error: "seat_taken" }); // המושב תפוס
    }
    res.json({ seat: up.rows[0] });
  } catch (e) {
    await q("ROLLBACK").catch(()=>{});
    console.error("API /poker/sit error:", e);
    res.status(500).json({ error: "server_error", details: String(e?.message || e) });
  }
}
