export const config = { runtime: "nodejs" };

import { q } from "../../../lib/db";

async function nextActiveSeatAfter(hand_id, fromSeat) {
  const r = await q(`
    SELECT seat_index
    FROM poker_hand_players
    WHERE hand_id=$1 AND folded=false AND all_in=false AND stack_live>0
    ORDER BY seat_index
  `, [hand_id]);
  const order = r.rows.map(x=>x.seat_index);
  if (!order.length) return null;
  const idx = order.findIndex(s => s > fromSeat);
  return (idx >= 0 ? order[idx] : order[0]) ?? null;
}

export default async function handler(req,res){
  const { hand_id } = req.query || {};
  if (!hand_id) return res.status(400).json({ error:"bad_request" });

  try {
    const h = await q(`SELECT current_turn, turn_deadline FROM poker_hands WHERE id=$1`, [hand_id]);
    if (!h.rows.length) return res.status(404).json({ error:"hand_not_found" });

    const { current_turn, turn_deadline } = h.rows[0];
    if (current_turn==null || !turn_deadline) return res.json({ ok:true, no_turn:true });

    if (Date.now() > new Date(turn_deadline).getTime()) {
      // פולד לשחקן שמאחר
      await q(`INSERT INTO poker_actions (hand_id, seat_index, action, amount) VALUES ($1,$2,'fold',0)`, [hand_id, current_turn]);
      await q(`UPDATE poker_hand_players SET folded=true, acted_street=true WHERE hand_id=$1 AND seat_index=$2`, [hand_id, current_turn]);

      const next = await nextActiveSeatAfter(hand_id, current_turn);
      const ddl  = next ? new Date(Date.now()+30_000) : null;
      await q(`UPDATE poker_hands SET current_turn=$2, turn_deadline=$3 WHERE id=$1`, [hand_id, next, ddl]);
      return res.json({ ok:true, folded: current_turn, next });
    }
    return res.json({ ok:true, waiting: current_turn });
  } catch(e){
    console.error("API /poker/tick error:", e);
    res.status(500).json({ error:"server_error", details: String(e.message||e) });
  }
}