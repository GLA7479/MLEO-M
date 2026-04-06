/**
 * FourLine client hints (7×6, row 0 top). Server is authoritative.
 */

export const OV2_FOURLINE_ROWS = 6;
export const OV2_FOURLINE_COLS = 7;
export const OV2_FOURLINE_CELLS = 42;

/**
 * @param {unknown} raw
 * @returns {(null|0|1)[]}
 */
export function parseFourLineCells(raw) {
  const a = Array.isArray(raw) ? raw : [];
  /** @type {(null|0|1)[]} */
  const out = Array(OV2_FOURLINE_CELLS).fill(null);
  for (let i = 0; i < OV2_FOURLINE_CELLS; i++) {
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
 * @param {number} col 0–6
 * @param {(null|0|1)[]} cells
 */
export function fourLineColumnPlayable(col, cells) {
  if (!Number.isInteger(col) || col < 0 || col > OV2_FOURLINE_COLS - 1) return false;
  const topIdx = col;
  return cells[topIdx] === null;
}

/**
 * @param {(null|0|1)[]} cells
 * @param {number} col
 */
export function fourLineLandingRow(col, cells) {
  if (!fourLineColumnPlayable(col, cells)) return null;
  for (let r = OV2_FOURLINE_ROWS - 1; r >= 0; r--) {
    const idx = r * OV2_FOURLINE_COLS + col;
    if (cells[idx] === null) return r;
  }
  return null;
}
