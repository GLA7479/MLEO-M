// pages/api/poker/tick.js
// Server-side watchdog: only auto_* when truly needed.
// If round settled or only one alive remains → do nothing (let action.js/advance-street handle it).

export const runtime = 'nodejs';

import { q } from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { hand_id } = req.body || {};
  if (!hand_id) return res.status(400).json({ error: 'bad_request', details: 'Missing hand_id' });

  try {
    await q('BEGIN');
    
    // Lock the hand
    const h = await q(
      `SELECT id, table_id, stage, current_turn, turn_deadline
       FROM poker.poker_hands
       WHERE id=$1 FOR UPDATE`,
      [hand_id]
    );
    const hand = h.rows[0];
    if (!hand) {
      await q('ROLLBACK');
      return res.json({ ok: true, nothing: 'hand_not_found' });
    }

    // If no turn or already ended or no deadline — nothing to do
    if (!hand.current_turn || hand.current_turn === null || !hand.turn_deadline || hand.stage === 'hand_end') {
      await q('ROLLBACK');
      return res.json({ ok: true, nothing: 'no_current_turn' });
    }

    // Deadline not passed?
    const t = await q(`SELECT now() > $1::timestamptz AS due`, [hand.turn_deadline]);
    if (t.rows[0].due !== true) {
      await q('ROLLBACK');
      return res.json({ ok: true, nothing: 'not_due' });
    }

    // Gather players for this hand
    const rows = await q(
      `SELECT php.seat_index, php.folded, php.all_in,
              COALESCE(php.bet_street,0)::bigint AS bet_street,
              COALESCE(ps.stack_live,0)::bigint AS stack_live
       FROM poker.poker_hand_players php
       JOIN poker.poker_seats ps
         ON ps.table_id=$1 AND ps.seat_index=php.seat_index
       WHERE php.hand_id=$2
       ORDER BY php.seat_index`,
      [hand.table_id, hand.id]
    );

    const alive = rows.rows.filter(r => r.folded === false);
    if (alive.length <= 1) {
      // let action.js handle paying; just mark no-op here
      await q('ROLLBACK');
      return res.json({ ok: true, nothing: 'single_alive' });
    }

    // Round settled? (no one pending)
    const maxBet = Math.max(...rows.rows.map(r => Number(r.bet_street || 0)));
    const pending = rows.rows
      .filter(r => r.folded === false)
      .some(r => Number(r.bet_street || 0) !== maxBet && Number(r.stack_live || 0) > 0);
    if (!pending) {
      // Avoid ghost auto_check
      await q(
        `UPDATE poker.poker_hands
            SET current_turn=NULL, turn_deadline=NULL
          WHERE id=$1`,
        [hand.id]
      );
      await q('COMMIT');
      return res.json({ ok: true, cleared: 'round_settled' });
    }

    // Otherwise, apply conservative auto_*
    const me = rows.rows.find(r => r.seat_index === hand.current_turn);
    if (!me || me.folded) {
      // move turn forward
      const next = computeNext(rows.rows, hand.current_turn);
      await q(
        `UPDATE poker.poker_hands
            SET current_turn=$2, turn_deadline = now() + interval '30 seconds'
          WHERE id=$1`,
        [hand.id, next]
      );
      await q('COMMIT');
      return res.json({ ok: true, moved: next });
    }

    if (Number(me.stack_live || 0) === 0 || me.all_in) {
      // cannot act — move on
      const next = computeNext(rows.rows, hand.current_turn);
      await q(
        `UPDATE poker.poker_hands
            SET current_turn=$2, turn_deadline = now() + interval '30 seconds'
          WHERE id=$1`,
        [hand.id, next]
      );
      await q('COMMIT');
      return res.json({ ok: true, skipped: 'all_in_or_no_chips', moved: next });
    }

    // If the player can safely check (their bet equals max), do auto_check; else auto_fold (very conservative)
    if (Number(me.bet_street || 0) === maxBet) {
      await q(
        `INSERT INTO poker.poker_actions (hand_id, seat_index, action, amount)
         VALUES ($1,$2,'auto_check',0)`,
        [hand.id, hand.current_turn]
      );
      const next = computeNext(rows.rows, hand.current_turn);
      await q(
        `UPDATE poker.poker_hands
            SET current_turn=$2, turn_deadline = now() + interval '30 seconds'
          WHERE id=$1`,
        [hand.id, next]
      );
      await q('COMMIT');
      return res.json({ ok: true, auto_check: true, moved: next });
    } else {
      await q(
        `INSERT INTO poker.poker_actions (hand_id, seat_index, action, amount)
         VALUES ($1,$2,'auto_fold',0)`,
        [hand.id, hand.current_turn]
      );
      await q(
        `UPDATE poker.poker_hand_players
            SET folded=true
          WHERE hand_id=$1 AND seat_index=$2`,
        [hand.id, hand.current_turn]
      );
      const next = computeNext(rows.rows, hand.current_turn);
      await q(
        `UPDATE poker.poker_hands
            SET current_turn=$2, turn_deadline = now() + interval '30 seconds'
          WHERE id=$1`,
        [hand.id, next]
      );
      await q('COMMIT');
      return res.json({ ok: true, auto_fold: true, moved: next });
    }
  } catch (e) {
    try { await q('ROLLBACK'); } catch {}
    return res.status(500).json({ error: 'server_error', detail: String(e) });
  }
}

function computeNext(rows, fromSeat) {
  const seats = rows
    .filter(r => r.folded === false && (r.all_in === false || Number(r.stack_live || 0) > 0))
    .map(r => r.seat_index)
    .sort((a, b) => a - b);
  if (!seats.length) return fromSeat;
  const after = seats.find(s => s > fromSeat);
  return typeof after === 'number' ? after : seats[0];
}
