// pages/api/poker/start-hand.js
export const config = { runtime: "nodejs" };
import { q } from "../../../lib/db";

const RANKS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
const SUITS = ["s","h","d","c"];
function shuffledDeck(){
  const d=[]; for(const r of RANKS) for(const s of SUITS) d.push(r+s);
  for(let i=d.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1)); [d[i],d[j]]=[d[j],d[i]];}
  return d;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { table_id } = req.body || {};
  if (!table_id) return res.status(400).json({ error: "bad_request", details: "Missing table_id" });

  try {
    // BEGIN
    await q("BEGIN");

    // Lock table to prevent race conditions on multiple Start clicks
    // Use hashtextextended to convert table_id to bigint safely
    await q(`SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))`, [table_id]);

    // Check if there's already an active hand for this table
    const active = await q(`
      SELECT id, hand_no, dealer_seat, sb_seat, bb_seat 
      FROM poker.poker_hands
      WHERE table_id=$1 AND ended_at IS NULL AND stage <> 'hand_end'
      ORDER BY started_at DESC LIMIT 1
    `, [table_id]);

    if (active.rowCount) {
      await q("COMMIT");
      console.log(`Hand ${active.rows[0].id} already active, returning it`);
      return res.status(200).json({ 
        hand_id: active.rows[0].id, 
        hand_no: active.rows[0].hand_no,
        dealer_seat: active.rows[0].dealer_seat,
        sb_seat: active.rows[0].sb_seat,
        bb_seat: active.rows[0].bb_seat,
        reused: true 
      });
    }

    // Check for seated players with chips
    const seated = await q(`
      SELECT seat_index, player_name, stack_live
      FROM poker.poker_seats
      WHERE table_id=$1 AND player_name IS NOT NULL AND stack_live > 0
      ORDER BY seat_index
    `,[table_id]);
    
    if (seated.rowCount < 2) {
      await q("ROLLBACK");
      return res.status(400).json({ error:"need_two_players" });
    }

    // Get next hand number atomically
    const nh = await q(`
      UPDATE poker.poker_tables
      SET next_hand_no = next_hand_no + 1
      WHERE id=$1
      RETURNING next_hand_no - 1 AS hand_no
    `, [table_id]);
    const hand_no = Number(nh.rows[0].hand_no);

    // Determine dealer, SB, BB
    const last = await q(`SELECT dealer_seat FROM poker.poker_hands WHERE table_id=$1 ORDER BY started_at DESC LIMIT 1`, [table_id]);
    const lastDealer = last.rowCount ? last.rows[0].dealer_seat : -1;
    const order = seated.rows.map(r=>r.seat_index);
    const nextDealer = order[(order.findIndex(x=>x>lastDealer)+1 + (lastDealer<0?0:0)) % order.length] ?? order[0];

    const idxD = order.indexOf(nextDealer);
    const sbSeat = order[(idxD+1) % order.length];
    const bbSeat = order[(idxD+2) % order.length];

    // Get stake
    const t = await q(`SELECT stake_min FROM poker.poker_tables WHERE id=$1`, [table_id]);
    const bb = Number(t.rows[0].stake_min || 20);
    const sb = Math.max(10, Math.floor(bb/2));

    // Create deck and deal hole cards
    const deck = shuffledDeck();
    const holes = {};
    for (const s of order) { holes[s] = [deck.pop(), deck.pop()]; }

    // Insert hand
    const hid = await q(`
      INSERT INTO poker.poker_hands(table_id, hand_no, stage, dealer_seat, sb_seat, bb_seat, current_turn, pot_total, board, deck_remaining, turn_deadline)
      VALUES ($1,$2,'preflop',$3,$4,$5,$6,0,'{}',$7, now() + interval '30 seconds')
      RETURNING id, dealer_seat, sb_seat, bb_seat
    `,[table_id, hand_no, nextDealer, sbSeat, bbSeat, (bbSeat+1)%9, deck]);
    const hand_id = hid.rows[0].id;

    // Create hand players
    for (const s of order) {
      await q(`INSERT INTO poker.poker_hand_players(hand_id, seat_index, bet_street, folded, all_in, acted_street, hole_cards)
               VALUES ($1,$2,0,false,false,false,$3)`, [hand_id, s, holes[s]]);
    }
    
    // Post blinds
    async function postBlind(seatIndex, amount){
      await q(`UPDATE poker.poker_seats SET stack_live = GREATEST(0, stack_live - $3) WHERE table_id=$1 AND seat_index=$2`, [table_id, seatIndex, amount]);
      await q(`UPDATE poker.poker_hand_players SET bet_street = bet_street + $3 WHERE hand_id=$1 AND seat_index=$2`, [hand_id, seatIndex, amount]);
    }
    await postBlind(sbSeat, sb);
    await postBlind(bbSeat, bb);

    await q("COMMIT");
    console.log(`Created hand ${hand_id} #${hand_no} for table ${table_id}`);
    return res.json({ hand_id, hand_no, dealer_seat: nextDealer, sb_seat: sbSeat, bb_seat: bbSeat, sb, bb });
  } catch (e) {
    await q("ROLLBACK").catch(()=>{});
    console.error("start-hand error:", e);
    res.status(500).json({ error:"server_error", details: String(e.message||e) });
  }
}
