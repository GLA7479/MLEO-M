import { QUICK_FLIP_CONFIG, QUICK_FLIP_MIN_WAGER } from "./quickFlipConfig";

export const SURGE_CASHOUT_MIN_WAGER = QUICK_FLIP_MIN_WAGER;

/** Multiplier gain per second while the round is live (server + client display). */
export const SURGE_CASHOUT_RISE_PER_SECOND = 0.12;

/** Crash point sampled in hundredths (e.g. 150 = 1.50x). */
export const SURGE_CASHOUT_CRASH_MIN_HUNDREDTHS = 105;
export const SURGE_CASHOUT_CRASH_MAX_HUNDREDTHS = 1200;

export function payoutForSurgeCashout(entryCost, multiplier) {
  const entry = Math.max(SURGE_CASHOUT_MIN_WAGER, Math.floor(Number(entryCost) || 0));
  const m = Number(multiplier);
  if (!Number.isFinite(m) || m < 1) return 0;
  return Math.max(0, Math.floor(entry * m));
}

/**
 * @param {{ terminalKind: "cashout" | "bust"; payoutReturn: number; entryCost: number; fundingSource?: "vault" | "gift" }} args
 */
export function buildSurgeCashoutSettlementSummary({
  terminalKind,
  payoutReturn,
  entryCost,
  fundingSource = "vault",
}) {
  const entry = Math.max(SURGE_CASHOUT_MIN_WAGER, Math.floor(Number(entryCost) || 0));
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
    isWin: terminalKind !== "bust" && payout > 0,
    settlementType: "client_shared_vault",
    fundingSource,
    terminalKind,
    gameKind: "surge_cashout",
  };
}
