/**
 * OV2 Board Path — action gating (contract only; no engine / RPC).
 */

/**
 * @param {{ phase?: string, turnMeta?: { activeSeatIndex?: number|null } }|null|undefined} session
 * @param {{ seatIndex: number }|null|undefined} selfSeat
 */
export function canRollDice(session, selfSeat) {
  if (!session || !selfSeat) return false;
  if (session.phase !== "playing") return false;
  if (session.turnMeta?.activeSeatIndex !== selfSeat.seatIndex) return false;
  return false;
}

/**
 * @param {unknown} session
 * @param {unknown} selfSeat
 */
export function canMoveToken(session, selfSeat) {
  void session;
  void selfSeat;
  return false;
}

/**
 * @param {unknown} session
 * @param {unknown} selfSeat
 */
export function canFinishTurn(session, selfSeat) {
  void session;
  void selfSeat;
  return false;
}
