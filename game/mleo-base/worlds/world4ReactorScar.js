/**
 * World 4 — Reactor Scar (sector identity + panel copy only).
 * Read-only display helpers — no economy, cap, or progression changes.
 */

export const world4ReactorScar = {
  id: "world4",
  order: 4,
  name: "Reactor Scar",
  dailyMleoCap: 4300,
};

export const WORLD4_SECTOR_IDENTITY = {
  badgeLabel: "Reactor scar",
  tagline: "High thermal ceiling · output push · overclock under discipline",
  descriptor:
    "This sector assumes a heavier production cap: energy budgeting, refinery load, and knowing when to burn overclock versus when to coast define survival.",
  focusShort: "Energy pressure · production push · overclock discipline",
  playstyleHint:
    "Line up refinery runs with energy headroom; treat overclock as a timed burst, not a permanent throttle plate.",
  sectorPressureNote:
    "4300-class daily throughput will drain reserves fast — pre-plan maintenance and power modes before you redline the stack.",
};

function fmtInt(n) {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) ? String(v) : "0";
}

function fmtPct(num, den) {
  const n = Number(num);
  const d = Math.max(1, Number(den));
  if (!Number.isFinite(n)) return "0";
  return Math.min(100, Math.max(0, Math.round((n / d) * 100))).toString();
}

/**
 * Read-only load line: energy vs cap, refinery tier proxy, overclock window (from existing state + derived).
 * @param {object} state
 * @param {object} derived
 */
export function getWorld4LoadSnapshot(state, derived) {
  const energyNow = Math.floor(Number(state?.resources?.ENERGY ?? 0));
  const energyCap = Math.max(1, Math.floor(Number(derived?.energyCap ?? 148)));
  const pct = fmtPct(energyNow, energyCap);

  const refineryLevel = Math.max(0, Math.floor(Number(state?.buildings?.refinery ?? 0)));

  const ocUntil = Number(state?.overclockUntil ?? state?.overclock_until ?? 0);
  const now = Date.now();
  const overclockActive = ocUntil > now;

  const summaryLine = `Energy ${fmtInt(energyNow)} / ${fmtInt(energyCap)} (${pct}% reserve) · Refinery L${fmtInt(
    refineryLevel
  )} · Overclock ${overclockActive ? "live" : "idle"}`;

  return {
    energyNow,
    energyCap,
    pct: Number(pct),
    refineryLevel,
    overclockActive,
    summaryLine,
  };
}

function world4ProgressionNote(ctx) {
  const nextName = ctx?.nextWorldName;
  const canDeploy = !!ctx?.canDeployToNextWorld;
  if (!nextName) return "Terminal sector posture — keep the scar cool and the stack honest.";
  if (canDeploy) {
    return `Next: ${nextName} — reactor gates satisfied. Deploy when ready for the next pressure band.`;
  }
  return `Working toward ${nextName}: full support tiers, broader program grid, and elite spread must stabilize before advance.`;
}

/**
 * @param {object} state
 * @param {object} derived
 * @param {{ nextWorldName?: string | null, canDeployToNextWorld?: boolean }} [ctx]
 */
export function buildWorld4PanelFlavor(state, derived, ctx = {}) {
  const id = WORLD4_SECTOR_IDENTITY;
  const load = getWorld4LoadSnapshot(state, derived);

  return {
    worldOrder: 4,
    panelShellClassName:
      "border-orange-400/25 bg-gradient-to-br from-orange-500/[0.07] via-transparent to-rose-500/[0.05]",
    badgeLabel: id.badgeLabel,
    tagline: id.tagline,
    descriptor: id.descriptor,
    focusShort: id.focusShort,
    playstyleHint: id.playstyleHint,
    sectorPressureNote: id.sectorPressureNote,
    progressionNote: world4ProgressionNote(ctx),
    flowMetricLine: load.summaryLine,
    overviewStripTitle: "Reactor scar",
    overviewHint:
      "Ride production surges with energy discipline — higher cap means faster strain; stage overclock and refinery pushes deliberately.",
    overviewStripShellClassName:
      "rounded-xl border border-orange-400/25 bg-orange-500/[0.08] px-3 py-2 text-[11px] leading-snug text-orange-50/90",
    overviewStripTitleClassName:
      "font-black uppercase tracking-[0.14em] text-orange-200/90",
  };
}
