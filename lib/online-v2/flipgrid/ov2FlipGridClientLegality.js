/**
 * FlipGrid client hints (8×8, row 0 top, idx = r*8+c). Server is authoritative.
 */

export const OV2_FLIPGRID_SIZE = 8;
export const OV2_FLIPGRID_CELLS = 64;

/** @type {readonly [number, number][]} */
const DIRS = Object.freeze([
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
]);

/**
 * @param {unknown} raw
 * @returns {(null|0|1)[]}
 */
export function parseFlipGridCells(raw) {
  const a = Array.isArray(raw) ? raw : [];
  /** @type {(null|0|1)[]} */
  const out = Array(OV2_FLIPGRID_CELLS).fill(null);
  for (let i = 0; i < OV2_FLIPGRID_CELLS; i++) {
    const v = a[i];
    if (v === null || v === undefined || v === "null") {
      out[i] = null;
      continue;
    }
    const n = Math.floor(Number(v));
    if (n === 0 || n === 1) out[i] = /** @type {0|1} */ (n);
    else out[i] = null;
  }
  return out;
}

/**
 * @param {(null|0|1)[]} cells
 * @param {number} idx
 */
function cellAt(cells, idx) {
  if (!Number.isInteger(idx) || idx < 0 || idx >= OV2_FLIPGRID_CELLS) return null;
  return cells[idx] ?? null;
}

/**
 * @param {(null|0|1)[]} cells
 * @param {number} r
 * @param {number} c
 * @param {0|1} seat
 * @param {number} dr
 * @param {number} dc
 * @returns {number[]}
 */
function lineFlipIndices(cells, r, c, seat, dr, dc) {
  const opp = 1 - seat;
  let rr = r + dr;
  let cc = c + dc;
  /** @type {number[]} */
  const acc = [];
  while (rr >= 0 && rr < OV2_FLIPGRID_SIZE && cc >= 0 && cc < OV2_FLIPGRID_SIZE) {
    const idx = rr * OV2_FLIPGRID_SIZE + cc;
    const v = cellAt(cells, idx);
    if (v === null) return [];
    if (v === opp) {
      acc.push(idx);
      rr += dr;
      cc += dc;
      continue;
    }
    if (v === seat) return acc;
    return [];
  }
  return [];
}

/**
 * @param {(null|0|1)[]} cells
 * @param {number} r
 * @param {number} c
 * @param {0|1} seat
 * @returns {number[]}
 */
export function allFlipIndicesForMove(cells, r, c, seat) {
  if (seat !== 0 && seat !== 1) return [];
  if (!Number.isInteger(r) || !Number.isInteger(c)) return [];
  if (r < 0 || r >= OV2_FLIPGRID_SIZE || c < 0 || c >= OV2_FLIPGRID_SIZE) return [];
  const place = r * OV2_FLIPGRID_SIZE + c;
  if (cellAt(cells, place) !== null) return [];
  const seen = new Set();
  for (const [dr, dc] of DIRS) {
    const part = lineFlipIndices(cells, r, c, seat, dr, dc);
    for (const idx of part) seen.add(idx);
  }
  return Array.from(seen);
}

/**
 * @param {number} r
 * @param {number} c
 * @param {(null|0|1)[]} cells
 * @param {number|null} mySeat
 * @param {number|null} turnSeat
 * @param {boolean} mustRespondDouble
 */
export function flipGridCellPlayable(r, c, cells, mySeat, turnSeat, mustRespondDouble) {
  if (mustRespondDouble) return false;
  if (mySeat !== 0 && mySeat !== 1) return false;
  if (turnSeat !== 0 && turnSeat !== 1) return false;
  if (mySeat !== turnSeat) return false;
  return allFlipIndicesForMove(cells, r, c, /** @type {0|1} */ (mySeat)).length > 0;
}
