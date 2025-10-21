// pages/api/poker/action.js
// Handles a single player action. Prevents ghost auto_* by clearing turn/deadline
// when a betting round is settled or when only one player remains.

export const runtime = 'nodejs';

import { q } from '../../../lib/db'; // adjust if your q() is elsewhere

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const { hand_id, seat_index, action, amount = 0 } = req.body || {};
  if (!hand_id || typeof seat_index !== 'number' || !action) {
    return res.status(400).json({ error: 'bad_request' });
  }

  try {
    await q('BEGIN');

    // Load hand & table
    const h = await q(
      `SELECT id, table_id, stage, current_turn, turn_deadline, dealer_seat
       FROM poker.poker_hands WHERE id=$1 FOR UPDATE`,
      [hand_id]
    );
    const hand = h.rows[0];
    if (!hand) {
      await q('ROLLBACK');
      return res.status(404).json({ error: 'hand_not_found' });
    }

    // Must be player's turn
    if (hand.current_turn !== seat_index) {
      await q('ROLLBACK');
      return res.status(409).json({ error: 'not_your_turn' });
    }

    // --- Validate action before applying ---
    const mbRow = await q(
      `SELECT COALESCE(MAX(bet_street),0)::bigint AS mb
       FROM poker.poker_hand_players WHERE hand_id=$1`,
      [hand_id]
    );
    const maxBetBefore = Number(mbRow.rows[0].mb || 0);
    const myBetBeforeRow = await q(
      `SELECT COALESCE(bet_street,0)::bigint AS bs
       FROM poker.poker_hand_players
       WHERE hand_id=$1 AND seat_index=$2`,
      [hand_id, seat_index]
    );
    const myBetBefore = Number(myBetBeforeRow.rows[0]?.bs || 0);
    const needToCall = Math.max(0, maxBetBefore - myBetBefore);

    // אסור Check מול הימור פתוח
    if (action === 'check' && needToCall > 0) {
      await q('ROLLBACK');
      return res.status(400).json({ error: 'cannot_check_facing_bet', toCall: needToCall });
    }

    // "bet" כשיש הימור פתוח נחשב "raise"
    let normalizedAction = action;
    if (action === 'bet' && maxBetBefore > 0) {
      normalizedAction = 'raise';
    }

    // Insert action
    await q(
      `INSERT INTO poker.poker_actions (hand_id, seat_index, action, amount)
       VALUES ($1,$2,$3,$4)`,
      [hand_id, seat_index, normalizedAction, Number(amount) || 0]
    );

    // Update per-action state (fold/check/call/raise/allin)
    await applyAction(hand, seat_index, normalizedAction, Number(amount) || 0);

    // ==== A) Close immediately if only 1 player alive ====
    const aliveRows = await q(
      `SELECT php.seat_index, php.folded, php.all_in,
              COALESCE(php.bet_street,0)::bigint AS bet_street,
              COALESCE(ps.stack_live,0)::bigint AS stack_live
       FROM poker.poker_hand_players php
       JOIN poker.poker_seats ps
         ON ps.table_id=$1 AND ps.seat_index=php.seat_index
       WHERE php.hand_id=$2
       ORDER BY php.seat_index`,
      [hand.table_id, hand_id]
    );

    const alive = aliveRows.rows.filter(r => r.folded === false);
    if (alive.length <= 1) {
      // Move street bets to pot
      const streetSum = aliveRows.rows.reduce((a, r) => a + Number(r.bet_street || 0), 0);
      if (streetSum > 0) {
        await q(
          `UPDATE poker.poker_hand_players
             SET contrib_total = contrib_total + bet_street,
                 bet_street    = 0
           WHERE hand_id = $1`,
          [hand_id]
        );
        await q(
          `UPDATE poker.poker_hands
             SET pot_total = pot_total + $2
           WHERE id = $1`,
          [hand_id, streetSum]
        );
      }
      // Pay entire pot to remaining player (if any)
      if (alive.length === 1) {
        const potRow = await q(`SELECT COALESCE(pot_total,0)::bigint AS pot FROM poker.poker_hands WHERE id=$1`, [hand_id]);
        const pot = Number(potRow.rows[0]?.pot || 0);
        if (pot > 0) {
          await q(
            `UPDATE poker.poker_seats
               SET stack_live = stack_live + $3
             WHERE table_id=$1 AND seat_index=$2`,
            [hand.table_id, alive[0].seat_index, pot]
          );
          await q(
            `UPDATE poker.poker_hand_players
               SET win_amount = COALESCE(win_amount,0) + $3
             WHERE hand_id=$1 AND seat_index=$2`,
            [hand_id, alive[0].seat_index, pot]
          );
          await q(`UPDATE poker.poker_hands SET pot_total=0 WHERE id=$1`, [hand_id]);
        }
      }

      await q(
        `UPDATE poker.poker_hands
            SET stage='hand_end',
                ended_at=now(),
                current_turn=NULL,
                turn_deadline=NULL
          WHERE id=$1`,
        [hand_id]
      );

      await q('COMMIT');
      return res.json({ ok: true, stage: 'hand_end', winners: alive.length ? [alive[0].seat_index] : [] });
    }

    // ==== B) Round settled? (everyone matched highest bet OR all-in/no chips) ====
    const maxBetRow = await q(
      `SELECT COALESCE(MAX(bet_street),0)::bigint AS mb
       FROM poker.poker_hand_players WHERE hand_id=$1`,
      [hand_id]
    );
    const maxBet = Number(maxBetRow.rows[0].mb || 0);

    const stillPending = aliveRows.rows
      .filter(r => r.folded === false)
      .some(r => Number(r.bet_street || 0) !== maxBet && Number(r.stack_live || 0) > 0);

    if (!stillPending) {
      // DO NOT set a new turn → clear to avoid ghost auto_check by tick()
      await q(
        `UPDATE poker.poker_hands
            SET current_turn=NULL,
                turn_deadline=NULL
          WHERE id=$1`,
        [hand_id]
      );
      await q('COMMIT');
      return res.json({ ok: true, round_settled: true });
    }

    // ==== C) Otherwise, set next turn & fresh deadline ====
    const nextSeat = computeNextSeat(aliveRows.rows, seat_index);
    await q(
      `UPDATE poker.poker_hands
          SET current_turn=$2,
              turn_deadline = now() + interval '30 seconds'
        WHERE id=$1`,
      [hand_id, nextSeat]
    );

    await q('COMMIT');
    return res.json({ ok: true, next_turn: nextSeat });
  } catch (e) {
    try { await q('ROLLBACK'); } catch {}
    return res.status(500).json({ error: 'server_error', detail: String(e) });
  }
}

// ---- helpers ---------------------------------------------------------------

async function applyAction(hand, seat, action, amount) {
  switch (action) {
    case 'fold':
      await q(
        `UPDATE poker.poker_hand_players
            SET folded=true
          WHERE hand_id=$1 AND seat_index=$2`,
        [hand.id, seat]
      );
      break;

    case 'check':
      // no state change, bet_street remains
      break;

    case 'call': {
      // bring seat's bet to max bet this street
      const mb = await q(
        `SELECT GREATEST(0, COALESCE(MAX(bet_street),0))::bigint AS mb
         FROM poker.poker_hand_players WHERE hand_id=$1`,
        [hand.id]
      );
      const maxBet = Number(mb.rows[0].mb || 0);
      const meRow = await q(
        `SELECT COALESCE(bet_street,0)::bigint AS bs
         FROM poker.poker_hand_players
         WHERE hand_id=$1 AND seat_index=$2`,
        [hand.id, seat]
      );
      const myBet = Number(meRow.rows[0]?.bs || 0);
      const toPut = Math.max(0, maxBet - myBet);
      if (toPut > 0) {
        await spendToBet(hand.table_id, seat, toPut, hand.id);
      }
      break;
    }

    case 'bet':
    case 'raise':
    case 'allin': {
      const put = Math.max(0, Number(amount) || 0);
      if (put > 0) await spendToBet(hand.table_id, seat, put, hand.id);
      if (action === 'allin') {
        await q(
          `UPDATE poker.poker_hand_players SET all_in=true WHERE hand_id=$1 AND seat_index=$2`,
          [hand.id, seat]
        );
      }
      break;
    }

    default:
      // ignore unknown action
      break;
  }
}

async function spendToBet(tableId, seat, amt, handId) {
  // take from seat.stack_live -> add to hand_player.bet_street
  await q(
    `UPDATE poker.poker_seats
        SET stack_live = GREATEST(0, stack_live - $3)
      WHERE table_id=$1 AND seat_index=$2`,
    [tableId, seat, amt]
  );
  await q(
    `UPDATE poker.poker_hand_players
        SET bet_street = COALESCE(bet_street,0) + $3
      WHERE hand_id=$1 AND seat_index=$2`,
    [handId, seat, amt]
  );
}

function computeNextSeat(aliveRows, fromSeat) {
  const aliveSeats = aliveRows
    .filter(r => r.folded === false && (r.all_in === false || Number(r.stack_live || 0) > 0))
    .map(r => r.seat_index)
    .sort((a, b) => a - b);

  if (!aliveSeats.length) return fromSeat;

  const after = aliveSeats.find(s => s > fromSeat);
  return typeof after === 'number' ? after : aliveSeats[0];
}
