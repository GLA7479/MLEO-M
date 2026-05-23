import { soloGamesForSimDay, ov2GameForSimDay } from "./monthlyCoveragePlan.mjs";

/** Canonical 5-action module touch sequence for Gate 3.5 preflight. */
const PREFLIGHT_SLOTS = [
  { module: "miners", action: "state" },
  { module: "base", action: "state" },
  { module: "solo_v2", action: "solo_session", needsSoloKey: true },
  { module: "ov2", action: "ov2_lobby", needsOv2: true },
  { module: "miners", action: "accrue" },
];

/**
 * Build a global interleaved timeline for all personas inside a short window.
 * @returns {{ timeline: Array, meta: object }}
 */
export function buildPreflightTimeline(personas, { windowMinutes = 30, perUserBudget = 5, simDay = 1, anchorMs = Date.now() } = {}) {
  const budget = Math.min(Math.max(1, perUserBudget), PREFLIGHT_SLOTS.length);
  const userCount = personas.length;
  const windowMs = windowMinutes * 60_000;
  const staggerMs = userCount > 1 ? Math.floor((windowMs * 0.35) / userCount) : 0;
  const slotMs = Math.max(15_000, Math.floor((windowMs * 0.55) / Math.max(budget, 1)));

  const soloKey = soloGamesForSimDay(simDay)[0] || "quick_flip";
  const dayOv2 = ov2GameForSimDay(simDay);

  const timeline = [];

  for (let i = 0; i < personas.length; i++) {
    const persona = personas[i];
    const baseOffset = i * staggerMs;

    for (let slot = 0; slot < budget; slot++) {
      const spec = PREFLIGHT_SLOTS[slot];
      const scheduledAtMs = anchorMs + baseOffset + slot * slotMs;
      const params = { personaId: persona.id, displayName: persona.displayName };

      if (spec.needsSoloKey) params.gameKey = soloKey;
      if (spec.needsOv2 && dayOv2) {
        params.ov2GameId = dayOv2.id;
        params.ov2GameTitle = dayOv2.title;
      }

      timeline.push({
        scheduledAt: new Date(scheduledAtMs).toISOString(),
        wallClockLabel: new Date(scheduledAtMs).toISOString(),
        module: spec.module,
        action: spec.action,
        params,
        persona,
      });
    }
  }

  timeline.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  return {
    timeline,
    meta: {
      userCount,
      perUserBudget: budget,
      totalActions: timeline.length,
      staggerMs,
      slotMs,
      windowMinutes,
      anchorMs,
      soloKey,
      ov2GameId: dayOv2?.id ?? null,
    },
  };
}
