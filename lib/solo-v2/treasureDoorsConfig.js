import { QUICK_FLIP_CONFIG, QUICK_FLIP_MIN_WAGER } from "./quickFlipConfig";

export const TREASURE_DOORS_MIN_WAGER = QUICK_FLIP_MIN_WAGER;

/** Multiplier after safely clearing chamber index 0..4 (five chambers). */
export const TREASURE_DOORS_MULTIPLIER_LADDER = [1.35, 1.95, 2.85, 4.2, 6.4];

export const TREASURE_DOORS_CHAMBER_COUNT = 5;
export const TREASURE_DOORS_DOOR_COUNT = 3;

export function payoutForMultiplier(entryCost, multiplier) {
  const entry = Math.max(TREASURE_DOORS_MIN_WAGER, Math.floor(Number(entryCost) || 0));
  const m = Number(multiplier);
  if (!Number.isFinite(m) || m <= 0) return 0;
  return Math.max(0, Math.floor(entry * m));
}

/**
 * @param {{ terminalKind: "trap" | "cashout" | "full_clear"; payoutReturn: number; entryCost: number; fundingSource?: "vault" | "gift" }} args
 */
export function buildTreasureDoorsSettlementSummary({
  terminalKind,
  payoutReturn,
  entryCost,
  fundingSource = "vault",
}) {
  const entry = Math.max(TREASURE_DOORS_MIN_WAGER, Math.floor(Number(entryCost) || 0));
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
    isWin: terminalKind !== "trap" && payout > 0,
    settlementType: "client_shared_vault",
    fundingSource,
    terminalKind,
    gameKind: "treasure_doors",
  };
}
