import { QUICK_FLIP_CONFIG, QUICK_FLIP_MIN_WAGER } from "./quickFlipConfig";

export const FLASH_VEIN_MIN_WAGER = QUICK_FLIP_MIN_WAGER;
export const FLASH_VEIN_ROUNDS = 5;
export const FLASH_VEIN_MULT_BPS_START = 10000;
export const FLASH_VEIN_SAFE_MULT_NUM = 122;
export const FLASH_VEIN_SAFE_MULT_DEN = 100;
export const FLASH_VEIN_GEM_MULT_NUM = 138;
export const FLASH_VEIN_GEM_MULT_DEN = 100;

/**
 * @param {unknown} raw
 * @returns {number | null} column 0..2
 */
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
