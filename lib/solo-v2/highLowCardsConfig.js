import { QUICK_FLIP_CONFIG, QUICK_FLIP_MIN_WAGER } from "./quickFlipConfig";
import { multiplierFromStreak, payoutFromEntryAndStreak } from "./server/highLowCardsEngine";

export const HIGH_LOW_CARDS_MIN_WAGER = QUICK_FLIP_MIN_WAGER;

export { multiplierFromStreak, payoutFromEntryAndStreak };

/**
 * Vault: netDelta = payoutReturn - entry (loss: -entry). Gift: lose => 0; win/cashout => payout only.
 * @param {{ payoutReturn: number; entryCost: number; fundingSource?: "vault" | "gift" }} args
 */
export function buildHighLowStreakSettlementSummary({ payoutReturn, entryCost, fundingSource = "vault" }) {
  const entry = Math.max(HIGH_LOW_CARDS_MIN_WAGER, Math.floor(Number(entryCost) || 0));
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
    isWin: payout > 0,
    settlementType: "client_shared_vault",
    fundingSource,
    gameKind: "high_low_streak",
  };
}
