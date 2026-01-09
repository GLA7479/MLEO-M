// lib/bingoEngine.js

export const BINGO_SIZE = 5;
export const BINGO_MAX = 75;

// --- Deterministic RNG helpers (seed string -> stable random) ---
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seedStr) {
  const seed = xmur3(seedStr)();
  return mulberry32(seed);
}

export function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Standard bingo columns:
// B: 1-15, I:16-30, N:31-45, G:46-60, O:61-75
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

  // Free center
  grid[2][2] = 0;
  return grid; // 5x5
}

export function makeEmptyMarks() {
  const marks = Array(25).fill(false);
  marks[12] = true; // FREE
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

export function isRowComplete(marks, rowIndex) {
  for (let c = 0; c < 5; c++) {
    if (!marks[rowIndex * 5 + c]) return false;
  }
  return true;
}

export function isFullComplete(marks) {
  return marks.every(Boolean);
}

export function buildDeck(seedStr) {
  const rng = makeRng(seedStr);
  const all = Array.from({ length: BINGO_MAX }, (_, i) => i + 1);
  return shuffle(all, rng);
}

