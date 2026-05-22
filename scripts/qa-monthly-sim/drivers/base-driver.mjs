import { BASE_ACTION_CATALOG } from "../lib/baseActions.mjs";
import { timingFields } from "../lib/logHelpers.mjs";

export async function runBaseAction(ctx, action) {
  const { client, persona, logger, stats, coverage } = ctx;
  const catalog = BASE_ACTION_CATALOG[action];

  if (!catalog) {
    return { ok: false, data: { message: "unknown base action" } };
  }

  if (catalog.automation === "coverage_gap") {
    await logger.logEvent({
      ...timingFields(ctx),
      userId: persona.id,
      module: "base",
      action,
      outcome: "coverage_gap",
      errorMessage: catalog.note,
      rawResponse: { automation: "coverage_gap" },
    });
    coverage?.recordBase(action, "coverage_gap", catalog.note);
    return { ok: false, coverageGap: true, reason: catalog.note };
  }

  if (action === "state") {
    const res = await client.get(catalog.path);
    const outcome = res.ok ? "ok" : "error";
    coverage?.recordBase(action, outcome);
    await logger.logEvent({
      ...timingFields(ctx),
      userId: persona.id,
      module: "base",
      action: "state",
      outcome,
      errorMessage: res.ok ? null : res.data?.message,
      responseMs: res.ms,
      rawResponse: res.data,
    });
    return res;
  }

  await client.ensureCsrf();
  const body = typeof catalog.body === "function" ? catalog.body() : catalog.body;
  const res = await client.post(catalog.path, body || {});
  const outcome = res.ok ? "ok" : "error";
  coverage?.recordBase(action, outcome, res.data?.message || res.data?.code);
  if (!res.ok) stats.errors += 1;
  stats.baseSessions += 1;

  await logger.logEvent({
    ...timingFields(ctx),
    userId: persona.id,
    module: "base",
    action,
    outcome,
    errorMessage: res.ok ? null : res.data?.message || res.data?.code,
    responseMs: res.ms,
    rawResponse: res.data,
  });
  return res;
}
