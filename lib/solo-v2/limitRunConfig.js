import { QUICK_FLIP_CONFIG, QUICK_FLIP_MIN_WAGER } from "./quickFlipConfig";

export const LIMIT_RUN_MIN_WAGER = QUICK_FLIP_MIN_WAGER;

/** House edge (e.g. 0.04 → ~96% RTP on fair limbo math). */
export const LIMIT_RUN_LIMBO_HOUSE_EDGE = 0.04;

export const LIMIT_RUN_LIMBO_MIN_TARGET = 1.01;
export const LIMIT_RUN_LIMBO_MAX_TARGET = 100;
export const LIMIT_RUN_LIMBO_MAX_RESULT = 1000;

/** Uniform denominator for crypto RNG (exclusive of 0). */
export const LIMIT_RUN_LIMBO_U_DENOM = 1_000_000_000;

export const LIMIT_RUN_TARGET_PRESETS = [1.5, 2, 5, 10, 50];

/**
 * @param {unknown} raw
 * @returns {number | null}
 */
export function normalizeLimitRunTargetMultiplier(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const clamped = Math.min(
    LIMIT_RUN_LIMBO_MAX_TARGET,
    Math.max(LIMIT_RUN_LIMBO_MIN_TARGET, n),
  );
  return Math.round(clamped * 100) / 100;
}

export function limboWinChancePercent(targetMultiplier) {
  const t = Number(targetMultiplier);
  if (!Number.isFinite(t) || t < LIMIT_RUN_LIMBO_MIN_TARGET) return 0;
  const edge = LIMIT_RUN_LIMBO_HOUSE_EDGE;
  return ((1 - edge) / t) * 100;
}

export function limboProjectedPayout(entryCost, targetMultiplier) {
  const entry = Math.max(LIMIT_RUN_MIN_WAGER, Math.floor(Number(entryCost) || 0));
  const t = Number(targetMultiplier);
  if (!Number.isFinite(t) || t < LIMIT_RUN_LIMBO_MIN_TARGET) return 0;
  return Math.max(0, Math.floor(entry * t));
}

/**
 * @param {{ terminalKind: "overload" | "cashout" | "full_clear"; payoutReturn: number; entryCost: number; fundingSource?: "vault" | "gift" }} args
 */
export function buildLimitRunSettlementSummary({
  terminalKind,
  payoutReturn,
  entryCost,
  fundingSource = "vault",
}) {
  const entry = Math.max(LIMIT_RUN_MIN_WAGER, Math.floor(Number(entryCost) || 0));
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
    gameKind: "limit_run",
  };
}
