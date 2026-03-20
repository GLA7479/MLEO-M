import { WINDOWS_DAYS } from "./config";
import { runProfileWindow } from "./engine";
import { PROFILES } from "./profiles";
import { printFormulaMap, printProfileHeader, printWindowResult } from "./report";
import { ProfileSettings, WindowResult } from "./types";

function judge(result365: WindowResult): string {
  const annual = result365.combined.annualizedLiabilityRate;
  const safe200 = annual * 5 <= 200_000_000_000 ? "YES" : "NO";
  const safe300 = annual * 5 <= 300_000_000_000 ? "YES" : "NO";
  return `safe200B=${safe200} | safe300B=${safe300} | annualized=${Math.round(annual).toLocaleString("en-US")}`;
}

function main(): void {
  console.log("Deterministic Economy Simulation Harness");
  console.log("Windows: 1d, 7d, 30d, 365d, 5y");
  console.log("Profiles: casual, normal, aggressive, offline-heavy");
  printFormulaMap();

  console.log("\n=== PROFILE ASSUMPTIONS ===");
  for (const p of PROFILES) printProfileAssumptions(p);

  for (const profile of PROFILES) {
    printProfileHeader(profile.name);
    const results = WINDOWS_DAYS.map((days) => runProfileWindow(profile, days));
    for (const r of results) printWindowResult(r);
    const r365 = results.find((x) => x.days === 365);
    if (r365) console.log(`\nJudgment | ${judge(r365)}`);
  }

  printRequestedDebugCases();
}

function printProfileAssumptions(p: ProfileSettings): void {
  const activeMin = p.base.activeSecondsPerDay / 60;
  const offlineMin = (86400 - p.base.activeSecondsPerDay) / 60;
  const totalBreaks = p.miners.activeBreaksPerDay + p.miners.offlineBreaksPerDay;
  const bpm = totalBreaks / Math.max(1, activeMin);
  console.log(
    [
      `- ${p.name}`,
      `population=${p.population}`,
      `spendBudgetPct/day=${(p.redeemableSpendBudgetPctPerDay * 100).toFixed(0)}%`,
      `breaks/day=${totalBreaks}`,
      `breaks/min=${bpm.toFixed(2)}`,
      `activeMin/day=${activeMin.toFixed(1)}`,
      `offlineMin/day=${offlineMin.toFixed(1)}`,
      `minersClaimToVault/day=${p.miners.claimToVaultPerDay}`,
      `baseShips/day=${p.base.shipsPerDay}`,
      `baseSpend[blueprint=${p.base.spendBlueprintPerDay},overclock=${p.base.spendOverclockPerDay},refill=${p.base.spendRefillPerDay}]`,
      `arcadePaidSessions/day=${p.arcade.paidSessionsPerDay}`,
      `arcadeAvgStake=${p.arcade.paidStake}`,
      `freeplaySessions/day=${p.arcade.freeplaySessionsPerDay}`,
    ].join(" | ")
  );
}

function printRequestedDebugCases(): void {
  console.log("\n=== CALIBRATION DEBUG CASES ===");
  const wanted: Array<[string, number]> = [
    ["normal", 30],
    ["aggressive", 30],
    ["normal", 365],
    ["aggressive", 365],
  ];
  for (const [name, days] of wanted) {
    const p = PROFILES.find((x) => x.name === name);
    if (!p) continue;
    const r = runProfileWindow(p, days as any);
    console.log(`\n${name.toUpperCase()} / ${days}d`);
    console.log(`MINERS gross created: ${Math.round(r.systems.minersGrossCreated).toLocaleString("en-US")}`);
    console.log(`MINERS after softcut/cap: ${Math.round(r.systems.minersAfterSoftcutCap).toLocaleString("en-US")}`);
    console.log(`MINERS moved to vault: ${Math.round(r.systems.minersMovedToVault).toLocaleString("en-US")}`);
    console.log(`BASE banked created: ${Math.round(r.systems.baseBankedCreated).toLocaleString("en-US")}`);
    console.log(`BASE moved to vault: ${Math.round(r.systems.baseMovedToVault).toLocaleString("en-US")}`);
    console.log(`BASE vault spends: ${Math.round(r.systems.baseVaultInternalSpends).toLocaleString("en-US")}`);
    console.log(`arcade paid gross rewards: ${Math.round(r.systems.arcadePaidGrossRewards).toLocaleString("en-US")}`);
    console.log(`arcade paid net sink/effect: ${Math.round(r.systems.arcadePaidNetVaultEffect).toLocaleString("en-US")}`);
    console.log(`arcade freeplay gross: ${Math.round(r.systems.arcadeFreeplayGrossRewards).toLocaleString("en-US")}`);
    console.log(`total redeemable credits: ${Math.round(r.combined.redeemableCredits).toLocaleString("en-US")}`);
    console.log(`total redeemable internal spends: ${Math.round(r.combined.redeemableInternalSpends).toLocaleString("en-US")}`);
    console.log(`final net redeemable liability: ${Math.round(r.combined.netRedeemableLiability).toLocaleString("en-US")}`);
  }
}

main();
