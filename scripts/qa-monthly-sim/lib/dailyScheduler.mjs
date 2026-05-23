import { pickOne, seededForPersona } from "./prng.mjs";
import { soloGamesForSimDay, ov2GameForSimDay } from "./monthlyCoveragePlan.mjs";
import { BASE_SCHEDULER_ACTIONS } from "./baseActions.mjs";

const MINERS_ACTIONS = ["state", "accrue", "claim_vault", "gift_claim"];

function pickModule(persona, rng) {
  const w = persona.moduleWeights;
  const r = rng();
  let acc = 0;
  for (const [mod, weight] of Object.entries(w)) {
    acc += weight;
    if (r <= acc) return mod;
  }
  return "miners";
}

function buildPersonaAction(persona, simDay, slotIndex) {
  const rng = seededForPersona(persona, simDay * 1000 + slotIndex);
  const mod = pickModule(persona, rng);
  const params = { personaId: persona.id, displayName: persona.displayName };
  let action;

  if (mod === "miners") {
    action = pickOne(rng, MINERS_ACTIONS) || "state";
  } else if (mod === "base") {
    action = pickOne(rng, BASE_SCHEDULER_ACTIONS) || "state";
  } else if (mod === "solo_v2") {
    action = "solo_session";
    const games = soloGamesForSimDay(simDay);
    params.gameKey = games[slotIndex % games.length] || games[0] || "quick_flip";
  } else if (mod === "ov2") {
    const dayOv2 = ov2GameForSimDay(simDay);
    action = slotIndex % 3 === 2 ? "ov2_room_create" : "ov2_lobby";
    if (dayOv2) {
      params.ov2GameId = dayOv2.id;
      params.ov2GameTitle = dayOv2.title;
    }
  } else {
    action = "state";
  }

  return { module: mod, action, params };
}

export function defaultDailyPerUserBudget(dailyWindowHours) {
  return Math.min(15, Math.max(5, Math.floor((dailyWindowHours * 60 * 0.85) / 20)));
}

/**
 * Global interleaved daily timeline — module weights per persona, simDay-seeded variation.
 */
export function buildDailyTimeline(personas, {
  simDay = 1,
  dailyWindowHours = 6,
  perUserBudget = null,
  anchorMs = Date.now(),
  runAnchorDate = null,
} = {}) {
  const budget = perUserBudget ?? defaultDailyPerUserBudget(dailyWindowHours);
  const windowMinutes = dailyWindowHours * 60;
  const windowMs = windowMinutes * 60_000;
  const userCount = personas.length;
  const staggerMs = userCount > 1 ? Math.floor((windowMs * 0.35) / userCount) : 0;
  const slotMs = Math.max(20_000, Math.floor((windowMs * 0.55) / Math.max(budget, 1)));

  const timeline = [];

  for (let i = 0; i < personas.length; i++) {
    const persona = personas[i];
    const baseOffset = i * staggerMs;

    for (let slot = 0; slot < budget; slot++) {
      const spec = buildPersonaAction(persona, simDay, slot);
      const scheduledAtMs = anchorMs + baseOffset + slot * slotMs;
      timeline.push({
        scheduledAt: new Date(scheduledAtMs).toISOString(),
        wallClockLabel: new Date(scheduledAtMs).toISOString(),
        module: spec.module,
        action: spec.action,
        params: spec.params,
        persona,
      });
    }
  }

  timeline.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  return {
    timeline,
    meta: {
      simDay,
      userCount,
      perUserBudget: budget,
      totalActions: timeline.length,
      staggerMs,
      slotMs,
      dailyWindowHours,
      windowMinutes,
      anchorMs,
      runAnchorDate: runAnchorDate || new Date(anchorMs).toISOString().slice(0, 10),
    },
  };
}
