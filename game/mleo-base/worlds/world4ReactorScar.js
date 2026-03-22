/**
 * World 4 — Reactor Scar
 * Sector identity + reactor gameplay readout.
 */

import {
  buildWorld4ReactorAlert,
  getWorld4ReactorSnapshot,
} from "./world4Gameplay";

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

function world4ProgressionNote(ctx) {
  const nextName = ctx?.nextWorldName;
  const canDeploy = !!ctx?.canDeployToNextWorld;

  if (!nextName) return "Terminal sector posture — keep the scar cool and the stack honest.";

  if (canDeploy) {
    return `Next: ${nextName} — reactor gates satisfied. Deploy when ready for the next pressure band.`;
  }

  return `Working toward ${nextName}: full support tiers, broader program grid, and elite spread must stabilize before advance.`;
}

export function getWorld4LoadSnapshot(state, derived = {}) {
  const reactor = getWorld4ReactorSnapshot(state, derived);
  const energyNow = Math.floor(Number(state?.resources?.ENERGY ?? 0));
  const energyCap = Math.max(1, Math.floor(Number(derived?.energyCap ?? 1)));

  return {
    energyNow,
    energyCap,
    reactor,
    alert: buildWorld4ReactorAlert(reactor),
    summaryLine: reactor
      ? `${reactor.compactLine} · ${reactor.thermalLine}`
      : `Energy ${fmtInt(energyNow)} / ${fmtInt(energyCap)}`,
  };
}

export function buildWorld4PanelFlavor(state, derived, ctx = {}) {
  const id = WORLD4_SECTOR_IDENTITY;
  const load = getWorld4LoadSnapshot(state, derived);
  const reactor = load.reactor;

  const overviewHint =
    reactor?.loadKey === "primed"
      ? "Primed stack: strong moment for output push or controlled overclock."
      : reactor?.loadKey === "strained"
        ? "Strained stack: recover reserve and maintenance before pushing harder."
        : "Managed load: keep reserve healthy and avoid sloppy overclock timing.";

  return {
    worldOrder: 4,
    panelShellClassName:
      "border-orange-400/25 bg-gradient-to-br from-orange-500/[0.07] via-transparent to-rose-500/[0.05]",
    badgeLabel: id.badgeLabel,
    tagline: id.tagline,
    descriptor: id.descriptor,
    focusShort: id.focusShort,
    playstyleHint: reactor?.actionHint || id.playstyleHint,
    sectorPressureNote: reactor?.reason || id.sectorPressureNote,
    progressionNote: world4ProgressionNote(ctx),
    flowMetricLine: load.summaryLine,
    overviewStripTitle: reactor ? `${id.badgeLabel} · ${reactor.loadLabel}` : "Reactor scar",
    overviewHint,
    overviewStripShellClassName:
      reactor?.loadKey === "primed"
        ? "rounded-xl border border-orange-400/25 bg-orange-500/[0.10] px-3 py-2 text-[11px] leading-snug text-orange-50/90"
        : reactor?.loadKey === "strained"
          ? "rounded-xl border border-rose-400/25 bg-rose-500/[0.10] px-3 py-2 text-[11px] leading-snug text-rose-50/90"
          : "rounded-xl border border-orange-400/25 bg-orange-500/[0.08] px-3 py-2 text-[11px] leading-snug text-orange-50/90",
    overviewStripTitleClassName:
      reactor?.loadKey === "strained"
        ? "font-black uppercase tracking-[0.14em] text-rose-200/90"
        : "font-black uppercase tracking-[0.14em] text-orange-200/90",
    extraLines: reactor
      ? [
          reactor.supportLine,
          reactor.thermalLine,
          `Priority: ${reactor.priority}`,
          `Recommendation: ${reactor.recommendation}`,
        ]
      : [],
  };
}
