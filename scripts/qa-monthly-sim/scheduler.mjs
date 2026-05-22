import { pickInt, pickOne, seededForPersona, chance } from "./lib/prng.mjs";
import { buildScheduledAt } from "./lib/wallClock.mjs";
import { soloGamesForSimDay, ov2GameForSimDay } from "./lib/monthlyCoveragePlan.mjs";
import { BASE_SCHEDULER_ACTIONS } from "./lib/baseActions.mjs";

const WINDOW_HOURS = {
  morning: [8, 12],
  afternoon: [13, 17],
  evening: [18, 23],
  burst: [14, 17],
};

const MINERS_ACTIONS = ["state", "accrue", "claim_vault", "gift_claim"];

let soloSlotIndex = 0;

function isActiveToday(persona, simDay, monthDays = 30) {
  const rng = seededForPersona(persona, simDay);
  const activeDays = pickInt(rng, persona.activeDaysMin, persona.activeDaysMax);
  const threshold = activeDays / monthDays;
  return chance(rng, threshold);
}

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

function minutesBudget(persona, rng) {
  const raw = pickInt(rng, persona.dailyMinutesMin, persona.dailyMinutesMax);
  return Math.min(raw, persona.maxDailyMinutes);
}

function gapMinutes(persona, compressed) {
  if (compressed) return 0;
  if (persona.risk === "high" || persona.rapidActions) return pickInt(seededForPersona(persona, 99), 2, 8);
  if (persona.risk === "low" || persona.risk === "none") return pickInt(seededForPersona(persona, 98), 15, 45);
  return pickInt(seededForPersona(persona, 97), 5, 20);
}

function nextSoloGameKey(simDay) {
  const slots = soloGamesForSimDay(simDay);
  if (!slots.length) return "quick_flip";
  const key = slots[soloSlotIndex % slots.length];
  soloSlotIndex += 1;
  return key;
}

function pickBaseAction(rng) {
  return pickOne(rng, BASE_SCHEDULER_ACTIONS) || "state";
}

/**
 * Build ordered actions for one persona on one sim day.
 * @returns {{ active: boolean, actions: Array, totalMinutes: number, runAnchorDate: string }}
 */
export function buildDaySchedule(persona, simDay, { compressed = false, runAnchorDate = null } = {}) {
  if (!isActiveToday(persona, simDay)) {
    return { active: false, actions: [], totalMinutes: 0, runAnchorDate: runAnchorDate || new Date().toISOString().slice(0, 10) };
  }

  const anchor = runAnchorDate || new Date().toISOString().slice(0, 10);
  const rng = seededForPersona(persona, simDay + 1000);
  const totalMinutes = minutesBudget(persona, rng);
  const actions = [];
  let spent = 0;
  const windows = persona.preferredWindows || ["morning"];
  const win = pickOne(rng, windows);
  const [h0, h1] = WINDOW_HOURS[win] || WINDOW_HOURS.morning;
  let cursorHour = pickInt(rng, h0, h1);
  let cursorMin = pickInt(rng, 0, 59);

  const dayOv2 = ov2GameForSimDay(simDay);

  while (spent < totalMinutes) {
    const mod = pickModule(persona, rng);
    let action;
    const params = { personaId: persona.id, displayName: persona.displayName };

    if (mod === "miners") {
      action = pickOne(rng, MINERS_ACTIONS);
    } else if (mod === "base") {
      action = pickBaseAction(rng);
    } else if (mod === "solo_v2") {
      action = "solo_session";
      params.gameKey = nextSoloGameKey(simDay);
    } else if (mod === "ov2") {
      action = rng() > 0.5 ? "ov2_room_create" : "ov2_lobby";
      if (dayOv2) {
        params.ov2GameId = dayOv2.id;
        params.ov2GameTitle = dayOv2.title;
      }
    } else {
      action = "state";
    }

    const scheduledAt = buildScheduledAt(anchor, simDay, cursorHour, cursorMin);

    actions.push({
      scheduledAt,
      wallClockLabel: scheduledAt,
      module: mod,
      action,
      params,
    });

    const actionMinutes = mod === "ov2" ? 8 : mod === "solo_v2" ? 4 : 2;
    spent += actionMinutes;
    const gap = gapMinutes(persona, compressed);
    cursorMin += gap;
    while (cursorMin >= 60) {
      cursorMin -= 60;
      cursorHour += 1;
    }
    if (actions.length > 200) break;
  }

  return { active: true, actions, totalMinutes, runAnchorDate: anchor };
}

export function buildSchedulesForDay(personas, simDay, opts) {
  soloSlotIndex = 0;
  return personas.map(p => ({
    persona: p,
    schedule: buildDaySchedule(p, simDay, opts),
  }));
}
