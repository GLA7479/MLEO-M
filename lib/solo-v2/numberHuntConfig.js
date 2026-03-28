import { QUICK_FLIP_CONFIG, QUICK_FLIP_MIN_WAGER } from "./quickFlipConfig";

export const NUMBER_HUNT_MIN_WAGER = QUICK_FLIP_MIN_WAGER;
export const NUMBER_HUNT_MIN_NUM = 1;
export const NUMBER_HUNT_MAX_NUM = 20;
export const NUMBER_HUNT_MAX_GUESSES = 3;
/** Multiplier by 1-based guess index when hit (guess 1 → index 0). */
export const NUMBER_HUNT_HIT_MULTIPLIERS = [4.5, 2.5, 1.5];

/**
 * @param {unknown} raw
 * @returns {number | null}
 */
export function normalizeNumberHuntGuess(raw) {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return null;
  if (n < NUMBER_HUNT_MIN_NUM || n > NUMBER_HUNT_MAX_NUM) return null;
  return n;
}

export function numberHuntMaxPayout(entryCost) {
  const entry = Math.max(NUMBER_HUNT_MIN_WAGER, Math.floor(Number(entryCost) || 0));
  const m = NUMBER_HUNT_HIT_MULTIPLIERS[0];
  return Math.max(0, Math.floor(entry * m));
}

/**
 * @param {{ terminalKind: "overload" | "cashout" | "full_clear"; payoutReturn: number; entryCost: number; fundingSource?: "vault" | "gift" }} args
 */
export function buildNumberHuntSettlementSummary({
  terminalKind,
  payoutReturn,
  entryCost,
  fundingSource = "vault",
}) {
  const entry = Math.max(NUMBER_HUNT_MIN_WAGER, Math.floor(Number(entryCost) || 0));
  const payout = Math.max(0, Math.floor(Number(payoutReturn) || 0));
  const isGift = fundingSource === "gift";
  const netDelta = isGift ? payout : payout - entry;
  return {
    entryCost: entry,
    winReturn: payout,
    lossReturn: QUICK_FLIP_CONFIG.lossReturn,
    impliedRtpPercent: QUICK_FLIP_CONFIG.impliedRtpPercent,
    payoutReturn: payout,
    netDelta,
    isWin: terminalKind !== "overload" && payout > 0,
    settlementType: "client_shared_vault",
    fundingSource,
    terminalKind,
    gameKind: "number_hunt",
  };
}
