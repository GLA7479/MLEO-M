/**
 * Wall-clock scheduling for live runs.
 * Immediate batch execution only when dry-run, local+compressed, or explicit compressed (non-live).
 */

export function isImmediateExecutionMode({ dryRun, mode, compressed }) {
  if (dryRun) return true;
  if (compressed) return true;
  if (mode === "local") return true;
  return false;
}

/** @returns {Date} calendar date for sim day N (day 1 = runAnchorDate). */
export function resolveRunAnchorDate(runAnchorDate, simDay) {
  const anchor = runAnchorDate ? new Date(runAnchorDate) : new Date();
  const d = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + (simDay - 1));
  return d;
}

/**
 * Build ISO scheduled time on run anchor + sim day at hour/minute UTC.
 */
export function buildScheduledAt(runAnchorDate, simDay, hour, minute) {
  const d = resolveRunAnchorDate(runAnchorDate, simDay);
  d.setUTCHours(hour, minute, 0, 0);
  return d.toISOString();
}

/**
 * Wait until scheduledAt when live wall-clock mode is active.
 * @returns {{ waitedMs: number, outsideWindow: boolean, executedAt: string }}
 */
export async function waitUntilScheduled(scheduledAt, { immediate }) {
  const executedAt = new Date();
  if (immediate) {
    return { waitedMs: 0, outsideWindow: false, executedAt: executedAt.toISOString() };
  }

  const target = new Date(scheduledAt).getTime();
  const now = executedAt.getTime();
  let outsideWindow = false;
  let waitedMs = 0;

  if (target > now) {
    waitedMs = target - now;
    await new Promise(r => setTimeout(r, waitedMs));
    return {
      waitedMs,
      outsideWindow: false,
      executedAt: new Date().toISOString(),
    };
  }

  outsideWindow = true;
  return {
    waitedMs: 0,
    outsideWindow: true,
    executedAt: new Date().toISOString(),
  };
}

export function assertLiveNotCompressed(mode, compressed) {
  if (mode === "live" && compressed) {
    throw new Error(
      "Refusing --compressed with --mode=live. Compressed execution is only for --dry-run or --mode=local validation."
    );
  }
}
