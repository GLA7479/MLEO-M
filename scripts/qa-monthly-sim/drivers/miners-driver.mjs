import { timingFields } from "../lib/logHelpers.mjs";

export async function runMinersAction(ctx, action) {
  const { client, persona, logger, stats, coverage } = ctx;
  let vaultBefore = stats.lastVault;

  if (action === "state" || vaultBefore == null) {
    const res = await client.get("/api/miners/state");
    const vault = Number(res.data?.state?.vault ?? res.data?.state?.sharedVaultBalance ?? 0);
    stats.lastVault = vault;
    coverage?.recordMiners("state", res.ok ? "ok" : "error");
    await logger.logEvent({
      ...timingFields(ctx),
      userId: persona.id,
      module: "miners",
      action: "state",
      vaultBefore: vault,
      vaultAfter: vault,
      outcome: res.ok ? "ok" : "error",
      errorMessage: res.ok ? null : JSON.stringify(res.data),
      responseMs: res.ms,
      rawResponse: res.data,
    });
    return res;
  }

  if (action === "accrue") {
    await client.ensureCsrf();
    const res = await client.post("/api/miners/accrue", {
      stageCounts: { "1": 3 },
      offline: false,
    });
    coverage?.recordMiners("accrue", res.ok ? "ok" : "error");
    stats.minersSessions += 1;
    await logger.logEvent({
      ...timingFields(ctx),
      userId: persona.id,
      module: "miners",
      action: "accrue",
      outcome: res.ok ? "ok" : "error",
      errorMessage: res.ok ? null : res.data?.message,
      responseMs: res.ms,
      rawResponse: res.data,
    });
    return res;
  }

  if (action === "claim_vault") {
    await client.ensureCsrf();
    vaultBefore = stats.lastVault ?? 0;
    const res = await client.post("/api/miners/claim/to-vault", { amount: 0 });
    const vaultAfter = Number(res.data?.vault ?? res.data?.sharedVault ?? vaultBefore);
    const delta = vaultAfter - vaultBefore;
    stats.lastVault = vaultAfter;
    stats.earned += Math.max(0, delta);
    stats.spent += Math.max(0, -delta);
    coverage?.recordMiners("claim_vault", res.ok ? "ok" : "error");
    stats.minersSessions += 1;
    await logger.logEvent({
      ...timingFields(ctx),
      userId: persona.id,
      module: "miners",
      action: "claim_vault",
      vaultBefore,
      vaultAfter,
      delta,
      outcome: res.ok ? "ok" : "error",
      errorMessage: res.ok ? null : res.data?.message,
      responseMs: res.ms,
      rawResponse: res.data,
    });
    return res;
  }

  if (action === "gift_claim") {
    await client.ensureCsrf();
    const res = await client.post("/api/miners/gift/claim", {});
    coverage?.recordMiners("gift_claim", res.ok ? "ok" : "error");
    await logger.logEvent({
      ...timingFields(ctx),
      userId: persona.id,
      module: "miners",
      action: "gift_claim",
      outcome: res.ok ? "ok" : "error",
      errorMessage: res.ok ? null : res.data?.message,
      responseMs: res.ms,
      rawResponse: res.data,
    });
    return res;
  }

  return { ok: false, data: { message: "unknown miners action" } };
}
