export const config = { runtime: "nodejs" };

import { q } from "../../../lib/db";

function buildDeck(){
  const R = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
  const S = ["s","h","d","c"];
  const d=[]; for (const r of R) for (const s of S) d.push(r+s);
  for (let i=d.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [d[i],d[j]]=[d[j],d[i]]; }
  return d;
}

export default async function handler(req,res){
  if (req.method!=="POST") return res.status(405).end();
  const { table_id, hand_id } = req.body||{};
  if (!table_id || !hand_id) return res.status(400).json({ error:"bad_request" });

  try {
    const t = await q(`SELECT small_blind, big_blind FROM poker_tables WHERE id=$1`, [table_id]);
    if (!t.rows.length) return res.status(404).json({ error:"table_not_found" });
    const { small_blind: SB, big_blind: BB } = t.rows[0];

    const seats = await q(
      `SELECT seat_index, player_name, stack
       FROM poker_seats WHERE table_id=$1 AND stack>0
       ORDER BY seat_index`, [table_id]
    );
    if (seats.rows.length<2) return res.status(400).json({ error:"need_2_players" });

    const deck = buildDeck();

    // two cards to each (round-robin)
    const holeBySeat = {};
    for (let r=0;r<2;r++){
      for (const s of seats.rows){
        const c = deck.pop();
        (holeBySeat[s.seat_index] ||= []).push(c);
      }
    }

    // snapshot players for this hand
    await q(`DELETE FROM poker_hand_players WHERE hand_id=$1`, [hand_id]);
    for (const s of seats.rows){
      await q(
        `INSERT INTO poker_hand_players
         (hand_id, table_id, seat_index, player_name, player_id, hole_cards, stack_start, stack_live, folded, all_in, bet_street, acted_street)
         VALUES ($1,$2,$3,$4,NULL,$5::jsonb,$6,$6,false,false,0,false)`,
        [hand_id, table_id, s.seat_index, s.player_name, JSON.stringify(holeBySeat[s.seat_index]||[]), s.stack]
      );
    }

    // sb/bb relative to dealer
    const dealer = Number((await q(`SELECT dealer_seat FROM poker_hands WHERE id=$1`, [hand_id])).rows[0].dealer_seat);
    const order = seats.rows.map(s=>s.seat_index).sort((a,b)=>a-b);
    const leftOf = (x) => {
      const idx = order.findIndex(s => s > x);
      return (idx >= 0 ? order[idx] : order[0]);
    };
    const sbSeat = leftOf(dealer);
    const bbSeat = leftOf(sbSeat);

    // post blinds into snapshot + actions
    await q(`UPDATE poker_hand_players
             SET bet_street = CASE seat_index WHEN $2 THEN $4 WHEN $3 THEN $5 ELSE 0 END,
                 stack_live = stack_live - CASE seat_index WHEN $2 THEN $4 WHEN $3 THEN $5 ELSE 0 END
             WHERE hand_id=$1`,
          [hand_id, sbSeat, bbSeat, SB, BB]);
    await q(`INSERT INTO poker_actions (hand_id, seat_index, action, amount) VALUES
             ($1,$2,'post_sb',$4), ($1,$3,'post_bb',$5)`,
          [hand_id, sbSeat, bbSeat, SB, BB]);

    // first to act (UTG): after BB
    const afterBB = leftOf(bbSeat);
    const deadline = new Date(Date.now() + 30_000);

    await q(
      `UPDATE poker_hands
         SET stage='preflop',
             deck_remaining=$2::jsonb,
             board=$3::jsonb,
             current_turn=$4,
             turn_deadline=$5
       WHERE id=$1`,
      [hand_id, JSON.stringify(deck), JSON.stringify([]), afterBB, deadline]
    );

    res.json({ ok:true, players: seats.rows.length, current_turn: afterBB, to_call: BB });
  } catch(e){
    console.error("API /poker/deal-init error:", e);
    res.status(500).json({ error:"server_error", details: String(e.message||e) });
  }
}