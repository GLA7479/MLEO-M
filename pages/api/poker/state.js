export const config = { runtime: "nodejs" };

import { q } from "../../../lib/db";

export default async function handler(req, res) {
  try {
    const { hand_id } = req.method === 'POST' ? (req.body || {}) : (req.query || {});
    
    // Log request for debugging
    console.log('REQ /api/poker/state:', { hand_id, method: req.method });
    
    if (!hand_id) {
      console.log('ERROR: Missing hand_id');
      return res.status(400).json({ error: "bad_request", details: "missing hand_id" });
    }

    // Return mock data for now
    console.log('Returning mock state for hand_id:', hand_id);
    
    const hand = {
      id: hand_id,
      table_id: "3461b4af-ce76-4ecf-bc82-8490c194e994",
      hand_no: 1,
      dealer_seat: 0,
      stage: "preflop",
      pot_total: 30,
      board: [],
      deck_remaining: [],
      current_turn: 0,
      turn_deadline: null,
      created_at: new Date().toISOString()
    };

    // Mock players data
    const players = {
      rows: [
        {
          seat_index: 0,
          player_name: "ERAN",
          hole_cards: ["As", "Kh"],
          stack_start: 1000,
          stack_live: 1000,
          folded: false,
          all_in: false,
          bet_street: 10,
          acted_street: false,
          in_hand: true
        },
        {
          seat_index: 1,
          player_name: "LIAM",
          hole_cards: ["Qd", "Jc"],
          stack_start: 1000,
          stack_live: 1000,
          folded: false,
          all_in: false,
          bet_street: 20,
          acted_street: false,
          in_hand: true
        }
      ]
    };

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

    // Mock actions
    const actions = { rows: [] };

    // Mock table data
    const table = {
      id: "3461b4af-ce76-4ecf-bc82-8490c194e994",
      name: "TEST",
      small_blind: 10,
      big_blind: 20,
      max_players: 9
    };

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