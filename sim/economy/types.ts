export type ProfileName = "casual" | "normal" | "aggressive" | "offline-heavy";

export type WindowDays = 1 | 7 | 30 | 365 | 1825;

export interface MinersConfig {
  dailyCap: number;
  offlineFactor: number;
  baseStageV1: number;
  softcut: Array<{ upto: number; factor: number }>;
  stageBlocks: Array<{ start: number; end: number; r: number }>;
}

export interface BaseConfig {
  baseEnergyCap: number;
  powerCapBonus: number;
  coolantCapBonus: number;
  baseEnergyRegen: number;
  powerRegenBonus: number;
  coolantRegenBonus: number;
  dailyShipCap: number;
  shipLogisticsBonus: number;
  shipBlueprintBonus: number;
  refineryOreUsePerSec: number;
  refineryScrapUsePerSec: number;
  bankGainRate: number;
  refillCost: number;
  overclockCost: number;
  blueprintBaseCost: number;
  blueprintGrowth: number;
}

export interface ArcadeConfig {
  paidRtpByCategory: Record<string, number>;
}

export interface SimulationConfig {
  miners: MinersConfig;
  base: BaseConfig;
  arcade: ArcadeConfig;
}

export interface ProfileSettings {
  name: ProfileName;
  population: number;
  redeemableSpendBudgetPctPerDay: number;
  miners: {
    activeBreaksPerDay: number;
    offlineBreaksPerDay: number;
    moveToVaultRate: number;
    claimToVaultPerDay: number;
    stageResetEveryBreaks: number;
    stageStart: number;
    stageStartDriftPerDay: number;
  };
  base: {
    logisticsLevel: number;
    blueprintStartLevel: number;
    powerCellLevel: number;
    hasCoolant: boolean;
    refineryLevel: number;
    activeSecondsPerDay: number;
    offlineEffectiveFactor: number;
    shipsPerDay: number;
    spendBlueprintPerDay: number;
    spendOverclockPerDay: number;
    spendRefillPerDay: number;
  };
  arcade: {
    paidSessionsPerDay: number;
    paidStake: number;
    paidMix: Record<string, number>;
    freeplaySessionsPerDay: number;
    freeplayAvgReward: number;
  };
}

export interface SystemTotals {
  minersGrossCreated: number;
  minersAfterSoftcutCap: number;
  minersMovedToVault: number;
  minersNetRedeemableLiability: number;
  baseBankedCreated: number;
  baseMovedToVault: number;
  baseVaultInternalSpends: number;
  baseNetRedeemableLiability: number;
  arcadePaidGrossRewards: number;
  arcadePaidNetVaultEffect: number;
  arcadeFreeplayGrossRewards: number;
  arcadeFreeplayRedeemableContribution: number;
}

export interface CombinedTotals {
  grossMleoCreated: number;
  redeemableCredits: number;
  nonRedeemableCredits: number;
  redeemableInternalSpends: number;
  withdrawn: number;
  burnedExcluded: number;
  netRedeemableLiability: number;
  annualizedLiabilityRate: number;
  projectedYearsTo200B: number;
  projectedYearsTo300B: number;
}

export interface WindowResult {
  profile: ProfileName;
  days: WindowDays;
  systems: SystemTotals;
  combined: CombinedTotals;
}
