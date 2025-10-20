// pages/api/poker/action.js
export const config = { runtime: "nodejs" };

// POST { hand_id, seat_index, action, amount }
// action in: 'fold'|'check'|'call'|'bet'|'raise'|'allin'
import { q } from "../../../lib/db";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { hand_id, seat_index, action, amount } = req.body || {};
  if (!hand_id || seat_index==null || !action) return res.status(400).json({ error:"bad_request" });
  try {
    await q(
      `INSERT INTO poker_actions (hand_id, seat_index, action, amount)
       VALUES ($1,$2,$3,$4)`,
      [hand_id, seat_index, action, Number(amount||0)]
    );
    res.json({ ok:true });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error:"server_error" });
  }
}
