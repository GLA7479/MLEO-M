/**
 * Tile Rush Duel — board helpers (must match server `ov2_trd_*` rules).
 */

export const TRD_ROWS = 6;
export const TRD_COLS = 4;

/**
 * @param {{ r: number, c: number, removed?: boolean }[]} tiles
 */
export function trdCellOccupied(tiles, r, c) {
  const rr = Math.floor(Number(r));
  const cc = Math.floor(Number(c));
  return tiles.some(t => t && !t.removed && Math.floor(Number(t.r)) === rr && Math.floor(Number(t.c)) === cc);
}

/**
 * @param {{ r: number, c: number, removed?: boolean }[]} tiles
 */
export function trdTileFreeAt(tiles, cols, r, c) {
  const cc = Math.floor(Number(cols));
  const rr = Math.floor(Number(r));
  const ci = Math.floor(Number(c));
  if (!trdCellOccupied(tiles, rr, ci)) return false;
  const leftOpen = ci === 0 || !trdCellOccupied(tiles, rr, ci - 1);
  const rightOpen = ci === cc - 1 || !trdCellOccupied(tiles, rr, ci + 1);
  return leftOpen || rightOpen;
}

/**
 * Seat 1 sees columns mirrored; RPCs use canonical (seat 0) coordinates.
 * @param {number} mySeat
 * @param {number} cols
 */
export function trdUiToCanonical(r, c, mySeat, cols) {
  const cc = Math.floor(Number(cols));
  if (mySeat === 1) return { r: Math.floor(Number(r)), c: cc - 1 - Math.floor(Number(c)) };
  return { r: Math.floor(Number(r)), c: Math.floor(Number(c)) };
}

/** Palette for tile kinds (0..11) — abstract glyphs, not brands. */
export const TRD_KIND_SWATCH = [
  "bg-rose-600/90 border-rose-400/40",
  "bg-amber-500/90 border-amber-300/40",
  "bg-emerald-600/90 border-emerald-400/40",
  "bg-sky-600/90 border-sky-400/40",
  "bg-violet-600/90 border-violet-400/40",
  "bg-fuchsia-600/90 border-fuchsia-400/40",
  "bg-lime-600/90 border-lime-400/40",
  "bg-cyan-600/90 border-cyan-400/40",
  "bg-orange-600/90 border-orange-400/40",
  "bg-teal-600/90 border-teal-400/40",
  "bg-indigo-600/90 border-indigo-400/40",
  "bg-pink-600/90 border-pink-400/40",
];
