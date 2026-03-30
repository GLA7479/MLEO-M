import { randomInt } from "crypto";
import {
  VAULT_DOORS_DOOR_COUNT,
  VAULT_DOORS_MULTIPLIER_LADDER,
  VAULT_DOORS_STAGE_COUNT,
  payoutForMultiplier,
} from "../vaultDoorsConfig";

export function generateVaultTrapLayout() {
  const traps = [];
  for (let s = 0; s < VAULT_DOORS_STAGE_COUNT; s += 1) {
    traps.push(randomInt(0, VAULT_DOORS_DOOR_COUNT));
  }
  return traps;
}

export function isTrapAtStage(trapDoors, stageIndex, door) {
  const st = Math.floor(Number(stageIndex));
  const d = Math.floor(Number(door));
  if (!Number.isFinite(st) || st < 0 || st >= VAULT_DOORS_STAGE_COUNT) return null;
  if (!Number.isFinite(d) || d < 0 || d >= VAULT_DOORS_DOOR_COUNT) return null;
  const arr = Array.isArray(trapDoors) ? trapDoors : [];
  const t = arr[st];
  if (!Number.isFinite(Number(t))) return null;
  return Number(t) === d;
}

export function buildInitialActiveSummary(trapDoors) {
  return {
    phase: "vault_doors_active",
    rowCount: VAULT_DOORS_STAGE_COUNT,
    columnCount: VAULT_DOORS_DOOR_COUNT,
    trapDoors: [...trapDoors],
    currentRowIndex: 0,
    clearedRows: [],
    digHistory: [],
    lastProcessedPickEventId: 0,
    lastTurn: null,
  };
}

export function computePlayingNumbers(entryCost, currentRowIndex, clearedRowsLength) {
  const stage = Math.max(0, Math.floor(Number(currentRowIndex) || 0));
  const cleared = Math.max(0, Math.floor(Number(clearedRowsLength) || 0));

  let currentMultiplier = 1;
  if (cleared > 0) {
    const m = VAULT_DOORS_MULTIPLIER_LADDER[cleared - 1];
    if (Number.isFinite(m)) currentMultiplier = m;
  }

  let nextMultiplier = null;
  if (stage < VAULT_DOORS_STAGE_COUNT) {
    nextMultiplier = VAULT_DOORS_MULTIPLIER_LADDER[stage];
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
