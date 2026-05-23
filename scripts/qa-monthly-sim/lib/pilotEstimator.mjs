/** Calibrated avg execution ms per module (compressed local). OV2 includes Playwright launch. */
export const MODULE_EXEC_MS = {
  miners: 1500,
  base: 1500,
  solo_v2: 4000,
  ov2: 20_000,
};

const DEFAULT_PACING_MS = 900;

/**
 * @param {Array} timeline
 * @param {number} windowMinutes
 * @param {{ pacingMs?: number }} [opts]
 */
export function estimateTimeline(timeline, windowMinutes, opts = {}) {
  const pacingMs = opts.pacingMs ?? DEFAULT_PACING_MS;
  const windowMs = windowMinutes * 60_000;

  const perUserCounts = {};
  const perModuleCounts = { miners: 0, base: 0, solo_v2: 0, ov2: 0 };

  for (const item of timeline) {
    const uid = item.persona?.id ?? item.userId ?? "unknown";
    perUserCounts[uid] = (perUserCounts[uid] || 0) + 1;
    if (perModuleCounts[item.module] != null) perModuleCounts[item.module] += 1;
  }

  const users = Object.keys(perUserCounts).length;
  const totalActions = timeline.length;
  const firstAt = timeline[0]?.scheduledAt ?? null;
  const lastAt = timeline.at(-1)?.scheduledAt ?? null;
  const scheduleSpanMs =
    firstAt && lastAt ? new Date(lastAt).getTime() - new Date(firstAt).getTime() : 0;

  const moduleExecMs = opts.moduleExecMs ?? MODULE_EXEC_MS;

  let executionCostMs = 0;
  for (const item of timeline) {
    executionCostMs += moduleExecMs[item.module] ?? 2000;
    executionCostMs += pacingMs;
  }

  const estimatedDurationMs = Math.max(scheduleSpanMs, executionCostMs);
  const fits = estimatedDurationMs <= windowMs;

  return {
    users,
    totalActions,
    perUserCounts,
    perModuleCounts,
    firstAt,
    lastAt,
    scheduleSpanMs,
    executionCostMs,
    estimatedDurationMs,
    estimatedDurationMinutes: +(estimatedDurationMs / 60_000).toFixed(2),
    windowMinutes,
    windowMs,
    fits,
    pacingMs,
  };
}

export function assertTimelineFitsWindow(estimate) {
  if (estimate.fits) return estimate;
  const err = new Error("estimated_duration_exceeds_window");
  err.code = "ESTIMATOR_REFUSE";
  err.estimate = estimate;
  throw err;
}

export function formatEstimate(estimate) {
  return {
    plannedUsers: estimate.users,
    totalPlannedActions: estimate.totalActions,
    actionsPerUser: estimate.perUserCounts,
    perModuleCounts: estimate.perModuleCounts,
    firstScheduledTime: estimate.firstAt,
    lastScheduledTime: estimate.lastAt,
    scheduleSpanMs: estimate.scheduleSpanMs,
    executionCostMs: estimate.executionCostMs,
    estimatedDurationMs: estimate.estimatedDurationMs,
    estimatedDurationMinutes: estimate.estimatedDurationMinutes,
    requestedWindowMinutes: estimate.windowMinutes,
    requestedWindowMs: estimate.windowMs,
    fitsWindow: estimate.fits,
  };
}
