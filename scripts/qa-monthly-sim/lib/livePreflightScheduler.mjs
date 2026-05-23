import { buildPreflightTimeline } from "./preflightScheduler.mjs";

/** Calibrated avg execution ms per module on live site (real HTTP + Playwright). */
export const LIVE_MODULE_EXEC_MS = {
  miners: 2500,
  base: 3000,
  solo_v2: 8000,
  ov2: 35_000,
};

export const LIVE_PACING_MS = 1500;

/**
 * Gate 3.6 live preflight timeline — same interleave algorithm as Gate 3.5,
 * window default 45 min (30–60 allowed), real wall-clock scheduledAt values.
 */
export function buildLivePreflightTimeline(personas, { windowMinutes = 45, perUserBudget = 5, simDay = 1, anchorMs = Date.now() } = {}) {
  return buildPreflightTimeline(personas, {
    windowMinutes,
    perUserBudget,
    simDay,
    anchorMs,
  });
}
