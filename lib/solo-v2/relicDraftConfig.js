import { QUICK_FLIP_CONFIG, QUICK_FLIP_MIN_WAGER } from "./quickFlipConfig";

export const RELIC_DRAFT_MIN_WAGER = QUICK_FLIP_MIN_WAGER;

/** Base win multiplier before relic % bonus. */
export const RELIC_DRAFT_BASE_WIN_MULT = 1.74;

/**
 * @param {number} entryCost
 * @param {number} payoutPercentBonus — sum of relic modifiers (e.g. +18 / −8)
 */
export function payoutForRelicDraftWin(entryCost, payoutPercentBonus = 0) {
  const entry = Math.max(RELIC_DRAFT_MIN_WAGER, Math.floor(Number(entryCost) || 0));
  const bonus = Math.max(-35, Math.min(45, Math.floor(Number(payoutPercentBonus) || 0)));
  const mult = RELIC_DRAFT_BASE_WIN_MULT * ((100 + bonus) / 100);
  return Math.max(0, Math.floor(entry * mult));
}

/**
 * @param {{ terminalKind: "win" | "lose"; payoutReturn: number; entryCost: number; fundingSource?: "vault" | "gift" }} args
 */
export function buildRelicDraftSettlementSummary({
  terminalKind,
  payoutReturn,
  entryCost,
  fundingSource = "vault",
}) {
  const entry = Math.max(RELIC_DRAFT_MIN_WAGER, Math.floor(Number(entryCost) || 0));
  const payout = Math.max(0, Math.floor(Number(payoutReturn) || 0));
  const isGift = fundingSource === "gift";
  const netDelta = isGift ? payout : payout - entry;
  const bust = terminalKind === "lose";
  return {
    entryCost: entry,
    winReturn: payout,
    lossReturn: QUICK_FLIP_CONFIG.lossReturn,
    impliedRtpPercent: QUICK_FLIP_CONFIG.impliedRtpPercent,
    payoutReturn: payout,
    netDelta,
    isWin: !bust && payout > 0,
    settlementType: "client_shared_vault",
    fundingSource,
    terminalKind: bust ? "bust" : "cashout",
    gameKind: "relic_draft",
  };
}
