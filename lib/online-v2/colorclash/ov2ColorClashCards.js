/**
 * Color Clash — card labels and equality (client-only).
 */

/** @readonly */
export const OV2_CC_COLOR_NAMES = Object.freeze(["Crimson", "Ocean", "Forest", "Gold"]);

/**
 * @param {unknown} c
 * @returns {number|null}
 */
export function ccCardColorIndex(c) {
  if (!c || typeof c !== "object") return null;
  const raw = /** @type {Record<string, unknown>} */ (c).c;
  if (raw == null || raw === "") return null;
  const n = Math.floor(Number(raw));
  return Number.isInteger(n) && n >= 0 && n <= 3 ? n : null;
}

/**
 * @param {unknown} card
 * @returns {string}
 */
export function ccCardType(card) {
  if (!card || typeof card !== "object") return "";
  const t = /** @type {Record<string, unknown>} */ (card).t;
  return String(t != null ? t : "")
    .trim()
    .toLowerCase();
}

/**
 * @param {unknown} card
 * @returns {string}
 */
export function ccStableCardKey(card) {
  if (!card || typeof card !== "object") return "";
  const o = /** @type {Record<string, unknown>} */ (card);
  const keys = Object.keys(o).sort();
  const parts = keys.map(k => `${k}:${JSON.stringify(o[k])}`);
  return parts.join("|");
}

/**
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function ccCardsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  return ccStableCardKey(a) === ccStableCardKey(b);
}

/**
 * @param {unknown} raw
 * @returns {Record<string, unknown>[]}
 */
export function ccParseHandArray(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter(x => x && typeof x === "object").map(x => /** @type {Record<string, unknown>} */ ({ ...x }));
}

/**
 * @param {unknown} card
 * @returns {string}
 */
export function ccFormatCard(card) {
  const t = ccCardType(card);
  const ci = ccCardColorIndex(card);
  const col = ci != null ? OV2_CC_COLOR_NAMES[ci]?.slice(0, 1) ?? String(ci) : "";
  if (t === "n") {
    const v = /** @type {Record<string, unknown>} */ (card).v;
    const n = v != null ? Math.floor(Number(v)) : NaN;
    const num = Number.isFinite(n) ? String(n) : "?";
    return `${col}${num}`;
  }
  if (t === "s") return `${col}Skip`;
  if (t === "r") return `${col}Rev`;
  if (t === "d") return `${col}+2`;
  if (t === "w") return "Wild";
  if (t === "f") return "Wild+4";
  return "?";
}

/**
 * @param {unknown} idx
 * @returns {string}
 */
export function ccColorName(idx) {
  const n = Math.floor(Number(idx));
  if (!Number.isInteger(n) || n < 0 || n > 3) return "—";
  return OV2_CC_COLOR_NAMES[n] ?? String(n);
}
