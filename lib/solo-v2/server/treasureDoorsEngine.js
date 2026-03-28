import { randomInt } from "crypto";
import {
  TREASURE_DOORS_CHAMBER_COUNT,
  TREASURE_DOORS_DOOR_COUNT,
  TREASURE_DOORS_MULTIPLIER_LADDER,
  payoutForMultiplier,
} from "../treasureDoorsConfig";

export function generateTrapDoors() {
  const doors = [];
  for (let c = 0; c < TREASURE_DOORS_CHAMBER_COUNT; c += 1) {
    doors.push(randomInt(0, TREASURE_DOORS_DOOR_COUNT));
  }
  return doors;
}

export function isTrapAtChamber(trapDoors, chamberIndex, door) {
  const ch = Math.floor(Number(chamberIndex));
  const d = Math.floor(Number(door));
  if (!Number.isFinite(ch) || ch < 0 || ch >= TREASURE_DOORS_CHAMBER_COUNT) return null;
  if (!Number.isFinite(d) || d < 0 || d >= TREASURE_DOORS_DOOR_COUNT) return null;
  const arr = Array.isArray(trapDoors) ? trapDoors : [];
  const t = arr[ch];
  if (!Number.isFinite(Number(t))) return null;
  return Number(t) === d;
}

export function buildInitialActiveSummary(trapDoors) {
  return {
    phase: "treasure_doors_active",
    chamberCount: TREASURE_DOORS_CHAMBER_COUNT,
    doorCount: TREASURE_DOORS_DOOR_COUNT,
    trapDoors: [...trapDoors],
    currentChamberIndex: 0,
    clearedChambers: [],
    doorHistory: [],
    lastProcessedPickEventId: 0,
    lastTurn: null,
  };
}

export function computePlayingNumbers(entryCost, currentChamberIndex, clearedChambersLength) {
  const chamber = Math.max(0, Math.floor(Number(currentChamberIndex) || 0));
  const cleared = Math.max(0, Math.floor(Number(clearedChambersLength) || 0));

  let currentMultiplier = 1;
  if (cleared > 0) {
    const m = TREASURE_DOORS_MULTIPLIER_LADDER[cleared - 1];
    if (Number.isFinite(m)) currentMultiplier = m;
  }

  let nextMultiplier = null;
  if (chamber < TREASURE_DOORS_CHAMBER_COUNT) {
    nextMultiplier = TREASURE_DOORS_MULTIPLIER_LADDER[chamber];
  }

  const currentPayout = payoutForMultiplier(entryCost, currentMultiplier);
  const nextPayout =
    nextMultiplier != null ? payoutForMultiplier(entryCost, nextMultiplier) : currentPayout;

  return {
    currentMultiplier,
    nextMultiplier,
    currentPayout,
    nextPayout,
  };
}
