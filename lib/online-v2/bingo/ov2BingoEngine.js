/**
 * OV2 Bingo — deterministic card/deck logic (adapted from `lib/bingoEngine.js`).
 * Uses `ov2DeterministicRng` instead of inlined RNG.
 *
 * Pure rules helpers only. Preview marking policy (`applyPreviewMark`) gates on a called-number set;
 * a live server will own that set and validate claims separately.
 */

import { ov2MakeRng, ov2Shuffle } from "../shared/ov2DeterministicRng";

export const BINGO_SIZE = 5;
export const BINGO_MAX = 75;

export function makeRng(seedStr) {
  return ov2MakeRng(seedStr);
}

export function shuffle(arr, rng) {
  return ov2Shuffle(arr, rng);
}

export function generateCard(seedStr) {
  const rng = makeRng(seedStr);
  const colRanges = [
    [1, 15],
    [16, 30],
    [31, 45],
    [46, 60],
    [61, 75],
  ];

  const grid = Array.from({ length: 5 }, () => Array(5).fill(null));

  for (let c = 0; c < 5; c++) {
    const [lo, hi] = colRanges[c];
    const nums = [];
    for (let n = lo; n <= hi; n++) nums.push(n);
    const picked = shuffle(nums, rng).slice(0, 5);
    for (let r = 0; r < 5; r++) grid[r][c] = picked[r];
  }

  grid[2][2] = 0;
  return grid;
}

export function makeEmptyMarks() {
  const marks = Array(25).fill(false);
  marks[12] = true;
  return marks;
}

export function findNumberIndex(card, number) {
  if (!number) return -1;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (card[r][c] === number) return r * 5 + c;
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

/**
 * Preview-only: only allow marking numbers the local preview has “called”.
 * Authoritative mode will use server-called set + server validation instead.
 *
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
  for (let c = 0; c < 5; c++) {
    if (!marks[rowIndex * 5 + c]) return false;
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

export function buildDeck(seedStr) {
  const rng = makeRng(seedStr);
  const all = Array.from({ length: BINGO_MAX }, (_, i) => i + 1);
  return shuffle(all, rng);
}
