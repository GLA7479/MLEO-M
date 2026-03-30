import { QUICK_FLIP_CONFIG, QUICK_FLIP_MIN_WAGER } from "./quickFlipConfig";

export const SOLO_LADDER_MIN_WAGER = QUICK_FLIP_MIN_WAGER;

/** Steps to climb; final step success auto-clears the run. */
export const SOLO_LADDER_STEP_COUNT = 6;

/**
 * Per-step success probability (server draw). Tuned with multipliers for a modest house edge
 * versus greedy play-through (same implied RTP label family as Quick Flip — not a guaranteed live RTP).
 */
export const SOLO_LADDER_STEP_SUCCESS_PROB = [0.84, 0.82, 0.8, 0.78, 0.76, 0.74];

/** Multiplier on stake after each successful step (index 0 = after 1st success). */
export const SOLO_LADDER_MULTIPLIERS = [1.18, 1.42, 1.72, 2.08, 2.52, 3.05];

export function soloLadderMultiplierAfterSuccesses(successCount) {
  const n = Math.floor(Number(successCount));
  if (!Number.isFinite(n) || n < 1 || n > SOLO_LADDER_STEP_COUNT) return null;
  return SOLO_LADDER_MULTIPLIERS[n - 1];
}

export function payoutForSoloLadder(entryCost, multiplier) {
  const entry = Math.max(SOLO_LADDER_MIN_WAGER, Math.floor(Number(entryCost) || 0));
  const m = Number(multiplier);
  if (!Number.isFinite(m) || m <= 0) return 0;
  return Math.max(0, Math.floor(entry * m));
}

/**
 * @param {{ terminalKind: "bust" | "cashout" | "full_clear"; payoutReturn: number; entryCost: number; fundingSource?: "vault" | "gift" }} args
 */
export function buildSoloLadderSettlementSummary({
  terminalKind,
  payoutReturn,
  entryCost,
  fundingSource = "vault",
}) {
  const entry = Math.max(SOLO_LADDER_MIN_WAGER, Math.floor(Number(entryCost) || 0));
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
    isWin: terminalKind !== "bust" && payout > 0,
    settlementType: "client_shared_vault",
    fundingSource,
    terminalKind,
    gameKind: "solo_ladder",
  };
}
