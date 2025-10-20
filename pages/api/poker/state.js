export const config = { runtime: "nodejs" };

import { q } from "../../../lib/db";

export default async function handler(req, res) {
  try {
    const { hand_id } = req.query || {};
    if (!hand_id) return res.status(400).json({ error: "bad_request", details: "missing hand_id" });

    // Hand
    const h = await q(
      `SELECT id, table_id, hand_no, dealer_seat, stage, pot_total, board, deck_remaining, current_turn, turn_deadline, created_at
       FROM poker_hands WHERE id=$1`,
      [hand_id]
    );
    if (!h.rows.length) return res.status(404).json({ error: "hand_not_found" });
    const hand = h.rows[0];

    // Table (blinds/info)
    const t = await q(
      `SELECT id, name, small_blind, big_blind, max_players FROM poker_tables WHERE id=$1`,
      [hand.table_id]
    );
    const table = t.rows[0] || null;

    // Players snapshot for this hand
    const players = await q(
      `SELECT seat_index, player_name, hole_cards, stack_start, stack_live,
              folded, all_in, bet_street, acted_street
       FROM poker_hand_players
       WHERE hand_id=$1
       ORDER BY seat_index`,
      [hand_id]
    );

    // Calculate to_call for each player
    const maxBet = Math.max(0, ...players.rows
      .filter(p => !p.folded && !p.all_in)
      .map(p => Number(p.bet_street||0))
    );
    
    const toCallBySeat = {};
    players.rows.forEach(p => {
      const myBet = Number(p.bet_street||0);
      toCallBySeat[p.seat_index] = Math.max(0, maxBet - myBet);
    });

    // Actions log
    const actions = await q(
      `SELECT seat_index, action, amount, made_at
       FROM poker_actions
       WHERE hand_id=$1
       ORDER BY made_at ASC
       LIMIT 500`,
      [hand_id]
    );

    return res.status(200).json({
      hand, 
      table,
      board: Array.isArray(hand.board) ? hand.board : [],
      players: players.rows,
      actions: actions.rows,
      to_call: toCallBySeat
    });
  } catch (e) {
    console.error("API /poker/state error:", e);
    return res.status(500).json({ error: "server_error", details: String(e?.message || e) });
  }
}