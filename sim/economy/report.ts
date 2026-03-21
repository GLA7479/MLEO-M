import { ProfileName, WindowResult } from "./types";

function n(x: number): string {
  if (!Number.isFinite(x)) return "INF";
  return Math.round(x).toLocaleString("en-US");
}

function f2(x: number): string {
  if (!Number.isFinite(x)) return "INF";
  return x.toFixed(2);
}

export function printProfileHeader(profile: ProfileName): void {
  console.log(`\n=== PROFILE: ${profile.toUpperCase()} ===`);
}

export function printWindowResult(r: WindowResult): void {
  console.log(`\n[Window: ${r.days} days]`);
  console.log(
    [
      "MINERS",
      `gross=${n(r.systems.minersGrossCreated)}`,
      `afterSoftcutCap=${n(r.systems.minersAfterSoftcutCap)}`,
      `toVault=${n(r.systems.minersMovedToVault)}`,
      `netRedeemable=${n(r.systems.minersNetRedeemableLiability)}`,
    ].join(" | ")
  );
  console.log(
    [
      "BASE",
      `banked=${n(r.systems.baseBankedCreated)}`,
      `toVault=${n(r.systems.baseMovedToVault)}`,
      `spends=${n(r.systems.baseVaultInternalSpends)}`,
      `netRedeemable=${n(r.systems.baseNetRedeemableLiability)}`,
    ].join(" | ")
  );
  console.log(
    [
      "ARCADE PAID",
      `grossRewards=${n(r.systems.arcadePaidGrossRewards)}`,
      `netVaultEffect=${n(r.systems.arcadePaidNetVaultEffect)}`,
    ].join(" | ")
  );
  console.log(
    [
      "ARCADE FREEPLAY",
      `grossRewards=${n(r.systems.arcadeFreeplayGrossRewards)}`,
      `redeemableContribution=${n(r.systems.arcadeFreeplayRedeemableContribution)}`,
    ].join(" | ")
  );
  console.log(
    [
      "COMBINED",
      `grossCreated=${n(r.combined.grossMleoCreated)}`,
      `redeemableCredits=${n(r.combined.redeemableCredits)}`,
      `nonRedeemableCredits=${n(r.combined.nonRedeemableCredits)}`,
      `redeemableSpends=${n(r.combined.redeemableInternalSpends)}`,
      `netLiability=${n(r.combined.netRedeemableLiability)}`,
      `annualized=${n(r.combined.annualizedLiabilityRate)}`,
      `yearsTo200B=${f2(r.combined.projectedYearsTo200B)}`,
      `yearsTo300B=${f2(r.combined.projectedYearsTo300B)}`,
    ].join(" | ")
  );
}

export function printFormulaMap(): void {
  console.log("\n=== FORMULA SOURCE MAP ===");
  console.log("- MINERS: sql/miners_server_authority.sql (daily_cap=2500, offline_factor=0.35, base_stage_v1=0.20, safe-growth softcut + stage multipliers)");
  console.log("- BASE reconcile: sql/base_server_authority.sql (energy cap/regen, banked gain core formula, daily MLEO production cap)");
  console.log("- BASE ship/spend: sql/base_atomic_rpc.sql (ship factor, ship bank bonus, refill=160, blueprint growth, overclock cost)");
  console.log("- Arcade paid/freeplay: sql/arcade_sessions_add_slots_mystery.sql (paid stake debit + reward credit; freeplay modeled separately as non-redeemable)");
  console.log("- Vault identity: sql/vault_schema_fixed.sql via sync_vault_delta usage pattern");
}
