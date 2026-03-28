import { DROP_RUN_DRIFT_ROWS, DROP_RUN_GATES } from "../dropRunConfig";

export function buildDropRunInitialActiveSummary() {
  return {
    phase: "drop_run_active",
    lastProcessedGateEventId: 0,
  };
}

/**
 * @param {unknown} sessionRow
 * @returns {null | { lastProcessedGateEventId: number }}
 */
export function parseDropRunActiveSummary(sessionRow) {
  const s = sessionRow?.server_outcome_summary || {};
  if (s.phase !== "drop_run_active") return null;
  return {
    lastProcessedGateEventId: Math.max(0, Math.floor(Number(s.lastProcessedGateEventId) || 0)),
  };
}

/**
 * Build server path: each step drifts in {-1,0,1}, clamped to 1..DROP_RUN_GATES.
 * @param {number} entryGate release column
 * @param {(min: number, max: number) => number} randomIntFn crypto.randomInt: min inclusive, max exclusive
 */
export function computeDropRunPath(entryGate, randomIntFn) {
  let pos = Math.max(1, Math.min(DROP_RUN_GATES, Math.floor(entryGate)));
  const driftPath = [];
  const pathPositions = [pos];
  for (let i = 0; i < DROP_RUN_DRIFT_ROWS; i += 1) {
    const d = randomIntFn(-1, 2);
    driftPath.push(d);
    pos = Math.max(1, Math.min(DROP_RUN_GATES, pos + d));
    pathPositions.push(pos);
  }
  const finalBay = pathPositions[pathPositions.length - 1];
  return { driftPath, pathPositions, finalBay };
}
