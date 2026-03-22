/**
 * World 2 — Freight Orbit
 * Sector identity + throughput gameplay readout.
 */

import {
  buildWorld2FreightAlert,
  getWorld2ThroughputSnapshot,
} from "./world2Gameplay";

export const world2FreightOrbit = {
  id: "world2",
  order: 2,
  name: "Freight Orbit",
  dailyMleoCap: 3700,
};

export const WORLD2_SECTOR_IDENTITY = {
  badgeLabel: "Freight orbit",
  tagline: "Orbital logistics lanes · export rhythm · bank throughput",
  descriptor:
    "This sector rewards disciplined shipping windows, vault cadence, and keeping logistics support ahead of refinery pressure.",
  focusShort: "Logistics · shipping rhythm · bank flow",
  playstyleHint:
    "Batch shipments on clean windows; let logistics tiers and support systems carry throughput before you push raw refinery output.",
  sectorPressureNote:
    "Higher daily cap invites faster fills — watch support quality so exports stay clean under load.",
};

function fmtFlow(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  if (Math.abs(v) >= 1000) return `${Math.round(v).toLocaleString("en-US")}`;
  return v % 1 === 0 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, "");
}

function world2ProgressionNote(ctx) {
  const nextName = ctx?.nextWorldName;
  const canDeploy = !!ctx?.canDeployToNextWorld;

  if (!nextName) return "Final sector protocols — hold orbit discipline.";

  if (canDeploy) {
    return `Next: ${nextName} — all gates clear. Deploy when you are ready to shift cap and pressure profile.`;
  }

  return `Working toward ${nextName}: keep support lines tiered, spread programs, and maintain clean logistics rhythm.`;
}

export function getWorld2FlowSnapshot(state, derived = {}) {
  const lane = getWorld2ThroughputSnapshot(state, derived);
  const banked = Number(state?.bankedMleo ?? state?.banked_mleo ?? 0);
  const shippedToday = Number(state?.stats?.shippedToday ?? state?.stats?.shipped_today ?? 0);
  const sentToday = Number(state?.sentToday ?? state?.sent_today ?? 0);

  return {
    banked,
    shippedToday,
    sentToday,
    lane,
    alert: buildWorld2FreightAlert(lane),
    summaryLine: lane
      ? `${lane.compactLine} · ${lane.shippingLine}`
      : `Pad ${fmtFlow(banked)} banked · ${fmtFlow(shippedToday)} MLEO shipped today · ${fmtFlow(sentToday)} to vault today`,
  };
}

/**
 * @param {object} state
 * @param {object} derived
 * @param {{ nextWorldName?: string | null, canDeployToNextWorld?: boolean }} [ctx]
 */
export function buildWorld2PanelFlavor(state, derived, ctx = {}) {
  const id = WORLD2_SECTOR_IDENTITY;
  const flow = getWorld2FlowSnapshot(state, derived);
  const lane = flow.lane;

  const overviewHint =
    lane?.laneKey === "open"
      ? "Open lane: strong moment to export. Freight support is matching pressure."
      : lane?.laneKey === "congested"
        ? "Congested lane: stabilize support and catch logistics up before pushing harder."
        : "Steady lane: keep exports measured and maintain clean throughput discipline.";

  return {
    worldOrder: 2,
    panelShellClassName:
      "border-amber-400/25 bg-gradient-to-br from-amber-500/[0.06] via-transparent to-cyan-500/[0.04]",
    badgeLabel: id.badgeLabel,
    tagline: id.tagline,
    descriptor: id.descriptor,
    focusShort: id.focusShort,
    playstyleHint: lane?.actionHint || id.playstyleHint,
    sectorPressureNote: lane?.reason || id.sectorPressureNote,
    progressionNote: world2ProgressionNote(ctx),
    flowMetricLine: flow.summaryLine,
    overviewStripTitle: lane ? `${id.badgeLabel} · ${lane.laneLabel}` : "Freight orbit",
    overviewHint,
    overviewStripShellClassName:
      lane?.laneKey === "open"
        ? "rounded-xl border border-emerald-400/25 bg-emerald-500/[0.08] px-3 py-2 text-[11px] leading-snug text-emerald-50/90"
        : lane?.laneKey === "congested"
          ? "rounded-xl border border-amber-400/25 bg-amber-500/[0.09] px-3 py-2 text-[11px] leading-snug text-amber-50/90"
          : "rounded-xl border border-amber-400/25 bg-amber-500/[0.07] px-3 py-2 text-[11px] leading-snug text-amber-50/90",
    overviewStripTitleClassName:
      lane?.laneKey === "open"
        ? "font-black uppercase tracking-[0.14em] text-emerald-200/85"
        : "font-black uppercase tracking-[0.14em] text-amber-200/85",
    extraLines: lane
      ? [
          lane.logisticsLine,
          lane.shippingLine,
          `Priority: ${lane.priority}`,
          `Recommendation: ${lane.recommendation}`,
        ]
      : [],
  };
}
