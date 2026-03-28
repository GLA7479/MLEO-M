import { QUICK_FLIP_CONFIG, QUICK_FLIP_MIN_WAGER } from "./quickFlipConfig";

export const TRIPLE_DICE_MIN_WAGER = QUICK_FLIP_MIN_WAGER;

/** Same house-edge scale as Limit Run limbo for payout shaping. */
export const TRIPLE_DICE_HOUSE_EDGE = 0.04;

/** @typedef {"low" | "mid" | "high" | "triple"} TripleDiceZone */

export const TRIPLE_DICE_ZONES = /** @type {const} */ (["low", "mid", "high", "triple"]);

/** Ways to hit each zone with three fair dice (denominator 216). LOW/MID/HIGH partition totals; TRIPLE is face-based. */
export const TRIPLE_DICE_WAYS_BY_ZONE = Object.freeze({
  low: 56, // totals 3–8
  mid: 79, // totals 9–11
  high: 81, // totals 12–18
  triple: 6, // any 1-1-1 … 6-6-6
});

/**
 * @param {unknown} raw
 * @returns {TripleDiceZone | null}
 */
export function normalizeTripleDiceZone(raw) {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "low" || s === "mid" || s === "high" || s === "triple") return s;
  return null;
}

export function tripleDiceWaysForZone(zone) {
  const z = normalizeTripleDiceZone(zone);
  if (!z) return null;
  return TRIPLE_DICE_WAYS_BY_ZONE[z];
}

/** Empirical hit rate for display (true probability for uniform dice). */
export function tripleDiceWinChancePercent(zone) {
  const ways = tripleDiceWaysForZone(zone);
  if (ways == null || ways <= 0) return 0;
  return (ways / 216) * 100;
}

/** All three dice show the same face (client-safe; mirrors server rule). */
export function tripleDiceIsTripleRoll(dice) {
  const d = Array.isArray(dice) ? dice.map(v => Math.floor(Number(v) || 0)) : [];
  if (d.length !== 3) return false;
  return d[0] >= 1 && d[0] <= 6 && d[0] === d[1] && d[1] === d[2];
}

/** Band the total sits in (for copy). Triple faces are labeled TRIPLE regardless of sum. */
export function tripleDiceOutcomeBandLabel(dice, total) {
  if (tripleDiceIsTripleRoll(dice)) return "TRIPLE";
  const t = Math.floor(Number(total));
  if (!Number.isFinite(t)) return "—";
  if (t >= 3 && t <= 8) return "LOW";
  if (t >= 9 && t <= 11) return "MID";
  if (t >= 12 && t <= 18) return "HIGH";
  return "—";
}

export function tripleDiceFormatFaces(dice) {
  if (!Array.isArray(dice) || dice.length !== 3) return "—";
  return dice.map(v => Math.floor(Number(v) || 0)).join("·");
}

export function tripleDiceProjectedPayout(entryCost, zone) {
  const entry = Math.max(TRIPLE_DICE_MIN_WAGER, Math.floor(Number(entryCost) || 0));
  const ways = tripleDiceWaysForZone(zone);
  if (ways == null || ways <= 0) return 0;
  const edge = Math.min(0.49, Math.max(0, TRIPLE_DICE_HOUSE_EDGE));
  const mult = (216 / ways) * (1 - edge);
  if (!Number.isFinite(mult) || mult <= 0) return 0;
  return Math.max(0, Math.floor(entry * mult));
}

/**
 * @param {{ terminalKind: "overload" | "cashout" | "full_clear"; payoutReturn: number; entryCost: number; fundingSource?: "vault" | "gift" }} args
 */
export function buildTripleDiceSettlementSummary({
  terminalKind,
  payoutReturn,
  entryCost,
  fundingSource = "vault",
}) {
  const entry = Math.max(TRIPLE_DICE_MIN_WAGER, Math.floor(Number(entryCost) || 0));
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
    gameKind: "triple_dice",
  };
}
