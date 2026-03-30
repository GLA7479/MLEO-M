import { randomInt } from "crypto";
import {
  CRYSTAL_PATH_MULTIPLIER_LADDER,
  CRYSTAL_PATH_ROW_COUNT,
  CRYSTAL_PATH_TILE_COUNT,
  payoutForMultiplier,
} from "../crystalPathConfig";

/** One safe tile index per row (0..2), server-sealed. */
export function generateSafeColumns() {
  const cols = [];
  for (let r = 0; r < CRYSTAL_PATH_ROW_COUNT; r += 1) {
    cols.push(randomInt(0, CRYSTAL_PATH_TILE_COUNT));
  }
  return cols;
}

export function isPickSafe(safeColumns, rowIndex, column) {
  const row = Math.floor(Number(rowIndex));
  const col = Math.floor(Number(column));
  if (!Number.isFinite(row) || row < 0 || row >= CRYSTAL_PATH_ROW_COUNT) return null;
  if (!Number.isFinite(col) || col < 0 || col >= CRYSTAL_PATH_TILE_COUNT) return null;
  const arr = Array.isArray(safeColumns) ? safeColumns : [];
  const safe = arr[row];
  if (!Number.isFinite(Number(safe))) return null;
  return Number(safe) === col;
}

export function buildInitialActiveSummary(safeColumns) {
  return {
    phase: "crystal_path_active",
    rowCount: CRYSTAL_PATH_ROW_COUNT,
    columnCount: CRYSTAL_PATH_TILE_COUNT,
    safeColumns: [...safeColumns],
    currentRowIndex: 0,
    clearedRows: [],
    digHistory: [],
    lastProcessedPickEventId: 0,
    lastTurn: null,
  };
}

export function computePlayingNumbers(entryCost, currentRowIndex, clearedRowsLength) {
  const row = Math.max(0, Math.floor(Number(currentRowIndex) || 0));
  const cleared = Math.max(0, Math.floor(Number(clearedRowsLength) || 0));

  let currentMultiplier = 1;
  if (cleared > 0) {
    const m = CRYSTAL_PATH_MULTIPLIER_LADDER[cleared - 1];
    if (Number.isFinite(m)) currentMultiplier = m;
  }

  let nextMultiplier = null;
  if (row < CRYSTAL_PATH_ROW_COUNT) {
    nextMultiplier = CRYSTAL_PATH_MULTIPLIER_LADDER[row];
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
