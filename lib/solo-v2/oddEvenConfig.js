/** Aligned with Quick Flip: 50/50 with explicit house edge via multiplier (96% RTP design). */
export const ODD_EVEN_CONFIG = {
  entryCost: 25,
  winReturn: 48,
  lossReturn: 0,
  impliedRtpPercent: 96,
};

export const ODD_EVEN_MIN_WAGER = 25;
export const ODD_EVEN_WIN_MULTIPLIER = 1.92;

/**
 * @param {{ choice?: string | null; outcome?: string | null; isWin: boolean; entryCost?: number; fundingSource?: "vault" | "gift" }} args
 */
export function buildOddEvenSettlementSummary({
  choice,
  outcome,
  isWin,
  entryCost: entryCostArg,
  fundingSource = "vault",
}) {
  const raw = entryCostArg != null ? Number(entryCostArg) : ODD_EVEN_CONFIG.entryCost;
  const safe = Number.isFinite(raw) ? raw : ODD_EVEN_CONFIG.entryCost;
  const entryCost = Math.max(ODD_EVEN_MIN_WAGER, Math.floor(safe));

  const payoutReturn = isWin ? Math.floor(entryCost * ODD_EVEN_WIN_MULTIPLIER) : ODD_EVEN_CONFIG.lossReturn;
  const isGift = fundingSource === "gift";
  const netDelta = isGift ? (isWin ? payoutReturn : 0) : payoutReturn - entryCost;

  return {
    entryCost,
    winReturn: payoutReturn,
    lossReturn: ODD_EVEN_CONFIG.lossReturn,
    impliedRtpPercent: ODD_EVEN_CONFIG.impliedRtpPercent,
    payoutReturn,
    netDelta,
    choice: choice || null,
    outcome: outcome || null,
    isWin: Boolean(isWin),
    settlementType: "client_shared_vault",
    fundingSource,
  };
}
