// pages/api/poker/state.js
export const config = { runtime: "nodejs" };
import { q } from "../../../lib/db";

export default async function handler(req, res) {
  try {
    // קבל מזהה יד + seat_token כדי להחזיר רק את הקלפים שלו
    const { hand_id, seat_token } =
      req.method === "POST" ? (req.body || {}) : (req.query || {});
    if (!hand_id) return res.status(400).json({ error:"bad_request", details:"missing hand_id" });

    const H = await q(`SELECT id, table_id, hand_no, stage, dealer_seat, sb_seat, bb_seat, current_turn, pot_total, board
                       FROM poker.poker_hands WHERE id=$1`, [hand_id]);
    if (!H.rowCount) return res.status(404).json({ error:"hand_not_found" });
    const hand = H.rows[0];

    const T = await q(`SELECT id, name, stake_min FROM poker.poker_tables WHERE id=$1`, [hand.table_id]);
    const table = T.rows[0];

    const players = await q(`
      SELECT seat_index, bet_street, folded, all_in, acted_street
      FROM poker.poker_hand_players
      WHERE hand_id=$1
      ORDER BY seat_index
    `,[hand_id]);

    const actions = await q(`
      SELECT seat_index, action, amount, created_at
      FROM poker.poker_actions
      WHERE hand_id=$1
      ORDER BY created_at ASC
    `,[hand_id]);

    const seats = await q(`
      SELECT seat_index, player_name, stack_live, sat_out
      FROM poker.poker_seats
      WHERE table_id=$1
      ORDER BY seat_index
    `,[hand.table_id]);

    // JSON של to_call
    const toCall = await q(`SELECT poker.poker_to_call_json($1) AS j`, [hand_id]);
    const to_call = toCall.rows[0].j || {};

    // 🟢 החזרת הקלפים של הצופה בלבד (seat_token)
    let my_seat_index = null;
    let my_hole = null;
    if (seat_token && String(seat_token).trim()) {
      const me = await q(
        `SELECT seat_index FROM poker.poker_seats WHERE table_id=$1 AND seat_token=$2`,
        [hand.table_id, String(seat_token).trim()]
      );
      if (me.rowCount) {
        my_seat_index = me.rows[0].seat_index;
        const hc = await q(
          `SELECT hole_cards FROM poker.poker_hand_players WHERE hand_id=$1 AND seat_index=$2`,
          [hand_id, my_seat_index]
        );
        if (hc.rowCount) my_hole = hc.rows[0].hole_cards || null;
      }
    }

    return res.status(200).json({
      hand,
      table,
      board: Array.isArray(hand.board) ? hand.board : [],
      players: players.rows,
      actions: actions.rows,
      seats: seats.rows,
      to_call,
      my_seat_index,
      my_hole                       // ← זה מה שהלקוח צריך כדי לצייר את הקלפים שלך
    });
  } catch (e) {
    console.error("API /poker/state error:", e);
    return res.status(500).json({ error:"server_error", details:String(e?.message||e) });
  }
}
