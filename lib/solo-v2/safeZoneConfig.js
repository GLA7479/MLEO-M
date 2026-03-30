import { QUICK_FLIP_CONFIG, QUICK_FLIP_MIN_WAGER } from "./quickFlipConfig";

export const SAFE_ZONE_MIN_WAGER = QUICK_FLIP_MIN_WAGER;
export const SAFE_ZONE_MIN_SECURED_MS = 3500;
export const SAFE_ZONE_MAX_RUN_MS = 15000;

export const SAFE_ZONE_TIER_MS = [3500, 6000, 9000, 12000, 15000];
export const SAFE_ZONE_TIER_MULTIPLIERS = [1.2, 1.5, 1.9, 2.35, 2.85];

export function safeZoneMultiplierForSecuredMs(securedMs) {
  const t = Math.max(0, Math.floor(Number(securedMs) || 0));
  let m = 0;
  for (let i = 0; i < SAFE_ZONE_TIER_MS.length; i += 1) {
    if (t >= SAFE_ZONE_TIER_MS[i]) m = SAFE_ZONE_TIER_MULTIPLIERS[i];
  }
  return m;
}

export function safeZonePayoutForMs(entryCost, securedMs) {
  const entry = Math.max(SAFE_ZONE_MIN_WAGER, Math.floor(Number(entryCost) || 0));
  const mult = safeZoneMultiplierForSecuredMs(securedMs);
  if (!Number.isFinite(mult) || mult <= 0) return 0;
  return Math.max(0, Math.floor(entry * mult));
}

/**
 * @param {{ terminalKind: "fail"|"cashout"|"full_duration"; securedMs: number; entryCost: number; fundingSource?: "vault"|"gift" }} args
 */
export function buildSafeZoneSettlementSummary({
  terminalKind,
  securedMs,
  entryCost,
  fundingSource = "vault",
}) {
  const entry = Math.max(SAFE_ZONE_MIN_WAGER, Math.floor(Number(entryCost) || 0));
  const secured = Math.max(0, Math.floor(Number(securedMs) || 0));
  const payoutReturn =
    terminalKind === "fail" ? 0 : safeZonePayoutForMs(entry, secured);
  const isGift = fundingSource === "gift";
  const netDelta = isGift ? payoutReturn : payoutReturn - entry;
  return {
    entryCost: entry,
    winReturn: payoutReturn,
    lossReturn: QUICK_FLIP_CONFIG.lossReturn,
    impliedRtpPercent: QUICK_FLIP_CONFIG.impliedRtpPercent,
    payoutReturn,
    netDelta,
    isWin: terminalKind !== "fail" && payoutReturn > 0,
    settlementType: "client_shared_vault",
    fundingSource,
    terminalKind,
    securedMs: secured,
    gameKind: "safe_zone",
  };
}
