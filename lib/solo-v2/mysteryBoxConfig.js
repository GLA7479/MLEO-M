import { QUICK_FLIP_CONFIG, QUICK_FLIP_MIN_WAGER } from "./quickFlipConfig";

/** Same min stake as Quick Flip; win rate is 1/3 so multiplier targets ~96% RTP. */
export const MYSTERY_BOX_MIN_WAGER = QUICK_FLIP_MIN_WAGER;
export const MYSTERY_BOX_WIN_MULTIPLIER = 2.88;
export const MYSTERY_BOX_IMPLIED_RTP_PERCENT = 96;

/**
 * @param {{ choice?: number | string | null; outcome?: number | string | null; isWin: boolean; entryCost?: number; fundingSource?: "vault" | "gift" }} args
 */
export function buildMysteryBoxSettlementSummary({
  choice,
  outcome,
  isWin,
  entryCost: entryCostArg,
  fundingSource = "vault",
}) {
  const raw = entryCostArg != null ? Number(entryCostArg) : QUICK_FLIP_CONFIG.entryCost;
  const safe = Number.isFinite(raw) ? raw : QUICK_FLIP_CONFIG.entryCost;
  const entryCost = Math.max(MYSTERY_BOX_MIN_WAGER, Math.floor(safe));

  const payoutReturn = isWin ? Math.floor(entryCost * MYSTERY_BOX_WIN_MULTIPLIER) : QUICK_FLIP_CONFIG.lossReturn;
  const isGift = fundingSource === "gift";
  const netDelta = isGift ? (isWin ? payoutReturn : 0) : payoutReturn - entryCost;

  return {
    entryCost,
    winReturn: payoutReturn,
    lossReturn: QUICK_FLIP_CONFIG.lossReturn,
    impliedRtpPercent: MYSTERY_BOX_IMPLIED_RTP_PERCENT,
    payoutReturn,
    netDelta,
    choice: choice != null ? Number(choice) : null,
    outcome: outcome != null ? Number(outcome) : null,
    isWin: Boolean(isWin),
    settlementType: "client_shared_vault",
    fundingSource,
  };
}
