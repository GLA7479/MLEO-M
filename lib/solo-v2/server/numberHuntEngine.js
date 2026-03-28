import { randomInt } from "crypto";
import {
  NUMBER_HUNT_HIT_MULTIPLIERS,
  NUMBER_HUNT_MAX_GUESSES,
  NUMBER_HUNT_MAX_NUM,
  NUMBER_HUNT_MIN_NUM,
} from "../numberHuntConfig";

export function buildNumberHuntInitialActiveSummary() {
  const secretTarget = randomInt(NUMBER_HUNT_MIN_NUM, NUMBER_HUNT_MAX_NUM + 1);
  return {
    phase: "number_hunt_active",
    secretTarget,
    guessesUsed: 0,
    maxGuesses: NUMBER_HUNT_MAX_GUESSES,
    guessHistory: [],
    lastProcessedGuessEventId: 0,
    lowBound: NUMBER_HUNT_MIN_NUM,
    highBound: NUMBER_HUNT_MAX_NUM,
  };
}

/**
 * @param {unknown} sessionRow
 * @returns {null | {
 *   secretTarget: number,
 *   guessesUsed: number,
 *   maxGuesses: number,
 *   guessHistory: Array<{ guess: number, clue: string }>,
 *   lastProcessedGuessEventId: number,
 *   lowBound: number,
 *   highBound: number,
 * }}
 */
export function parseNumberHuntActiveSummary(sessionRow) {
  const s = sessionRow?.server_outcome_summary || {};
  if (s.phase !== "number_hunt_active") return null;
  const secretTarget = Math.floor(Number(s.secretTarget));
  if (!Number.isFinite(secretTarget)) return null;
  return {
    secretTarget,
    guessesUsed: Math.max(0, Math.floor(Number(s.guessesUsed) || 0)),
    maxGuesses: Math.max(1, Math.floor(Number(s.maxGuesses) || NUMBER_HUNT_MAX_GUESSES)),
    guessHistory: Array.isArray(s.guessHistory) ? s.guessHistory : [],
    lastProcessedGuessEventId: Math.max(0, Math.floor(Number(s.lastProcessedGuessEventId) || 0)),
    lowBound: Math.floor(Number(s.lowBound) ?? NUMBER_HUNT_MIN_NUM),
    highBound: Math.floor(Number(s.highBound) ?? NUMBER_HUNT_MAX_NUM),
  };
}

export { NUMBER_HUNT_HIT_MULTIPLIERS };
