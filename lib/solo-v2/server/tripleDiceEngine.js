import { randomInt } from "crypto";

export function buildTripleDiceInitialActiveSummary() {
  return {
    phase: "triple_dice_active",
    tripleDice: true,
    lastProcessedRollEventId: 0,
  };
}

/** @returns {[number, number, number]} */
export function rollThreeDice() {
  return [randomInt(1, 7), randomInt(1, 7), randomInt(1, 7)];
}

export function sumDice(dice) {
  const a = Array.isArray(dice) ? dice : [];
  return a.reduce((s, v) => s + Math.floor(Number(v) || 0), 0);
}

export function tripleDiceRollWins(rolledTotal, targetTotal) {
  return Math.floor(Number(rolledTotal)) === Math.floor(Number(targetTotal));
}
