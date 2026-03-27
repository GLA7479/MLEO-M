import {
  QUICK_FLIP_CONFIG,
  QUICK_FLIP_MIN_WAGER,
  QUICK_FLIP_WIN_MULTIPLIER,
} from "./quickFlipConfig";

export const DICE_PICK_MIN_WAGER = QUICK_FLIP_MIN_WAGER;
export const DICE_PICK_WIN_MULTIPLIER = QUICK_FLIP_WIN_MULTIPLIER;

/**
 * @param {{ zone?: string | null; roll?: number | null; isWin: boolean; entryCost?: number; fundingSource?: "vault" | "gift" }} args
 */
export function buildDicePickSettlementSummary({
  zone,
  roll,
  isWin,
  entryCost: entryCostArg,
  fundingSource = "vault",
}) {
  const raw = entryCostArg != null ? Number(entryCostArg) : QUICK_FLIP_CONFIG.entryCost;
  const safe = Number.isFinite(raw) ? raw : QUICK_FLIP_CONFIG.entryCost;
  const entryCost = Math.max(DICE_PICK_MIN_WAGER, Math.floor(safe));

  const payoutReturn = isWin ? Math.floor(entryCost * DICE_PICK_WIN_MULTIPLIER) : QUICK_FLIP_CONFIG.lossReturn;
  const isGift = fundingSource === "gift";
  const netDelta = isGift ? (isWin ? payoutReturn : 0) : payoutReturn - entryCost;

  return {
    entryCost,
    winReturn: payoutReturn,
    lossReturn: QUICK_FLIP_CONFIG.lossReturn,
    impliedRtpPercent: QUICK_FLIP_CONFIG.impliedRtpPercent,
    payoutReturn,
    netDelta,
    zone: zone || null,
    roll: roll != null ? Number(roll) : null,
    isWin: Boolean(isWin),
    settlementType: "client_shared_vault",
    fundingSource,
  };
}
