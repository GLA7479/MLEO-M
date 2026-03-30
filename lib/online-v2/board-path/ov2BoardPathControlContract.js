/**
 * OV2 Board Path — control gating (contract only; no RPC / engine).
 */

/**
 * @param {{ phase?: string, engine_phase?: string, turnMeta?: { activeSeatIndex?: number|null } }|null|undefined} session
 * @param {{ seatIndex: number }|null|undefined} selfSeat
 */
export function canSelfAct(session, selfSeat) {
  if (!session || !selfSeat) return false;
  const phase = session.phase ?? session.engine_phase;
  if (phase !== "playing") return false;
  const active = session.turnMeta?.activeSeatIndex;
  if (active == null) return false;
  if (active !== selfSeat.seatIndex) return false;
  return false; // placeholder until engine
}

/**
 * @param {{ phase?: string, engine_phase?: string }|null|undefined} session
 * @param {{ seatIndex: number }|null|undefined} selfSeat
 */
export function canEndTurn(session, selfSeat) {
  void session;
  void selfSeat;
  return false;
}
