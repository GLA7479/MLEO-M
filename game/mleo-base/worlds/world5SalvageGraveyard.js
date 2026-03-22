/**
 * World 5 — Salvage Graveyard (sector identity + panel copy only).
 * Read-only display — no economy, cap, or progression changes.
 */

export const world5SalvageGraveyard = {
  id: "world5",
  order: 5,
  name: "Salvage Graveyard",
  dailyMleoCap: 4600,
};

export const WORLD5_SECTOR_IDENTITY = {
  badgeLabel: "Salvage graveyard",
  tagline: "Scrap tides · recovery loops · maintenance under fire",
  descriptor:
    "This sector assumes sustained wear: salvage throughput, backlog pressure, and repair discipline decide whether you rebuild or break under the higher daily ceiling.",
  focusShort: "Salvage · recovery · maintenance & repair support",
  playstyleHint:
    "Let salvage and repair cadence lead; clear maintenance before chasing aggressive refinery stretches.",
  sectorPressureNote:
    "4600-class output accelerates wear — keep repair bay and stability in reserve for rough efficiency windows.",
};

function fmtInt(n) {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) ? String(v) : "0";
}

function fmtMaint(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0.0";
  return v.toFixed(1).replace(/\.0$/, "");
}

/**
 * Read-only salvage / recovery line from existing state.
 */
export function getWorld5SalvageSnapshot(state) {
  const scrap = Math.floor(Number(state?.resources?.SCRAP ?? 0));
  const maintenanceDue = Number(state?.maintenanceDue ?? state?.maintenance_due ?? 0);
  const stability = Number(state?.stability ?? 100);

  const salvageLv = Math.max(0, Math.floor(Number(state?.buildings?.salvage ?? 0)));
  const repairLv = Math.max(0, Math.floor(Number(state?.buildings?.repairBay ?? 0)));
  const repairTier = Math.max(1, Math.floor(Number(state?.buildingTiers?.repairBay ?? 1)));

  const summaryLine = `Scrap ${fmtInt(scrap)} in reserve · Maintenance ${fmtMaint(
    maintenanceDue
  )} due · Salvage L${fmtInt(salvageLv)} · Repair bay L${fmtInt(repairLv)} / T${fmtInt(
    repairTier
  )} · Stability ${fmtInt(stability)}%`;

  return {
    scrap,
    maintenanceDue,
    stability,
    salvageLv,
    repairLv,
    repairTier,
    summaryLine,
  };
}

function world5ProgressionNote(ctx) {
  const nextName = ctx?.nextWorldName;
  const canDeploy = !!ctx?.canDeployToNextWorld;
  if (!nextName) return "Final sector — hold the yard; recovery is the win condition.";
  if (canDeploy) {
    return `Next: ${nextName} — salvage gates cleared. Deploy when ready for the final pressure tier.`;
  }
  return `Working toward ${nextName}: tier-4 split, deeper program grid, and elite volume still ahead — pace recovery, not ego.`;
}

/**
 * @param {object} state
 * @param {object} _derived unused (kept for router parity)
 * @param {{ nextWorldName?: string | null, canDeployToNextWorld?: boolean }} [ctx]
 */
export function buildWorld5PanelFlavor(state, _derived, ctx = {}) {
  const id = WORLD5_SECTOR_IDENTITY;
  const snap = getWorld5SalvageSnapshot(state);

  return {
    worldOrder: 5,
    panelShellClassName:
      "border-teal-400/25 bg-gradient-to-br from-teal-500/[0.07] via-transparent to-zinc-600/[0.06]",
    badgeLabel: id.badgeLabel,
    tagline: id.tagline,
    descriptor: id.descriptor,
    focusShort: id.focusShort,
    playstyleHint: id.playstyleHint,
    sectorPressureNote: id.sectorPressureNote,
    progressionNote: world5ProgressionNote(ctx),
    flowMetricLine: snap.summaryLine,
    overviewStripTitle: "Salvage graveyard",
    overviewHint:
      "Treat scrap and maintenance as front-line resources — higher cap increases strain; rebuild loops before you chase peak output.",
    overviewStripShellClassName:
      "rounded-xl border border-teal-400/25 bg-teal-950/40 px-3 py-2 text-[11px] leading-snug text-teal-50/90",
    overviewStripTitleClassName:
      "font-black uppercase tracking-[0.14em] text-teal-200/90",
  };
}
