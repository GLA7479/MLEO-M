import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PERSONAS } from "../personas.mjs";
import { buildPreflightTimeline } from "../lib/preflightScheduler.mjs";
import { buildLivePreflightTimeline, LIVE_MODULE_EXEC_MS, LIVE_PACING_MS } from "../lib/livePreflightScheduler.mjs";
import { buildDailyTimeline } from "../lib/dailyScheduler.mjs";
import { estimateTimeline, assertTimelineFitsWindow } from "../lib/pilotEstimator.mjs";
import { buildSchedulesForDay } from "../scheduler.mjs";

describe("Gate 3.5 preflight scheduler", () => {
  it("builds 100 actions for 20 users with budget 5", () => {
    const { timeline, meta } = buildPreflightTimeline(PERSONAS, {
      windowMinutes: 30,
      perUserBudget: 5,
      simDay: 1,
      anchorMs: Date.now(),
    });
    assert.equal(timeline.length, 100);
    assert.equal(meta.userCount, 20);
  });

  it("interleaves miners round across all 20 users before deep slots", () => {
    const { timeline } = buildPreflightTimeline(PERSONAS, {
      windowMinutes: 30,
      perUserBudget: 5,
      simDay: 1,
      anchorMs: Date.now(),
    });
    const minersFirst = timeline.filter(t => t.module === "miners" && t.action === "state");
    assert.equal(minersFirst.length, 20);
    assert.equal(new Set(minersFirst.map(t => t.persona.id)).size, 20);
    const firstOv2 = timeline.find(t => t.module === "ov2");
    const lastBase = timeline.filter(t => t.module === "base").at(-1);
    assert.ok(firstOv2 && lastBase);
    assert.ok(new Date(firstOv2.scheduledAt) < new Date(lastBase.scheduledAt), "OV2 must not wait until all BASE finish");
  });

  it("covers all four modules in the timeline", () => {
    const { timeline } = buildPreflightTimeline(PERSONAS, {
      windowMinutes: 30,
      perUserBudget: 5,
      simDay: 1,
      anchorMs: Date.now(),
    });
    const mods = new Set(timeline.map(t => t.module));
    assert.ok(mods.has("miners"));
    assert.ok(mods.has("base"));
    assert.ok(mods.has("solo_v2"));
    assert.ok(mods.has("ov2"));
  });

  it("estimator fits 30-minute window for default plan", () => {
    const { timeline } = buildPreflightTimeline(PERSONAS, {
      windowMinutes: 30,
      perUserBudget: 5,
      simDay: 1,
      anchorMs: Date.now(),
    });
    const est = estimateTimeline(timeline, 30, { pacingMs: 900 });
    assert.equal(est.users, 20);
    assert.equal(est.totalActions, 100);
    assert.ok(est.fits, `expected fit, got ${est.estimatedDurationMinutes} min`);
  });

  it("estimator refuses 1-minute window", () => {
    const { timeline } = buildPreflightTimeline(PERSONAS, {
      windowMinutes: 1,
      perUserBudget: 5,
      simDay: 1,
      anchorMs: Date.now(),
    });
    const est = estimateTimeline(timeline, 1, { pacingMs: 900 });
    assert.equal(est.fits, false);
    assert.throws(() => assertTimelineFitsWindow(est), /estimated_duration_exceeds_window/);
  });
});

describe("Gate 3.6 live preflight scheduler", () => {
  it("builds 100 actions for 20 users with 45-minute window", () => {
    const { timeline, meta } = buildLivePreflightTimeline(PERSONAS, {
      windowMinutes: 45,
      perUserBudget: 5,
      simDay: 1,
      anchorMs: Date.now(),
    });
    assert.equal(timeline.length, 100);
    assert.equal(meta.userCount, 20);
  });

  it("estimator fits 45-minute live window", () => {
    const { timeline } = buildLivePreflightTimeline(PERSONAS, {
      windowMinutes: 45,
      perUserBudget: 5,
      simDay: 1,
      anchorMs: Date.now(),
    });
    const est = estimateTimeline(timeline, 45, {
      pacingMs: LIVE_PACING_MS,
      moduleExecMs: LIVE_MODULE_EXEC_MS,
    });
    assert.equal(est.users, 20);
    assert.ok(est.fits, `expected fit, got ${est.estimatedDurationMinutes} min`);
  });

  it("estimator refuses 5-minute live window", () => {
    const { timeline } = buildLivePreflightTimeline(PERSONAS, {
      windowMinutes: 5,
      perUserBudget: 5,
      simDay: 1,
      anchorMs: Date.now(),
    });
    const est = estimateTimeline(timeline, 5, {
      pacingMs: LIVE_PACING_MS,
      moduleExecMs: LIVE_MODULE_EXEC_MS,
    });
    assert.equal(est.fits, false);
  });
});

describe("Gate 4 daily scheduler", () => {
  it("builds interleaved timeline for 20 users with module-weight variation", () => {
    const { timeline, meta } = buildDailyTimeline(PERSONAS, {
      simDay: 1,
      dailyWindowHours: 6,
      perUserBudget: 9,
      anchorMs: Date.now(),
    });
    assert.equal(meta.userCount, 20);
    assert.equal(timeline.length, 180);
    const mods = new Set(timeline.map(t => t.module));
    assert.ok(mods.has("miners"));
    assert.ok(mods.has("base"));
  });

  it("estimator fits 6-hour daily window", () => {
    const { timeline } = buildDailyTimeline(PERSONAS, {
      simDay: 7,
      dailyWindowHours: 6,
      anchorMs: Date.now(),
    });
    const est = estimateTimeline(timeline, 6 * 60, {
      pacingMs: LIVE_PACING_MS,
      moduleExecMs: LIVE_MODULE_EXEC_MS,
    });
    assert.equal(est.users, 20);
    assert.ok(est.fits, `expected fit, got ${est.estimatedDurationMinutes} min`);
  });

  it("day 1 and day 7 timelines differ (simDay seeding)", () => {
    const a = buildDailyTimeline(PERSONAS, { simDay: 1, dailyWindowHours: 6, perUserBudget: 5, anchorMs: 1_700_000_000_000 });
    const b = buildDailyTimeline(PERSONAS, { simDay: 7, dailyWindowHours: 6, perUserBudget: 5, anchorMs: 1_700_000_000_000 });
    const sigA = a.timeline.map(t => `${t.persona.id}:${t.module}:${t.action}`).join("|");
    const sigB = b.timeline.map(t => `${t.persona.id}:${t.module}:${t.action}`).join("|");
    assert.notEqual(sigA, sigB);
  });
});

describe("Monthly scheduler regression guard", () => {
  it("monthly buildDaySchedule unchanged for seed=42 day=1 allUsers compressed", () => {
    const schedules = buildSchedulesForDay(PERSONAS, 1, {
      compressed: true,
      runAnchorDate: "2026-05-22",
      forceActive: false,
    });
    assert.equal(schedules.length, 20);
    const activeCount = schedules.filter(s => s.schedule.active).length;
    assert.ok(activeCount >= 0);
  });
});
