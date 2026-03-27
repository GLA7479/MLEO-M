/** Default stake when legacy sessions have missing/zero entry_amount (matches original fixed game). */
export const QUICK_FLIP_CONFIG = {
  entryCost: 25,
  winReturn: 48,
  lossReturn: 0,
  impliedRtpPercent: 96,
};

export const QUICK_FLIP_MIN_WAGER = 25;
export const QUICK_FLIP_WIN_MULTIPLIER = 1.92;

/**
 * @param {{ choice?: string | null; outcome?: string | null; isWin: boolean; entryCost?: number; fundingSource?: "vault" | "gift" }} args
 * vault: netDelta = payout - entry (lose: -entry). gift/freeplay: lose => 0 vault change; win => full payout only (no stake return).
 */
export function buildQuickFlipSettlementSummary({
  choice,
  outcome,
  isWin,
  entryCost: entryCostArg,
  fundingSource = "vault",
}) {
  const raw = entryCostArg != null ? Number(entryCostArg) : QUICK_FLIP_CONFIG.entryCost;
  const safe = Number.isFinite(raw) ? raw : QUICK_FLIP_CONFIG.entryCost;
  const entryCost = Math.max(QUICK_FLIP_MIN_WAGER, Math.floor(safe));

  const payoutReturn = isWin ? Math.floor(entryCost * QUICK_FLIP_WIN_MULTIPLIER) : QUICK_FLIP_CONFIG.lossReturn;
  const isGift = fundingSource === "gift";
  const netDelta = isGift ? (isWin ? payoutReturn : 0) : payoutReturn - entryCost;

  return {
    entryCost,
    winReturn: payoutReturn,
    lossReturn: QUICK_FLIP_CONFIG.lossReturn,
    impliedRtpPercent: QUICK_FLIP_CONFIG.impliedRtpPercent,
    payoutReturn,
    netDelta,
    choice: choice || null,
    outcome: outcome || null,
    isWin: Boolean(isWin),
    settlementType: "client_shared_vault",
    fundingSource,
  };
}
