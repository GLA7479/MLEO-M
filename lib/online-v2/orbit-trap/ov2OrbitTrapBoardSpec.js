/**
 * Orbit Trap — locked MVP board topology (OV2).
 * Slot index 0..7 clockwise per ring; O1/M1/I1 = index 0 … O8/M8/I8 = index 7.
 */

/** @typedef {"outer"|"mid"|"inner"|"core"} Ov2OrbitTrapRingId */

export const OV2_ORBIT_TRAP_RING_SLOTS = 8;

/** @type {readonly Ov2OrbitTrapRingId[]} */
export const OV2_ORBIT_TRAP_ROTATABLE_RINGS = Object.freeze(["outer", "mid", "inner"]);

/** Outer↔Mid gates: same slot index on both rings. */
export const OV2_ORBIT_TRAP_GATES_OUTER_MID = Object.freeze([
  [1, 1],
  [4, 4],
  [6, 6],
]);

/** Mid↔Inner gates */
export const OV2_ORBIT_TRAP_GATES_MID_INNER = Object.freeze([
  [0, 0],
  [3, 3],
  [5, 5],
]);

/** Trap cells: [ring, slot] */
export const OV2_ORBIT_TRAP_TRAPS = Object.freeze([
  ["outer", 3],
  ["mid", 7],
]);

/** Boost cells */
export const OV2_ORBIT_TRAP_BOOSTS = Object.freeze([
  ["outer", 7],
  ["inner", 2],
]);

/** Lock-slot cells (gain 1 lock token, max 1 held) */
export const OV2_ORBIT_TRAP_LOCK_SLOTS = Object.freeze([
  ["mid", 1],
  ["inner", 4],
]);

/** Seat 0..3 start positions on outer ring */
export const OV2_ORBIT_TRAP_START_OUTER_SLOTS = Object.freeze([0, 2, 4, 6]);

/** Initial fixed orb positions [ring, slot] */
export const OV2_ORBIT_TRAP_INITIAL_FIXED_ORBS = Object.freeze([
  ["outer", 5],
  ["mid", 2],
  ["inner", 6],
]);

/**
 * @param {string} ring
 * @param {number} slot
 */
export function ov2OrbitTrapCellKey(ring, slot) {
  return `${ring}:${slot}`;
}

/**
 * @param {readonly (readonly [string, number])[]} cells
 * @returns {Set<string>}
 */
export function ov2OrbitTrapCellSet(cells) {
  const s = new Set();
  for (const [r, sl] of cells) s.add(ov2OrbitTrapCellKey(r, sl));
  return s;
}
