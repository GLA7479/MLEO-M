/** Building / research keys aligned with base_atomic_rpc.sql config. */
const BUILDING_REQUIRES = {
  hq: [],
  quarry: [],
  tradeHub: [{ key: "quarry", lvl: 1 }],
  salvage: [{ key: "quarry", lvl: 2 }],
  refinery: [
    { key: "salvage", lvl: 1 },
    { key: "tradeHub", lvl: 1 },
  ],
  powerCell: [{ key: "tradeHub", lvl: 1 }],
  minerControl: [{ key: "hq", lvl: 2 }],
  arcadeHub: [{ key: "hq", lvl: 2 }],
  expeditionBay: [
    { key: "hq", lvl: 3 },
    { key: "salvage", lvl: 2 },
  ],
  logisticsCenter: [
    { key: "hq", lvl: 2 },
    { key: "tradeHub", lvl: 2 },
  ],
  researchLab: [
    { key: "hq", lvl: 2 },
    { key: "minerControl", lvl: 1 },
  ],
  repairBay: [
    { key: "hq", lvl: 2 },
    { key: "powerCell", lvl: 1 },
  ],
};

const BUILDING_MAX_LEVEL = {
  logisticsCenter: 15,
  researchLab: 15,
  repairBay: 15,
};

const RESEARCH_ORDER = [
  "coolant",
  "routing",
  "fieldOps",
  "minerSync",
  "arcadeOps",
  "logistics",
  "predictiveMaintenance",
  "deepScan",
  "tokenDiscipline",
];

const RESEARCH_REQUIRES = {
  coolant: [],
  routing: ["coolant"],
  fieldOps: ["routing"],
  minerSync: ["routing"],
  arcadeOps: ["fieldOps"],
  logistics: ["routing"],
  predictiveMaintenance: ["fieldOps"],
  deepScan: ["arcadeOps"],
  tokenDiscipline: ["logistics", "deepScan"],
};

function buildingLevel(state, key) {
  const buildings = state?.buildings || {};
  return Number(buildings[key] ?? 0);
}

function researchDone(state, key) {
  const research = state?.research || {};
  return Boolean(research[key]);
}

function requirementsMet(state, requires = []) {
  return requires.every(r => buildingLevel(state, r.key) >= r.lvl);
}

export function pickBuildableBuildingKey(state) {
  if (!state) return null;
  for (const key of Object.keys(BUILDING_REQUIRES)) {
    if (!requirementsMet(state, BUILDING_REQUIRES[key])) continue;
    const level = buildingLevel(state, key);
    const max = BUILDING_MAX_LEVEL[key];
    if (max != null && level >= max) continue;
    return key;
  }
  return null;
}

export function pickUnlockableResearchKey(state) {
  if (!state) return null;
  for (const key of RESEARCH_ORDER) {
    if (researchDone(state, key)) continue;
    const reqs = RESEARCH_REQUIRES[key] || [];
    if (!reqs.every(r => researchDone(state, r))) continue;
    return key;
  }
  return null;
}

/** Prefer refill when energy is not full; otherwise skip spend automation. */
export function pickSpendType(state) {
  const energy = Number(state?.energy ?? state?.resources?.energy ?? 100);
  const cap = Number(state?.energyCap ?? state?.maxEnergy ?? 100);
  if (energy < cap * 0.85) return "refill";
  return null;
}

export function mapBaseActionOutcome(res) {
  if (res?.ok) return "ok";
  const msg = String(res?.data?.message || res?.data?.code || "");
  if (/too many requests/i.test(msg)) return "rate_limited";
  if (/invalid building key|invalid research key/i.test(msg)) return "coverage_gap";
  if (
    /already completed|insufficient|not enough|nothing ready|needs more|near full|on cooldown|tier advancement|max level|not available|not unlocked|requirements not met|missing crew_role|missing commander|still out in the field|for maintenance/i.test(
      msg
    )
  ) {
    return "coverage_gap";
  }
  return "error";
}
