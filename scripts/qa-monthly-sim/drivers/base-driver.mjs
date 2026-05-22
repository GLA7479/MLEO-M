import { BASE_ACTION_CATALOG } from "../lib/baseActions.mjs";
import { timingFields } from "../lib/logHelpers.mjs";
import {
  mapBaseActionOutcome,
  pickBuildableBuildingKey,
  pickSpendType,
  pickUnlockableResearchKey,
} from "../lib/baseStateDiscovery.mjs";
import { sleep, rateLimitBackoffMs } from "../lib/requestPacing.mjs";

async function ensureBaseState(ctx) {
  if (ctx.baseStateLoaded) return ctx.baseState;
  const res = await ctx.client.get("/api/base/state");
  ctx.baseState = res.data?.state || null;
  ctx.baseStateLoaded = true;
  if (res.ok && ctx.baseState) ctx.baseStateFetchedAt = Date.now();
  return ctx.baseState;
}

function invalidateBaseState(ctx) {
  ctx.baseState = null;
  ctx.baseStateLoaded = false;
}

async function resolveBaseBody(ctx, action) {
  const state = await ensureBaseState(ctx);
  if (action === "build") {
    const building_key = pickBuildableBuildingKey(state);
    if (!building_key) return { gap: true, note: "No buildable building_key from live BASE state" };
    return { body: { building_key } };
  }
  if (action === "research") {
    const research_key = pickUnlockableResearchKey(state);
    if (!research_key) return { gap: true, note: "No unlockable research_key from live BASE state" };
    return { body: { research_key } };
  }
  if (action === "spend") {
    const spend_type = pickSpendType(state);
    if (!spend_type) return { gap: true, note: "Energy near full — spend not applicable" };
    return { body: { spend_type } };
  }
  const catalog = BASE_ACTION_CATALOG[action];
  const body = typeof catalog?.body === "function" ? catalog.body() : catalog?.body;
  return { body: body || {} };
}

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
    const outcome = mapBaseActionOutcome(res);
    if (res.ok && res.data?.state) {
      ctx.baseState = res.data.state;
      ctx.baseStateLoaded = true;
    }
    const recorded = outcome === "ok" ? "ok" : outcome === "coverage_gap" ? "coverage_gap" : "error";
    coverage?.recordBase(action, recorded, res.data?.message);
    await logger.logEvent({
      ...timingFields(ctx),
      userId: persona.id,
      module: "base",
      action: "state",
      outcome: recorded,
      errorMessage: res.ok ? null : res.data?.message,
      responseMs: res.ms,
      rawResponse: res.data,
    });
    return res;
  }

  const resolved = await resolveBaseBody(ctx, action);
  if (resolved.gap) {
    await logger.logEvent({
      ...timingFields(ctx),
      userId: persona.id,
      module: "base",
      action,
      outcome: "coverage_gap",
      errorMessage: resolved.note,
      rawResponse: { automation: "coverage_gap", reason: resolved.note },
    });
    coverage?.recordBase(action, "coverage_gap", resolved.note);
    return { ok: false, coverageGap: true, reason: resolved.note };
  }

  await client.ensureCsrf();
  let res = await client.post(catalog.path, resolved.body);
  let outcome = mapBaseActionOutcome(res);

  if (outcome === "rate_limited") {
    for (let attempt = 0; attempt < 3 && outcome === "rate_limited"; attempt++) {
      await sleep(rateLimitBackoffMs(attempt));
      res = await client.post(catalog.path, resolved.body);
      outcome = mapBaseActionOutcome(res);
    }
  }

  if (res.ok) invalidateBaseState(ctx);

  const recorded =
    outcome === "ok" ? "ok" : outcome === "coverage_gap" ? "coverage_gap" : outcome === "rate_limited" ? "error" : "error";
  coverage?.recordBase(action, recorded, res.data?.message || res.data?.code);
  if (recorded === "error") stats.errors += 1;
  stats.baseSessions += 1;

  await logger.logEvent({
    ...timingFields(ctx),
    userId: persona.id,
    module: "base",
    action,
    outcome: recorded,
    errorMessage: res.ok ? null : res.data?.message || res.data?.code,
    responseMs: res.ms,
    rawResponse: { ...res.data, requestBody: resolved.body },
  });
  return res;
}
