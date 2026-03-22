/**
 * World 5 — Salvage Graveyard
 * Sector identity + salvage gameplay readout.
 */

import {
  buildWorld5SalvageAlert,
  getWorld5SalvagePressureSnapshot,
} from "./world5Gameplay";

export const world5SalvageGraveyard = {
  id: "world5",
  order: 5,
  name: "Salvage Graveyard",
  dailyMleoCap: 4600,
};

export const WORLD5_SECTOR_IDENTITY = {
  badgeLabel: "Salvage graveyard",
  tagline: "Recovery pressure · repair loops · sustained salvage discipline",
  descriptor:
    "This sector rewards healthy recovery loops: scrap stock, repair follow-through, and avoiding the maintenance drag that comes from forcing salvage too hard.",
  focusShort: "Scrap · recovery loops · maintenance stress",
  playstyleHint:
    "Build salvage in rhythm with repair support; do not let raw recovery pressure outrun maintenance quality.",
  sectorPressureNote:
    "Higher throughput here turns neglect into drag quickly — salvage harder only when reserves and repair are clean.",
};

function fmtInt(n) {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) ? String(v) : "0";
}

function world5ProgressionNote(ctx) {
  const nextName = ctx?.nextWorldName;
  const canDeploy = !!ctx?.canDeployToNextWorld;

  if (!nextName) return "Terminal graveyard posture — recover cleanly and waste nothing.";

  if (canDeploy) {
    return `Next: ${nextName} — salvage gates satisfied. Deploy when ready for full-system command pressure.`;
  }

  return `Working toward ${nextName}: recovery tiers, elite spread, and repair resilience still need to harden before advance.`;
}

export function getWorld5SalvageSnapshot(state, derived = {}) {
  const salvage = getWorld5SalvagePressureSnapshot(state, derived);
  const scrapStored = Math.floor(Number(state?.resources?.SCRAP ?? state?.resources?.scrap ?? 0));

  return {
    scrapStored,
    salvage,
    alert: buildWorld5SalvageAlert(salvage),
    summaryLine: salvage
      ? `${salvage.compactLine} · ${salvage.recoveryLine}`
      : `Scrap ${fmtInt(scrapStored)} in reserve`,
  };
}

export function buildWorld5PanelFlavor(state, derived, ctx = {}) {
  const id = WORLD5_SECTOR_IDENTITY;
  const flow = getWorld5SalvageSnapshot(state, derived);
  const salvage = flow.salvage;

  const overviewHint =
    salvage?.salvageKey === "rich"
      ? "Rich recovery: strong moment to push salvage while repair stays aligned."
      : salvage?.salvageKey === "strained"
        ? "Strained recovery: repair and reserve quality need attention before more pressure."
        : "Stable recovery: keep salvage and maintenance in balance.";

  return {
    worldOrder: 5,
    panelShellClassName:
      "border-emerald-400/25 bg-gradient-to-br from-emerald-500/[0.07] via-transparent to-amber-500/[0.05]",
    badgeLabel: id.badgeLabel,
    tagline: id.tagline,
    descriptor: id.descriptor,
    focusShort: id.focusShort,
    playstyleHint: salvage?.actionHint || id.playstyleHint,
    sectorPressureNote: salvage?.reason || id.sectorPressureNote,
    progressionNote: world5ProgressionNote(ctx),
    flowMetricLine: flow.summaryLine,
    overviewStripTitle: salvage ? `${id.badgeLabel} · ${salvage.salvageLabel}` : "Salvage graveyard",
    overviewHint,
    overviewStripShellClassName:
      salvage?.salvageKey === "rich"
        ? "rounded-xl border border-emerald-400/25 bg-emerald-500/[0.10] px-3 py-2 text-[11px] leading-snug text-emerald-50/90"
        : salvage?.salvageKey === "strained"
          ? "rounded-xl border border-amber-400/25 bg-amber-500/[0.10] px-3 py-2 text-[11px] leading-snug text-amber-50/90"
          : "rounded-xl border border-emerald-400/25 bg-emerald-500/[0.08] px-3 py-2 text-[11px] leading-snug text-emerald-50/90",
    overviewStripTitleClassName:
      salvage?.salvageKey === "strained"
        ? "font-black uppercase tracking-[0.14em] text-amber-200/90"
        : "font-black uppercase tracking-[0.14em] text-emerald-200/90",
    extraLines: salvage
      ? [
          salvage.systemsLine,
          salvage.recoveryLine,
          `Priority: ${salvage.priority}`,
          `Recommendation: ${salvage.recommendation}`,
        ]
      : [],
  };
}
