import { QUICK_FLIP_CONFIG, QUICK_FLIP_MIN_WAGER } from "./quickFlipConfig";

export const DROP_RUN_MIN_WAGER = QUICK_FLIP_MIN_WAGER;
/** Landing columns across the bottom row (server + UI). */
export const DROP_RUN_GATES = 9;
/** Independent random drifts per drop — longer path for smoother visuals. */
export const DROP_RUN_DRIFT_ROWS = 14;
/** Fixed top release column (center). Path authority; not a player choice. */
export const DROP_RUN_RELEASE_COLUMN = 5;
/** pathPositions length === DROP_RUN_DRIFT_ROWS + 1 */
export const DROP_RUN_PATH_POINT_COUNT = DROP_RUN_DRIFT_ROWS + 1;
/**
 * Multiplier by landing column 1–9 (symmetric: outer zero, ramp to center).
 */
export const DROP_RUN_BAY_MULTIPLIERS = [0, 0.35, 0.85, 1.45, 4.75, 1.45, 0.85, 0.35, 0];

/**
 * @param {unknown} raw
 * @returns {number | null} column 1–DROP_RUN_GATES
 */
export function normalizeDropRunGate(raw) {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return null;
  if (n < 1 || n > DROP_RUN_GATES) return null;
  return n;
}

export function dropRunMaxPayout(entryCost) {
  const entry = Math.max(DROP_RUN_MIN_WAGER, Math.floor(Number(entryCost) || 0));
  const m = Math.max(...DROP_RUN_BAY_MULTIPLIERS);
  return Math.max(0, Math.floor(entry * m));
}

export function dropRunMultiplierForBay(bay) {
  const b = Math.floor(Number(bay));
  if (!Number.isFinite(b) || b < 1 || b > DROP_RUN_GATES) return 0;
  return DROP_RUN_BAY_MULTIPLIERS[b - 1] ?? 0;
}

/**
 * @param {{ terminalKind: "overload" | "cashout" | "full_clear"; payoutReturn: number; entryCost: number; fundingSource?: "vault" | "gift" }} args
 */
export function buildDropRunSettlementSummary({
  terminalKind,
  payoutReturn,
  entryCost,
  fundingSource = "vault",
}) {
  const entry = Math.max(DROP_RUN_MIN_WAGER, Math.floor(Number(entryCost) || 0));
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
    isWin: terminalKind !== "overload" && payout > 0,
    settlementType: "client_shared_vault",
    fundingSource,
    terminalKind,
    gameKind: "drop_run",
  };
}
