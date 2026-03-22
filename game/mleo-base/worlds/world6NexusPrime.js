/**
 * World 6 — Nexus Prime (sector identity + panel copy only).
 * Read-only display — no economy, cap, or progression changes.
 */

export const world6NexusPrime = {
  id: "world6",
  order: 6,
  name: "Nexus Prime",
  dailyMleoCap: 4900,
};

export const WORLD6_SECTOR_IDENTITY = {
  badgeLabel: "Nexus prime",
  tagline: "Endgame command · integrated stacks · strategic balance under peak cap",
  descriptor:
    "This sector is the synthesis lane: support programs, specialization claims, elite rotations, and core infrastructure must stay aligned while the highest daily ceiling pushes every subsystem at once.",
  focusShort: "Integration · strategic balance · multi-system command",
  playstyleHint:
    "Rotate attention across logistics, lab, and repair lines — win by cadence and buffers, not by maxing one vector alone.",
  sectorPressureNote:
    "4900-class throughput is unforgiving — small slips in stability, energy, or maintenance compound across integrated systems.",
};

const SUPPORT_KEYS = ["logisticsCenter", "researchLab", "repairBay"];

const MILESTONE_KEYS_BY_BUILDING = {
  logisticsCenter: ["disciplined_pipeline", "buffer_authority"],
  researchLab: ["matrix_operator", "telemetry_controller"],
  repairBay: ["preventive_standard", "mesh_discipline"],
};

const MAX_SUPPORT_PROGRAMS = 9;
const MAX_SPECIALIZATION_MILESTONES = 6;

function fmtInt(n) {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) ? String(v) : "0";
}

function countProgramsUnlocked(state) {
  let n = 0;
  for (const b of SUPPORT_KEYS) {
    const u =
      state?.supportProgramUnlocks?.[b] || state?.support_program_unlocks?.[b] || {};
    for (const k of Object.keys(u)) {
      if (u[k] === true) n += 1;
    }
  }
  return n;
}

function countMilestonesClaimed(state) {
  const claimed =
    state?.specializationMilestonesClaimed || state?.specialization_milestones_claimed || {};
  let n = 0;
  for (const b of SUPPORT_KEYS) {
    const bucket = claimed[b];
    if (!bucket || typeof bucket !== "object") continue;
    for (const mk of MILESTONE_KEYS_BY_BUILDING[b] || []) {
      if (bucket[mk]) n += 1;
    }
  }
  return n;
}

function countEliteClaims(state) {
  const m = state?.contractState?.claimed || state?.contract_state?.claimed || {};
  return Object.keys(m).filter((k) => k.startsWith("elite:") && m[k]).length;
}

/**
 * Read-only endgame integration line (existing state only).
 */
export function getWorld6NexusSnapshot(state) {
  const programs = countProgramsUnlocked(state);
  const milestones = countMilestonesClaimed(state);
  const elite = countEliteClaims(state);
  const hq = Math.max(1, Math.floor(Number(state?.buildings?.hq ?? 1)));
  const cmd = Math.max(1, Math.floor(Number(state?.commanderLevel ?? state?.commander_level ?? 1)));
  const stability = Math.floor(Number(state?.stability ?? 100));

  const summaryLine = `Command board: ${fmtInt(programs)}/${MAX_SUPPORT_PROGRAMS} programs · ${fmtInt(
    milestones
  )}/${MAX_SPECIALIZATION_MILESTONES} spec milestones · ${fmtInt(elite)} elite claims · HQ L${fmtInt(
    hq
  )} · Cmdr L${fmtInt(cmd)} · Stability ${fmtInt(stability)}%`;

  return {
    programs,
    milestones,
    elite,
    hq,
    cmd,
    stability,
    summaryLine,
  };
}

function world6ProgressionNote(ctx) {
  if (!ctx?.nextWorldName) {
    return "Final sector — hold Nexus Prime; balance integrated systems under peak daily throughput.";
  }
  return `Staging ${ctx.nextWorldName} — verify sector snapshot if this appears at tier 6.`;
}

/**
 * @param {object} state
 * @param {object} _derived unused (router parity)
 * @param {{ nextWorldName?: string | null, canDeployToNextWorld?: boolean }} [ctx]
 */
export function buildWorld6PanelFlavor(state, _derived, ctx = {}) {
  const id = WORLD6_SECTOR_IDENTITY;
  const snap = getWorld6NexusSnapshot(state);

  return {
    worldOrder: 6,
    panelShellClassName:
      "border-indigo-400/25 bg-gradient-to-br from-indigo-500/[0.08] via-transparent to-violet-500/[0.06]",
    badgeLabel: id.badgeLabel,
    tagline: id.tagline,
    descriptor: id.descriptor,
    focusShort: id.focusShort,
    playstyleHint: id.playstyleHint,
    sectorPressureNote: id.sectorPressureNote,
    progressionNote: world6ProgressionNote(ctx),
    flowMetricLine: snap.summaryLine,
    overviewStripTitle: "Nexus prime",
    overviewHint:
      "Endgame sector: trade off between peak production and integrated support — command mastery means pacing every loop, not sprinting one.",
    overviewStripShellClassName:
      "rounded-xl border border-indigo-400/25 bg-indigo-950/45 px-3 py-2 text-[11px] leading-snug text-indigo-50/90",
    overviewStripTitleClassName:
      "font-black uppercase tracking-[0.14em] text-indigo-200/90",
  };
}
