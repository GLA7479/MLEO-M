/**
 * Persists per-player manual dab marks for OV2 Bingo (client-only; claims stay server-authoritative).
 * Key: room + session + participant — never shared across matches or users.
 */

const PREFIX = "ov2_bingo_marks_v1";

/** @param {string} roomId @param {string} sessionId @param {string} participantKey */
export function ov2BingoMarksStorageKey(roomId, sessionId, participantKey) {
  const r = String(roomId || "").trim();
  const s = String(sessionId || "").trim();
  const p = String(participantKey || "").trim();
  if (!r || !s || !p) return "";
  return `${PREFIX}:${r}:${s}:${p}`;
}

/**
 * Drop marks on cells whose numbers were never called (stale storage / rule enforcement).
 * @param {number[][]} card
 * @param {boolean[]} marks
 * @param {readonly number[]} calledNumbers
 */
export function reconcileBingoMarksToCalled(card, marks, calledNumbers) {
  if (!card || !Array.isArray(marks) || marks.length !== 25) return makeEmptyMarksInternal();
  const called = new Set(
    Array.isArray(calledNumbers) ? calledNumbers.map(n => Number(n)).filter(Number.isFinite) : []
  );
  const flat = card.flat();
  return marks.map((marked, idx) => {
    if (idx === 12) return true;
    const n = flat[idx];
    if (!marked) return false;
    return called.has(n);
  });
}

function makeEmptyMarksInternal() {
  const m = Array(25).fill(false);
  m[12] = true;
  return m;
}

/**
 * @param {string} key
 * @returns {boolean[]|null}
 */
export function loadOv2BingoMarks(key) {
  if (typeof window === "undefined" || !key) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length !== 25) return null;
    return arr.map(x => Boolean(x));
  } catch {
    return null;
  }
}

/**
 * @param {string} key
 * @param {boolean[]} marks
 */
export function saveOv2BingoMarks(key, marks) {
  if (typeof window === "undefined" || !key || !Array.isArray(marks) || marks.length !== 25) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(marks));
  } catch {
    /* quota / private mode */
  }
}
