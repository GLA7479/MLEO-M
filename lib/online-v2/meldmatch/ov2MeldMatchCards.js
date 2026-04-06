/**
 * MeldMatch client card helpers (0..51: rank = c % 13 ace low, suit = floor(c / 13)).
 * Hints only — server validates all finishes and layoffs.
 */

const RANK_CHARS = "A23456789TJQK";
const SUIT_CHARS = "SHDC";

/** @param {number} c */
export function mmCardRank(c) {
  const n = Math.floor(Number(c));
  if (!Number.isFinite(n) || n < 0 || n > 51) return null;
  return n % 13;
}

/** @param {number} c */
export function mmCardSuit(c) {
  const n = Math.floor(Number(c));
  if (!Number.isFinite(n) || n < 0 || n > 51) return null;
  return Math.floor(n / 13);
}

/** @param {number} c */
export function mmDeadwoodPoints(c) {
  const r = mmCardRank(c);
  if (r == null) return 0;
  if (r === 0) return 1;
  if (r >= 9) return 10;
  return r + 1;
}

/** @param {number[]} cards */
export function mmFormatCard(c) {
  const id = Math.floor(Number(c));
  if (!Number.isFinite(id) || id < 0 || id > 51) return "?";
  const r = id % 13;
  const s = Math.floor(id / 13);
  return `${RANK_CHARS[r] ?? "?"}${SUIT_CHARS[s] ?? "?"}`;
}

/** @param {unknown} raw */
export function mmParseHandArray(raw) {
  if (raw == null || raw === "null") return [];
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const x of raw) {
    const n = Math.floor(Number(x));
    if (Number.isFinite(n) && n >= 0 && n <= 51) out.push(n);
  }
  return out;
}

/** @param {number[]} cards */
function mmSortCopy(cards) {
  return [...cards].sort((a, b) => a - b);
}

/** @param {number[]} cards */
export function mmIsValidSet(cards) {
  if (!Array.isArray(cards) || cards.length < 3) return false;
  const ranks = cards.map(mmCardRank);
  if (ranks.some(r => r == null)) return false;
  const r0 = /** @type {number} */ (ranks[0]);
  return ranks.every(r => r === r0);
}

/** @param {number[]} cards */
export function mmIsValidRun(cards) {
  if (!Array.isArray(cards) || cards.length < 3) return false;
  const suits = cards.map(mmCardSuit);
  if (suits.some(s => s == null)) return false;
  const s0 = /** @type {number} */ (suits[0]);
  if (!suits.every(s => s === s0)) return false;
  const ranks = mmSortCopy(cards.map(c => /** @type {number} */ (mmCardRank(c))));
  for (let i = 1; i < ranks.length; i++) {
    if (ranks[i] !== ranks[i - 1] + 1) return false;
  }
  return true;
}

/** @param {number[]} cards */
export function mmIsValidMeld(cards) {
  return mmIsValidSet(cards) || mmIsValidRun(cards);
}

/**
 * Enumerate every subset of `pool` that includes `mustInclude`, has size >= 3, and is a valid meld.
 * @param {number[]} pool
 * @param {number} mustInclude
 * @returns {number[][]}
 */
function mmMeldsContaining(pool, mustInclude) {
  const out = [];
  const idx = pool.indexOf(mustInclude);
  if (idx < 0) return out;
  const n = pool.length;
  const maxMask = 1 << n;
  for (let mask = 0; mask < maxMask; mask++) {
    if ((mask & (1 << idx)) === 0) continue;
    const pick = [];
    for (let b = 0; b < n; b++) {
      if (mask & (1 << b)) pick.push(pool[b]);
    }
    if (pick.length < 3) continue;
    if (mmIsValidMeld(pick)) out.push(pick);
  }
  return out;
}

/**
 * @param {number[]} remaining
 * @param {number[][]} meldsSoFar
 * @param {number[]} deadSoFar
 * @returns {{ melds: number[][], deadwood: number[], deadwoodPts: number } | null}
 */
function mmSearchPartition(remaining, meldsSoFar, deadSoFar) {
  if (remaining.length === 0) {
    const deadwoodPts = deadSoFar.reduce((s, c) => s + mmDeadwoodPoints(c), 0);
    return { melds: meldsSoFar, deadwood: deadSoFar, deadwoodPts };
  }
  const first = remaining[0];
  /** @type {{ melds: number[][], deadwood: number[], deadwoodPts: number } | null} */
  let best = null;

  const restAfterDead = remaining.slice(1);
  const branchDead = mmSearchPartition(restAfterDead, meldsSoFar, [...deadSoFar, first]);
  if (branchDead) {
    best = branchDead;
  }

  const meldOptions = mmMeldsContaining(remaining, first);
  for (const meld of meldOptions) {
    const setM = new Set(meld);
    const rest = remaining.filter(c => !setM.has(c));
    const br = mmSearchPartition(rest, [...meldsSoFar, mmSortCopy(meld)], deadSoFar);
    if (!br) continue;
    if (!best || br.deadwoodPts < best.deadwoodPts) best = br;
  }

  return best;
}

/**
 * Best partition of exactly `cards` into valid melds + deadwood (min deadwood points).
 * @param {number[]} cards
 */
export function mmBestPartition(cards) {
  if (!Array.isArray(cards) || cards.length === 0) {
    return { melds: [], deadwood: [], deadwoodPts: 0 };
  }
  return mmSearchPartition(cards, [], []);
}

/**
 * Try each of 11 cards as discard; return a valid gin or knock declaration payload, or null.
 * @param {number[]} hand11
 * @returns {{ kind: 'gin'|'knock', discard: number, melds: number[][], deadwood: number[], deadwoodPts: number } | null}
 */
export function mmSuggestFinishFromHand11(hand11) {
  if (!Array.isArray(hand11) || hand11.length !== 11) return null;
  /** @type {{ kind: 'gin'|'knock', discard: number, melds: number[][], deadwood: number[], deadwoodPts: number } | null} */
  let ginPick = null;
  /** @type {{ kind: 'gin'|'knock', discard: number, melds: number[][], deadwood: number[], deadwoodPts: number } | null} */
  let knockPick = null;

  for (let i = 0; i < hand11.length; i++) {
    const discard = hand11[i];
    const rest = hand11.filter((_, j) => j !== i);
    const part = mmBestPartition(rest);
    if (!part) continue;
    if (part.deadwoodPts === 0) {
      ginPick = { kind: "gin", discard, melds: part.melds, deadwood: part.deadwood, deadwoodPts: 0 };
      break;
    }
    if (part.deadwoodPts <= 10) {
      if (!knockPick || part.deadwoodPts < knockPick.deadwoodPts) {
        knockPick = { kind: "knock", discard, melds: part.melds, deadwood: part.deadwood, deadwoodPts: part.deadwoodPts };
      }
    }
  }

  return ginPick || knockPick;
}
