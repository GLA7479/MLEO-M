/**
 * OV2 Bingo — pure rules engine (5×5, 1..75 deck, deterministic RNG).
 * No I/O, no legacy `lib/bingo*` imports.
 */

import { ov2MakeRng, ov2Shuffle } from "../shared/ov2DeterministicRng.js";

export const BINGO_MIN = 1;
export const BINGO_MAX = 75;
export const BINGO_SIZE = 5;
export const BINGO_FREE_VALUE = 0;

/** @type {readonly ["row1","row2","row3","row4","row5","full"]} */
export const BINGO_PRIZE_KEYS = Object.freeze(["row1", "row2", "row3", "row4", "row5", "full"]);

/** Inclusive seat indices for an 8-seat table (0..7). */
const BINGO_MAX_SEAT_INDEX = 7;

const COLUMN_RANGES = Object.freeze([
  [1, 15],
  [16, 30],
  [31, 45],
  [46, 60],
  [61, 75],
]);

const ROW_PRIZE_KEY_BY_INDEX = Object.freeze(["row1", "row2", "row3", "row4", "row5"]);

const PRIZE_KEY_SET = new Set(BINGO_PRIZE_KEYS);

/** @param {string} seedStr */
export function makeRng(seedStr) {
  return ov2MakeRng(String(seedStr ?? ""));
}

/** @param {unknown[]} list @param {() => number} rng */
export function shuffle(list, rng) {
  return ov2Shuffle(list, rng);
}

/**
 * Shuffled draw order for 1..75 (deterministic).
 * @param {string} seedStr
 * @returns {number[]}
 */
export function buildDeck(seedStr) {
  const rng = makeRng(seedStr);
  const nums = Array.from({ length: BINGO_MAX - BINGO_MIN + 1 }, (_, i) => BINGO_MIN + i);
  return shuffle(nums, rng);
}

/**
 * Standard card from a single seed string (B/I/N/G/O columns, FREE center).
 * @param {string} seedStr
 * @returns {number[][]}
 */
export function generateCard(seedStr) {
  const rng = makeRng(seedStr);
  /** @type {number[][]} */
  const grid = Array.from({ length: BINGO_SIZE }, () => Array(BINGO_SIZE).fill(BINGO_FREE_VALUE));

  for (let c = 0; c < BINGO_SIZE; c++) {
    const [lo, hi] = COLUMN_RANGES[c];
    const pool = [];
    for (let n = lo; n <= hi; n++) pool.push(n);
    const picked = shuffle(pool, rng).slice(0, BINGO_SIZE);
    for (let r = 0; r < BINGO_SIZE; r++) grid[r][c] = picked[r];
  }

  grid[2][2] = BINGO_FREE_VALUE;
  return grid;
}

/**
 * Card identity for a seated participant.
 * @param {{ seed: unknown, roundId: unknown, seatIndex: number }} p
 * @returns {string}
 */
export function getCardSeed({ seed, roundId, seatIndex }) {
  const si = Number(seatIndex);
  if (!Number.isInteger(si) || si < 0 || si > BINGO_MAX_SEAT_INDEX) {
    throw new RangeError("seatIndex must be an integer 0..7");
  }
  return `${String(seed ?? "")}::${String(roundId ?? "")}::${si}`;
}

/**
 * @param {{ seed: unknown, roundId: unknown, seatIndex: number }} p
 * @returns {number[][]}
 */
export function getCardForSeat(p) {
  return generateCard(getCardSeed(p));
}

/**
 * Valid unique call order, integers in [BINGO_MIN, BINGO_MAX], first-seen order preserved.
 * @param {unknown} called
 * @returns {number[]}
 */
export function normalizeCalledNumbers(called) {
  if (called == null) return [];
  const list = Array.isArray(called) ? called : Array.from(/** @type {Iterable<unknown>} */ (called));
  const seen = new Set();
  /** @type {number[]} */
  const out = [];
  for (const raw of list) {
    const n =
      typeof raw === "number" && Number.isInteger(raw)
        ? raw
        : Number.parseInt(String(raw).trim(), 10);
    if (!Number.isFinite(n) || n < BINGO_MIN || n > BINGO_MAX) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/**
 * @param {unknown} called
 * @param {unknown} value
 */
export function isNumberCalled(called, value) {
  const v = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(v) || v < BINGO_MIN || v > BINGO_MAX) return false;
  return normalizeCalledNumbers(called).includes(v);
}

/**
 * @param {number} cellValue
 * @param {ReadonlySet<number>|Set<number>} calledSet
 */
export function isCellSatisfiedByCalled(cellValue, calledSet) {
  if (cellValue === BINGO_FREE_VALUE) return true;
  return calledSet.has(cellValue);
}

/** @param {ReadonlyArray<ReadonlyArray<number>>} card @param {unknown} called */
export function getSatisfiedMask(card, called) {
  const set = new Set(normalizeCalledNumbers(called));
  /** @type {boolean[]} */
  const mask = [];
  for (let r = 0; r < BINGO_SIZE; r++) {
    for (let c = 0; c < BINGO_SIZE; c++) {
      mask.push(isCellSatisfiedByCalled(card[r][c], set));
    }
  }
  return mask;
}

/** @param {ReadonlyArray<ReadonlyArray<number>>} card @param {unknown} called @param {number} rowIndex 0..4 */
export function isRowWonByCalls(card, called, rowIndex) {
  if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= BINGO_SIZE) return false;
  const set = new Set(normalizeCalledNumbers(called));
  for (let c = 0; c < BINGO_SIZE; c++) {
    if (!isCellSatisfiedByCalled(card[rowIndex][c], set)) return false;
  }
  return true;
}

/** @param {ReadonlyArray<ReadonlyArray<number>>} card @param {unknown} called */
export function getWonRowKeys(card, called) {
  /** @type {string[]} */
  const keys = [];
  for (let r = 0; r < BINGO_SIZE; r++) {
    if (isRowWonByCalls(card, called, r)) keys.push(ROW_PRIZE_KEY_BY_INDEX[r]);
  }
  return keys;
}

/** @param {ReadonlyArray<ReadonlyArray<number>>} card @param {unknown} called */
export function isFullWonByCalls(card, called) {
  const set = new Set(normalizeCalledNumbers(called));
  for (let r = 0; r < BINGO_SIZE; r++) {
    for (let c = 0; c < BINGO_SIZE; c++) {
      if (!isCellSatisfiedByCalled(card[r][c], set)) return false;
    }
  }
  return true;
}

/**
 * Caller is the lowest active seat index (0..7).
 * @param {unknown} activeSeats
 * @returns {number|null}
 */
export function resolveCallerSeat(activeSeats) {
  if (!Array.isArray(activeSeats) || activeSeats.length === 0) return null;
  /** @type {number|null} */
  let min = null;
  for (const raw of activeSeats) {
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > BINGO_MAX_SEAT_INDEX) continue;
    if (min === null || n < min) min = n;
  }
  return min;
}

/**
 * @param {{ prizeKey: string, card: ReadonlyArray<ReadonlyArray<number>>, called: unknown, existingClaims: unknown }} p
 */
export function canClaimPrize({ prizeKey, card, called, existingClaims }) {
  if (typeof prizeKey !== "string" || !PRIZE_KEY_SET.has(prizeKey)) return false;
  const claims = Array.isArray(existingClaims) ? existingClaims : [];
  for (const row of claims) {
    if (row == null || typeof row !== "object") continue;
    const k = /** @type {Record<string, unknown>} */ (row).prize_key;
    if (k === prizeKey) return false;
  }
  if (prizeKey === "full") return isFullWonByCalls(card, called);
  const m = /^row([1-5])$/.exec(prizeKey);
  if (!m) return false;
  const idx = Number(m[1]) - 1;
  return isRowWonByCalls(card, called, idx);
}

/** @param {number} potTotal — original session pot (same basis as server `pot_total` at open). */
export function computeRowPrizeAmount(potTotal) {
  const p = Number(potTotal);
  if (!Number.isFinite(p) || p <= 0) return 0;
  return Math.max(0, p * 0.15);
}

/**
 * Full-card prize: fixed 25% of original session pot (not remainder after row claims).
 * @param {{ potTotal: number, existingClaims?: unknown }} p — `existingClaims` ignored; kept for call-site compatibility.
 */
export function computeFullPrizeAmount({ potTotal }) {
  const p = Number(potTotal);
  if (!Number.isFinite(p) || p <= 0) return 0;
  return Math.max(0, Math.trunc(p * 0.25));
}

/**
 * @param {{ card: ReadonlyArray<ReadonlyArray<number>>, called: unknown, existingClaims: unknown }} p
 * @returns {string[]}
 */
export function getAvailablePrizeKeys({ card, called, existingClaims }) {
  return BINGO_PRIZE_KEYS.filter(pk => canClaimPrize({ prizeKey: pk, card, called, existingClaims }));
}

// --- Preview / hook compatibility (same module; not part of the locked OV2 live contract list) ---

export function makeEmptyMarks() {
  const marks = Array(25).fill(false);
  marks[12] = true;
  return marks;
}

export function findNumberIndex(card, number) {
  if (!number) return -1;
  for (let r = 0; r < BINGO_SIZE; r++) {
    for (let c = 0; c < BINGO_SIZE; c++) {
      if (card[r][c] === number) return r * BINGO_SIZE + c;
    }
  }
  return -1;
}

export function applyMark(card, marks, number) {
  const idx = findNumberIndex(card, number);
  if (idx < 0) return { marks, changed: false };
  if (marks[idx]) return { marks, changed: false };
  const next = [...marks];
  next[idx] = true;
  return { marks: next, changed: true };
}

/** Live manual dab: toggle mark on the cell for `number` (free center not toggled). Authoritative claims still use server `called`. */
export function toggleManualPlayerMark(card, marks, number) {
  const idx = findNumberIndex(card, number);
  if (idx < 0) return { marks, changed: false };
  if (idx === 12) return { marks, changed: false };
  const next = [...marks];
  next[idx] = !next[idx];
  return { marks: next, changed: true };
}

/**
 * Preview: mark only if the number has been “called” in the local set.
 * @param {number[][]} card
 * @param {boolean[]} marks
 * @param {number} number
 * @param {Set<number>|ReadonlySet<number>} calledSet
 */
export function applyPreviewMark(card, marks, number, calledSet) {
  if (number == null || Number.isNaN(number)) return { marks, changed: false };
  if (!calledSet.has(number)) return { marks, changed: false };
  return applyMark(card, marks, number);
}

export function isRowComplete(marks, rowIndex) {
  for (let c = 0; c < BINGO_SIZE; c++) {
    if (!marks[rowIndex * BINGO_SIZE + c]) return false;
  }
  return true;
}

export function isFullComplete(marks) {
  return marks.every(Boolean);
}

/** @param {boolean[]} marks */
export function computePreviewLineCompletion(marks) {
  const completedRowIndexes = [];
  for (let r = 0; r < BINGO_SIZE; r++) {
    if (isRowComplete(marks, r)) completedRowIndexes.push(r);
  }
  return {
    completedRowIndexes,
    hasAnyRow: completedRowIndexes.length > 0,
    isFull: isFullComplete(marks),
  };
}
