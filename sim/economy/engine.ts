import { CONFIG } from "./config";
import { simulateArcadeDay } from "./formulas/arcade";
import { defaultBaseState, simulateBaseDay } from "./formulas/base";
import { defaultMinersState, simulateMinersDay } from "./formulas/miners";
import { ProfileSettings, WindowDays, WindowResult } from "./types";

const TARGET_200B = 200_000_000_000;
const TARGET_300B = 300_000_000_000;

export function runProfileWindow(profile: ProfileSettings, days: WindowDays): WindowResult {
  const minersState = defaultMinersState(CONFIG.miners);
  const baseState = defaultBaseState(profile.base.blueprintStartLevel);

  let minersGrossCreated = 0;
  let minersAfterSoftcutCap = 0;
  let minersMovedToVault = 0;
  let baseBankedCreated = 0;
  let baseMovedToVault = 0;
  let baseVaultInternalSpends = 0;
  let arcadePaidGrossRewards = 0;
  let arcadePaidNetVaultEffect = 0;
  let arcadeFreeplayGrossRewards = 0;
  let redeemableInternalSpendsActual = 0;
  let redeemableVaultBalance = 0;

  for (let day = 0; day < days; day += 1) {
    const miners = simulateMinersDay(
      CONFIG.miners,
      {
        activeBreaks: profile.miners.activeBreaksPerDay,
        offlineBreaks: profile.miners.offlineBreaksPerDay,
        moveToVaultRate: profile.miners.moveToVaultRate,
        claimToVaultPerDay: profile.miners.claimToVaultPerDay,
        stageResetEveryBreaks: profile.miners.stageResetEveryBreaks,
        stageStart: profile.miners.stageStart,
        stageStartDriftPerDay: profile.miners.stageStartDriftPerDay,
        dayIndex: day,
      },
      minersState
    );
    minersGrossCreated += miners.grossCreated * profile.population;
    minersAfterSoftcutCap += miners.afterSoftcutCap * profile.population;
    minersMovedToVault += miners.movedToVault * profile.population;

    const base = simulateBaseDay(
      CONFIG.base,
      {
        ...profile.base,
        blueprintLevel: baseState.blueprintLevel,
      },
      baseState
    );
    baseBankedCreated += base.bankedCreated * profile.population;
    baseMovedToVault += base.movedToVault * profile.population;
    baseVaultInternalSpends += base.vaultInternalSpends * profile.population;

    const arcade = simulateArcadeDay(CONFIG.arcade, profile.arcade);
    arcadePaidGrossRewards += arcade.paidGrossRewards * profile.population;
    arcadePaidNetVaultEffect += arcade.paidNetVaultEffect * profile.population;
    arcadeFreeplayGrossRewards += arcade.freeplayGrossRewards * profile.population;

    // Day-level liability ledger: spend cannot exceed available redeemable balance.
    const dayRedeemableCredit =
      miners.movedToVault * profile.population +
      base.movedToVault * profile.population +
      Math.max(0, arcade.paidNetVaultEffect * profile.population);
    const dayPotentialSpend =
      base.vaultInternalSpends * profile.population +
      Math.max(0, -(arcade.paidNetVaultEffect * profile.population));
    redeemableVaultBalance += dayRedeemableCredit;
    const spendBudget = Math.max(0, Math.min(1, profile.redeemableSpendBudgetPctPerDay));
    const daySpendBudgetCap = redeemableVaultBalance * spendBudget;
    const dayActualSpend = Math.min(
      dayPotentialSpend,
      Math.max(0, redeemableVaultBalance),
      Math.max(0, daySpendBudgetCap)
    );
    redeemableVaultBalance -= dayActualSpend;
    redeemableInternalSpendsActual += dayActualSpend;
  }

  const redeemableCredits = minersMovedToVault + baseMovedToVault + Math.max(0, arcadePaidNetVaultEffect);
  const redeemableInternalSpends = redeemableInternalSpendsActual;
  const nonRedeemableCredits = arcadeFreeplayGrossRewards;
  const withdrawn = 0;
  const burnedExcluded = nonRedeemableCredits;

  const netRedeemableLiability =
    redeemableCredits - redeemableInternalSpends - withdrawn - burnedExcluded;
  const annualizedLiabilityRate = (netRedeemableLiability / days) * 365;
  const projectedYearsTo200B =
    annualizedLiabilityRate > 0 ? TARGET_200B / annualizedLiabilityRate : Number.POSITIVE_INFINITY;
  const projectedYearsTo300B =
    annualizedLiabilityRate > 0 ? TARGET_300B / annualizedLiabilityRate : Number.POSITIVE_INFINITY;

  return {
    profile: profile.name,
    days,
    systems: {
      minersGrossCreated,
      minersAfterSoftcutCap,
      minersMovedToVault,
      minersNetRedeemableLiability: minersMovedToVault,
      baseBankedCreated,
      baseMovedToVault,
      baseVaultInternalSpends,
      baseNetRedeemableLiability: baseMovedToVault - baseVaultInternalSpends,
      arcadePaidGrossRewards,
      arcadePaidNetVaultEffect,
      arcadeFreeplayGrossRewards,
      arcadeFreeplayRedeemableContribution: 0,
    },
    combined: {
      grossMleoCreated: minersGrossCreated + baseBankedCreated + arcadePaidGrossRewards + arcadeFreeplayGrossRewards,
      redeemableCredits,
      nonRedeemableCredits,
      redeemableInternalSpends,
      withdrawn,
      burnedExcluded,
      netRedeemableLiability,
      annualizedLiabilityRate,
      projectedYearsTo200B,
      projectedYearsTo300B,
    },
  };
}
