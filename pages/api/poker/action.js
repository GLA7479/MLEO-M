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

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  
  let { hand_id, seat_index, action, amount, raise_to } = req.body || {};
  if (!hand_id || seat_index==null || !action) return res.status(400).json({ error:"bad_request" });

  try {
    // Normalize bet/raise to raise_to
    if (action === 'bet' || action === 'raise') {
      action = 'raise_to';
      amount = Number(raise_to ?? amount);
    }

    // Check if it's player's turn
    const h = await q(`SELECT current_turn, stage FROM poker_hands WHERE id=$1`, [hand_id]);
    if (!h.rows.length) return res.status(404).json({ error:"hand_not_found" });
    const { current_turn, stage } = h.rows[0];
    if (current_turn !== seat_index) return res.status(409).json({ error:"not_your_turn" });

    // Get table info
    const t = await q(`SELECT small_blind, big_blind FROM poker_tables WHERE id=(SELECT table_id FROM poker_hands WHERE id=$1)`, [hand_id]);
    const { small_blind: SB, big_blind: BB } = t.rows[0];

    // Get player info
    const p = await q(`SELECT stack_live, bet_street, folded, all_in FROM poker_hand_players WHERE hand_id=$1 AND seat_index=$2`, [hand_id, seat_index]);
    if (!p.rows.length) return res.status(404).json({ error:"player_not_found" });
    if (p.rows[0].folded || p.rows[0].all_in) return res.status(409).json({ error:"inactive_player" });

    // Calculate to_call
    const others = await q(`SELECT bet_street FROM poker_hand_players WHERE hand_id=$1 AND folded=false AND all_in=false`, [hand_id]);
    const maxBet = Math.max(0, ...others.rows.map(r=>Number(r.bet_street||0)));
    const myBet = Number(p.rows[0].bet_street||0);
    const toCall = Math.max(0, maxBet - myBet);
    const stack = Number(p.rows[0].stack_live||0);

    let used = 0;
    let setFold=false, setAllin=false, addBet=0;

    if (action==='fold'){
      setFold=true;
    } else if (action==='check'){
      if (toCall>0) return res.status(400).json({ error:"illegal_check", toCall });
    } else if (action==='call'){
      used = Math.min(toCall, stack);
      if (used < toCall && used===stack) setAllin=true;
      addBet = used;
    } else if (action==='raise_to' || action==='allin'){
      let want = Number(amount||0);
      if (action==='allin') want = stack;
      if (want<=0) return res.status(400).json({ error:"bad_amount" });

      if (maxBet===0 && want < BB) {
        return res.status(400).json({ error:"min_bet_bb", min: BB });
      }
      if (maxBet>0){
        const minRaise = Math.max(BB, maxBet - myBet);
        if (want < minRaise) return res.status(400).json({ error:"min_raise", min: minRaise });
      }
      if (want > stack) { want = stack; }
      addBet = toCall + want;
      used = Math.min(addBet, stack);
      if (used===stack) setAllin=true;
    } else {
      return res.status(400).json({ error:"unknown_action" });
    }

    // Record action
    await q(`INSERT INTO poker_actions (hand_id, seat_index, action, amount) VALUES ($1,$2,$3,$4)`,
            [hand_id, seat_index, action, Math.floor(used)]);

    if (setFold){
      await q(`UPDATE poker_hand_players SET folded=true, acted_street=true WHERE hand_id=$1 AND seat_index=$2`, [hand_id, seat_index]);
    } else {
      await q(
        `UPDATE poker_hand_players
           SET bet_street = bet_street + $3,
               stack_live = stack_live - $3,
               all_in = CASE WHEN $4 THEN true ELSE all_in END,
               acted_street = true
         WHERE hand_id=$1 AND seat_index=$2`,
        [hand_id, seat_index, Math.floor(used), setAllin]
      );
    }

    // Reset acted_street for other players on raise
    if (action === 'raise_to' || action === 'allin') {
      await q(
        `UPDATE poker_hand_players
         SET acted_street = false
         WHERE hand_id=$1 AND seat_index<>$2
           AND folded=false AND all_in=false`,
        [hand_id, seat_index]
      );
    }

    // Next player + deadline
    const next = await nextActiveSeatAfter(hand_id, seat_index);
    const ddl = next ? new Date(Date.now()+30_000) : null;
    await q(`UPDATE poker_hands SET current_turn=$2, turn_deadline=$3 WHERE id=$1`, [hand_id, next, ddl]);

    res.json({ ok:true, next: next, deadline: ddl, toCallNext: Math.max(0, (maxBet) - 0) });
  } catch(e){
    console.error("API /poker/action error:", e);
    res.status(500).json({ error:"server_error", details:String(e.message||e) });
  }
}