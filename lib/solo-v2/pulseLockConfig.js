import { QUICK_FLIP_CONFIG, QUICK_FLIP_MIN_WAGER } from "./quickFlipConfig";

export const PULSE_LOCK_MIN_WAGER = QUICK_FLIP_MIN_WAGER;

/** Zone radii and sweep are tuned for readable play; multipliers stay in a modest Solo V2 band. */
export const PULSE_LOCK_MULTIPLIERS = {
  perfect: 1.88,
  good: 1.42,
  edge: 1.12,
  miss: 0,
};

/** Shared client/server: marker position along the bar from authoritative timestamps. */
export function markerPhase01(lockMs, roundStartMs, sweepPeriodMs) {
  const period = Math.max(1, Math.floor(Number(sweepPeriodMs) || 1));
  const elapsed = Math.max(0, Number(lockMs) - Number(roundStartMs));
  const mod = elapsed % period;
  return mod / period;
}

/**
 * @param {{ hitQuality: "perfect" | "good" | "edge" | "miss"; entryCost?: number; fundingSource?: "vault" | "gift" }} args
 */
export function buildPulseLockSettlementSummary({
  hitQuality,
  entryCost: entryCostArg,
  fundingSource = "vault",
}) {
  const raw = entryCostArg != null ? Number(entryCostArg) : QUICK_FLIP_CONFIG.entryCost;
  const safe = Number.isFinite(raw) ? raw : QUICK_FLIP_CONFIG.entryCost;
  const entryCost = Math.max(PULSE_LOCK_MIN_WAGER, Math.floor(safe));

  const q = String(hitQuality || "").toLowerCase();
  let mult = PULSE_LOCK_MULTIPLIERS.miss;
  if (q === "perfect") mult = PULSE_LOCK_MULTIPLIERS.perfect;
  else if (q === "good") mult = PULSE_LOCK_MULTIPLIERS.good;
  else if (q === "edge") mult = PULSE_LOCK_MULTIPLIERS.edge;

  const isWin = q === "perfect" || q === "good" || q === "edge";
  const payoutReturn = isWin ? Math.floor(entryCost * mult) : QUICK_FLIP_CONFIG.lossReturn;
  const isGift = fundingSource === "gift";
  const netDelta = isGift ? (isWin ? payoutReturn : 0) : payoutReturn - entryCost;

  return {
    entryCost,
    winReturn: payoutReturn,
    lossReturn: QUICK_FLIP_CONFIG.lossReturn,
    impliedRtpPercent: QUICK_FLIP_CONFIG.impliedRtpPercent,
    payoutReturn,
    netDelta,
    hitQuality: isWin ? q : "miss",
    isWin,
    settlementType: "client_shared_vault",
    fundingSource,
  };
}
