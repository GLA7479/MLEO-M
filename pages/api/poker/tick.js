// pages/api/poker/tick.js
export const config = { runtime: "nodejs" };
import { q } from "../../../lib/db";

export default async function handler(req,res){
  if (req.method!=='POST') return res.status(405).end();
  const { hand_id } = req.body || {};
  if (!hand_id) return res.status(400).json({ error:"bad_request", details:"Missing hand_id" });

  try {
    await q("BEGIN");
    const H = await q(`SELECT id, table_id, current_turn, turn_deadline FROM poker.poker_hands WHERE id=$1 FOR UPDATE`, [hand_id]);
    if (!H.rowCount) { await q("ROLLBACK"); return res.status(404).json({ error:"hand_not_found" }); }
    const hand = H.rows[0];

    const tooLate = await q(`SELECT now() > $1 AS late`, [hand.turn_deadline]);
    if (!tooLate.rows[0].late) {
      await q("ROLLBACK");
      return res.json({ ok:true, no_turn:true });
    }

    const me = await q(`SELECT seat_index, bet_street, folded, all_in, acted_street
                        FROM poker.poker_hand_players WHERE hand_id=$1 AND seat_index=$2 FOR UPDATE`,
                        [hand_id, hand.current_turn]);
    if (!me.rowCount) { await q("ROLLBACK"); return res.json({ ok:true, no_turn:true }); }
    const P = me.rows[0];

    const maxBetRow = await q(`SELECT MAX(bet_street) AS mb FROM poker.poker_hand_players WHERE hand_id=$1`, [hand_id]);
    const toCall = Math.max(0, Number(maxBetRow.rows[0].mb||0) - Number(P.bet_street||0));

    if (toCall === 0) {
      // auto-check
      await q(`UPDATE poker.poker_hand_players SET acted_street=true WHERE hand_id=$1 AND seat_index=$2`, [hand_id, hand.current_turn]);
      await q(`INSERT INTO poker.poker_actions(hand_id, seat_index, action, amount) VALUES ($1,$2,'auto_check',0)`, [hand_id, hand.current_turn]);
    } else {
      // auto-fold
      await q(`UPDATE poker.poker_hand_players SET folded=true, acted_street=true WHERE hand_id=$1 AND seat_index=$2`, [hand_id, hand.current_turn]);
      await q(`INSERT INTO poker.poker_actions(hand_id, seat_index, action, amount) VALUES ($1,$2,'auto_fold',0)`, [hand_id, hand.current_turn]);
    }

    // next seat
    const alive = await q(`
      SELECT php.seat_index
      FROM poker.poker_hand_players php
      JOIN poker.poker_seats ps ON ps.table_id=$1 AND ps.seat_index=php.seat_index
      WHERE php.hand_id=$2 AND php.folded=false
      ORDER BY php.seat_index
    `, [hand.table_id, hand_id]);
    const order = alive.rows.map(r=>r.seat_index);
    const i = order.findIndex(s=>s>hand.current_turn);
    const nextSeat = (i>=0 ? order[i] : order[0]) ?? hand.current_turn;

    await q(`UPDATE poker.poker_hands SET current_turn=$2, turn_deadline=now()+interval '30 seconds' WHERE id=$1`, [hand_id, nextSeat]);
    await q("COMMIT");
    return res.json({ ok:true, current_turn: nextSeat });
  } catch(e){
    await q("ROLLBACK").catch(()=>{});
    console.error("API /poker/tick error:", e);
    res.status(500).json({ error:"server_error", details:String(e.message||e) });
  }
}
