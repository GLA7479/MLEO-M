/** Aligned with `sql/base_economy_config` + MINERS softcut (daily MLEO production into banked). */
export const DAILY_SOFTCUT = [
  { upto: 0.55, factor: 1.0 },
  { upto: 0.75, factor: 0.55 },
  { upto: 0.9, factor: 0.3 },
  { upto: 1.0, factor: 0.15 },
  { upto: 9.99, factor: 0.06 },
];

export function baseMleoSoftcutFactor(used, cap) {
  if (!cap || cap <= 0) return 1;
  const ratio = Math.max(0, Number(used || 0)) / cap;
  for (const step of DAILY_SOFTCUT) {
    if (ratio <= step.upto) return step.factor;
  }
  return 0.06;
}

export const OFFLINE_TIERS = [
  { hours: 2, factor: 0.55 },
  { hours: 6, factor: 0.35 },
  { hours: 12, factor: 0.18 },
];

export const BUILDINGS = [
  {
    key: "hq",
    name: "HQ",
    desc: "Core base level. Improves global efficiency and unlocks advanced systems.",
    baseCost: { GOLD: 80, ORE: 40 },
    growth: 1.18,
    energyUse: 0,
    outputs: {},
  },
  {
    key: "quarry",
    name: "Quarry",
    desc: "Turns energy into raw Ore.",
    baseCost: { GOLD: 60 },
    growth: 1.18,
    energyUse: 0.72,
    outputs: { ORE: 1.35 },
  },
  {
    key: "tradeHub",
    name: "Trade Hub",
    desc: "Keeps the base liquid with steady Gold income.",
    baseCost: { GOLD: 100, ORE: 30 },
    growth: 1.2,
    energyUse: 0.78,
    outputs: { GOLD: 0.60 },
    requires: [{ key: "quarry", lvl: 1 }],
  },
  {
    key: "salvage",
    name: "Salvage Yard",
    desc: "Recovers Scrap for advanced systems.",
    baseCost: { GOLD: 145, ORE: 80 },
    growth: 1.22,
    energyUse: 0.78,
    outputs: { SCRAP: 0.50 },
    requires: [{ key: "quarry", lvl: 2 }],
  },
  {
    key: "refinery",
    name: "Refinery",
    desc: "Converts Ore + Scrap into bankable MLEO.",
    baseCost: { GOLD: 260, ORE: 165, SCRAP: 30 },
    growth: 1.24,
    energyUse: 0.82,
    convert: { ORE: 1.65, SCRAP: 0.62, MLEO: 0.0165 },
    requires: [
      { key: "salvage", lvl: 1 },
      { key: "tradeHub", lvl: 1 },
    ],
  },
  {
    key: "powerCell",
    name: "Power Cell",
    desc: "Boosts Energy cap and regeneration.",
    baseCost: { GOLD: 180, ORE: 68, SCRAP: 48 },
    growth: 1.22,
    energyUse: 0,
    power: { cap: 42, regen: 2.5 },
    requires: [{ key: "tradeHub", lvl: 1 }],
  },
  {
    key: "minerControl",
    name: "Miner Control",
    desc: "Improves synergy with Miners and increases ore conversion quality.",
    baseCost: { GOLD: 320, ORE: 120, SCRAP: 40 },
    growth: 1.22,
    energyUse: 0.2,
    outputs: { DATA: 0.14 },
    requires: [{ key: "hq", lvl: 2 }],
  },
  {
    key: "arcadeHub",
    name: "Arcade Hub",
    desc: "Turns activity into base progression and improves mission rewards.",
    baseCost: { GOLD: 360, ORE: 90, SCRAP: 50 },
    growth: 1.24,
    energyUse: 0.22,
    outputs: { DATA: 0.11 },
    requires: [{ key: "hq", lvl: 2 }],
  },
  {
    key: "expeditionBay",
    name: "Expedition Bay",
    desc: "Unlocks stronger expeditions and better loot tables.",
    baseCost: { GOLD: 500, ORE: 180, SCRAP: 85 },
    growth: 1.26,
    energyUse: 0,
    outputs: {},
    requires: [
      { key: "hq", lvl: 3 },
      { key: "salvage", lvl: 2 },
    ],
  },
  {
    key: "logisticsCenter",
    name: "Logistics Center",
    desc: "Improves export handling, vault-loop support and command flow.",
    baseCost: { ORE: 240, GOLD: 140, SCRAP: 95 },
    growth: 1.36,
    maxLevel: 15,
    energyUse: 0.2,
    outputs: { DATA: 0.06 },
    requires: [{ key: "hq", lvl: 2 }, { key: "tradeHub", lvl: 2 }],
  },
  {
    key: "researchLab",
    name: "Research Lab",
    desc: "Boosts DATA generation and supports advanced research paths.",
    baseCost: { ORE: 205, GOLD: 160, SCRAP: 95 },
    growth: 1.34,
    maxLevel: 15,
    energyUse: 0.24,
    outputs: { DATA: 0.22 },
    requires: [{ key: "hq", lvl: 2 }, { key: "minerControl", lvl: 1 }],
  },
  {
    key: "repairBay",
    name: "Repair Bay",
    desc: "Improves stability and lowers maintenance pressure.",
    baseCost: { ORE: 180, GOLD: 115, SCRAP: 115 },
    growth: 1.31,
    maxLevel: 15,
    energyUse: 0.22,
    outputs: {},
    requires: [{ key: "hq", lvl: 2 }, { key: "powerCell", lvl: 1 }],
  },
];

export const BUILDING_POWER_STEPS = [0, 25, 50, 75, 100];
export const DEFAULT_BUILDING_POWER_MODE = 100;

export const RUNTIME_CONTROLLED_BUILDINGS = new Set([
  "quarry",
  "tradeHub",
  "salvage",
  "refinery",
  "minerControl",
  "arcadeHub",
  "logisticsCenter",
  "researchLab",
  "repairBay",
]);

export const STRUCTURES_TAB_A = ["hq", "quarry", "tradeHub", "salvage", "refinery", "powerCell"];
export const STRUCTURES_TAB_B = [
  "minerControl",
  "arcadeHub",
  "expeditionBay",
  "logisticsCenter",
  "researchLab",
  "repairBay",
];

export const MODULES = [
  { key: "servoDrill", name: "Servo Drill", desc: "+15% Ore output.", cost: { GOLD: 320, SCRAP: 50 } },
  {
    key: "vaultCompressor",
    name: "Vault Compressor",
    desc: "+8% bank efficiency and stronger vault-loop support.",
    cost: { GOLD: 420, ORE: 120, SCRAP: 70 },
  },
  {
    key: "arcadeRelay",
    name: "Arcade Relay",
    desc: "+15% mission XP and +10% DATA gain.",
    cost: { GOLD: 520, ORE: 160, SCRAP: 90 },
  },
  {
    key: "minerLink",
    name: "Miner Link",
    desc: "+12% Ore and +8% refinery stability.",
    cost: { GOLD: 700, ORE: 260, SCRAP: 110 },
  },
];

export const RESEARCH = [
  { key: "coolant", name: "Coolant Loops", desc: "+1.35 Energy regen and +22 Energy cap.", cost: { ORE: 240, SCRAP: 70 } },
  {
    key: "routing",
    name: "Routing AI",
    desc: "+8% bank efficiency.",
    cost: { ORE: 400, GOLD: 260, SCRAP: 120 },
    requires: ["coolant"],
  },
  {
    key: "fieldOps",
    name: "Field Ops",
    desc: "Crew bonus increases.",
    cost: { ORE: 650, GOLD: 420, SCRAP: 180 },
    requires: ["routing"],
  },
  {
    key: "minerSync",
    name: "Miner Sync",
    desc: "+12% Ore output and +1 daily mission slot.",
    cost: { ORE: 520, GOLD: 300, SCRAP: 130, DATA: 20 },
    requires: ["routing"],
  },
  {
    key: "arcadeOps",
    name: "Arcade Ops",
    desc: "+15% commander XP and +10% expedition rewards.",
    cost: { ORE: 600, GOLD: 420, SCRAP: 180, DATA: 30 },
    requires: ["fieldOps"],
  },
  {
    key: "logistics",
    name: "Logistics",
    desc: "Improves export flow and vault-loop handling.",
    cost: { ORE: 700, GOLD: 460, SCRAP: 220, DATA: 40 },
    requires: ["routing"],
  },
  {
    key: "predictiveMaintenance",
    name: "Predictive Maintenance",
    desc: "Maintenance decay is 25% slower and Repair Bay works better.",
    cost: { ORE: 620, GOLD: 420, SCRAP: 260, DATA: 36 },
    requires: ["fieldOps"],
  },
  {
    key: "deepScan",
    name: "Deep Scan",
    desc: "+18% DATA from expeditions and better rare findings.",
    cost: { ORE: 760, GOLD: 520, SCRAP: 240, DATA: 48 },
    requires: ["arcadeOps"],
  },
  {
    key: "tokenDiscipline",
    name: "Token Discipline",
    desc: "-12% raw banked MLEO output, +22% DATA output, and a more controlled economy style.",
    cost: { ORE: 820, GOLD: 560, SCRAP: 280, DATA: 60 },
    requires: ["logistics", "deepScan"],
  },
];

export const DAILY_MISSIONS = [
  { key: "upgrade_building", name: "Upgrade 1 building", target: 1, reward: { XP: 30, DATA: 10 } },
  { key: "run_expedition", name: "Complete 1 expedition", target: 1, reward: { XP: 35, SCRAP: 24 } },
  { key: "generate_data", name: "Generate 12 DATA", target: 12, reward: { XP: 30, GOLD: 90 } },
  { key: "perform_maintenance", name: "Perform 1 maintenance", target: 1, reward: { XP: 35, DATA: 8 } },
  { key: "double_expedition", name: "Launch 2 expeditions", target: 2, reward: { XP: 40, SCRAP: 28 } },
  { key: "ship_mleo", name: "Ship 60 MLEO", target: 60, reward: { XP: 45, GOLD: 140 } },
  { key: "spend_vault", name: "Spend 50 MLEO from vault", target: 50, reward: { XP: 55, DATA: 14 } },
];

export const CONFIG = {
  title: "MLEO BASE",
  subtitle: "Command your MLEO base, connect Miners + Arcade, and grow your shared vault.",
  startingGold: 332,
  baseEnergyCap: 148,
  baseEnergyRegen: 6.4,
  /** Daily cap on MLEO *production* into banked (server: base_economy_config.daily_mleo_cap). */
  dailyBaseMleoCap: 2500,
  /** Scales refinery MLEO rate vs legacy 0.015 core (server: base_economy_config.mleo_gain_mult). */
  baseMleoGainMult: 0.5,
  /** @deprecated Renamed concept: was shipping cap; production cap is `dailyBaseMleoCap`. */
  dailyShipCap: 2500,
  expeditionCost: 36,
  expeditionCooldownMs: 120_000,
  overclockCost: 900,
  overclockDurationMs: 8 * 60 * 1000,
  refillCost: 160,
  blueprintBaseCost: 1800,
  blueprintGrowth: 1.65,
};

export const EVENT_COOLDOWN_MS = 2 * 60 * 1000;

export const LIVE_EVENTS = [
  {
    key: "reactor_surge",
    title: "Reactor Surge",
    text: "A sudden power spike is stressing core systems. Choose between stability or short-term output.",
    when: (state) => (state.buildings.powerCell || 0) >= 1 || (state.buildings.refinery || 0) >= 1,
    choices: [
      {
        key: "stabilize",
        label: "Stabilize Core",
        effect: { resources: { GOLD: -30, SCRAP: -12 }, stability: +8 },
        log: "Core stabilized. Stability improved.",
      },
      {
        key: "overload",
        label: "Push Output",
        effect: { stability: -6, tempBuff: { key: "surge_boost", untilMs: 60 * 1000 } },
        log: "Reactor overloaded. Production boost active, but stability dropped.",
      },
    ],
  },
  {
    key: "salvage_signal",
    title: "Salvage Signal",
    text: "Your scanners picked up a drifting salvage cluster. Spend energy for a controlled recovery.",
    when: (state) => (state.buildings.salvage || 0) >= 1 || (state.buildings.expeditionBay || 0) >= 1,
    choices: [
      { key: "ignore", label: "Ignore", effect: {}, log: "Signal ignored. No recovery team dispatched." },
      {
        key: "send_scout",
        label: "Send Scout",
        effect: { resources: { ENERGY: -18, SCRAP: +22, DATA: +5 } },
        log: "Scout returned with salvage materials and tactical data.",
      },
      {
        key: "full_recovery",
        label: "Full Recovery",
        effect: { resources: { ENERGY: -28, GOLD: -20, SCRAP: +36, DATA: +8 }, stability: -2 },
        log: "Full recovery team deployed. Larger haul secured.",
      },
    ],
  },
  {
    key: "crew_dispute",
    title: "Crew Dispute",
    text: "Tension is rising among workers. Resolve it cleanly or accept a temporary efficiency dip.",
    when: (state) => (state.crew || 0) >= 2,
    choices: [
      {
        key: "bonus",
        label: "Pay Bonus",
        effect: { resources: { GOLD: -40 }, stability: +4 },
        log: "Crew bonus paid. Morale stabilized.",
      },
      { key: "delay", label: "Delay Response", effect: { stability: -5 }, log: "Issue delayed. Crew morale weakened." },
    ],
  },
  {
    key: "logistics_window",
    title: "Logistics Window",
    text: "A narrow export route is open. Improve your next shipment quality or wait.",
    when: (state) => (state.buildings.logisticsCenter || 0) >= 1,
    choices: [
      {
        key: "prepare",
        label: "Prepare Route",
        effect: { resources: { DATA: -6 }, nextShipBonus: 0.08 },
        log: "Logistics route prepared. Next shipment will be slightly stronger.",
      },
      { key: "skip", label: "Skip Window", effect: {}, log: "Window skipped. Standard export flow maintained." },
    ],
  },
];

export const CREW_ROLES = [
  { key: "engineer", name: "Engineer", desc: "Improves stability handling and maintenance flow." },
  { key: "logistician", name: "Logistician", desc: "Improves shipment preparation and export discipline." },
  { key: "researcher", name: "Researcher", desc: "Focuses on DATA efficiency and system analysis." },
  { key: "scout", name: "Scout", desc: "Improves expedition awareness and field scouting identity." },
  { key: "operations", name: "Operations Chief", desc: "Balances overall command pressure and base rhythm." },
];

export const COMMANDER_PATHS = [
  { key: "industry", name: "Industry", desc: "Production-focused command style with safer infrastructure pacing." },
  { key: "logistics", name: "Logistics", desc: "Shipment discipline, export timing and vault flow identity." },
  { key: "research", name: "Research", desc: "DATA, analysis and long-term systems optimization." },
  { key: "ecosystem", name: "Ecosystem", desc: "Supports synergy with Miners, Arcade and broader MLEO structure." },
];

export const LIVE_CONTRACTS = [
  {
    key: "stability_watch",
    title: "Stability Watch",
    desc: "Keep base stability at 85%+.",
    rewardText: "Reward: DATA 10 · XP 20",
    check: (state) => Number(state.stability || 0) >= 85,
    reward: { DATA: 10, XP: 20 },
  },
  {
    key: "energy_ready",
    title: "Energy Reserve",
    desc: "Keep energy above 45% of cap.",
    rewardText: "Reward: GOLD 80 · XP 15",
    check: (state, derived) =>
      Number(state.resources?.ENERGY || 0) >= Math.floor((derived.energyCap || 0) * 0.45),
    reward: { GOLD: 80, XP: 15 },
  },
  {
    key: "banking_cycle",
    title: "Banking Cycle",
    desc: "Accumulate at least 120 banked MLEO before next shipment.",
    rewardText: "Reward: DATA 8 · SCRAP 16 · XP 18",
    check: (state) => Number(state.bankedMleo || 0) >= 120,
    reward: { DATA: 8, SCRAP: 16, XP: 18 },
  },
  {
    key: "field_readiness",
    title: "Field Readiness",
    desc: "Maintain expedition readiness and 4+ DATA.",
    rewardText: "Reward: GOLD 60 · XP 18",
    check: (state) =>
      Number(state.resources?.DATA || 0) >= 4 && Number(state.expeditionReadyAt || 0) <= Date.now(),
    reward: { GOLD: 60, XP: 18 },
  },
];

export const BASE_HOME_SCENE_ORDER = [
  "hq",
  "quarry",
  "tradeHub",
  "salvage",
  "refinery",
  "powerCell",
  "minerControl",
  "arcadeHub",
  "expeditionBay",
  "logisticsCenter",
  "researchLab",
  "repairBay",
];

export const BASE_HOME_SCENE_POSITIONS_MOBILE = {
  hq: { x: 50, y: 40 },
  powerCell: { x: 80, y: 8 },
  researchLab: { x: 51, y: 10 },
  tradeHub: { x: 20, y: 5 },
  salvage: { x: 15, y: 31 },
  arcadeHub: { x: 50, y: 61 },
  minerControl: { x: 16, y: 18 },
  refinery: { x: 21, y: 47 },
  quarry: { x: 18, y: 62 },
  expeditionBay: { x: 85, y: 29 },
  logisticsCenter: { x: 86, y: 45 },
  repairBay: { x: 78, y: 60 },
};

export const BASE_HOME_SCENE_POSITIONS_DESKTOP = {
  hq: { x: 50, y: 42 },
  tradeHub: { x: 25, y: 14 },
  salvage: { x: 17, y: 31 },
  refinery: { x: 24, y: 50 },
  quarry: { x: 17, y: 70 },
  minerControl: { x: 47, y: 65 },
  arcadeHub: { x: 43, y: 20 },
  powerCell: { x: 79, y: 14 },
  researchLab: { x: 65, y: 10 },
  expeditionBay: { x: 86, y: 31 },
  logisticsCenter: { x: 79, y: 46 },
  repairBay: { x: 86, y: 70 },
};

export const BASE_HOME_SCENE_IDENTITY = {
  hq: { short: "HQ", glow: "emerald", icon: "◆" },
  quarry: { short: "MINE", glow: "amber", icon: "◇" },
  tradeHub: { short: "TRD", glow: "yellow", icon: "◎" },
  salvage: { short: "SAL", glow: "lime", icon: "▣" },
  refinery: { short: "REF", glow: "orange", icon: "⬡" },
  powerCell: { short: "PWR", glow: "cyan", icon: "⚡" },
  minerControl: { short: "MIN", glow: "slate", icon: "▤" },
  arcadeHub: { short: "ARC", glow: "violet", icon: "◉" },
  expeditionBay: { short: "EXP", glow: "violet", icon: "◈" },
  logisticsCenter: { short: "LOG", glow: "sky", icon: "▢" },
  researchLab: { short: "LAB", glow: "indigo", icon: "◉" },
  repairBay: { short: "REP", glow: "teal", icon: "⚙" },
};
