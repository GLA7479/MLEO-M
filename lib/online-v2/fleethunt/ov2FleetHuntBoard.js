/**
 * Fleet Hunt — pure board helpers (client UX; server validates).
 */

export const FH_GRID_SIZE = 10;

/** Required ship lengths (multiset). */
export const FH_SHIP_LENGTHS = Object.freeze([5, 4, 3, 3, 2]);

/**
 * @param {unknown} ships
 * @returns {{ r: number, c: number }[][]}
 */
export function fhParseShipCellsList(ships) {
  if (!Array.isArray(ships)) return [];
  /** @type {{ r: number, c: number }[][]} */
  const out = [];
  for (const sh of ships) {
    if (!sh || typeof sh !== "object" || !Array.isArray(sh.cells)) {
      out.push([]);
      continue;
    }
    const cells = [];
    for (const cell of sh.cells) {
      if (!cell || typeof cell !== "object") continue;
      const r = Math.floor(Number(cell.r));
      const c = Math.floor(Number(cell.c));
      if (Number.isInteger(r) && Number.isInteger(c)) cells.push({ r, c });
    }
    out.push(cells);
  }
  return out;
}

/**
 * @param {{ r: number, c: number }[][]} placedCells
 * @returns {number[]}
 */
export function fhRemainingLengths(placedCells) {
  const rem = [...FH_SHIP_LENGTHS];
  for (const cells of placedCells) {
    const len = cells.length;
    const idx = rem.indexOf(len);
    if (idx >= 0) rem.splice(idx, 1);
  }
  return rem;
}

/**
 * @param {Set<string>} occupiedKeys
 * @param {number} length
 * @param {number} r
 * @param {number} c
 * @param {boolean} horizontal
 * @returns {{ r: number, c: number }[] | null}
 */
export function fhTryPlaceShip(occupiedKeys, length, r, c, horizontal) {
  /** @type {{ r: number, c: number }[]} */
  const cells = [];
  for (let i = 0; i < length; i += 1) {
    const rr = horizontal ? r : r + i;
    const cc = horizontal ? c + i : c;
    if (rr < 0 || rr >= FH_GRID_SIZE || cc < 0 || cc >= FH_GRID_SIZE) return null;
    const k = `${rr},${cc}`;
    if (occupiedKeys.has(k)) return null;
    cells.push({ r: rr, c: cc });
  }
  return cells;
}

/**
 * @param {{ r: number, c: number }[][]} placed
 * @returns {Set<string>}
 */
export function fhOccupiedKeys(placed) {
  const s = new Set();
  for (const cells of placed) {
    for (const { r, c } of cells) {
      s.add(`${r},${c}`);
    }
  }
  return s;
}

/**
 * @param {unknown[]} shots
 * @param {number} r
 * @param {number} c
 * @returns {boolean}
 */
export function fhShotAt(shots, r, c) {
  if (!Array.isArray(shots)) return false;
  return shots.some(
    s => s && typeof s === "object" && Math.floor(Number(s.r)) === r && Math.floor(Number(s.c)) === c
  );
}

/**
 * @param {unknown} k
 * @returns {string}
 */
export function fhShotKindLabel(k) {
  const s = String(k || "").toLowerCase();
  if (s === "hit") return "Hit";
  if (s === "miss") return "Miss";
  if (s === "sunk") return "Sunk";
  return s || "—";
}
