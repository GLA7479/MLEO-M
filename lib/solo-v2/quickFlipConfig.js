export const QUICK_FLIP_CONFIG = {
  entryCost: 25,
  winReturn: 48,
  lossReturn: 0,
  impliedRtpPercent: 96,
};

export function buildQuickFlipSettlementSummary({ choice, outcome, isWin }) {
  const payoutReturn = isWin ? QUICK_FLIP_CONFIG.winReturn : QUICK_FLIP_CONFIG.lossReturn;
  const netDelta = payoutReturn - QUICK_FLIP_CONFIG.entryCost;

  return {
    entryCost: QUICK_FLIP_CONFIG.entryCost,
    winReturn: QUICK_FLIP_CONFIG.winReturn,
    lossReturn: QUICK_FLIP_CONFIG.lossReturn,
    impliedRtpPercent: QUICK_FLIP_CONFIG.impliedRtpPercent,
    payoutReturn,
    netDelta,
    choice: choice || null,
    outcome: outcome || null,
    isWin: Boolean(isWin),
    settlementType: "client_shared_vault",
  };
}
