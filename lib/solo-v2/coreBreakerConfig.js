import { QUICK_FLIP_CONFIG, QUICK_FLIP_MIN_WAGER } from "./quickFlipConfig";

export const CORE_BREAKER_MIN_WAGER = QUICK_FLIP_MIN_WAGER;
/** Strikes required to clear the core (win). */
export const CORE_BREAKER_STRIKE_STEPS = 5;
/** Basis points: payout = floor(entry * multBps / 10000). Starts at 10000 (= 1.0×). */
export const CORE_BREAKER_MULT_BPS_START = 10000;
/** Safe strike multiplier (22% bump). */
export const CORE_BREAKER_SAFE_MULT_NUM = 122;
export const CORE_BREAKER_SAFE_MULT_DEN = 100;
/** Gem strike multiplier (38% bump). */
export const CORE_BREAKER_GEM_MULT_NUM = 138;
export const CORE_BREAKER_GEM_MULT_DEN = 100;

/**
 * @param {unknown} raw
 * @returns {number | null} column 0..2
 */
export function normalizeCoreBreakerColumn(raw) {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > 2) return null;
  return n;
}

export function coreBreakerMaxPayout(entryCost) {
  const entry = Math.max(CORE_BREAKER_MIN_WAGER, Math.floor(Number(entryCost) || 0));
  let m = CORE_BREAKER_MULT_BPS_START;
  for (let i = 0; i < CORE_BREAKER_STRIKE_STEPS; i += 1) {
    m = Math.floor((m * CORE_BREAKER_GEM_MULT_NUM) / CORE_BREAKER_GEM_MULT_DEN);
  }
  return Math.max(0, Math.floor((entry * m) / 10000));
}

/**
 * @param {{ terminalKind: "overload" | "full_clear"; payoutReturn: number; entryCost: number; fundingSource?: "vault" | "gift" }} args
 */
export function buildCoreBreakerSettlementSummary({
  terminalKind,
  payoutReturn,
  entryCost,
  fundingSource = "vault",
}) {
  const entry = Math.max(CORE_BREAKER_MIN_WAGER, Math.floor(Number(entryCost) || 0));
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
    isWin: terminalKind === "full_clear" && payout > 0,
    settlementType: "client_shared_vault",
    fundingSource,
    terminalKind,
    gameKind: "core_breaker",
  };
}
