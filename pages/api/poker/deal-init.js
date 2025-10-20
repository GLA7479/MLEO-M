// pages/api/poker/deal-init.js
export const config = { runtime: "nodejs" };

// POST { table_id, hand_id }
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
    const seats = await q(
      `SELECT seat_index, player_name, stack
       FROM poker_seats WHERE table_id=$1 AND stack>0
       ORDER BY seat_index`, [table_id]
    );
    if (seats.rows.length<2) return res.status(400).json({ error:"need_2_players" });

    const deck = buildDeck();
    // חלק 2 קלפים לכל שחקן (סיבוב-סיבוב)
    const holeBySeat = {};
    for (let r=0;r<2;r++){
      for (const s of seats.rows){
        const c = deck.pop();
        (holeBySeat[s.seat_index] ||= []).push(c);
      }
    }

    // נקה snapshot קודם (אם קיים בטעות), ואז החדר שחקנים ליד הזו
    await q(`DELETE FROM poker_hand_players WHERE hand_id=$1`, [hand_id]);

    for (const s of seats.rows){
      const hole = holeBySeat[s.seat_index] || [];
      await q(
        `INSERT INTO poker_hand_players
         (hand_id, table_id, seat_index, player_name, player_id, hole_cards, stack_start, stack_live, folded, all_in, bet_street, acted_street)
         VALUES ($1,$2,$3,$4,NULL,$5,$6,$6,false,false,0,false)`,
        [hand_id, table_id, s.seat_index, s.player_name, hole, s.stack]
      );
    }

    // עדכן שלב ו"מחויבות" חפיסה בסיסית
    await q(`UPDATE poker_hands SET stage='preflop', pot_total=0 WHERE id=$1`, [hand_id]);

    res.json({ ok:true, players: Object.keys(holeBySeat).length });
  } catch(e){
    console.error(e);
    res.status(500).json({ error:"server_error" });
  }
}
