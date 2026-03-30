/**
 * OV2 Board Path — control gating (contract only; no RPC).
 */

import {
  canBoardPathSeatEndTurn,
  canBoardPathSeatMove,
  canBoardPathSeatRoll,
} from "./ov2BoardPathEngine";

/**
 * True when self may invoke a server turn action (roll / move / end turn) for the current step.
 * @param {{ phase?: string, engine_phase?: string, turnMeta?: Record<string, unknown> }|null|undefined} session
 * @param {{ seatIndex: number, participantKey?: string }|null|undefined} selfSeat
 * @param {unknown[]|null|undefined} seats — session seat rows or local seats (`seat_index` / `seatIndex`)
 */
export function canSelfAct(session, selfSeat, seats) {
  const pk = selfSeat?.participantKey?.trim() || null;
  if (!session || !selfSeat || !Array.isArray(seats) || seats.length === 0 || !pk) return false;
  return (
    canBoardPathSeatRoll(session, seats, pk) ||
    canBoardPathSeatMove(session, seats, pk) ||
    canBoardPathSeatEndTurn(session, seats, pk)
  );
}

/**
 * @param {{ phase?: string, engine_phase?: string, turnMeta?: Record<string, unknown> }|null|undefined} session
 * @param {{ seatIndex: number, participantKey?: string }|null|undefined} selfSeat
 * @param {unknown[]|null|undefined} seats
 */
export function canEndTurn(session, selfSeat, seats) {
  const pk = selfSeat?.participantKey?.trim() || null;
  if (!session || !selfSeat || !pk || !Array.isArray(seats)) return false;
  return canBoardPathSeatEndTurn(session, seats, pk);
}
