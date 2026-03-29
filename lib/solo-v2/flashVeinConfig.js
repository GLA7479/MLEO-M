import { QUICK_FLIP_CONFIG, QUICK_FLIP_MIN_WAGER } from "./quickFlipConfig";

export const FLASH_VEIN_MIN_WAGER = QUICK_FLIP_MIN_WAGER;
export const FLASH_VEIN_ROUNDS = 5;
/** After the flash hides, lane buttons stay locked for this many ms (memory beat). */
export const FLASH_VEIN_POST_REVEAL_BLACKOUT_MS = 185;
export const FLASH_VEIN_MULT_BPS_START = 10000;
export const FLASH_VEIN_SAFE_MULT_NUM = 122;
export const FLASH_VEIN_SAFE_MULT_DEN = 100;
export const FLASH_VEIN_GEM_MULT_NUM = 138;
export const FLASH_VEIN_GEM_MULT_DEN = 100;

/**
 * @param {unknown} raw
 * @returns {number | null} column 0..2
 */
/** Per-round flash duration (ms): round 1 = index 0, … round 5 = index 4. */
const FLASH_VEIN_REVEAL_MS_BY_ROUND = Object.freeze([600, 500, 420, 360, 320]);

export function flashVeinRevealMsForRound(roundIndex) {
  const i = Math.max(0, Math.min(FLASH_VEIN_ROUNDS - 1, Math.floor(Number(roundIndex) || 0)));
  return FLASH_VEIN_REVEAL_MS_BY_ROUND[i] ?? 600;
}

export function normalizeFlashVeinColumn(raw) {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > 2) return null;
  return n;
}

export function flashVeinMaxPayout(entryCost) {
  const entry = Math.max(FLASH_VEIN_MIN_WAGER, Math.floor(Number(entryCost) || 0));
  let m = FLASH_VEIN_MULT_BPS_START;
  for (let i = 0; i < FLASH_VEIN_ROUNDS; i += 1) {
    m = Math.floor((m * FLASH_VEIN_GEM_MULT_NUM) / FLASH_VEIN_GEM_MULT_DEN);
  }
  return Math.max(0, Math.floor((entry * m) / 10000));
}

export function buildFlashVeinSettlementSummary({
  terminalKind,
  payoutReturn,
  entryCost,
  fundingSource = "vault",
}) {
  const entry = Math.max(FLASH_VEIN_MIN_WAGER, Math.floor(Number(entryCost) || 0));
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
    isWin: terminalKind === "full_clear" && payout > 0,
    settlementType: "client_shared_vault",
    fundingSource,
    terminalKind,
    gameKind: "flash_vein",
  };
}
