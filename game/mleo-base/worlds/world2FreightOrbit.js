/**
 * World 2 — Freight Orbit (sector identity + panel copy only).
 * Gameplay math and deploy rules live elsewhere; this module is display / light flavor.
 */

export const world2FreightOrbit = {
  id: "world2",
  order: 2,
  name: "Freight Orbit",
  dailyMleoCap: 3700,
};

/** Static identity strings for UI (command-center tone). */
export const WORLD2_SECTOR_IDENTITY = {
  badgeLabel: "Freight orbit",
  tagline: "Orbital logistics lanes · export rhythm · bank throughput",
  descriptor:
    "This sector rewards disciplined shipping windows, vault cadence, and keeping logistics support ahead of refinery pressure.",
  focusShort: "Logistics · shipping rhythm · bank flow",
  playstyleHint:
    "Batch shipments when the pad is healthy; let logistics tiers and programs carry throughput before you chase raw refinery spikes.",
  sectorPressureNote:
    "Higher daily cap invites faster fills — watch energy and stability so exports stay clean under load.",
};

function fmtFlow(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  if (Math.abs(v) >= 1000) return `${Math.round(v).toLocaleString("en-US")}`;
  return v % 1 === 0 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, "");
}

/**
 * Small read-only flow readout from existing state (no economy changes).
 */
export function getWorld2FlowSnapshot(state) {
  const banked = Number(state?.bankedMleo ?? state?.banked_mleo ?? 0);
  const shippedToday = Number(state?.stats?.shippedToday ?? state?.stats?.shipped_today ?? 0);
  const sentToday = Number(state?.sentToday ?? state?.sent_today ?? 0);
  return {
    banked,
    shippedToday,
    sentToday,
    summaryLine: `Pad ${fmtFlow(banked)} banked · ${fmtFlow(shippedToday)} MLEO shipped today · ${fmtFlow(sentToday)} to vault today`,
  };
}

function world2ProgressionNote(ctx) {
  const nextName = ctx?.nextWorldName;
  const canDeploy = !!ctx?.canDeployToNextWorld;
  if (!nextName) return "Final sector protocols — hold orbit discipline.";
  if (canDeploy) {
    return `Next: ${nextName} — all gates clear. Deploy when you are ready to shift cap and pressure profile.`;
  }
  return `Working toward ${nextName}: keep three support lines tiered, programs spread, and stability/energy within sector gates.`;
}

/**
 * @param {object} state
 * @param {object} _derived reserved for future light flavor (unused — avoids economy coupling)
 * @param {{ nextWorldName?: string | null, canDeployToNextWorld?: boolean }} [ctx]
 */
export function buildWorld2PanelFlavor(state, _derived, ctx = {}) {
  const id = WORLD2_SECTOR_IDENTITY;
  const flow = getWorld2FlowSnapshot(state);

  return {
    worldOrder: 2,
    /** Optional shell accent (Tailwind classes) */
    panelShellClassName:
      "border-amber-400/25 bg-gradient-to-br from-amber-500/[0.06] via-transparent to-cyan-500/[0.04]",
    badgeLabel: id.badgeLabel,
    tagline: id.tagline,
    descriptor: id.descriptor,
    focusShort: id.focusShort,
    playstyleHint: id.playstyleHint,
    sectorPressureNote: id.sectorPressureNote,
    progressionNote: world2ProgressionNote(ctx),
    flowMetricLine: flow.summaryLine,
    /** Shown once near top of Overview when in Freight Orbit */
    overviewStripTitle: "Freight orbit",
    overviewHint:
      "Prioritize logistics throughput and clean shipment timing — cap is higher; pace exports with stability.",
  };
}
