import { randomInt } from "crypto";
import {
  LIMIT_RUN_LIMBO_HOUSE_EDGE,
  LIMIT_RUN_LIMBO_MAX_RESULT,
  LIMIT_RUN_LIMBO_U_DENOM,
} from "../limitRunConfig";

export function buildLimitRunInitialActiveSummary() {
  return {
    phase: "limit_run_active",
    limbo: true,
    lastProcessedRollEventId: 0,
  };
}

/**
 * Classic limbo: U ~ Uniform(0,1), outcome = (1-houseEdge) / U, capped.
 * @returns {number} multiplier rounded to 4 decimal places
 */
export function rollLimboMultiplier() {
  const u = randomInt(1, LIMIT_RUN_LIMBO_U_DENOM) / LIMIT_RUN_LIMBO_U_DENOM;
  const edge = Math.min(0.49, Math.max(0, LIMIT_RUN_LIMBO_HOUSE_EDGE));
  let m = (1 - edge) / u;
  if (!Number.isFinite(m) || m < 1) m = 1;
  m = Math.min(LIMIT_RUN_LIMBO_MAX_RESULT, m);
  return Math.round(m * 10000) / 10000;
}

export function limboRollWins(rollMultiplier, targetMultiplier) {
  const r = Number(rollMultiplier);
  const t = Number(targetMultiplier);
  if (!Number.isFinite(r) || !Number.isFinite(t)) return false;
  return r + 1e-9 >= t;
}
