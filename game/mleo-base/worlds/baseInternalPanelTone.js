/**
 * Subtle world-aware accents for BASE internal panels (Overview, Operations console).
 * World 1 uses empty strings — unchanged baseline. Presentation only.
 */

const NEUTRAL = {
  opsGrid: "",
  opsHintWrap: "",
  overviewStack: "",
  cardShell: "",
  sectionBar: "",
  availabilityBadge: "",
  systemsHint: "",
  miniStat: "",
  /** Large rounded-3xl section cards (Ops / Build / Intel). */
  panelSectionShell: "",
  /** Collapsed subtitle / hint under section headers. */
  helperRow: "",
  /** Mobile “Ready now” summary block. */
  readyNowShell: "",
  /** Cyan count pill on section headers. */
  sectionCountBadge: "",
  /** Compact stat tiles, log rows, neutral mission rows. */
  compactUtilityTile: "",
  /** Daily mission row when not focus-highlighted. */
  missionRowAccent: "",
};

/** Freight Orbit — amber / cyan, structured movement */
const W2 = {
  opsGrid:
    "relative rounded-[20px] shadow-[0_0_48px_-18px_rgba(251,191,36,0.14),0_0_36px_-14px_rgba(34,211,238,0.08)] before:pointer-events-none before:absolute before:inset-x-3 before:-top-px before:h-px before:rounded-full before:bg-gradient-to-r before:from-transparent before:via-amber-400/45 before:to-cyan-400/35",
  opsHintWrap: "mt-1.5 rounded-lg border border-amber-400/12 bg-amber-500/[0.06] px-2 py-1.5",
  overviewStack:
    "relative before:pointer-events-none before:absolute before:inset-x-0 before:-top-2 before:h-px before:bg-gradient-to-r before:from-transparent before:via-amber-400/35 before:to-cyan-400/30",
  cardShell: "shadow-[inset_0_1px_0_0_rgba(251,191,36,0.05)] ring-1 ring-inset ring-amber-400/[0.06]",
  sectionBar: "mt-1.5 h-0.5 w-10 rounded-full bg-gradient-to-r from-amber-400/55 to-cyan-400/40",
  availabilityBadge: "shadow-[0_0_12px_rgba(251,191,36,0.12)] ring-1 ring-amber-400/20",
  systemsHint: "border-amber-400/12 bg-amber-500/[0.04]",
  miniStat: "border-amber-400/[0.08] shadow-[0_0_14px_-6px_rgba(34,211,238,0.05)]",
  panelSectionShell:
    "relative ring-1 ring-inset ring-amber-400/[0.06] shadow-[inset_0_1px_0_0_rgba(251,191,36,0.045)]",
  helperRow: "border-l-2 border-amber-400/25 pl-2.5",
  readyNowShell:
    "ring-1 ring-inset ring-cyan-400/18 shadow-[0_0_28px_-10px_rgba(251,191,36,0.12),0_0_20px_-8px_rgba(34,211,238,0.08)]",
  sectionCountBadge: "ring-1 ring-amber-400/40 shadow-[0_0_10px_rgba(251,191,36,0.18)]",
  compactUtilityTile:
    "ring-1 ring-inset ring-amber-400/[0.05] shadow-[inset_0_1px_0_0_rgba(34,211,238,0.04)]",
  missionRowAccent: "ring-1 ring-inset ring-amber-400/[0.05]",
};

/** Signal Wastes — violet / cyan, telemetry */
const W3 = {
  opsGrid:
    "relative rounded-[20px] shadow-[0_0_48px_-18px_rgba(167,139,250,0.12),0_0_36px_-14px_rgba(34,211,238,0.08)] before:pointer-events-none before:absolute before:inset-x-3 before:-top-px before:h-px before:rounded-full before:bg-gradient-to-r before:from-transparent before:via-violet-400/45 before:to-cyan-400/40",
  opsHintWrap: "mt-1.5 rounded-lg border border-violet-400/14 bg-violet-500/[0.06] px-2 py-1.5",
  overviewStack:
    "relative before:pointer-events-none before:absolute before:inset-x-0 before:-top-2 before:h-px before:bg-gradient-to-r before:from-transparent before:via-violet-400/38 before:to-cyan-400/32",
  cardShell: "shadow-[inset_0_1px_0_0_rgba(167,139,250,0.06)] ring-1 ring-inset ring-violet-400/[0.07]",
  sectionBar: "mt-1.5 h-0.5 w-10 rounded-full bg-gradient-to-r from-violet-400/55 to-cyan-400/45",
  availabilityBadge: "shadow-[0_0_12px_rgba(167,139,250,0.14)] ring-1 ring-violet-400/22",
  systemsHint: "border-violet-400/12 bg-violet-500/[0.04]",
  miniStat: "border-violet-400/[0.08] shadow-[0_0_14px_-6px_rgba(34,211,238,0.06)]",
  panelSectionShell:
    "relative ring-1 ring-inset ring-violet-400/[0.07] shadow-[inset_0_1px_0_0_rgba(167,139,250,0.05)]",
  helperRow: "border-l-2 border-violet-400/28 pl-2.5",
  readyNowShell:
    "ring-1 ring-inset ring-cyan-400/20 shadow-[0_0_28px_-10px_rgba(167,139,250,0.12),0_0_20px_-8px_rgba(34,211,238,0.08)]",
  sectionCountBadge: "ring-1 ring-violet-400/45 shadow-[0_0_10px_rgba(167,139,250,0.2)]",
  compactUtilityTile:
    "ring-1 ring-inset ring-violet-400/[0.06] shadow-[inset_0_1px_0_0_rgba(34,211,238,0.04)]",
  missionRowAccent: "ring-1 ring-inset ring-violet-400/[0.06]",
};

/** Reactor Scar — orange / rose, thermal */
const W4 = {
  opsGrid:
    "relative rounded-[20px] shadow-[0_0_48px_-18px_rgba(249,115,22,0.14),0_0_36px_-14px_rgba(251,113,133,0.08)] before:pointer-events-none before:absolute before:inset-x-3 before:-top-px before:h-px before:rounded-full before:bg-gradient-to-r before:from-transparent before:via-orange-400/48 before:to-rose-400/35",
  opsHintWrap: "mt-1.5 rounded-lg border border-orange-400/16 bg-orange-500/[0.07] px-2 py-1.5",
  overviewStack:
    "relative before:pointer-events-none before:absolute before:inset-x-0 before:-top-2 before:h-px before:bg-gradient-to-r before:from-transparent before:via-orange-400/42 before:to-rose-400/32",
  cardShell: "shadow-[inset_0_1px_0_0_rgba(249,115,22,0.06)] ring-1 ring-inset ring-orange-400/[0.08]",
  sectionBar: "mt-1.5 h-0.5 w-10 rounded-full bg-gradient-to-r from-orange-400/58 to-rose-400/42",
  availabilityBadge: "shadow-[0_0_14px_rgba(249,115,22,0.12)] ring-1 ring-orange-400/22",
  systemsHint: "border-orange-400/14 bg-orange-500/[0.05]",
  miniStat: "border-orange-400/[0.1] shadow-[0_0_14px_-6px_rgba(251,113,133,0.06)]",
  panelSectionShell:
    "relative ring-1 ring-inset ring-orange-400/[0.08] shadow-[inset_0_1px_0_0_rgba(249,115,22,0.05)]",
  helperRow: "border-l-2 border-orange-400/30 pl-2.5",
  readyNowShell:
    "ring-1 ring-inset ring-orange-400/22 shadow-[0_0_28px_-10px_rgba(249,115,22,0.14),0_0_20px_-8px_rgba(251,113,133,0.08)]",
  sectionCountBadge: "ring-1 ring-orange-400/45 shadow-[0_0_10px_rgba(249,115,22,0.18)]",
  compactUtilityTile:
    "ring-1 ring-inset ring-orange-400/[0.07] shadow-[inset_0_1px_0_0_rgba(251,113,133,0.04)]",
  missionRowAccent: "ring-1 ring-inset ring-orange-400/[0.06]",
};

/** Salvage Graveyard — emerald / amber, reclaimed */
const W5 = {
  opsGrid:
    "relative rounded-[20px] shadow-[0_0_48px_-18px_rgba(16,185,129,0.12),0_0_36px_-14px_rgba(245,158,11,0.08)] before:pointer-events-none before:absolute before:inset-x-3 before:-top-px before:h-px before:rounded-full before:bg-gradient-to-r before:from-transparent before:via-emerald-400/38 before:to-amber-400/32",
  opsHintWrap:
    "mt-1.5 rounded-lg border border-dashed border-emerald-400/18 bg-emerald-500/[0.05] px-2 py-1.5",
  overviewStack:
    "relative before:pointer-events-none before:absolute before:inset-x-0 before:-top-2 before:h-px before:bg-gradient-to-r before:from-transparent before:via-emerald-400/35 before:to-amber-400/28",
  cardShell: "shadow-[inset_0_1px_0_0_rgba(16,185,129,0.05)] ring-1 ring-inset ring-emerald-400/[0.07]",
  sectionBar: "mt-1.5 h-0.5 w-10 rounded-full bg-gradient-to-r from-emerald-400/50 to-amber-400/38",
  availabilityBadge: "shadow-[0_0_12px_rgba(16,185,129,0.1)] ring-1 ring-emerald-400/20",
  systemsHint: "border-emerald-400/12 bg-emerald-500/[0.04]",
  miniStat: "border-emerald-400/[0.08] shadow-[0_0_14px_-6px_rgba(245,158,11,0.05)]",
  panelSectionShell:
    "relative ring-1 ring-inset ring-emerald-400/[0.07] shadow-[inset_0_1px_0_0_rgba(16,185,129,0.045)]",
  helperRow: "border-l-2 border-dashed border-emerald-400/25 pl-2.5",
  readyNowShell:
    "ring-1 ring-inset ring-emerald-400/20 shadow-[0_0_28px_-10px_rgba(16,185,129,0.12),0_0_20px_-8px_rgba(245,158,11,0.07)]",
  sectionCountBadge: "ring-1 ring-emerald-400/40 shadow-[0_0_10px_rgba(16,185,129,0.14)]",
  compactUtilityTile:
    "ring-1 ring-inset ring-emerald-400/[0.06] shadow-[inset_0_1px_0_0_rgba(245,158,11,0.035)]",
  missionRowAccent: "ring-1 ring-inset ring-emerald-400/[0.055]",
};

/** Nexus Prime — cyan / violet, command */
const W6 = {
  opsGrid:
    "relative rounded-[20px] shadow-[0_0_52px_-18px_rgba(34,211,238,0.14),0_0_40px_-14px_rgba(167,139,250,0.1)] before:pointer-events-none before:absolute before:inset-x-3 before:-top-px before:h-px before:rounded-full before:bg-gradient-to-r before:from-transparent before:via-cyan-300/48 before:to-violet-400/38",
  opsHintWrap: "mt-1.5 rounded-lg border border-cyan-300/18 bg-cyan-500/[0.06] px-2 py-1.5",
  overviewStack:
    "relative before:pointer-events-none before:absolute before:inset-x-0 before:-top-2 before:h-px before:bg-gradient-to-r before:from-transparent before:via-cyan-300/42 before:to-violet-400/35",
  cardShell: "shadow-[inset_0_1px_0_0_rgba(34,211,238,0.06)] ring-1 ring-inset ring-cyan-300/[0.08]",
  sectionBar: "mt-1.5 h-0.5 w-10 rounded-full bg-gradient-to-r from-cyan-300/55 to-violet-400/45",
  availabilityBadge: "shadow-[0_0_14px_rgba(34,211,238,0.14)] ring-1 ring-cyan-300/25",
  systemsHint: "border-cyan-300/14 bg-cyan-500/[0.05]",
  miniStat: "border-cyan-300/[0.09] shadow-[0_0_14px_-6px_rgba(167,139,250,0.06)]",
  panelSectionShell:
    "relative ring-1 ring-inset ring-cyan-300/[0.08] shadow-[inset_0_1px_0_0_rgba(34,211,238,0.05)]",
  helperRow: "border-l-2 border-cyan-300/30 pl-2.5",
  readyNowShell:
    "ring-1 ring-inset ring-cyan-300/25 shadow-[0_0_30px_-10px_rgba(34,211,238,0.14),0_0_22px_-8px_rgba(167,139,250,0.1)]",
  sectionCountBadge: "ring-1 ring-cyan-200/50 shadow-[0_0_12px_rgba(34,211,238,0.22)]",
  compactUtilityTile:
    "ring-1 ring-inset ring-cyan-300/[0.07] shadow-[inset_0_1px_0_0_rgba(167,139,250,0.04)]",
  missionRowAccent: "ring-1 ring-inset ring-cyan-300/[0.065]",
};

const BY_ORDER = {
  2: W2,
  3: W3,
  4: W4,
  5: W5,
  6: W6,
};

export function getBaseInternalPanelTone(worldOrder) {
  const n = Number(worldOrder);
  if (!Number.isFinite(n) || n <= 1) return NEUTRAL;
  return BY_ORDER[n] || NEUTRAL;
}
