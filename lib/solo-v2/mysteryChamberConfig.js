import { QUICK_FLIP_CONFIG, QUICK_FLIP_MIN_WAGER } from "./quickFlipConfig";

export const MYSTERY_CHAMBER_MIN_WAGER = QUICK_FLIP_MIN_WAGER;

export const MYSTERY_CHAMBER_CHAMBER_COUNT = 4;
export const MYSTERY_CHAMBER_SIGIL_COUNT = 4;

/** Multiplier applied to secured return when clearing each chamber (ladder index 0..count-1). */
export const MYSTERY_CHAMBER_CLEAR_MULTIPLIERS = [1.2, 1.5, 2, 3];

export const MYSTERY_CHAMBER_SIGIL_GLYPHS = ["I", "II", "III", "IV"];

/** Secured return at run start (before any chamber cleared). */
export function mysteryChamberStartingSecured(entryWager) {
  return Math.max(0, Math.floor(Number(entryWager) || 0));
}

/** Floor product of the ladder if all chambers clear (preview / cap). */
export function mysteryChamberMaxPotentialReturn(entryWager) {
  let s = mysteryChamberStartingSecured(entryWager);
  for (const m of MYSTERY_CHAMBER_CLEAR_MULTIPLIERS) {
    s = Math.floor(s * m);
  }
  return s;
}

export function normalizeMysteryChamberSigil(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n >= MYSTERY_CHAMBER_SIGIL_COUNT) return null;
  return n;
}

/**
 * @param {{ terminalKind: "fail" | "cashout" | "full_clear"; payoutReturn: number; entryCost: number; fundingSource?: "vault" | "gift" }} args
 */
export function buildMysteryChamberSettlementSummary({
  terminalKind,
  payoutReturn,
  entryCost,
  fundingSource = "vault",
}) {
  const entry = Math.max(MYSTERY_CHAMBER_MIN_WAGER, Math.floor(Number(entryCost) || 0));
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
    isWin: terminalKind !== "fail" && payout > 0,
    settlementType: "client_shared_vault",
    fundingSource,
    terminalKind,
    gameKind: "mystery_chamber",
  };
}
