/**
 * Client-side Mystery Chamber stats (localStorage), same pattern as Quick Flip / Mystery Box.
 * Updated only from authoritative resolve responses (no double-count on refresh).
 */

export const MYSTERY_CHAMBER_STATS_KEY = "solo_v2_mystery_chamber_stats_v2";

const CHAMBERS = 4;
const SIGILS = 4;

function zeros(n) {
  return Array.from({ length: n }, () => 0);
}

export function defaultMysteryChamberStats() {
  return {
    schemaVersion: 2,
    totalRuns: 0,
    fullClears: 0,
    cashouts: 0,
    failures: 0,
    picksOnChamber: zeros(CHAMBERS),
    successesOnChamber: zeros(CHAMBERS),
    depthSum: 0,
    totalPlayed: 0,
    totalReturned: 0,
    bestReturn: 0,
    picksBySigil: zeros(SIGILS),
    /** When a run ends in fail, count each sigil index shown as safe on the reveal. */
    revealedSafeHits: zeros(SIGILS),
  };
}

function mergeDefaults(parsed) {
  const d = defaultMysteryChamberStats();
  if (!parsed || typeof parsed !== "object") return d;
  return {
    ...d,
    totalRuns: Number(parsed.totalRuns || 0),
    fullClears: Number(parsed.fullClears || 0),
    cashouts: Number(parsed.cashouts || 0),
    failures: Number(parsed.failures || 0),
    picksOnChamber: mergeArr(parsed.picksOnChamber, CHAMBERS),
    successesOnChamber: mergeArr(parsed.successesOnChamber, CHAMBERS),
    depthSum: Number(parsed.depthSum || 0),
    totalPlayed: Number(parsed.totalPlayed || 0),
    totalReturned: Number(parsed.totalReturned || 0),
    bestReturn: Number(parsed.bestReturn || 0),
    picksBySigil: mergeArr(parsed.picksBySigil, SIGILS),
    revealedSafeHits: mergeArr(parsed.revealedSafeHits, SIGILS),
  };
}

function mergeArr(raw, len) {
  const z = zeros(len);
  if (!Array.isArray(raw)) return z;
  for (let i = 0; i < len; i += 1) {
    z[i] = Number(raw[i] || 0);
  }
  return z;
}

export function readMysteryChamberStats() {
  if (typeof window === "undefined") return defaultMysteryChamberStats();
  try {
    const raw = window.localStorage.getItem(MYSTERY_CHAMBER_STATS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return mergeDefaults(parsed);
  } catch {
    return defaultMysteryChamberStats();
  }
}

export function writeMysteryChamberStats(next) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MYSTERY_CHAMBER_STATS_KEY, JSON.stringify(next));
  } catch {
    // ignore quota / private mode
  }
}

function bumpAt(arr, i, delta = 1) {
  const next = [...arr];
  const idx = Math.max(0, Math.min(arr.length - 1, i));
  next[idx] = (Number(next[idx]) || 0) + delta;
  return next;
}

/** Deepest human chamber number (1–4) reached when the run ended. */
export function deepestChamberHumanReached(terminalKind, finalChamberIndex, chambersCleared) {
  const fc = Math.max(0, Math.min(3, Math.floor(Number(finalChamberIndex) || 0)));
  const cc = Math.max(0, Math.floor(Number(chambersCleared) || 0));
  if (terminalKind === "full_clear") return 4;
  if (terminalKind === "cashout") return Math.min(4, cc + 1);
  return fc + 1;
}

/**
 * Mid-run server success (not final chamber clear — that is folded into terminal full_clear).
 */
export function recordMysteryChamberTurnComplete(prev, { chamberIndex, sigilIndex }) {
  const ci = Math.max(0, Math.min(CHAMBERS - 1, Math.floor(Number(chamberIndex) || 0)));
  const si = Math.max(0, Math.min(SIGILS - 1, Math.floor(Number(sigilIndex) || 0)));
  return {
    ...prev,
    picksOnChamber: bumpAt(prev.picksOnChamber, ci, 1),
    successesOnChamber: bumpAt(prev.successesOnChamber, ci, 1),
    picksBySigil: bumpAt(prev.picksBySigil, si, 1),
  };
}

/**
 * Terminal run outcome (fail, cashout, or full_clear). Use settlement entry + payout from server summary.
 */
export function recordMysteryChamberTerminal(prev, args) {
  const {
    terminalKind,
    entryCost,
    payoutReturn,
    finalChamberIndex,
    chambersCleared,
    chosenSigil,
    safeSigilSet,
  } = args;

  const entry = Math.max(0, Math.floor(Number(entryCost) || 0));
  const payout = Math.max(0, Math.floor(Number(payoutReturn) || 0));
  const fc = Math.max(0, Math.min(3, Math.floor(Number(finalChamberIndex) || 0)));
  const cc = Math.max(0, Math.floor(Number(chambersCleared) || 0));

  let next = {
    ...prev,
    totalRuns: prev.totalRuns + 1,
    totalPlayed: prev.totalPlayed + entry,
    totalReturned: prev.totalReturned + payout,
    bestReturn: Math.max(prev.bestReturn, payout),
    depthSum: prev.depthSum + deepestChamberHumanReached(terminalKind, fc, cc),
  };

  if (terminalKind === "fail") {
    next.failures += 1;
    next.picksOnChamber = bumpAt(next.picksOnChamber, fc, 1);
    const ch = Math.max(0, Math.min(SIGILS - 1, Math.floor(Number(chosenSigil) || 0)));
    next.picksBySigil = bumpAt(next.picksBySigil, ch, 1);
    const set = Array.isArray(safeSigilSet) ? safeSigilSet : [];
    for (const raw of set) {
      const s = Math.floor(Number(raw));
      if (s >= 0 && s < SIGILS) {
        next.revealedSafeHits = bumpAt(next.revealedSafeHits, s, 1);
      }
    }
  } else if (terminalKind === "cashout") {
    next.cashouts += 1;
  } else if (terminalKind === "full_clear") {
    next.fullClears += 1;
    next.picksOnChamber = bumpAt(next.picksOnChamber, 3, 1);
    next.successesOnChamber = bumpAt(next.successesOnChamber, 3, 1);
    const ch = Math.max(0, Math.min(SIGILS - 1, Math.floor(Number(chosenSigil) || 0)));
    next.picksBySigil = bumpAt(next.picksBySigil, ch, 1);
  }

  return next;
}

export function totalSuccessfulSafePicks(stats) {
  return stats.successesOnChamber.reduce((a, b) => a + (Number(b) || 0), 0);
}

export function runsWithReturn(stats) {
  return stats.fullClears + stats.cashouts;
}

export function chamberClearRatePercent(stats, chamberIndex) {
  const p = Number(stats.picksOnChamber[chamberIndex] || 0);
  const s = Number(stats.successesOnChamber[chamberIndex] || 0);
  if (!p) return null;
  return (s / p) * 100;
}

export function averageChamberReached(stats) {
  if (!stats.totalRuns) return null;
  return stats.depthSum / stats.totalRuns;
}

const SS_PICK_PREFIX = "solo_v2_mc_stats_picks_";
const SS_TERM_PREFIX = "solo_v2_mc_stats_terminal_";

export function loadMysteryChamberPickDedupe(sessionId) {
  if (typeof window === "undefined" || !sessionId) return new Set();
  try {
    const raw = window.sessionStorage.getItem(`${SS_PICK_PREFIX}${sessionId}`);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.map(x => Number(x)).filter(n => Number.isFinite(n) && n > 0) : []);
  } catch {
    return new Set();
  }
}

export function rememberMysteryChamberPickDedupe(sessionId, pickEventId) {
  if (typeof window === "undefined" || !sessionId) return;
  const id = Number(pickEventId);
  if (!Number.isFinite(id) || id <= 0) return;
  try {
    const set = loadMysteryChamberPickDedupe(sessionId);
    set.add(id);
    window.sessionStorage.setItem(`${SS_PICK_PREFIX}${sessionId}`, JSON.stringify([...set]));
  } catch {
    // ignore
  }
}

export function mysteryChamberTerminalAlreadyRecorded(sessionId) {
  if (typeof window === "undefined" || !sessionId) return false;
  try {
    return window.sessionStorage.getItem(`${SS_TERM_PREFIX}${sessionId}`) === "1";
  } catch {
    return false;
  }
}

export function rememberMysteryChamberTerminal(sessionId) {
  if (typeof window === "undefined" || !sessionId) return;
  try {
    window.sessionStorage.setItem(`${SS_TERM_PREFIX}${sessionId}`, "1");
  } catch {
    // ignore
  }
}
