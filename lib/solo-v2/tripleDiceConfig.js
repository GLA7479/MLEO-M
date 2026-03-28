import { QUICK_FLIP_CONFIG, QUICK_FLIP_MIN_WAGER } from "./quickFlipConfig";

export const TRIPLE_DICE_MIN_WAGER = QUICK_FLIP_MIN_WAGER;

/** Same house-edge scale as Limit Run limbo for payout shaping. */
export const TRIPLE_DICE_HOUSE_EDGE = 0.04;

export const TRIPLE_DICE_MIN_TOTAL = 3;
export const TRIPLE_DICE_MAX_TOTAL = 18;

/** Ways to roll each sum with three fair six-sided dice (denominator 216). */
export const TRIPLE_DICE_WAYS_BY_TOTAL = Object.freeze({
  3: 1,
  4: 3,
  5: 6,
  6: 10,
  7: 15,
  8: 21,
  9: 25,
  10: 27,
  11: 27,
  12: 25,
  13: 21,
  14: 15,
  15: 10,
  16: 6,
  17: 3,
  18: 1,
});

/**
 * @param {unknown} raw
 * @returns {number | null}
 */
export function normalizeTripleDiceTargetTotal(raw) {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return null;
  if (n < TRIPLE_DICE_MIN_TOTAL || n > TRIPLE_DICE_MAX_TOTAL) return null;
  return n;
}

export function tripleDiceWaysForTotal(total) {
  const t = Math.floor(Number(total));
  if (!Number.isFinite(t)) return null;
  const w = TRIPLE_DICE_WAYS_BY_TOTAL[t];
  return typeof w === "number" ? w : null;
}

/** Empirical hit rate for display (before house edge). */
export function tripleDiceWinChancePercent(targetTotal) {
  const ways = tripleDiceWaysForTotal(targetTotal);
  if (ways == null) return 0;
  return (ways / 216) * 100;
}

export function tripleDiceProjectedPayout(entryCost, targetTotal) {
  const entry = Math.max(TRIPLE_DICE_MIN_WAGER, Math.floor(Number(entryCost) || 0));
  const ways = tripleDiceWaysForTotal(targetTotal);
  if (ways == null || ways <= 0) return 0;
  const edge = Math.min(0.49, Math.max(0, TRIPLE_DICE_HOUSE_EDGE));
  const mult = (216 / ways) * (1 - edge);
  if (!Number.isFinite(mult) || mult <= 0) return 0;
  return Math.max(0, Math.floor(entry * mult));
}

/**
 * @param {{ terminalKind: "overload" | "cashout" | "full_clear"; payoutReturn: number; entryCost: number; fundingSource?: "vault" | "gift" }} args
 */
export function buildTripleDiceSettlementSummary({
  terminalKind,
  payoutReturn,
  entryCost,
  fundingSource = "vault",
}) {
  const entry = Math.max(TRIPLE_DICE_MIN_WAGER, Math.floor(Number(entryCost) || 0));
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
    gameKind: "triple_dice",
  };
}
