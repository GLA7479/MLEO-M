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
  const { table_id, force_new: forceNewRaw } = req.body || {};
  const force_new = !!forceNewRaw;
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
      const a = active.rows[0];
      if (force_new) {
        // Close existing hand and continue to create a new one
        await q(`UPDATE poker.poker_hands SET stage='hand_end', ended_at=now() WHERE id=$1`, [a.id]);
      } else {
        await q("COMMIT");
        console.log(`Hand ${a.id} already active, returning it`);
        return res.status(200).json({ 
          hand_id: a.id, 
          hand_no: a.hand_no,
          dealer_seat: a.dealer_seat,
          sb_seat: a.sb_seat,
          bb_seat: a.bb_seat,
          reused: true 
        });
      }
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

    // Get next hand number atomically and robustly (never collide with existing MAX)
    const nh = await q(`
      WITH mx AS (
        SELECT COALESCE(MAX(hand_no) + 1, 1)::bigint AS want
        FROM poker.poker_hands
        WHERE table_id = $1
      )
      , upd AS (
        UPDATE poker.poker_tables t
        SET next_hand_no = GREATEST(t.next_hand_no, (SELECT want FROM mx)) + 1
        WHERE t.id = $1
        RETURNING next_hand_no - 1 AS hand_no
      )
      SELECT hand_no FROM upd
    `, [table_id]);
    const hand_no = Number(nh.rows[0].hand_no || 1);

    // Determine dealer, SB, BB (robust ring logic)
    const last = await q(`SELECT dealer_seat FROM poker.poker_hands WHERE table_id=$1 ORDER BY started_at DESC LIMIT 1`, [table_id]);
    const lastDealer = last.rowCount ? last.rows[0].dealer_seat : -1;
    const order = seated.rows.map(r=>r.seat_index);
    // Ring index of next dealer
    const dealerIdx = (lastDealer>=0 && order.includes(lastDealer))
      ? (order.indexOf(lastDealer) + 1) % order.length
      : 0;
    const nextDealer = order[dealerIdx];

    const sbSeat = order[(dealerIdx + 1) % order.length];
    const bbSeat = order[(dealerIdx + 2) % order.length];

    // Get stake
    const t = await q(`SELECT stake_min FROM poker.poker_tables WHERE id=$1`, [table_id]);
    const bb = Number(t.rows[0].stake_min || 20);
    const sb = Math.max(10, Math.floor(bb/2));

    // Create deck and deal hole cards
    const deck = shuffledDeck();
    const holes = {};
    for (const s of order) { holes[s] = [deck.pop(), deck.pop()]; }

    // Determine UTG (first to act after BB in preflop)
    // For 2 players (heads-up): UTG is SB (dealer acts first preflop)
    let utgSeat;
    if (order.length >= 3) {
      utgSeat = order[(dealerIdx + 3) % order.length];
    } else {
      utgSeat = order[(dealerIdx + 1) % order.length];
    }
    if (utgSeat === undefined || utgSeat === null) utgSeat = sbSeat ?? order[0];

    // Insert hand - set current_turn to UTG
    const hid = await q(`
      INSERT INTO poker.poker_hands(table_id, hand_no, stage, dealer_seat, sb_seat, bb_seat, current_turn, pot_total, board, deck_remaining, turn_deadline)
      VALUES ($1,$2,'preflop',$3,$4,$5,$6,0,'{}',$7, now() + interval '30 seconds')
      RETURNING id, dealer_seat, sb_seat, bb_seat
    `,[table_id, hand_no, nextDealer, sbSeat, bbSeat, utgSeat, deck]);
    const hand_id = hid.rows[0].id;
    
    console.log(`Hand ${hand_id}: Dealer=${nextDealer}, SB=${sbSeat}, BB=${bbSeat}, UTG=${utgSeat}`);

    // Create hand players (SB/BB have NOT acted yet - they only posted blinds)
    for (const s of order) {
      await q(`INSERT INTO poker.poker_hand_players(hand_id, seat_index, bet_street, folded, all_in, acted_street, hole_cards)
               VALUES ($1,$2,0,false,false,false,$3)`, [hand_id, s, holes[s]]);
    }
    
    // Mark that this is preflop - SB/BB have NOT made a decision yet (only posted blinds)
    
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
