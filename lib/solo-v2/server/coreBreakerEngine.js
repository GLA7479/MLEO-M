import { randomInt } from "crypto";
import {
  CORE_BREAKER_GEM_MULT_DEN,
  CORE_BREAKER_GEM_MULT_NUM,
  CORE_BREAKER_MULT_BPS_START,
  CORE_BREAKER_SAFE_MULT_DEN,
  CORE_BREAKER_SAFE_MULT_NUM,
  CORE_BREAKER_STRIKE_STEPS,
} from "../coreBreakerConfig";

const TYPES = ["unstable", "safe", "gem"];

function shuffleRow() {
  const row = [...TYPES];
  for (let i = row.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1);
    const t = row[i];
    row[i] = row[j];
    row[j] = t;
  }
  return row;
}

export function buildCoreBreakerInitialActiveSummary() {
  const strikePlan = [];
  for (let s = 0; s < CORE_BREAKER_STRIKE_STEPS; s += 1) {
    strikePlan.push(shuffleRow());
  }
  return {
    phase: "core_breaker_active",
    strikePlan,
    currentStepIndex: 0,
    multBps: CORE_BREAKER_MULT_BPS_START,
    gemsCollected: 0,
    strikeHistory: [],
    lastProcessedPickEventId: 0,
  };
}

function isValidRow(row) {
  if (!Array.isArray(row) || row.length !== 3) return false;
  const counts = { unstable: 0, safe: 0, gem: 0 };
  for (const c of row) {
    if (!counts.hasOwnProperty(c)) return false;
    counts[c] += 1;
  }
  return counts.unstable === 1 && counts.safe === 1 && counts.gem === 1;
}

/**
 * @param {unknown} sessionRow
 * @returns {null | {
 *   strikePlan: string[][],
 *   currentStepIndex: number,
 *   multBps: number,
 *   gemsCollected: number,
 *   strikeHistory: Array<{ column: number, outcome: string, stepIndex: number }>,
 *   lastProcessedPickEventId: number,
 * }}
 */
export function parseCoreBreakerActiveSummary(sessionRow) {
  const s = sessionRow?.server_outcome_summary || {};
  if (s.phase !== "core_breaker_active") return null;
  const strikePlan = Array.isArray(s.strikePlan) ? s.strikePlan : [];
  if (strikePlan.length !== CORE_BREAKER_STRIKE_STEPS) return null;
  if (!strikePlan.every(isValidRow)) return null;
  return {
    strikePlan,
    currentStepIndex: Math.max(0, Math.min(CORE_BREAKER_STRIKE_STEPS, Math.floor(Number(s.currentStepIndex) || 0))),
    multBps: Math.max(CORE_BREAKER_MULT_BPS_START, Math.floor(Number(s.multBps) || CORE_BREAKER_MULT_BPS_START)),
    gemsCollected: Math.max(0, Math.floor(Number(s.gemsCollected) || 0)),
    strikeHistory: Array.isArray(s.strikeHistory) ? s.strikeHistory : [],
    lastProcessedPickEventId: Math.max(0, Math.floor(Number(s.lastProcessedPickEventId) || 0)),
  };
}

export function applyMultForOutcome(multBps, outcome) {
  const m = Math.max(1, Math.floor(Number(multBps) || CORE_BREAKER_MULT_BPS_START));
  if (outcome === "gem") {
    return Math.floor((m * CORE_BREAKER_GEM_MULT_NUM) / CORE_BREAKER_GEM_MULT_DEN);
  }
  if (outcome === "safe") {
    return Math.floor((m * CORE_BREAKER_SAFE_MULT_NUM) / CORE_BREAKER_SAFE_MULT_DEN);
  }
  return m;
}
