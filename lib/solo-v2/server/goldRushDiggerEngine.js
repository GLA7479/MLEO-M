import { randomInt } from "crypto";
import {
  GOLD_RUSH_COLUMN_COUNT,
  GOLD_RUSH_MULTIPLIER_LADDER,
  GOLD_RUSH_ROW_COUNT,
  payoutForMultiplier,
} from "../goldRushDiggerConfig";

export function generateBombColumns() {
  const cols = [];
  for (let r = 0; r < GOLD_RUSH_ROW_COUNT; r += 1) {
    cols.push(randomInt(0, GOLD_RUSH_COLUMN_COUNT));
  }
  return cols;
}

export function isBombAtRow(bombColumns, rowIndex, column) {
  const r = Math.floor(Number(rowIndex));
  const c = Math.floor(Number(column));
  if (!Number.isFinite(r) || r < 0 || r >= GOLD_RUSH_ROW_COUNT) return null;
  if (!Number.isFinite(c) || c < 0 || c >= GOLD_RUSH_COLUMN_COUNT) return null;
  const arr = Array.isArray(bombColumns) ? bombColumns : [];
  const b = arr[r];
  if (!Number.isFinite(Number(b))) return null;
  return Number(b) === c;
}

export function buildInitialActiveSummary(bombColumns) {
  return {
    phase: "gold_rush_digger_active",
    rowCount: GOLD_RUSH_ROW_COUNT,
    columnCount: GOLD_RUSH_COLUMN_COUNT,
    bombColumns: [...bombColumns],
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
    const m = GOLD_RUSH_MULTIPLIER_LADDER[cleared - 1];
    if (Number.isFinite(m)) currentMultiplier = m;
  }

  let nextMultiplier = null;
  if (row < GOLD_RUSH_ROW_COUNT) {
    nextMultiplier = GOLD_RUSH_MULTIPLIER_LADDER[row];
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
