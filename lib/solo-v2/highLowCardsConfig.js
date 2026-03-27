import {
  QUICK_FLIP_MIN_WAGER,
  QUICK_FLIP_WIN_MULTIPLIER,
  buildQuickFlipSettlementSummary,
} from "./quickFlipConfig";

export const HIGH_LOW_CARDS_MIN_WAGER = QUICK_FLIP_MIN_WAGER;
export const HIGH_LOW_CARDS_WIN_MULTIPLIER = QUICK_FLIP_WIN_MULTIPLIER;

/**
 * @param {{ choice?: string | null; outcome?: string | null; isWin: boolean; entryCost?: number; fundingSource?: "vault" | "gift" }} args
 */
export function buildHighLowCardsSettlementSummary(args) {
  return buildQuickFlipSettlementSummary(args);
}
