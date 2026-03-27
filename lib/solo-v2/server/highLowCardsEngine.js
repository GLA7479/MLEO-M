import { randomInt } from "crypto";

/** Matches legacy mleo-hilo.js: Ace high. */
export const HIGH_LOW_CARD_VALUES = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

export const HIGH_LOW_CARD_RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
export const HIGH_LOW_CARD_SUITS = ["♠", "♥", "♦", "♣"];

/** Per legacy: 1 + streak * 0.206 (streak = successful guesses so far). */
export const HIGH_LOW_STREAK_MULT_STEP = 0.206;

export function multiplierFromStreak(streak) {
  const s = Math.max(0, Math.floor(Number(streak) || 0));
  return 1 + s * HIGH_LOW_STREAK_MULT_STEP;
}

export function payoutFromEntryAndStreak(entryAmount, streak) {
  const entry = Math.max(0, Math.floor(Number(entryAmount) || 0));
  const mult = multiplierFromStreak(streak);
  return Math.floor(entry * mult);
}

export function drawServerCard() {
  const rank = HIGH_LOW_CARD_RANKS[randomInt(0, HIGH_LOW_CARD_RANKS.length)];
  const suit = HIGH_LOW_CARD_SUITS[randomInt(0, HIGH_LOW_CARD_SUITS.length)];
  return {
    rank,
    suit,
    value: HIGH_LOW_CARD_VALUES[rank],
  };
}

/**
 * @param {"high"|"low"} guess
 * @param {number} currentValue
 * @param {number} nextValue
 * @returns {boolean}
 */
export function isGuessCorrect(guess, currentValue, nextValue) {
  if (nextValue > currentValue) return guess === "high";
  if (nextValue < currentValue) return guess === "low";
  return false;
}

export function buildActiveSummaryPatch(card) {
  return {
    phase: "high_low_cards_active",
    currentValue: card.value,
    currentRank: card.rank,
    currentSuit: card.suit,
    streak: 0,
    lastProcessedGuessEventId: 0,
    lastTurn: null,
  };
}
