import { QUICK_FLIP_CONFIG, QUICK_FLIP_MIN_WAGER } from "./quickFlipConfig";

export const CRYSTAL_PATH_MIN_WAGER = QUICK_FLIP_MIN_WAGER;

/** Multiplier after safely clearing row index 0..5 (six rows) — Gold Rush ladder scale. */
export const CRYSTAL_PATH_MULTIPLIER_LADDER = [1.42, 2.14, 3.21, 4.82, 7.24, 10.86];

export const CRYSTAL_PATH_ROW_COUNT = 6;
export const CRYSTAL_PATH_TILE_COUNT = 3;

export function payoutForMultiplier(entryCost, multiplier) {
  const entry = Math.max(CRYSTAL_PATH_MIN_WAGER, Math.floor(Number(entryCost) || 0));
  const m = Number(multiplier);
  if (!Number.isFinite(m) || m <= 0) return 0;
  return Math.max(0, Math.floor(entry * m));
}

/**
 * @param {{ terminalKind: "bomb" | "cashout" | "full_clear"; payoutReturn: number; entryCost: number; fundingSource?: "vault" | "gift" }} args
 */
export function buildCrystalPathSettlementSummary({
  terminalKind,
  payoutReturn,
  entryCost,
  fundingSource = "vault",
}) {
  const entry = Math.max(CRYSTAL_PATH_MIN_WAGER, Math.floor(Number(entryCost) || 0));
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
    isWin: terminalKind !== "bomb" && payout > 0,
    settlementType: "client_shared_vault",
    fundingSource,
    terminalKind,
    gameKind: "crystal_path",
  };
}
