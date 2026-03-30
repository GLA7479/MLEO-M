import { QUICK_FLIP_CONFIG, QUICK_FLIP_MIN_WAGER } from "./quickFlipConfig";

export const DIAMONDS_MIN_WAGER = QUICK_FLIP_MIN_WAGER;
export const DIAMONDS_GRID_SIZE = 5;
export const DIAMONDS_CELL_COUNT = 25;

/** Preset label → bomb count on 5×5 (25 cells). */
export const DIAMONDS_BOMB_COUNT_FOR_DIFFICULTY = {
  easy: 3,
  medium: 5,
  hard: 7,
  expert: 10,
};

/** ~4% house edge applied to fair combinatorial odds (same ballpark as Quick Flip’s 96% implied RTP). */
export const DIAMONDS_HOUSE_EDGE = 0.04;

function binomial(n, k) {
  const nn = Math.floor(Number(n));
  const kk = Math.floor(Number(k));
  if (kk < 0 || kk > nn) return 0;
  if (kk === 0 || kk === nn) return 1;
  const k2 = Math.min(kk, nn - kk);
  let r = 1;
  for (let i = 1; i <= k2; i += 1) {
    r = (r * (nn - k2 + i)) / i;
  }
  return Math.round(r);
}

/**
 * Fair multiplier after k safe reveals (all distinct cells, all safe), before house edge.
 * P(all k safe) = C(S,k) / C(N,k) with S = N - B safe cells.
 */
export function diamondsFairMultiplier(cellCount, safeCount, safeRevealed) {
  const N = Math.floor(Number(cellCount));
  const S = Math.floor(Number(safeCount));
  const k = Math.floor(Number(safeRevealed));
  if (!Number.isFinite(N) || !Number.isFinite(S) || !Number.isFinite(k)) return null;
  if (k < 1 || k > S || S > N || S < 1) return null;
  const num = binomial(N, k);
  const den = binomial(S, k);
  if (!den) return null;
  return num / den;
}

export function diamondsMultiplierAfterReveals(bombCount, safeRevealed) {
  const B = Math.floor(Number(bombCount));
  const k = Math.floor(Number(safeRevealed));
  if (!Number.isFinite(B) || B < 1 || B >= DIAMONDS_CELL_COUNT) return null;
  const S = DIAMONDS_CELL_COUNT - B;
  if (k < 1 || k > S) return null;
  const fair = diamondsFairMultiplier(DIAMONDS_CELL_COUNT, S, k);
  if (fair == null || !Number.isFinite(fair)) return null;
  return Math.max(1, (1 - DIAMONDS_HOUSE_EDGE) * fair);
}

export function payoutForDiamonds(entryCost, multiplier) {
  const entry = Math.max(DIAMONDS_MIN_WAGER, Math.floor(Number(entryCost) || 0));
  const m = Number(multiplier);
  if (!Number.isFinite(m) || m < 1) return 0;
  return Math.max(0, Math.floor(entry * m));
}

/**
 * @param {{ terminalKind: "bomb" | "cashout" | "full_clear"; payoutReturn: number; entryCost: number; fundingSource?: "vault" | "gift" }} args
 */
export function buildDiamondsSettlementSummary({
  terminalKind,
  payoutReturn,
  entryCost,
  fundingSource = "vault",
}) {
  const entry = Math.max(DIAMONDS_MIN_WAGER, Math.floor(Number(entryCost) || 0));
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
    isWin: terminalKind !== "bomb" && payout > 0,
    settlementType: "client_shared_vault",
    fundingSource,
    terminalKind,
    gameKind: "diamonds",
  };
}
