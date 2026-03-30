import { QUICK_FLIP_CONFIG, QUICK_FLIP_MIN_WAGER } from "./quickFlipConfig";

export const CORE_BALANCE_MIN_WAGER = QUICK_FLIP_MIN_WAGER;

export const CORE_BALANCE_WIN_MULTIPLIER = 1.76;

export function payoutForCoreBalanceWin(entryCost) {
  const entry = Math.max(CORE_BALANCE_MIN_WAGER, Math.floor(Number(entryCost) || 0));
  return Math.max(0, Math.floor(entry * CORE_BALANCE_WIN_MULTIPLIER));
}

/**
 * @param {{ terminalKind: "win" | "lose"; payoutReturn: number; entryCost: number; fundingSource?: "vault" | "gift" }} args
 */
export function buildCoreBalanceSettlementSummary({
  terminalKind,
  payoutReturn,
  entryCost,
  fundingSource = "vault",
}) {
  const entry = Math.max(CORE_BALANCE_MIN_WAGER, Math.floor(Number(entryCost) || 0));
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
    gameKind: "core_balance",
  };
}
