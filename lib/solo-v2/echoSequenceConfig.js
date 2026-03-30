import { QUICK_FLIP_CONFIG, QUICK_FLIP_MIN_WAGER } from "./quickFlipConfig";

export const ECHO_SEQUENCE_MIN_WAGER = QUICK_FLIP_MIN_WAGER;
export const ECHO_SEQUENCE_TOTAL_ROUNDS = 5;
export const ECHO_SEQUENCE_OPTION_COUNT = 4;
export const ECHO_SEQUENCE_SYMBOLS = ["red", "blue", "green", "gold", "violet"];
export const ECHO_SEQUENCE_MULTIPLIER_LADDER = [1.22, 1.58, 2.02, 2.72, 3.68];

export function multiplierAfterRound(roundIndex) {
  const i = Math.floor(Number(roundIndex));
  if (!Number.isFinite(i) || i < 0 || i >= ECHO_SEQUENCE_MULTIPLIER_LADDER.length) return null;
  return ECHO_SEQUENCE_MULTIPLIER_LADDER[i];
}

export function payoutForMultiplier(entryCost, multiplier) {
  const entry = Math.max(ECHO_SEQUENCE_MIN_WAGER, Math.floor(Number(entryCost) || 0));
  const m = Number(multiplier);
  if (!Number.isFinite(m) || m <= 0) return 0;
  return Math.max(0, Math.floor(entry * m));
}

/**
 * @param {{ terminalKind: "wrong"|"cashout"|"full_clear"; payoutReturn: number; entryCost: number; fundingSource?: "vault"|"gift"}} args
 */
export function buildEchoSequenceSettlementSummary({
  terminalKind,
  payoutReturn,
  entryCost,
  fundingSource = "vault",
}) {
  const entry = Math.max(ECHO_SEQUENCE_MIN_WAGER, Math.floor(Number(entryCost) || 0));
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
    isWin: terminalKind !== "wrong" && payout > 0,
    settlementType: "client_shared_vault",
    fundingSource,
    terminalKind,
    gameKind: "echo_sequence",
  };
}
