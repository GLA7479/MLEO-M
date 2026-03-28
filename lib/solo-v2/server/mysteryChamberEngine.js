import { randomInt } from "crypto";
import {
  MYSTERY_CHAMBER_CHAMBER_COUNT,
  MYSTERY_CHAMBER_CLEAR_MULTIPLIERS,
  MYSTERY_CHAMBER_SIGIL_COUNT,
} from "../mysteryChamberConfig";

/** @returns {number[]} length = chamber count, values 0..sigilCount-1 */
export function generateSafeSigils() {
  const arr = [];
  for (let i = 0; i < MYSTERY_CHAMBER_CHAMBER_COUNT; i += 1) {
    arr.push(randomInt(0, MYSTERY_CHAMBER_SIGIL_COUNT));
  }
  return arr;
}

export function buildMysteryChamberInitialActiveSummary(safeSigils, entryCost) {
  const entry = Math.max(0, Math.floor(Number(entryCost) || 0));
  let sigils = Array.isArray(safeSigils) ? safeSigils.map(s => Math.floor(Number(s))) : generateSafeSigils();
  if (sigils.length !== MYSTERY_CHAMBER_CHAMBER_COUNT) {
    sigils = generateSafeSigils();
  }
  return {
    phase: "mystery_chamber_active",
    mysteryChamber: true,
    chamberCount: MYSTERY_CHAMBER_CHAMBER_COUNT,
    sigilCount: MYSTERY_CHAMBER_SIGIL_COUNT,
    safeSigils: sigils,
    currentChamberIndex: 0,
    chambersCleared: 0,
    securedReturn: entry,
    lastProcessedPickEventId: 0,
    lastTurn: null,
    sigilHistory: [],
  };
}
