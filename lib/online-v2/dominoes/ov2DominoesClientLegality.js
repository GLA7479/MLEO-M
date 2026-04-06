/**
 * Client-side dominoes helpers (mirror server rules for UX hints only).
 */

/**
 * @param {unknown} t
 * @returns {{ a: number, b: number } | null}
 */
export function parseDominoTile(t) {
  if (!t || typeof t !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (t);
  const a = Math.floor(Number(o.a));
  const b = Math.floor(Number(o.b));
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || a > 6 || b < 0 || b > 6) return null;
  return { a: Math.min(a, b), b: Math.max(a, b) };
}

/**
 * @param {unknown[]} line
 * @returns {{ left: number, right: number } | null}
 */
export function dominoLineOpens(line) {
  const arr = Array.isArray(line) ? line : [];
  if (arr.length === 0) return null;
  const first = arr[0];
  const last = arr[arr.length - 1];
  if (!first || typeof first !== "object" || !last || typeof last !== "object") return null;
  const L = Math.floor(Number(/** @type {Record<string, unknown>} */ (first).lo));
  const R = Math.floor(Number(/** @type {Record<string, unknown>} */ (last).hi));
  if (!Number.isFinite(L) || !Number.isFinite(R)) return null;
  return { left: L, right: R };
}

/**
 * @param {unknown[]} line
 * @param {{ a: number, b: number }} tile
 * @returns {{ left: boolean, right: boolean }}
 */
export function dominoTileAttachSides(line, tile) {
  const o = dominoLineOpens(line);
  if (!o) return { left: true, right: true };
  const { a, b } = tile;
  return {
    left: a === o.left || b === o.left,
    right: a === o.right || b === o.right,
  };
}
