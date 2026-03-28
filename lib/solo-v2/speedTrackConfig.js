import { QUICK_FLIP_CONFIG, QUICK_FLIP_MIN_WAGER } from "./quickFlipConfig";

export const SPEED_TRACK_MIN_WAGER = QUICK_FLIP_MIN_WAGER;

/** Multiplier after safely clearing checkpoint index 0..5 (six checkpoints). */
export const SPEED_TRACK_MULTIPLIER_LADDER = [1.24, 1.62, 2.15, 2.95, 4.1, 5.9];

export const SPEED_TRACK_CHECKPOINT_COUNT = 6;
export const SPEED_TRACK_ROUTE_COUNT = 3;

/** Canonical route keys (lowercase). */
export const SPEED_TRACK_ROUTES = ["inside", "center", "outside"];

export function payoutForMultiplier(entryCost, multiplier) {
  const entry = Math.max(SPEED_TRACK_MIN_WAGER, Math.floor(Number(entryCost) || 0));
  const m = Number(multiplier);
  if (!Number.isFinite(m) || m <= 0) return 0;
  return Math.max(0, Math.floor(entry * m));
}

/**
 * @param {{ terminalKind: "blocked" | "cashout" | "full_clear"; payoutReturn: number; entryCost: number; fundingSource?: "vault" | "gift" }} args
 */
export function buildSpeedTrackSettlementSummary({
  terminalKind,
  payoutReturn,
  entryCost,
  fundingSource = "vault",
}) {
  const entry = Math.max(SPEED_TRACK_MIN_WAGER, Math.floor(Number(entryCost) || 0));
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
    isWin: terminalKind !== "blocked" && payout > 0,
    settlementType: "client_shared_vault",
    fundingSource,
    terminalKind,
    gameKind: "speed_track",
  };
}
