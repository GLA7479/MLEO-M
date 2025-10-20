// pages/api/poker/start-hand.js
export const config = { runtime: "nodejs" };

// POST { table_id }
// returns { hand_id, hand_no, dealer_seat, sb_seat, bb_seat, sb, bb }
import { q } from "../../../lib/db";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { table_id } = req.body || {};
  
  // Log request for debugging
  console.log('REQ /api/poker/start-hand:', { table_id });
  
  if (!table_id) {
    console.log('ERROR: Missing table_id');
    return res.status(400).json({ error:"bad_request", details: "Missing table_id" });
  }
  try {
    const t = await q(`SELECT small_blind, big_blind FROM poker_tables WHERE id=$1`, [table_id]);
    if (!t.rows.length) return res.status(404).json({ error:"table_not_found" });
    const { small_blind: sb, big_blind: bb } = t.rows[0];

    const seats = await q(`SELECT seat_index, stack FROM poker_seats WHERE table_id=$1 AND stack>0 ORDER BY seat_index`, [table_id]);
    if (seats.rows.length < 2) return res.status(400).json({ error:"need_2_players" });

    const dealer_seat = seats.rows[0].seat_index;
    const sb_seat = seats.rows[1].seat_index;
    const bb_seat = seats.rows[2]?.seat_index ?? seats.rows[0].seat_index; // אם רק 2 שחקנים, BB יהיה הדילר

    const hand = await q(
      `WITH last_no AS (
         SELECT COALESCE(MAX(hand_no),0) hn FROM poker_hands WHERE table_id=$1
       ),
       ins AS (
         INSERT INTO poker_hands (id, table_id, hand_no, dealer_seat, stage, pot_total)
         SELECT gen_random_uuid(), $1, (SELECT hn+1 FROM last_no), $2, 'preflop', 0
         RETURNING id, hand_no
       )
       SELECT id, hand_no FROM ins`,
      [table_id, dealer_seat]
    );
    const hand_id = hand.rows[0].id, hand_no = hand.rows[0].hand_no;

    // Log blinds
    await q(`INSERT INTO poker_actions (hand_id, seat_index, action, amount) VALUES ($1,$2,'post_sb',$3)`, [hand_id, sb_seat, sb]);
    await q(`INSERT INTO poker_actions (hand_id, seat_index, action, amount) VALUES ($1,$2,'post_bb',$3)`, [hand_id, bb_seat, bb]);

    res.json({ hand_id, hand_no, dealer_seat, sb_seat, bb_seat, sb, bb });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error:"server_error" });
  }
}
