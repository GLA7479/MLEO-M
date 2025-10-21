// pages/api/poker/action.js
export const config = { runtime: "nodejs" };
import { q } from "../../../lib/db";

function ensureNum(x){ return Math.max(0, Number(x || 0)); }

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  let { hand_id, seat_index, action, amount, raise_to, action_id } = req.body || {};
  if (!hand_id || seat_index == null || !action) {
    return res.status(400).json({ error:"bad_request", details:"Missing hand_id/seat_index/action" });
  }
  seat_index = Number(seat_index);
  amount = ensureNum(amount);
  raise_to = ensureNum(raise_to);

  try {
    await q("BEGIN");

    // Idempotency check - if action_id already exists, return success without re-executing
    if (action_id) {
      const existing = await q(`SELECT id FROM poker.poker_actions WHERE action_id=$1`, [action_id]);
      if (existing.rowCount > 0) {
        await q("ROLLBACK");
        console.log(`Idempotent action detected: ${action_id}, skipping duplicate`);
        return res.json({ ok: true, idempotent: true, message: "Action already processed" });
      }
    }

    const H = await q(`SELECT id, table_id, stage, current_turn FROM poker.poker_hands WHERE id=$1 FOR UPDATE`, [hand_id]);
    if (!H.rowCount) { await q("ROLLBACK"); return res.status(404).json({ error:"hand_not_found" }); }
    const hand = H.rows[0];

    if (hand.current_turn !== seat_index) { await q("ROLLBACK"); return res.status(400).json({ error:"not_your_turn" }); }

    const P = await q(`SELECT seat_index, bet_street, folded, all_in, acted_street
                       FROM poker.poker_hand_players WHERE hand_id=$1 AND seat_index=$2 FOR UPDATE`,
                       [hand_id, seat_index]);
    if (!P.rowCount) { await q("ROLLBACK"); return res.status(400).json({ error:"player_not_in_hand" }); }
    const me = P.rows[0];

    const S = await q(`SELECT stack_live FROM poker.poker_seats WHERE table_id=$1 AND seat_index=$2 FOR UPDATE`,
                       [hand.table_id, seat_index]);
    const myStack = Number(S.rows[0].stack_live || 0);

    // helpers
    const maxBetRow = await q(`SELECT MAX(bet_street) AS mb FROM poker.poker_hand_players WHERE hand_id=$1`, [hand_id]);
    const maxBet = Number(maxBetRow.rows[0].mb || 0);
    const toCall = Math.max(0, maxBet - Number(me.bet_street||0));

    async function pay(amt){
      const can = Math.min(amt, Math.max(0, (await (async()=> {
        const s = await q(`SELECT stack_live FROM poker.poker_seats WHERE table_id=$1 AND seat_index=$2`, [hand.table_id, seat_index]);
        return Number(s.rows[0].stack_live||0);
      })())));
      await q(`UPDATE poker.poker_seats SET stack_live = stack_live - $3 WHERE table_id=$1 AND seat_index=$2`, [hand.table_id, seat_index, can]);
      await q(`UPDATE poker.poker_hand_players SET bet_street = bet_street + $2 WHERE hand_id=$1 AND seat_index=$3`, [hand_id, can, seat_index]);
      return can;
    }

    const act = action.toLowerCase();

    if (act === "fold") {
      await q(`UPDATE poker.poker_hand_players SET folded=true, acted_street=true WHERE hand_id=$1 AND seat_index=$2`, [hand_id, seat_index]);
      await q(`INSERT INTO poker.poker_actions(hand_id, seat_index, action, amount, action_id) VALUES ($1,$2,'fold',0,$3)`, [hand_id, seat_index, action_id || null]);
    } else if (act === "check") {
      if (toCall !== 0) { await q("ROLLBACK"); return res.status(400).json({ error:"cannot_check" }); }
      await q(`UPDATE poker.poker_hand_players SET acted_street=true WHERE hand_id=$1 AND seat_index=$2`, [hand_id, seat_index]);
      await q(`INSERT INTO poker.poker_actions(hand_id, seat_index, action, amount, action_id) VALUES ($1,$2,'check',0,$3)`, [hand_id, seat_index, action_id || null]);
    } else if (act === "call") {
      const paid = await pay(toCall);
      await q(`UPDATE poker.poker_hand_players SET acted_street=true WHERE hand_id=$1 AND seat_index=$2`, [hand_id, seat_index]);
      await q(`INSERT INTO poker.poker_actions(hand_id, seat_index, action, amount, action_id) VALUES ($1,$2,'call',$3,$4)`,
              [hand_id, seat_index, paid, action_id || null]);
    } else if (act === "bet" || act === "raise" || act === "allin") {
      // מינימום: אם maxBet==0 → מינימום BB; אחרת דלתת ההעלאה האחרונה (אפשר להחמיר בשלב הבא)
      const minRaise = (maxBet === 0 ? (await q(`SELECT stake_min FROM poker.poker_tables WHERE id=$1`, [hand.table_id])).rows[0].stake_min : 1);
      let add = act === "allin" ? myStack : (raise_to ? Math.max(0, raise_to - Number(me.bet_street||0)) : amount);
      add = Math.max(add, 0);
      if (maxBet === 0 && act === "bet" && add < minRaise) { await q("ROLLBACK"); return res.status(400).json({ error:"min_bet", min: minRaise }); }
      if (maxBet > 0 && act !== "allin" && add < Math.max(minRaise, toCall+1)) {
        // raise must exceed call (פשטני כרגע; נשפר "delta last raise" בהמשך)
        await q("ROLLBACK"); return res.status(400).json({ error:"min_raise" });
      }
      const paid = await pay(toCall + add);
      await q(`UPDATE poker.poker_hand_players SET acted_street=true, all_in = (SELECT stack_live=0 FROM poker.poker_seats WHERE table_id=$1 AND seat_index=$2)
               WHERE hand_id=$3 AND seat_index=$2`, [hand.table_id, seat_index, hand_id]);
      await q(`INSERT INTO poker.poker_actions(hand_id, seat_index, action, amount, action_id) VALUES ($1,$2,$3,$4,$5)`,
              [hand_id, seat_index, act, paid, action_id || null]);
    } else {
      await q("ROLLBACK"); return res.status(400).json({ error:"bad_action" });
    }

    // advance turn (next non-folded, non-all-in with chips OR allow check)
    const next = await q(`
      WITH alive AS (
        SELECT php.seat_index, ps.stack_live, php.folded, php.all_in
        FROM poker.poker_hand_players php
        JOIN poker.poker_seats ps ON ps.table_id=$1 AND ps.seat_index=php.seat_index
        WHERE php.hand_id=$2
      )
      SELECT seat_index FROM alive
      WHERE folded=false AND (all_in=false OR stack_live>0)
      ORDER BY seat_index
    `, [hand.table_id, hand_id]);

    const order = next.rows.map(r=>r.seat_index);
    let nextSeat = null;
    if (order.length) {
      const i = order.findIndex(s => s > seat_index);
      nextSeat = (i>=0 ? order[i] : order[0]);
    }

    await q(`UPDATE poker.poker_hands SET current_turn = COALESCE($2, current_turn), turn_deadline = now() + interval '30 seconds' WHERE id=$1`, [hand_id, nextSeat]);

    await q("COMMIT");

    // החזר מצב עדכני
    const S2 = await q(`SELECT poker.poker_to_call_json($1) AS j`, [hand_id]);
    return res.json({ ok:true, to_call: S2.rows[0].j || {} });
  } catch (e) {
    await q("ROLLBACK").catch(()=>{});
    console.error("API /poker/action error:", e);
    res.status(500).json({ error:"server_error", details:String(e.message||e) });
  }
}
