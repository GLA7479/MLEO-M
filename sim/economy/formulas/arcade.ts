import { ArcadeConfig } from "../types";

export interface ArcadeDayInput {
  paidSessionsPerDay: number;
  paidStake: number;
  paidMix: Record<string, number>;
  freeplaySessionsPerDay: number;
  freeplayAvgReward: number;
}

export interface ArcadeDayResult {
  paidGrossRewards: number;
  paidNetVaultEffect: number;
  freeplayGrossRewards: number;
  freeplayRedeemableContribution: number;
}

export function simulateArcadeDay(cfg: ArcadeConfig, input: ArcadeDayInput): ArcadeDayResult {
  const paidSessions = Math.max(0, input.paidSessionsPerDay);
  const paidStakes = paidSessions * Math.max(0, input.paidStake);
  let weightedRtp = 0;
  for (const [key, weight] of Object.entries(input.paidMix)) {
    const rtp = cfg.paidRtpByCategory[key] ?? 0;
    weightedRtp += weight * rtp;
  }
  const paidRewards = paidStakes * weightedRtp;
  const paidNet = paidRewards - paidStakes;

  const freeplayRewards = Math.max(0, input.freeplaySessionsPerDay) * Math.max(0, input.freeplayAvgReward);
  return {
    paidGrossRewards: paidRewards,
    paidNetVaultEffect: paidNet,
    freeplayGrossRewards: freeplayRewards,
    freeplayRedeemableContribution: 0,
  };
}
