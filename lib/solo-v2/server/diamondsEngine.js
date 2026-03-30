import { randomInt } from "crypto";
import { DIAMONDS_CELL_COUNT } from "../diamondsConfig";

/**
 * Uniform random subset of `count` distinct cell indices in [0, DIAMONDS_CELL_COUNT).
 */
export function generateDiamondBombIndices(bombCount) {
  const B = Math.floor(Number(bombCount));
  if (!Number.isFinite(B) || B < 1 || B >= DIAMONDS_CELL_COUNT) {
    throw new Error("invalid_diamonds_bomb_count");
  }
  const indices = Array.from({ length: DIAMONDS_CELL_COUNT }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1);
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const bombs = indices.slice(0, B).sort((a, b) => a - b);
  return bombs;
}

export function buildDiamondsInitialActiveSummary(bombIndices, difficulty, bombCount) {
  const sorted = [...bombIndices].map(n => Math.floor(Number(n))).sort((a, b) => a - b);
  return {
    phase: "diamonds_active",
    gridSize: 5,
    cellCount: DIAMONDS_CELL_COUNT,
    bombCount: Math.floor(Number(bombCount)),
    difficulty: String(difficulty || "medium"),
    bombIndices: sorted,
    revealedSafeIndices: [],
  };
}
