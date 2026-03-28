import { randomInt } from "crypto";
import {
  MYSTERY_CHAMBER_CHAMBER_COUNT,
  MYSTERY_CHAMBER_CLEAR_MULTIPLIERS,
  MYSTERY_CHAMBER_SIGIL_COUNT,
} from "../mysteryChamberConfig";

/**
 * @returns {number[][]} length = chamber count; chambers 0–2 are [a,b] distinct in 0..SIGIL-1; last chamber is [x].
 * Uses crypto.randomInt(min, max) with exclusive max → uniform.
 */
export function generateSafeSigilSets() {
  const sets = [];
  for (let i = 0; i < MYSTERY_CHAMBER_CHAMBER_COUNT; i += 1) {
    if (i < MYSTERY_CHAMBER_CHAMBER_COUNT - 1) {
      let a = randomInt(0, MYSTERY_CHAMBER_SIGIL_COUNT);
      let b = randomInt(0, MYSTERY_CHAMBER_SIGIL_COUNT);
      while (b === a) {
        b = randomInt(0, MYSTERY_CHAMBER_SIGIL_COUNT);
      }
      sets.push(a < b ? [a, b] : [b, a]);
    } else {
      sets.push([randomInt(0, MYSTERY_CHAMBER_SIGIL_COUNT)]);
    }
  }
  return sets;
}

function normalizeSafeSigilSetsInput(value) {
  if (!Array.isArray(value) || value.length !== MYSTERY_CHAMBER_CHAMBER_COUNT) return null;
  const out = [];
  for (let i = 0; i < MYSTERY_CHAMBER_CHAMBER_COUNT; i += 1) {
    const row = value[i];
    if (!Array.isArray(row)) return null;
    const nums = row.map(x => Math.floor(Number(x))).filter(n => Number.isFinite(n));
    if (i < MYSTERY_CHAMBER_CHAMBER_COUNT - 1) {
      if (nums.length !== 2 || nums[0] === nums[1]) return null;
      const a = nums[0];
      const b = nums[1];
      if (a < 0 || a >= MYSTERY_CHAMBER_SIGIL_COUNT || b < 0 || b >= MYSTERY_CHAMBER_SIGIL_COUNT) return null;
      out.push(a < b ? [a, b] : [b, a]);
    } else {
      if (nums.length !== 1) return null;
      const x = nums[0];
      if (x < 0 || x >= MYSTERY_CHAMBER_SIGIL_COUNT) return null;
      out.push([x]);
    }
  }
  return out;
}

/**
 * @param {number[][] | null | undefined} safeSigilSetsPrefill optional validated sets; otherwise generated.
 * @param {number} entryCost
 */
export function buildMysteryChamberInitialActiveSummary(safeSigilSetsPrefill, entryCost) {
  const entry = Math.max(0, Math.floor(Number(entryCost) || 0));
  const normalized = normalizeSafeSigilSetsInput(safeSigilSetsPrefill);
  const safeSigilSets = normalized || generateSafeSigilSets();
  return {
    phase: "mystery_chamber_active",
    mysteryChamber: true,
    chamberCount: MYSTERY_CHAMBER_CHAMBER_COUNT,
    sigilCount: MYSTERY_CHAMBER_SIGIL_COUNT,
    safeSigilSets,
    currentChamberIndex: 0,
    chambersCleared: 0,
    securedReturn: entry,
    lastProcessedPickEventId: 0,
    lastTurn: null,
    sigilHistory: [],
  };
}
