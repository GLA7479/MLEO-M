/**
 * World 3 — Signal Wastes (sector identity + panel copy only).
 * Display / read-only helpers only — no economy or progression changes.
 */

export const world3SignalWastes = {
  id: "world3",
  order: 3,
  name: "Signal Wastes",
  dailyMleoCap: 4000,
};

/** Static identity strings for UI (command-center tone). */
export const WORLD3_SECTOR_IDENTITY = {
  badgeLabel: "Signal wastes",
  tagline: "Noisy spectrum · research telemetry · disciplined DATA routing",
  descriptor:
    "This sector stresses clean signal hygiene: research depth, lab program discipline, and keeping DATA reserves meaningful under higher production caps.",
  focusShort: "DATA · research · telemetry discipline",
  playstyleHint:
    "Stagger spendy DATA actions with expedition and contracts; keep the lab on a deliberate program instead of chasing every passive spike.",
  sectorPressureNote:
    "Higher cap accelerates refinery and mission pressure — protect stability and energy so telemetry work stays sustainable.",
};

const RESEARCH_LAB_MILESTONE_KEYS = ["matrix_operator", "telemetry_controller"];

function fmtInt(n) {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) ? String(v) : "0";
}

/**
 * Read-only snapshot from existing state (no formula changes).
 */
export function getWorld3SignalSnapshot(state) {
  const dataStored = Math.floor(Number(state?.resources?.DATA ?? 0));
  const research = state?.research && typeof state.research === "object" ? state.research : {};
  const researchActiveCount = Object.keys(research).filter((k) => !!research[k]).length;

  const active =
    state?.supportProgramActive?.researchLab ??
    state?.support_program_active?.researchLab ??
    null;
  const labProgram =
    typeof active === "string" && active.length ? active : null;

  const claimed =
    state?.specializationMilestonesClaimed?.researchLab ??
    state?.specialization_milestones_claimed?.researchLab ??
    {};
  const labMilestonesDone = RESEARCH_LAB_MILESTONE_KEYS.filter((k) => !!claimed[k]).length;

  const summaryLine = `DATA ${fmtInt(dataStored)} in buffer · ${fmtInt(
    researchActiveCount
  )} research tracks on · Lab program: ${
    labProgram || "—"
  } · Lab milestones ${labMilestonesDone}/${RESEARCH_LAB_MILESTONE_KEYS.length}`;

  return {
    dataStored,
    researchActiveCount,
    labProgram,
    labMilestonesDone,
    summaryLine,
  };
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

/**
 * @param {object} state
 * @param {object} _derived reserved (unused)
 * @param {{ nextWorldName?: string | null, canDeployToNextWorld?: boolean }} [ctx]
 */
export function buildWorld3PanelFlavor(state, _derived, ctx = {}) {
  const id = WORLD3_SECTOR_IDENTITY;
  const signal = getWorld3SignalSnapshot(state);

  return {
    worldOrder: 3,
    panelShellClassName:
      "border-violet-400/25 bg-gradient-to-br from-violet-500/[0.07] via-transparent to-cyan-500/[0.04]",
    badgeLabel: id.badgeLabel,
    tagline: id.tagline,
    descriptor: id.descriptor,
    focusShort: id.focusShort,
    playstyleHint: id.playstyleHint,
    sectorPressureNote: id.sectorPressureNote,
    progressionNote: world3ProgressionNote(ctx),
    flowMetricLine: signal.summaryLine,
    overviewStripTitle: "Signal wastes",
    overviewHint:
      "Hold DATA reserves for decisive research and lab windows — higher cap amplifies noise; filter through telemetry discipline.",
    overviewStripShellClassName:
      "rounded-xl border border-violet-400/25 bg-violet-500/[0.08] px-3 py-2 text-[11px] leading-snug text-violet-50/90",
    overviewStripTitleClassName:
      "font-black uppercase tracking-[0.14em] text-violet-200/90",
  };
}
