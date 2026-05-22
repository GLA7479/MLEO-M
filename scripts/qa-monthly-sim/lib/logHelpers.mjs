export function timingFields(ctx) {
  const t = ctx?.actionTiming;
  if (!t) return {};
  return {
    plannedAt: t.plannedAt,
    executedAt: t.executedAt,
    waitedMs: t.waitedMs,
    outsideWindow: t.outsideWindow,
    simulatedAt: t.plannedAt,
  };
}
