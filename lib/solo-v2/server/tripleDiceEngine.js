import { randomInt } from "crypto";
import { normalizeTripleDiceZone, tripleDiceIsTripleRoll } from "../tripleDiceConfig";

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

/**
 * Player wins if: TRIPLE pick → three matching faces; else total falls in chosen band.
 * @param {import("../tripleDiceConfig").TripleDiceZone | string} zone
 * @param {number[]} dice
 * @param {number} rolledTotal
 */
export function tripleDiceRollWins(zone, dice, rolledTotal) {
  const z = normalizeTripleDiceZone(zone);
  if (!z) return false;
  if (z === "triple") return tripleDiceIsTripleRoll(dice);
  const t = Math.floor(Number(rolledTotal));
  if (!Number.isFinite(t)) return false;
  if (z === "low") return t >= 3 && t <= 8;
  if (z === "mid") return t >= 9 && t <= 11;
  if (z === "high") return t >= 12 && t <= 18;
  return false;
}
