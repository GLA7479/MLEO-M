import { QUICK_FLIP_CONFIG, QUICK_FLIP_MIN_WAGER } from "./quickFlipConfig";

export const CHALLENGE_21_MIN_WAGER = QUICK_FLIP_MIN_WAGER;

/**
 * @param {"win" | "lose" | "push"} outcome
 * @param {number} entryCost
 * @returns {number} gross return to player (0 on loss, entry on push, 2×entry on win)
 */
export function challenge21PayoutReturn(outcome, entryCost) {
  const entry = Math.max(CHALLENGE_21_MIN_WAGER, Math.floor(Number(entryCost) || 0));
  if (outcome === "win") return entry * 2;
  if (outcome === "push") return entry;
  return 0;
}

/**
 * @param {{ outcome: "win" | "lose" | "push"; payoutReturn: number; entryCost: number; fundingSource?: "vault" | "gift" }} args
 */
export function buildChallenge21SettlementSummary({
  outcome,
  payoutReturn,
  entryCost,
  fundingSource = "vault",
}) {
  const entry = Math.max(CHALLENGE_21_MIN_WAGER, Math.floor(Number(entryCost) || 0));
  const payout = Math.max(0, Math.floor(Number(payoutReturn) || 0));
  const isGift = fundingSource === "gift";
  const netDelta = isGift ? payout : payout - entry;
  const terminalKind =
    outcome === "lose" ? "overload" : outcome === "push" ? "cashout" : "full_clear";
  return {
    entryCost: entry,
    winReturn: payout,
    lossReturn: QUICK_FLIP_CONFIG.lossReturn,
    impliedRtpPercent: QUICK_FLIP_CONFIG.impliedRtpPercent,
    payoutReturn: payout,
    netDelta,
    isWin: outcome === "win",
    isPush: outcome === "push",
    settlementType: "client_shared_vault",
    fundingSource,
    terminalKind,
    gameKind: "challenge_21",
  };
}

/**
 * @param {unknown} raw
 * @returns {string | null} Normalized decision or null.
 */
export function normalizeChallenge21Decision(raw) {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  if (s === "draw" || s === "hit") return "hit";
  if (s === "hold" || s === "stand") return "stand";
  if (s === "double" || s === "double_down") return "double";
  if (s === "split") return "split";
  if (s === "insurance" || s === "insurance_accept" || s === "insurance_yes") return "insurance_accept";
  if (s === "insurance_decline" || s === "insurance_no" || s === "no_insurance") return "insurance_decline";
  return null;
}

/**
 * Full-round settlement (split / double / insurance).
 * @param {{ totalRisked: number; totalReturn: number; payoutReturn: number; entryCost: number; fundingSource?: "vault" | "gift" }} args
 */
export function buildChallenge21SettlementSummaryFromTotals({
  totalRisked,
  totalReturn,
  payoutReturn,
  entryCost,
  fundingSource = "vault",
}) {
  const risked = Math.max(0, Math.floor(Number(totalRisked) || 0));
  const ret = Math.max(0, Math.floor(Number(totalReturn) || 0));
  const payout = Math.max(0, Math.floor(Number(payoutReturn) || ret));
  const baseEntry = Math.max(CHALLENGE_21_MIN_WAGER, Math.floor(Number(entryCost) || 0));
  const isGift = fundingSource === "gift";
  const netDelta = isGift ? ret : ret - risked;
  const outcome = netDelta > 0 ? "win" : netDelta < 0 ? "lose" : "push";
  const terminalKind =
    outcome === "lose" ? "overload" : outcome === "push" ? "cashout" : "full_clear";
  return {
    entryCost: baseEntry,
    totalRisked: risked,
    winReturn: payout,
    lossReturn: QUICK_FLIP_CONFIG.lossReturn,
    impliedRtpPercent: QUICK_FLIP_CONFIG.impliedRtpPercent,
    payoutReturn: payout,
    netDelta,
    isWin: outcome === "win",
    isPush: outcome === "push",
    settlementType: "client_shared_vault",
    fundingSource,
    terminalKind,
    gameKind: "challenge_21",
  };
}
