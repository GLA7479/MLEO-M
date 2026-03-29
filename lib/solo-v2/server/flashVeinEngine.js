import { randomInt } from "crypto";
import {
  FLASH_VEIN_GEM_MULT_DEN,
  FLASH_VEIN_GEM_MULT_NUM,
  FLASH_VEIN_MULT_BPS_START,
  FLASH_VEIN_ROUNDS,
  FLASH_VEIN_SAFE_MULT_DEN,
  FLASH_VEIN_SAFE_MULT_NUM,
} from "../flashVeinConfig";

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

export function buildFlashVeinInitialActiveSummary() {
  const roundPlan = [];
  for (let s = 0; s < FLASH_VEIN_ROUNDS; s += 1) {
    roundPlan.push(shuffleRow());
  }
  return {
    phase: "flash_vein_active",
    roundPlan,
    currentRoundIndex: 0,
    revealedForRound: null,
    multBps: FLASH_VEIN_MULT_BPS_START,
    gemsCollected: 0,
    roundHistory: [],
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
 */
export function parseFlashVeinActiveSummary(sessionRow) {
  const s = sessionRow?.server_outcome_summary || {};
  if (s.phase !== "flash_vein_active") return null;
  const roundPlan = Array.isArray(s.roundPlan) ? s.roundPlan : [];
  if (roundPlan.length !== FLASH_VEIN_ROUNDS) return null;
  if (!roundPlan.every(isValidRow)) return null;
  const rfr = s.revealedForRound;
  const revealedForRound = rfr === null || rfr === undefined ? null : Math.floor(Number(rfr));
  return {
    roundPlan,
    currentRoundIndex: Math.max(0, Math.min(FLASH_VEIN_ROUNDS - 1, Math.floor(Number(s.currentRoundIndex) || 0))),
    revealedForRound: revealedForRound !== null && Number.isFinite(revealedForRound) ? revealedForRound : null,
    multBps: Math.max(FLASH_VEIN_MULT_BPS_START, Math.floor(Number(s.multBps) || FLASH_VEIN_MULT_BPS_START)),
    gemsCollected: Math.max(0, Math.floor(Number(s.gemsCollected) || 0)),
    roundHistory: Array.isArray(s.roundHistory) ? s.roundHistory : [],
    lastProcessedPickEventId: Math.max(0, Math.floor(Number(s.lastProcessedPickEventId) || 0)),
  };
}

export function applyMultForFlashVeinOutcome(multBps, outcome) {
  const m = Math.max(1, Math.floor(Number(multBps) || FLASH_VEIN_MULT_BPS_START));
  if (outcome === "gem") {
    return Math.floor((m * FLASH_VEIN_GEM_MULT_NUM) / FLASH_VEIN_GEM_MULT_DEN);
  }
  if (outcome === "safe") {
    return Math.floor((m * FLASH_VEIN_SAFE_MULT_NUM) / FLASH_VEIN_SAFE_MULT_DEN);
  }
  return m;
}
