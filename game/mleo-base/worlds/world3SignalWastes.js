/**
 * World 3 — Signal Wastes
 * Sector identity + telemetry gameplay readout.
 */

import {
  buildWorld3TelemetryAlert,
  getWorld3TelemetrySnapshot,
} from "./world3Gameplay";

export const world3SignalWastes = {
  id: "world3",
  order: 3,
  name: "Signal Wastes",
  dailyMleoCap: 4000,
};

export const WORLD3_SECTOR_IDENTITY = {
  badgeLabel: "Signal wastes",
  tagline: "Noisy spectrum · research telemetry · disciplined DATA routing",
  descriptor:
    "This sector stresses clean signal hygiene: research depth, lab program discipline, and keeping DATA reserves meaningful under higher production caps.",
  focusShort: "DATA · research · telemetry discipline",
  playstyleHint:
    "Stage DATA spending around strong telemetry windows; keep the lab on a deliberate program instead of chasing every passive spike.",
  sectorPressureNote:
    "Higher cap accelerates refinery and mission pressure — protect stability and energy so telemetry work stays sustainable.",
};

function fmtInt(n) {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) ? String(v) : "0";
}

function world3ProgressionNote(ctx) {
  const nextName = ctx?.nextWorldName;
  const canDeploy = !!ctx?.canDeployToNextWorld;

  if (!nextName) return "Final sector hold — keep signals clean and research redundant.";

  if (canDeploy) {
    return `Next: ${nextName} — telemetry gates satisfied. Deploy when ready to shift sector load.`;
  }

  return `Working toward ${nextName}: tier-3 lab pressure, elite proof, and stability bands must align before the next hop.`;
}

export function getWorld3SignalSnapshot(state, derived = {}) {
  const telemetry = getWorld3TelemetrySnapshot(state, derived);
  const dataStored = Math.floor(Number(state?.resources?.DATA ?? 0));

  return {
    dataStored,
    telemetry,
    alert: buildWorld3TelemetryAlert(telemetry),
    summaryLine: telemetry
      ? `${telemetry.compactLine} · ${telemetry.telemetryLine}`
      : `DATA ${fmtInt(dataStored)} in buffer`,
  };
}

export function buildWorld3PanelFlavor(state, derived, ctx = {}) {
  const id = WORLD3_SECTOR_IDENTITY;
  const signal = getWorld3SignalSnapshot(state, derived);
  const telemetry = signal.telemetry;

  const overviewHint =
    telemetry?.signalKey === "clean"
      ? "Clean telemetry: strong moment for research / DATA decisions."
      : telemetry?.signalKey === "noisy"
        ? "Noisy telemetry: stabilize support and stop wasting DATA on weak windows."
        : "Stable telemetry: keep DATA meaningful and maintain lab discipline.";

  return {
    worldOrder: 3,
    panelShellClassName:
      "border-violet-400/25 bg-gradient-to-br from-violet-500/[0.07] via-transparent to-cyan-500/[0.04]",
    badgeLabel: id.badgeLabel,
    tagline: id.tagline,
    descriptor: id.descriptor,
    focusShort: id.focusShort,
    playstyleHint: telemetry?.actionHint || id.playstyleHint,
    sectorPressureNote: telemetry?.reason || id.sectorPressureNote,
    progressionNote: world3ProgressionNote(ctx),
    flowMetricLine: signal.summaryLine,
    overviewStripTitle: telemetry ? `${id.badgeLabel} · ${telemetry.signalLabel}` : "Signal wastes",
    overviewHint,
    overviewStripShellClassName:
      telemetry?.signalKey === "clean"
        ? "rounded-xl border border-violet-400/25 bg-violet-500/[0.10] px-3 py-2 text-[11px] leading-snug text-violet-50/90"
        : telemetry?.signalKey === "noisy"
          ? "rounded-xl border border-amber-400/25 bg-amber-500/[0.09] px-3 py-2 text-[11px] leading-snug text-amber-50/90"
          : "rounded-xl border border-violet-400/25 bg-violet-500/[0.08] px-3 py-2 text-[11px] leading-snug text-violet-50/90",
    overviewStripTitleClassName:
      telemetry?.signalKey === "noisy"
        ? "font-black uppercase tracking-[0.14em] text-amber-200/90"
        : "font-black uppercase tracking-[0.14em] text-violet-200/90",
    extraLines: telemetry
      ? [
          telemetry.systemsLine,
          telemetry.telemetryLine,
          `Priority: ${telemetry.priority}`,
          `Recommendation: ${telemetry.recommendation}`,
        ]
      : [],
  };
}
