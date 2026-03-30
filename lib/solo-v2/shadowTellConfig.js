import { QUICK_FLIP_CONFIG, QUICK_FLIP_MIN_WAGER } from "./quickFlipConfig";

export const SHADOW_TELL_MIN_WAGER = QUICK_FLIP_MIN_WAGER;

/** Total return multipliers on entry (stake-inclusive payout). */
export const SHADOW_TELL_PAYOFF = {
  weak: { challenge: 2.08, safe: 1.2, middle: 1.52 },
  balanced: { challenge: 1.15, safe: 1.38, middle: 1.28 },
  strong: { challenge: 0.42, safe: 1.45, middle: 0.9 },
};

/**
 * @param {number} entryCost
 * @param {"weak"|"balanced"|"strong"} profile
 * @param {"challenge"|"safe"|"middle"} choice
 */
export function payoutMultiplierForShadowTell(profile, choice) {
  const row = SHADOW_TELL_PAYOFF[profile];
  const mult = row?.[choice];
  if (!Number.isFinite(mult)) return 0;
  return mult;
}

/**
 * @param {{ terminalKind: "win" | "lose"; payoutReturn: number; entryCost: number; fundingSource?: "vault" | "gift" }} args
 */
export function buildShadowTellSettlementSummary({
  terminalKind,
  payoutReturn,
  entryCost,
  fundingSource = "vault",
}) {
  const entry = Math.max(SHADOW_TELL_MIN_WAGER, Math.floor(Number(entryCost) || 0));
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
    gameKind: "shadow_tell",
  };
}

/** Upper bound for HUD copy (challenge vs weak). */
export function shadowTellBestCaseReturn(entryCost) {
  const entry = Math.max(SHADOW_TELL_MIN_WAGER, Math.floor(Number(entryCost) || 0));
  return Math.max(0, Math.floor(entry * SHADOW_TELL_PAYOFF.weak.challenge));
}
