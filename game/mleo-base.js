import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useAccountModal, useConnectModal } from "@rainbow-me/rainbowkit";
import Layout from "../components/Layout";
import {
  applyBaseVaultDelta,
  getBaseVaultBalance,
  getBaseState,
  buildBuilding,
  installModule,
  researchTech,
  launchExpedition as launchExpeditionAction,
  shipToVault,
  spendFromVault,
  hireCrewAction,
  performMaintenanceAction,
  claimBaseMission,
  setBuildingPowerMode,
} from "../lib/baseVaultClient";

const MAX_LOG_ITEMS = 16;

const DAILY_SOFTCUT = [
  { upto: 0.60, factor: 1.00 },
  { upto: 0.85, factor: 0.72 },
  { upto: 1.00, factor: 0.50 },
  { upto: 1.15, factor: 0.30 },
  { upto: 9.99, factor: 0.16 },
];

const OFFLINE_TIERS = [
  { hours: 2, factor: 0.55 },
  { hours: 6, factor: 0.35 },
  { hours: 12, factor: 0.18 },
];

const BUILDINGS = [
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
    outputs: { ORE: 2.0 },
  },
  {
    key: "tradeHub",
    name: "Trade Hub",
    desc: "Keeps the base liquid with steady Gold income.",
    baseCost: { GOLD: 100, ORE: 30 },
    growth: 1.2,
    energyUse: 0.78,
    outputs: { GOLD: 1.0 },
    requires: [{ key: "quarry", lvl: 1 }],
  },
  {
    key: "salvage",
    name: "Salvage Yard",
    desc: "Recovers Scrap for advanced systems.",
    baseCost: { GOLD: 150, ORE: 90 },
    growth: 1.22,
    energyUse: 0.78,
    outputs: { SCRAP: 0.8 },
    requires: [{ key: "quarry", lvl: 2 }],
  },
  {
    key: "refinery",
    name: "Refinery",
    desc: "Converts Ore + Scrap into bankable MLEO.",
    baseCost: { GOLD: 280, ORE: 180, SCRAP: 35 },
    growth: 1.25,
    energyUse: 1.10,
    convert: { ORE: 1.8, SCRAP: 0.7, MLEO: 0.10 },
    requires: [
      { key: "salvage", lvl: 1 },
      { key: "tradeHub", lvl: 1 },
    ],
  },
  {
    key: "powerCell",
    name: "Power Cell",
    desc: "Boosts Energy cap and regeneration.",
    baseCost: { GOLD: 240, SCRAP: 45 },
    growth: 1.24,
    energyUse: 0,
    power: { cap: 42, regen: 2.2 },
    requires: [{ key: "tradeHub", lvl: 1 }],
  },
  {
    key: "minerControl",
    name: "Miner Control",
    desc: "Improves synergy with Miners and increases ore conversion quality.",
    baseCost: { GOLD: 320, ORE: 120, SCRAP: 40 },
    growth: 1.22,
    energyUse: 0.20,
    outputs: { DATA: 0.18 },
    requires: [{ key: "hq", lvl: 2 }],
  },
  {
    key: "arcadeHub",
    name: "Arcade Hub",
    desc: "Turns activity into base progression and improves mission rewards.",
    baseCost: { GOLD: 360, ORE: 90, SCRAP: 50 },
    growth: 1.24,
    energyUse: 0.22,
    outputs: { DATA: 0.15 },
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
    desc: "Improves shipment quality, export handling and daily ship efficiency.",
    baseCost: { ORE: 220, GOLD: 180, SCRAP: 90 },
    growth: 1.7,
    maxLevel: 15,
    energyUse: 0.20,
    outputs: { DATA: 0.08 },
    requires: [{ key: "hq", lvl: 2 }, { key: "tradeHub", lvl: 2 }],
  },
  {
    key: "researchLab",
    name: "Research Lab",
    desc: "Boosts DATA generation and supports advanced research paths.",
    baseCost: { ORE: 180, GOLD: 240, SCRAP: 110 },
    growth: 1.75,
    maxLevel: 15,
    energyUse: 0.24,
    outputs: { DATA: 0.28 },
    requires: [{ key: "hq", lvl: 2 }, { key: "minerControl", lvl: 1 }],
  },
  {
    key: "repairBay",
    name: "Repair Bay",
    desc: "Improves stability and lowers maintenance pressure.",
    baseCost: { ORE: 160, GOLD: 160, SCRAP: 140 },
    growth: 1.7,
    maxLevel: 15,
    energyUse: 0.22,
    outputs: {},
    requires: [{ key: "hq", lvl: 2 }, { key: "powerCell", lvl: 1 }],
  },
];

const BUILDING_POWER_STEPS = [0, 25, 50, 75, 100];
const DEFAULT_BUILDING_POWER_MODE = 100;

const RUNTIME_CONTROLLED_BUILDINGS = new Set([
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

function fmtRate(value, digits = 2) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 1000) return fmt(n);
  return n.toFixed(digits).replace(/\.?0+$/, "").replace(/\.$/, "");
}

function canThrottleBuilding(buildingKey) {
  return RUNTIME_CONTROLLED_BUILDINGS.has(buildingKey);
}

function normalizePowerMode(value) {
  const n = Number(value);
  return BUILDING_POWER_STEPS.includes(n) ? n : DEFAULT_BUILDING_POWER_MODE;
}

function getBuildingPowerMode(state, buildingKey) {
  if (!canThrottleBuilding(buildingKey)) return DEFAULT_BUILDING_POWER_MODE;
  return normalizePowerMode(state?.buildingPowerModes?.[buildingKey]);
}

function getBuildingPowerFactor(state, buildingKey) {
  return getBuildingPowerMode(state, buildingKey) / 100;
}

function getEffectiveBuildingLevel(state, buildingKey) {
  const baseLevel = Number(state?.buildings?.[buildingKey] || 0);
  return baseLevel * getBuildingPowerFactor(state, buildingKey);
}

function getBuildingEnergyLine(building, level, powerMode) {
  if (building.key === "powerCell") {
    return "Passive: no ENERGY drain · adds cap + regen";
  }

  if (!canThrottleBuilding(building.key)) {
    return "Always active / utility structure";
  }

  const factor = normalizePowerMode(powerMode) / 100;
  const effectiveDrain = (building.energyUse || 0) * level * factor;

  if (normalizePowerMode(powerMode) === 0) {
    return "Drain: 0 ENERGY/s · output stopped";
  }

  if (effectiveDrain > 0) {
    return `Drain at ${powerMode}%: ${fmtRate(effectiveDrain)} ENERGY/s`;
  }

  return "Passive: no ENERGY drain";
}

function getBuildingPowerLine(buildingKey, powerMode) {
  if (!canThrottleBuilding(buildingKey)) return "Always active / utility structure";

  const normalized = normalizePowerMode(powerMode);
  if (normalized === 0) {
    return "Mode 0% · passive output and drain stopped";
  }
  return `Mode ${normalized}% · passive output and drain scaled`;
}

const STRUCTURES_TAB_A = [
  "hq",
  "quarry",
  "tradeHub",
  "salvage",
  "refinery",
  "powerCell",
];

const STRUCTURES_TAB_B = [
  "minerControl",
  "arcadeHub",
  "expeditionBay",
  "logisticsCenter",
  "researchLab",
  "repairBay",
];

const MODULES = [
  {
    key: "servoDrill",
    name: "Servo Drill",
    desc: "+15% Ore output.",
    cost: { GOLD: 320, SCRAP: 50 },
  },
  {
    key: "vaultCompressor",
    name: "Vault Compressor",
    desc: "+8% bank efficiency and +5% ship yield.",
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

const RESEARCH = [
  {
    key: "coolant",
    name: "Coolant Loops",
    desc: "+1.35 Energy regen and +22 Energy cap.",
    cost: { ORE: 240, SCRAP: 70 },
  },
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
    desc: "+10% ship efficiency and smoother export flow.",
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
    desc: "-12% raw banked MLEO output, +22% DATA output, +10% ship quality.",
    cost: { ORE: 820, GOLD: 560, SCRAP: 280, DATA: 60 },
    requires: ["logistics", "deepScan"],
  },
];

const DAILY_MISSIONS = [
  {
    key: "upgrade_building",
    name: "Upgrade 1 building",
    target: 1,
    reward: { XP: 30, DATA: 10 },
  },
  {
    key: "run_expedition",
    name: "Complete 1 expedition",
    target: 1,
    reward: { XP: 35, SCRAP: 24 },
  },
  {
    key: "generate_data",
    name: "Generate 12 DATA",
    target: 12,
    reward: { XP: 30, GOLD: 90 },
  },
  {
    key: "perform_maintenance",
    name: "Perform 1 maintenance",
    target: 1,
    reward: { XP: 35, DATA: 8 },
  },
  {
    key: "double_expedition",
    name: "Launch 2 expeditions",
    target: 2,
    reward: { XP: 40, SCRAP: 28 },
  },
  {
    key: "ship_mleo",
    name: "Ship 60 MLEO",
    target: 60,
    reward: { XP: 45, GOLD: 140 },
  },
  {
    key: "spend_vault",
    name: "Spend 50 MLEO from vault",
    target: 50,
    reward: { XP: 55, DATA: 14 },
  },
];

const CONFIG = {
  title: "MLEO BASE",
  subtitle: "Command your MLEO base, connect Miners + Arcade, and grow your shared vault.",
  startingGold: 320,
  baseEnergyCap: 140,
  baseEnergyRegen: 4.6,
  dailyShipCap: 12_000,
  expeditionCost: 36,
  expeditionCooldownMs: 120_000,
  overclockCost: 900,
  overclockDurationMs: 8 * 60 * 1000,
  refillCost: 180,
  blueprintBaseCost: 1800,
  blueprintGrowth: 1.65,
};

const EVENT_COOLDOWN_MS = 2 * 60 * 1000;

const LIVE_EVENTS = [
  {
    key: "reactor_surge",
    title: "Reactor Surge",
    text: "A sudden power spike is stressing core systems. Choose between stability or short-term output.",
    when: (state) => (state.buildings.powerCell || 0) >= 1 || (state.buildings.refinery || 0) >= 1,
    choices: [
      {
        key: "stabilize",
        label: "Stabilize Core",
        effect: {
          resources: { GOLD: -30, SCRAP: -12 },
          stability: +8,
        },
        log: "Core stabilized. Stability improved.",
      },
      {
        key: "overload",
        label: "Push Output",
        effect: {
          stability: -6,
          tempBuff: { key: "surge_boost", untilMs: 60 * 1000 },
        },
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
      {
        key: "ignore",
        label: "Ignore",
        effect: {},
        log: "Signal ignored. No recovery team dispatched.",
      },
      {
        key: "send_scout",
        label: "Send Scout",
        effect: {
          resources: { ENERGY: -18, SCRAP: +22, DATA: +5 },
        },
        log: "Scout returned with salvage materials and tactical data.",
      },
      {
        key: "full_recovery",
        label: "Full Recovery",
        effect: {
          resources: { ENERGY: -28, GOLD: -20, SCRAP: +36, DATA: +8 },
          stability: -2,
        },
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
        effect: {
          resources: { GOLD: -40 },
          stability: +4,
        },
        log: "Crew bonus paid. Morale stabilized.",
      },
      {
        key: "delay",
        label: "Delay Response",
        effect: {
          stability: -5,
        },
        log: "Issue delayed. Crew morale weakened.",
      },
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
        effect: {
          resources: { DATA: -6 },
          nextShipBonus: 0.08,
        },
        log: "Logistics route prepared. Next shipment will be slightly stronger.",
      },
      {
        key: "skip",
        label: "Skip Window",
        effect: {},
        log: "Window skipped. Standard export flow maintained.",
      },
    ],
  },
];

function getSystemState(stability) {
  const value = Number(stability || 100);
  if (value < 50) return "critical";
  if (value < 70) return "warning";
  return "normal";
}

function systemStateMeta(systemState) {
  if (systemState === "critical") {
    return {
      label: "CRITICAL",
      accent: "rose",
      panel: "border-rose-500/30 bg-rose-500/10",
      text: "Base performance is under pressure. Prioritize maintenance and safe decisions.",
    };
  }
  if (systemState === "warning") {
    return {
      label: "WARNING",
      accent: "amber",
      panel: "border-amber-500/30 bg-amber-500/10",
      text: "Base stability is slipping. Stay ahead before systems degrade further.",
    };
  }
  return {
    label: "STABLE",
    accent: "emerald",
    panel: "border-emerald-500/30 bg-emerald-500/10",
    text: "Systems are healthy. Good time to expand and optimize.",
  };
}

function applyResourceDelta(resources, delta = {}, caps = {}) {
  const next = { ...resources };
  for (const [key, amount] of Object.entries(delta)) {
    const current = Number(next[key] || 0);
    const raw = current + Number(amount || 0);
    const maxCap = Number.isFinite(caps[key]) ? caps[key] : Infinity;
    next[key] = clamp(raw, 0, maxCap);
  }
  return next;
}

function canApplyEventChoice(state, choice, derived) {
  const delta = choice?.effect?.resources || {};
  return Object.entries(delta).every(([key, value]) => {
    if (value >= 0) return true;
    return (state.resources[key] || 0) >= Math.abs(value);
  });
}

function pickLiveEvent(state) {
  const candidates = LIVE_EVENTS.filter((event) => event.when(state));
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

const CREW_ROLES = [
  {
    key: "engineer",
    name: "Engineer",
    desc: "Improves stability handling and maintenance flow.",
  },
  {
    key: "logistician",
    name: "Logistician",
    desc: "Improves shipment preparation and export discipline.",
  },
  {
    key: "researcher",
    name: "Researcher",
    desc: "Focuses on DATA efficiency and system analysis.",
  },
  {
    key: "scout",
    name: "Scout",
    desc: "Improves expedition awareness and field scouting identity.",
  },
  {
    key: "operations",
    name: "Operations Chief",
    desc: "Balances overall command pressure and base rhythm.",
  },
];

const COMMANDER_PATHS = [
  {
    key: "industry",
    name: "Industry",
    desc: "Production-focused command style with safer infrastructure pacing.",
  },
  {
    key: "logistics",
    name: "Logistics",
    desc: "Shipment discipline, export timing and vault flow identity.",
  },
  {
    key: "research",
    name: "Research",
    desc: "DATA, analysis and long-term systems optimization.",
  },
  {
    key: "ecosystem",
    name: "Ecosystem",
    desc: "Supports synergy with Miners, Arcade and broader MLEO structure.",
  },
];

function crewRoleMeta(roleKey) {
  return CREW_ROLES.find((item) => item.key === roleKey) || CREW_ROLES[0];
}

function commanderPathMeta(pathKey) {
  return COMMANDER_PATHS.find((item) => item.key === pathKey) || COMMANDER_PATHS[0];
}

const LIVE_CONTRACTS = [
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
      Number(state.resources?.DATA || 0) >= 4 &&
      Number(state.expeditionReadyAt || 0) <= Date.now(),
    reward: { GOLD: 60, XP: 18 },
  },
];

function buildingRoleTag(key) {
  if (["quarry", "tradeHub", "salvage", "refinery"].includes(key)) return "Production";
  if (["powerCell", "repairBay"].includes(key)) return "Systems";
  if (["minerControl", "arcadeHub"].includes(key)) return "Ecosystem";
  if (["expeditionBay", "researchLab", "logisticsCenter"].includes(key)) return "Command";
  return "Core";
}

function buildingSynergyTag(key) {
  if (key === "minerControl") return "Synergy: Miners";
  if (key === "arcadeHub") return "Synergy: Arcade";
  if (key === "refinery") return "Synergy: Vault loop";
  if (key === "logisticsCenter") return "Synergy: Shipments";
  if (key === "researchLab") return "Synergy: DATA";
  if (key === "repairBay") return "Synergy: Stability";
  if (key === "expeditionBay") return "Synergy: Expeditions";
  if (key === "powerCell") return "Synergy: Energy";
  return "Synergy: Base";
}

function buildingRiskTag(key) {
  if (key === "refinery") return "Risk: Stability load";
  if (key === "quarry") return "Risk: Energy demand";
  if (key === "tradeHub") return "Risk: Low impact";
  if (key === "salvage") return "Risk: Medium load";
  if (key === "powerCell") return "Risk: Low";
  if (key === "repairBay") return "Risk: Low";
  if (key === "researchLab") return "Risk: Energy pressure";
  if (key === "logisticsCenter") return "Risk: Low";
  if (key === "expeditionBay") return "Risk: Resource timing";
  return "Risk: Low";
}

function sectorStatusForBuilding(key, state) {
  const level = Number(state.buildings?.[key] || 0);
  const stability = Number(state.stability || 100);

  if (level <= 0) return "offline";
  if (stability < 50 && ["refinery", "researchLab", "logisticsCenter"].includes(key)) return "critical";
  if (stability < 70 && ["repairBay", "powerCell", "refinery"].includes(key)) return "warning";
  return "active";
}

function sectorStatusClasses(status) {
  if (status === "critical") return "border-rose-500/35 bg-rose-500/10 text-rose-200";
  if (status === "warning") return "border-amber-500/35 bg-amber-500/10 text-amber-200";
  if (status === "active") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  return "border-white/10 bg-white/5 text-white/45";
}

function getAlerts(state, derived, systemState, liveContracts = []) {
  const alerts = [];

  const energy = Number(state.resources?.ENERGY || 0);
  const energyCap = Number(derived.energyCap || 0);
  const banked = Number(state.bankedMleo || 0);
  const sentToday = Number(state.sentToday || 0);
  const shipCap = Number(derived.shipCap || 0);
  const expeditionReady = Number(state.expeditionReadyAt || 0) <= Date.now();
  const claimableContracts = liveContracts.filter((c) => c.done && !c.claimed).length;

  if (systemState === "critical") {
    alerts.push({
      key: "critical-stability",
      tone: "critical",
      title: "Critical stability",
      text: "Systems are under pressure. Prioritize maintenance and safe actions.",
    });
  } else if (systemState === "warning") {
    alerts.push({
      key: "warning-stability",
      tone: "warning",
      title: "Stability slipping",
      text: "Base performance is softening. Repair flow is recommended soon.",
    });
  }

  if (energyCap > 0 && energy <= energyCap * 0.08) {
    alerts.push({
      key: "low-energy",
      tone: "critical",
      title: "Critical energy reserve",
      text: "Energy reserve is critically low. Refill now or allow systems to recover.",
    });
  } else if (energyCap > 0 && energy <= energyCap * 0.18) {
    alerts.push({
      key: "low-energy",
      tone: "warning",
      title: "Low energy reserve",
      text: "Energy is getting low. Consider refill or Power Cell soon.",
    });
  }

  if (
    expeditionReady &&
    Number(state.resources?.DATA || 0) >= 4 &&
    Number(state.resources?.ENERGY || 0) >= CONFIG.expeditionCost
  ) {
    alerts.push({
      key: "expedition-ready",
      tone: "info",
      title: "Expedition ready",
      text: "Field team is available for deployment.",
    });
  }

  if (shipCap > 0 && sentToday / shipCap >= 0.8) {
    alerts.push({
      key: "ship-pressure",
      tone: "warning",
      title: "Ship cap nearing limit",
      text: "Daily export capacity is getting tight. Pace shipments carefully.",
    });
  }

  if (claimableContracts > 0) {
    alerts.push({
      key: "contracts-ready",
      tone: "success",
      title: "Contract reward ready",
      text: `${claimableContracts} command contract${claimableContracts > 1 ? "s are" : " is"} ready to claim.`,
    });
  }

  return alerts.slice(0, 4);
}

function alertToneClasses(tone) {
  if (tone === "critical") {
    return "border-white/10 bg-white/[0.04] text-rose-200 shadow-[inset_0_0_0_1px_rgba(244,63,94,0.28)]";
  }

  if (tone === "warning") {
    return "border-white/10 bg-white/[0.04] text-amber-200 shadow-[inset_0_0_0_1px_rgba(250,204,21,0.24)]";
  }

  if (tone === "success") {
    return "border-white/10 bg-white/[0.04] text-emerald-200 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.24)]";
  }

  return "border-white/10 bg-white/[0.04] text-sky-200 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.22)]";
}

function highlightCard(condition, mode = "info") {
  if (!condition) return "";

  if (mode === "critical") {
    return "rounded-2xl border border-rose-400/50 bg-rose-500/12 shadow-[0_0_0_1px_rgba(244,63,94,0.10),0_0_14px_rgba(244,63,94,0.06)]";
  }

  if (mode === "warning") {
    return "rounded-2xl border border-amber-400/45 bg-amber-500/12 shadow-[0_0_0_1px_rgba(250,204,21,0.09),0_0_12px_rgba(250,204,21,0.05)]";
  }

  if (mode === "success") {
    return "rounded-2xl border border-emerald-400/28 bg-white/[0.02] shadow-[0_0_0_1px_rgba(52,211,153,0.09),0_0_12px_rgba(52,211,153,0.05)]";
  }

  return "rounded-2xl border border-cyan-400/24 bg-white/[0.02] shadow-[0_0_0_1px_rgba(34,211,238,0.08),0_0_12px_rgba(34,211,238,0.04)]";
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function fmt(value) {
  const n = Number(value || 0);
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return `${Math.floor(n)}`;
}

function formatResourceValue(value) {
  const n = Number(value || 0);
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return `${Math.floor(n)}`;
}

function costTone(current, needed) {
  return Number(current || 0) >= Number(needed || 0)
    ? "text-emerald-300"
    : "text-rose-300";
}

function canCoverCost(resources, cost) {
  return Object.entries(cost || {}).every(
    ([key, value]) => Number(resources?.[key] || 0) >= Number(value || 0)
  );
}

function ResourceCostRow({ cost, resources }) {
  const entries = Object.entries(cost || {}).filter(([, value]) => Number(value || 0) > 0);

  return (
    <div className="mt-1.5 min-h-[34px] max-h-[34px] overflow-hidden">
      {entries.length ? (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold leading-4">
          {entries.slice(0, 3).map(([key, value]) => (
            <span key={key} className={costTone(resources?.[key], value)}>
              {key} {formatResourceValue(value)}
            </span>
          ))}
        </div>
      ) : (
        <div className="h-[34px]" />
      )}
    </div>
  );
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function safeParse(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function loadJson(key, fallback) {
  if (typeof window === "undefined") return fallback;
  return safeParse(window.localStorage.getItem(key), fallback);
}

function saveJson(key, value) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function saveBaseProfilePatch(patch) {
  if (typeof window === "undefined") return;
  const current = loadJson("mleo_base_profile_v1", {}) || {};
  window.localStorage.setItem(
    "mleo_base_profile_v1",
    JSON.stringify({
      ...current,
      ...patch,
    })
  );
}

function pushLog(log, text) {
  const next = [{ id: `${Date.now()}-${Math.random()}`, ts: Date.now(), text }, ...(log || [])];
  return next.slice(0, MAX_LOG_ITEMS);
}

function buildingCost(def, level) {
  const factor = Math.pow(def.growth || 1, level);
  const earlyDiscount =
    level === 0 ? 0.82
    : level === 1 ? 0.88
    : level === 2 ? 0.92
    : 1;
  const out = {};
  for (const [key, value] of Object.entries(def.baseCost || {})) {
    out[key] = Math.ceil(value * factor * earlyDiscount);
  }
  return out;
}

function crewCost(count) {
  return {
    GOLD: Math.ceil(120 * Math.pow(1.16, count)),
    ORE: Math.ceil(55 * Math.pow(1.14, count)),
    SCRAP: Math.ceil(18 * Math.pow(1.16, count)),
  };
}

function canAfford(stock, cost) {
  return Object.entries(cost || {}).every(([key, value]) => (stock[key] || 0) >= value);
}

function pay(stock, cost) {
  const next = { ...stock };
  for (const [key, value] of Object.entries(cost || {})) {
    next[key] = Math.max(0, (next[key] || 0) - value);
  }
  return next;
}

function hasResources(resources, cost = {}) {
  return Object.entries(cost).every(([key, amount]) => (resources[key] || 0) >= amount);
}

function spendResources(resources, cost = {}) {
  const next = { ...resources };
  for (const [key, amount] of Object.entries(cost)) {
    next[key] = Math.max(0, (next[key] || 0) - amount);
  }
  return next;
}

function unlocked(def, state) {
  if (!def.requires?.length) return true;
  return def.requires.every((req) => (state.buildings[req.key] || 0) >= (req.lvl || 1));
}

/** Server-aligned softcut: factor between 1.0 and 0.5 by sent_today/ship_cap ratio. */
function getShipSoftcutFactor(sentToday, shipCap) {
  const safeCap = Math.max(1, Number(shipCap || 0));
  const safeSent = Math.max(0, Number(sentToday || 0));
  const ratio = safeSent / safeCap;
  return Math.max(0.5, 1 - ratio * 0.5);
}

function softcutFactor(used, cap) {
  return getShipSoftcutFactor(used, cap);
}

function offlineFactorFor(ms) {
  let remaining = Math.max(0, ms);
  let consumed = 0;
  let weighted = 0;
  let startMs = 0;
  for (const tier of OFFLINE_TIERS) {
    const tierEnd = tier.hours * 3600 * 1000;
    const room = Math.max(0, tierEnd - startMs);
    const take = Math.min(remaining, room);
    if (take <= 0) break;
    weighted += take * tier.factor;
    consumed += take;
    remaining -= take;
    startMs = tierEnd;
  }
  if (consumed <= 0) return 0;
  return weighted / consumed;
}

async function readVaultSafe() {
  try {
    const res = await getBaseVaultBalance();
    if (!res?.ok) return 0;
    const value = Number(res.balance || 0);
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  } catch {
    return 0;
  }
}

/** Blueprint is paid from shared vault MLEO + DATA; not state.resources ORE/GOLD/SCRAP. */
function canAffordBlueprint(state, sharedVault, cost, dataCost) {
  const vault = Number(
    sharedVault ?? state?.sharedMleo ?? state?.sharedVault ?? state?.vaultMleo ?? 0
  );
  const data = Number(state?.resources?.DATA || 0);
  return vault >= Number(cost || 0) && data >= Number(dataCost || 0);
}

async function addToVault(amount, gameId = "mleo-base") {
  const delta = Math.max(0, Math.floor(Number(amount || 0)));
  if (!delta) return { ok: true, skipped: true };
  return applyBaseVaultDelta(delta, gameId);
}

function xpForLevel(level) {
  return 120 + (level - 1) * 80;
}

function applyLevelUps(next) {
  const state = {
    ...next,
    log: [...(next.log || [])],
  };
  while (state.commanderXp >= xpForLevel(state.commanderLevel)) {
    state.commanderXp -= xpForLevel(state.commanderLevel);
    state.commanderLevel += 1;
    state.log = pushLog(state.log, `Commander Level ${state.commanderLevel} reached.`);
  }
  return state;
}

function getMissionProgress(state) {
  return {
    upgrade_building: Number(state?.stats?.upgradesToday || 0),
    ship_mleo: Number(state?.stats?.shippedToday || 0),
    run_expedition: Number(state?.stats?.expeditionsToday || 0),
    spend_vault: Number(state?.stats?.vaultSpentToday || 0),
    generate_data: Number(state?.stats?.dataToday || 0),
    perform_maintenance: Number(state?.stats?.maintenanceToday || 0),
    double_expedition: Number(state?.stats?.expeditionsToday || 0),
  };
}

function freshState() {
  return {
    version: 6,
    lastDay: todayKey(),
    lastHiddenAt: 0,
    starterPackClaimed: false,
    resources: {
      ORE: 70,
      GOLD: CONFIG.startingGold,
      SCRAP: 22,
      ENERGY: CONFIG.baseEnergyCap,
      DATA: 10,
    },
    lastTickAt: Date.now(),
    buildings: {
      hq: 1,
      quarry: 1,
      tradeHub: 0,
      salvage: 0,
      refinery: 0,
      powerCell: 0,
      minerControl: 0,
      arcadeHub: 0,
      expeditionBay: 0,
      logisticsCenter: 0,
      researchLab: 0,
      repairBay: 0,
    },
    buildingPowerModes: {},
    crew: 0,
    crewRole: "engineer",
    modules: {},
    research: {},
    bankedMleo: 0,
    sentToday: 0,
    totalBanked: 0,
    blueprintLevel: 0,
    totalSharedSpent: 0,
    overclockUntil: 0,
    expeditionReadyAt: Date.now(),
    maintenanceDue: 0,
    stability: 100,
    commanderXp: 0,
    commanderLevel: 1,
    commanderPath: "industry",
    totalExpeditions: 0,
    totalMissionsDone: 0,
    stats: {
      upgradesToday: 0,
      shippedToday: 0,
      expeditionsToday: 0,
      vaultSpentToday: 0,
      dataToday: 0,
      maintenanceToday: 0,
    },
    missionState: {
      dailySeed: todayKey(),
      completed: {},
      claimed: {},
    },
    log: pushLog([], "MLEO BASE online. HQ is active."),
  };
}

function safeNumber(value, fallback = 0, min = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, n);
}

function safeInteger(value, fallback = 0, min = 0) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, n);
}

function normalizeBuildingPowerModes(rawModes, rawPaused = null) {
  const out = {};
  for (const key of RUNTIME_CONTROLLED_BUILDINGS) {
    const raw = rawModes?.[key];
    if (BUILDING_POWER_STEPS.includes(Number(raw))) {
      out[key] = Number(raw);
      continue;
    }

    // Backward compat: rawPaused can be the old pausedBuildings/paused_buildings boolean map.
    if (rawPaused && typeof rawPaused[key] === "boolean") {
      out[key] = rawPaused[key] ? 0 : 100;
    }
  }
  return out;
}

function sanitizeBaseState(raw, fallback = null) {
  const seed = fallback || freshState();
  const src = raw && typeof raw === "object" ? raw : {};

  return {
    ...seed,
    ...src,

    version: safeInteger(src.version, seed.version, 1),
    lastDay: typeof src.lastDay === "string" ? src.lastDay : seed.lastDay,
    lastTickAt: safeInteger(src.lastTickAt, seed.lastTickAt, 0),
    lastHiddenAt: safeInteger(src.lastHiddenAt, 0, 0),

    resources: {
      ...seed.resources,
      ...(src.resources || {}),
      ORE: safeNumber(src?.resources?.ORE, seed.resources.ORE, 0),
      GOLD: safeNumber(src?.resources?.GOLD, seed.resources.GOLD, 0),
      SCRAP: safeNumber(src?.resources?.SCRAP, seed.resources.SCRAP, 0),
      ENERGY: safeNumber(src?.resources?.ENERGY, seed.resources.ENERGY, 0),
      DATA: safeNumber(src?.resources?.DATA, seed.resources.DATA, 0),
    },

    buildings: {
      ...seed.buildings,
      ...(src.buildings || {}),
      hq: safeInteger(src?.buildings?.hq, seed.buildings.hq, 1),
      quarry: safeInteger(src?.buildings?.quarry, seed.buildings.quarry, 0),
      tradeHub: safeInteger(src?.buildings?.tradeHub, seed.buildings.tradeHub, 0),
      salvage: safeInteger(src?.buildings?.salvage, seed.buildings.salvage, 0),
      refinery: safeInteger(src?.buildings?.refinery, seed.buildings.refinery, 0),
      powerCell: safeInteger(src?.buildings?.powerCell, seed.buildings.powerCell, 0),
      minerControl: safeInteger(src?.buildings?.minerControl, seed.buildings.minerControl, 0),
      arcadeHub: safeInteger(src?.buildings?.arcadeHub, seed.buildings.arcadeHub, 0),
      expeditionBay: safeInteger(src?.buildings?.expeditionBay, seed.buildings.expeditionBay, 0),
      logisticsCenter: safeInteger(src?.buildings?.logisticsCenter, seed.buildings.logisticsCenter, 0),
      researchLab: safeInteger(src?.buildings?.researchLab, seed.buildings.researchLab, 0),
      repairBay: safeInteger(src?.buildings?.repairBay, seed.buildings.repairBay, 0),
    },

    buildingPowerModes: normalizeBuildingPowerModes(
      src?.buildingPowerModes || src?.building_power_modes || {},
      src?.pausedBuildings || src?.paused_buildings || {}
    ),

    crew: safeInteger(src.crew, seed.crew, 0),
    crewRole: typeof src.crewRole === "string" ? src.crewRole : seed.crewRole,
    commanderPath: typeof src.commanderPath === "string" ? src.commanderPath : seed.commanderPath,

    modules: src.modules && typeof src.modules === "object" ? src.modules : {},
    research: src.research && typeof src.research === "object" ? src.research : {},

    bankedMleo: safeNumber(src.bankedMleo, seed.bankedMleo, 0),
    sentToday: safeNumber(src.sentToday, seed.sentToday, 0),
    totalBanked: safeNumber(src.totalBanked, seed.totalBanked, 0),
    blueprintLevel: safeInteger(src.blueprintLevel, seed.blueprintLevel, 0),
    totalSharedSpent: safeNumber(src.totalSharedSpent, seed.totalSharedSpent, 0),
    overclockUntil: safeInteger(src.overclockUntil, seed.overclockUntil, 0),
    expeditionReadyAt: safeInteger(src.expeditionReadyAt, seed.expeditionReadyAt, 0),
    maintenanceDue: safeNumber(src.maintenanceDue, seed.maintenanceDue, 0),
    stability: safeNumber(src.stability, seed.stability, 0),
    commanderXp: safeNumber(src.commanderXp, seed.commanderXp, 0),
    commanderLevel: safeInteger(src.commanderLevel, seed.commanderLevel, 1),
    totalExpeditions: safeInteger(src.totalExpeditions, seed.totalExpeditions, 0),
    totalMissionsDone: safeInteger(src.totalMissionsDone, seed.totalMissionsDone, 0),

    stats: {
      ...seed.stats,
      ...(src.stats || {}),
      upgradesToday: safeInteger(src?.stats?.upgradesToday, seed.stats.upgradesToday, 0),
      shippedToday: safeNumber(src?.stats?.shippedToday, seed.stats.shippedToday, 0),
      expeditionsToday: safeInteger(src?.stats?.expeditionsToday, seed.stats.expeditionsToday, 0),
      vaultSpentToday: safeNumber(src?.stats?.vaultSpentToday, seed.stats.vaultSpentToday, 0),
      dataToday: safeNumber(src?.stats?.dataToday, seed.stats.dataToday, 0),
      maintenanceToday: safeInteger(src?.stats?.maintenanceToday, seed.stats.maintenanceToday, 0),
    },

    missionState: {
      dailySeed:
        typeof src?.missionState?.dailySeed === "string"
          ? src.missionState.dailySeed
          : seed.missionState.dailySeed,
      completed:
        src?.missionState?.completed && typeof src.missionState.completed === "object"
          ? src.missionState.completed
          : {},
      claimed:
        src?.missionState?.claimed && typeof src.missionState.claimed === "object"
          ? src.missionState.claimed
          : {},
    },

    log: Array.isArray(src.log) ? src.log.slice(0, MAX_LOG_ITEMS) : seed.log,
  };
}

function isNewPlayer(state) {
  const b = state?.buildings || {};
  const upgrades = state?.stats?.upgradesToday ?? 0;
  return (b.hq || 0) <= 1 && upgrades === 0 && (b.refinery || 0) === 0;
}

function applyStarterPackIfNeeded(state) {
  if (!state) return state;
  if (typeof window === "undefined") return state;
  try {
    if (window.localStorage.getItem("mleo_starter_claimed") === "1") return state;
    if (!isNewPlayer(state)) return state;
  } catch {
    return state;
  }
  const derived = derive(state);
  const energyCap = Number(derived?.energyCap ?? CONFIG.baseEnergyCap);
  const next = {
    ...state,
    resources: {
      ...state.resources,
      ORE: (state.resources?.ORE || 0) + 80,
      GOLD: (state.resources?.GOLD || 0) + 12,
      SCRAP: (state.resources?.SCRAP || 0) + 12,
      ENERGY: Math.max(state.resources?.ENERGY || 0, energyCap),
    },
  };
  try {
    window.localStorage.setItem("mleo_starter_claimed", "1");
  } catch {}
  return next;
}

function normalizeServerState(raw, prevState = null) {
  const seed = freshState();
  const prev = prevState ? sanitizeBaseState(prevState, seed) : null;

  if (!raw) {
    return prev ? sanitizeBaseState({ ...seed, ...prev }, seed) : seed;
  }

  const lastTick =
    raw.lastTickAt ??
    (raw.last_tick_at ? new Date(raw.last_tick_at).getTime() : prev?.lastTickAt ?? Date.now());

  const expeditionReady =
    raw.expeditionReadyAt ??
    (raw.expedition_ready_at
      ? new Date(raw.expedition_ready_at).getTime()
      : prev?.expeditionReadyAt ?? Date.now());

  const overclockUntil =
    raw.overclockUntil ??
    (raw.overclock_until ? new Date(raw.overclock_until).getTime() : prev?.overclockUntil ?? 0);

  return sanitizeBaseState({
    ...seed,
    ...(prev || {}),
    ...raw,

    version: Number(raw.version ?? prev?.version ?? seed.version),
    lastDay: raw.lastDay || raw.last_day || prev?.lastDay || seed.lastDay,

    lastTickAt: lastTick,
    lastHiddenAt: 0,

    resources: raw.resources || prev?.resources || seed.resources,
    buildings: raw.buildings || prev?.buildings || seed.buildings,
    buildingPowerModes: normalizeBuildingPowerModes(
      raw.buildingPowerModes ||
        raw.building_power_modes ||
        prev?.buildingPowerModes ||
        seed.buildingPowerModes,
      raw.pausedBuildings || raw.paused_buildings || null
    ),
    modules: raw.modules || prev?.modules || {},
    research: raw.research || prev?.research || {},

    crew: Number(raw.crew ?? prev?.crew ?? 0),
    crewRole:
      raw.crewRole ??
      raw.crew_role ??
      prev?.crewRole ??
      "engineer",
    commanderPath:
      raw.commanderPath ??
      raw.commander_path ??
      prev?.commanderPath ??
      "industry",

    bankedMleo: Number(raw.bankedMleo ?? raw.banked_mleo ?? prev?.bankedMleo ?? 0),
    sentToday: Number(raw.sentToday ?? raw.sent_today ?? prev?.sentToday ?? 0),
    totalBanked: Number(raw.totalBanked ?? raw.total_banked ?? prev?.totalBanked ?? 0),
    blueprintLevel: Number(raw.blueprintLevel ?? raw.blueprint_level ?? prev?.blueprintLevel ?? 0),
    totalSharedSpent: Number(raw.totalSharedSpent ?? raw.total_shared_spent ?? prev?.totalSharedSpent ?? 0),
    overclockUntil,
    expeditionReadyAt: expeditionReady,
    maintenanceDue: Number(raw.maintenanceDue ?? raw.maintenance_due ?? prev?.maintenanceDue ?? 0),
    stability: Number(raw.stability ?? prev?.stability ?? 100),
    commanderXp: Number(raw.commanderXp ?? raw.commander_xp ?? prev?.commanderXp ?? 0),
    commanderLevel: Number(raw.commanderLevel ?? raw.commander_level ?? prev?.commanderLevel ?? 1),
    totalExpeditions: Number(raw.totalExpeditions ?? raw.total_expeditions ?? prev?.totalExpeditions ?? 0),
    totalMissionsDone: Number(raw.totalMissionsDone ?? raw.total_missions_done ?? prev?.totalMissionsDone ?? 0),

    stats: raw.stats || prev?.stats || seed.stats,
    missionState: raw.missionState || raw.mission_state || prev?.missionState || seed.missionState,
    log: prev?.log || seed.log,
  }, seed);
}

function derive(state, now = Date.now()) {
  const powerLevel = state.buildings.powerCell || 0;
  const hqLevel = state.buildings.hq || 1;
  const minerLink = getEffectiveBuildingLevel(state, "minerControl");
  const arcadeLink = getEffectiveBuildingLevel(state, "arcadeHub");
  const researchLabLevel = getEffectiveBuildingLevel(state, "researchLab");
  const repairBayLevel = getEffectiveBuildingLevel(state, "repairBay");
  const hasFieldOps = !!state.research.fieldOps;

  const crewRole = state.crewRole || "engineer";
  const commanderPath = state.commanderPath || "industry";
  const workerBonus = 1 + state.crew * (hasFieldOps ? 0.03 : 0.02);
  const overclock = now < (state.overclockUntil || 0) ? 1.35 : 1;
  const hqBonus = 1 + hqLevel * 0.03;
  const minerBonus = 1 + minerLink * 0.04;
  const arcadeBonus = 1 + arcadeLink * 0.03;
  const stability = clamp(Number(state.stability || 100), 50, 100);
  const stabilityFactor = 0.75 + (stability / 100) * 0.25;

  let oreMult = workerBonus * overclock;
  let goldMult = workerBonus * overclock;
  let scrapMult = workerBonus * overclock;
  let mleoMult = workerBonus * overclock;
  let dataMult = (1 + researchLabLevel * 0.06) * arcadeBonus;
  const logisticsLevel = getEffectiveBuildingLevel(state, "logisticsCenter");
  let bankBonus = 1 + state.blueprintLevel * 0.02 + logisticsLevel * 0.025;
  let maintenanceRelief = 1 + repairBayLevel * 0.08;

  if (crewRole === "engineer") {
    maintenanceRelief *= 1.06;
  } else if (crewRole === "logistician") {
    bankBonus *= 1.03;
  } else if (crewRole === "researcher") {
    dataMult *= 1.05;
  } else if (crewRole === "scout") {
    dataMult *= 1.02;
  } else if (crewRole === "operations") {
    goldMult *= 1.02;
    scrapMult *= 1.02;
  }

  if (commanderPath === "industry") {
    oreMult *= 1.03;
    maintenanceRelief *= 1.03;
  } else if (commanderPath === "logistics") {
    bankBonus *= 1.04;
  } else if (commanderPath === "research") {
    dataMult *= 1.06;
  } else if (commanderPath === "ecosystem") {
    goldMult *= 1.01;
    dataMult *= 1.02;
  }

  if (state.modules.servoDrill) oreMult *= 1.15;
  if (state.modules.vaultCompressor) {
    mleoMult *= 1.04;
  }
  if (state.modules.arcadeRelay) {
    dataMult *= 1.12;
  }
  if (state.modules.minerLink) {
    oreMult *= 1.08;
  }
  if (state.research.minerSync) oreMult *= 1.12;
  if (state.research.arcadeOps) dataMult *= 1.10;
  if (state.research.deepScan) dataMult *= 1.18;
  if (state.research.tokenDiscipline) {
    dataMult *= 1.22;
    mleoMult *= 0.88;
  }
  if (state.research.predictiveMaintenance) {
    maintenanceRelief *= 1.25;
  }

  oreMult *= hqBonus * minerBonus * stabilityFactor;
  goldMult *= hqBonus * stabilityFactor;
  scrapMult *= hqBonus * stabilityFactor;
  mleoMult *= hqBonus * stabilityFactor;
  dataMult *= hqBonus * stabilityFactor;

  const shipCap =
    CONFIG.dailyShipCap +
    logisticsLevel * 1800 +
    state.blueprintLevel * 450;

  const minersBonus = {
    offlineRetention: minerLink * 0.015,
    oreQuality: minerLink * 0.02,
  };

  const arcadeSupport = {
    missionBoost: arcadeLink * 0.015,
    retrySupport: arcadeLink * 0.005,
  };

  return {
    energyCap: CONFIG.baseEnergyCap + powerLevel * 42 + (state.research.coolant ? 22 : 0),
    energyRegen: CONFIG.baseEnergyRegen + powerLevel * 2.2 + (state.research.coolant ? 1.35 : 0),
    oreMult,
    goldMult,
    scrapMult,
    mleoMult,
    dataMult,
    shipCap,
    bankBonus,
    maintenanceRelief,
    stability,
    minersBonus,
    arcadeSupport,
    expeditionCooldownMs: CONFIG.expeditionCooldownMs,
  };
}

function simulate(state, elapsedMs, efficiency = 1) {
  const next = {
    ...state,
    resources: { ...state.resources },
    buildings: { ...state.buildings },
    buildingPowerModes: { ...(state.buildingPowerModes || {}) },
    modules: { ...state.modules },
    research: { ...state.research },
    missionState: {
      ...state.missionState,
      completed: { ...(state.missionState?.completed || {}) },
      claimed: { ...(state.missionState?.claimed || {}) },
    },
    stats: { ...(state.stats || {}) },
    log: [...(state.log || [])],
  };

  const now = Date.now();
  if (next.lastDay !== todayKey()) {
    next.lastDay = todayKey();
    next.sentToday = 0;
    next.stats = {
      upgradesToday: 0,
      shippedToday: 0,
      expeditionsToday: 0,
      vaultSpentToday: 0,
      dataToday: 0,
      maintenanceToday: 0,
    };
    next.missionState = {
      dailySeed: todayKey(),
      completed: {},
      claimed: {},
    };
    next.log = pushLog(next.log, "New day: shipment cap and missions refreshed.");
  }

  const dt = clamp(elapsedMs / 1000, 0, 60 * 60 * 12);
  const effective = dt * efficiency;
  const d = derive(next, now);
  const reserveEnergy = Math.max(8, Math.floor(d.energyCap * 0.06));
  const dataBefore = next.resources.DATA || 0;

  next.resources.ENERGY = clamp(next.resources.ENERGY + d.energyRegen * dt, 0, d.energyCap);

  const runBuilding = (key, producer) => {
    const baseLevel = Number(next.buildings[key] || 0);
    if (!baseLevel) return;

    const powerFactor = getBuildingPowerFactor(next, key);
    const effectiveLevel = baseLevel * powerFactor;
    if (effectiveLevel <= 0) return;

    producer(effectiveLevel);
  };

  runBuilding("quarry", (level) => {
    const energyNeed = 0.72 * level * dt;
    if (next.resources.ENERGY < energyNeed) return;
    next.resources.ENERGY -= energyNeed;
    next.resources.ORE += 2.0 * level * d.oreMult * effective;
  });

  runBuilding("tradeHub", (level) => {
    const energyNeed = 0.78 * level * dt;
    if (next.resources.ENERGY < energyNeed) return;
    next.resources.ENERGY -= energyNeed;
    next.resources.GOLD += 1.0 * level * d.goldMult * effective;
  });

  runBuilding("salvage", (level) => {
    const energyNeed = 0.78 * level * dt;
    if (next.resources.ENERGY < energyNeed) return;
    next.resources.ENERGY -= energyNeed;
    next.resources.SCRAP += 0.8 * level * d.scrapMult * effective;
  });

  runBuilding("minerControl", (level) => {
    const energyNeed = 0.20 * level * dt;
    if (next.resources.ENERGY - energyNeed < reserveEnergy) return;
    next.resources.ENERGY -= energyNeed;
    next.resources.DATA += 0.18 * level * d.dataMult * effective;
  });

  runBuilding("arcadeHub", (level) => {
    const energyNeed = 0.22 * level * dt;
    if (next.resources.ENERGY - energyNeed < reserveEnergy) return;
    next.resources.ENERGY -= energyNeed;
    next.resources.DATA += 0.15 * level * d.dataMult * effective;
  });

  runBuilding("researchLab", (level) => {
    const energyNeed = 0.24 * level * dt;
    if (next.resources.ENERGY - energyNeed < reserveEnergy) return;
    next.resources.ENERGY -= energyNeed;
    next.resources.DATA += 0.28 * level * d.dataMult * effective;
  });

  runBuilding("logisticsCenter", (level) => {
    const energyNeed = 0.20 * level * dt;
    if (next.resources.ENERGY - energyNeed < reserveEnergy) return;
    next.resources.ENERGY -= energyNeed;
    next.resources.DATA += 0.08 * level * d.dataMult * effective;
  });

  runBuilding("repairBay", (level) => {
    const energyNeed = 0.22 * level * dt;
    if (next.resources.ENERGY < energyNeed) return;
    next.resources.ENERGY -= energyNeed;
    next.stability = Math.min(100, (next.stability || 100) + 0.035 * level * effective);
  });

  runBuilding("refinery", (level) => {
    const energyNeed = 1.10 * level * dt;
    const oreNeed = 1.8 * level * effective;
    const scrapNeed = 0.7 * level * effective;
    if (next.resources.ENERGY - energyNeed < reserveEnergy) return;
    if (next.resources.ORE < oreNeed || next.resources.SCRAP < scrapNeed) return;
    next.resources.ENERGY -= energyNeed;
    next.resources.ORE -= oreNeed;
    next.resources.SCRAP -= scrapNeed;
    next.bankedMleo += 0.10 * level * d.mleoMult * d.bankBonus * effective;
  });

  const elapsedMinutes = dt / 60;
  const decayMultiplier = 1 / (d.maintenanceRelief || 1);
  next.maintenanceDue = (next.maintenanceDue || 0) + elapsedMinutes * 0.14 * decayMultiplier;

  if ((next.maintenanceDue || 0) >= 1) {
    const decaySteps = Math.floor(next.maintenanceDue);
    next.maintenanceDue -= decaySteps;
    next.stability = Math.max(60, (next.stability || 100) - decaySteps * 0.08);
  }

  const dataAfter = next.resources.DATA || 0;
  const gainedData = Math.max(0, Math.floor(dataAfter - dataBefore));
  if (gainedData > 0) {
    next.stats = {
      ...next.stats,
      dataToday: (next.stats?.dataToday || 0) + gainedData,
    };
  }

  next.resources.ENERGY = clamp(next.resources.ENERGY, 0, d.energyCap);
  next.stability = clamp(next.stability || 100, 55, 100);
  next.lastTickAt = now;
  return next;
}

function rollExpeditionLoot(state) {
  const bay = state.buildings.expeditionBay || 0;
  const rareBonus =
    (state.research.arcadeOps ? 1.12 : 1) *
    (state.research.deepScan ? 1.18 : 1);
  const base = 1 + bay * 0.12;
  const ore = Math.floor((35 + Math.random() * 65) * base);
  const gold = Math.floor((20 + Math.random() * 45) * base);
  const scrap = Math.floor((12 + Math.random() * 28) * base);
  const data = Math.floor((6 + Math.random() * 14) * rareBonus);
  const mleoChance = 0.08 + bay * 0.01 + (state.research.deepScan ? 0.02 : 0);
  const bankedMleo = Math.random() < mleoChance ? Math.floor(4 + Math.random() * 8) : 0;
  return { ore, gold, scrap, data, bankedMleo };
}

function MetricCard({ label, value, note, accent = "emerald", compact = false }) {
  const border = {
    emerald: "border-emerald-500/30 text-emerald-300",
    cyan: "border-cyan-500/30 text-cyan-300",
    amber: "border-amber-500/30 text-amber-300",
    violet: "border-violet-500/30 text-violet-300",
    rose: "border-rose-500/30 text-rose-300",
    sky: "border-sky-500/30 text-sky-300",
    slate: "border-white/10 text-white",
  }[accent];

  return (
    <div
      className={`h-full w-full rounded-2xl border bg-white/5 ${border} ${
        compact ? "px-3 py-2.5" : "px-4 py-3"
      }`}
    >
      <div
        className={`uppercase tracking-[0.18em] text-white/55 ${
          compact ? "text-[10px]" : "text-xs"
        }`}
      >
        {label}
      </div>

      <div
        className={`font-bold text-white ${
          compact ? "mt-0.5 text-lg leading-5" : "mt-1 text-xl"
        }`}
      >
        {value}
      </div>

      {note ? (
        <div
          className={`text-white/55 ${
            compact ? "mt-0.5 text-[11px] leading-4" : "mt-1 text-xs"
          }`}
        >
          {note}
        </div>
      ) : null}
    </div>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-5">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-white">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-white/60">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function AvailabilityBadge() {
  return (
    <span className="inline-flex items-center justify-center rounded-full bg-cyan-400 px-2 py-1 text-[10px] font-black tracking-[0.14em] text-slate-950">
      AVAILABLE
    </span>
  );
}

function availabilityCardClass(isAvailable) {
  return isAvailable
    ? "border-cyan-400/30 bg-cyan-500/5"
    : "border-white/10 bg-black/20";
}

function sectionStatusHint(type, data = {}) {
  if (type === "operations-console") {
    const parts = [];
    if (data.expedition) parts.push("expedition ready");
    if (data.ship) parts.push("shipment ready");
    if (data.refill) parts.push("refill available");
    if (data.maintain) parts.push("maintenance available");
    return parts.length ? parts.join(" · ") : "Nothing available right now";
  }

  if (type === "daily-missions") {
    return data.count > 0
      ? `${data.count} mission reward${data.count > 1 ? "s" : ""} ready`
      : "Nothing available right now";
  }

  if (type === "intel-summary") {
    return data.count > 0
      ? "Key progress and identity data available"
      : "No tracked progress yet";
  }

  if (type === "intel-log") {
    return data.count > 0
      ? `${data.count} recent log entr${data.count > 1 ? "ies" : "y"}`
      : "No log entries yet";
  }

  return "";
}

function buildSectionHint(type, counts) {
  if (type === "development") {
    const parts = [];
    if (counts.modules > 0) {
      parts.push(`${counts.modules} module${counts.modules > 1 ? "s" : ""}`);
    }
    if (counts.research > 0) {
      parts.push(`${counts.research} research`);
    }
    return parts.length ? `${parts.join(" · ")} available` : "Nothing available right now";
  }

  if (type === "structures") {
    return counts.structures > 0
      ? `${counts.structures} upgrade${counts.structures > 1 ? "s" : ""} available`
      : "Nothing available right now";
  }

  if (type === "support") {
    return counts.support > 0
      ? "Blueprint ready"
      : "Nothing available right now";
  }

  return "";
}

function SectionAvailabilityBadge({ count }) {
  if (!count) return null;

  return (
    <span className="inline-flex min-w-6 h-6 items-center justify-center rounded-full bg-cyan-400 px-2 text-[11px] font-black text-slate-950">
      {count}
    </span>
  );
}

function buildSectionCardClass(hasAvailable) {
  return hasAvailable
    ? "border-cyan-400/25 bg-cyan-500/6 shadow-[0_0_14px_rgba(34,211,238,0.06)]"
    : "border-white/10 bg-white/5";
}

function WindowBankedBadge({ value }) {
  return (
    <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/8 px-2.5 py-1.5">
      <div className="text-[9px] font-black uppercase tracking-[0.12em] text-cyan-200/55">
        Banked
      </div>
      <div className="text-xs font-extrabold text-cyan-100">
        {formatResourceValue(value || 0)} MLEO
      </div>
    </div>
  );
}

function BaseResourceBar({
  resources,
  energy,
  energyCap,
  bankedMleo = 0,
  compact = false,
  showBanked = true,
}) {
  const items = [
    { key: "ORE", label: "ORE", value: formatResourceValue(resources?.ORE || 0) },
    { key: "GOLD", label: "GOLD", value: formatResourceValue(resources?.GOLD || 0) },
    { key: "SCRAP", label: "SCRAP", value: formatResourceValue(resources?.SCRAP || 0) },
    { key: "DATA", label: "DATA", value: formatResourceValue(resources?.DATA || 0) },
    {
      key: "ENERGY",
      label: "ENERGY",
      value: `${formatResourceValue(energy || 0)}/${formatResourceValue(energyCap || 0)}`,
      focus: true,
    },
  ];

  return (
    <div
      className={`sticky top-0 z-20 -mx-1 mb-3 rounded-2xl border border-white/10 bg-slate-950/90 backdrop-blur-md ${
        compact ? "px-2 py-2" : "px-3 py-2.5"
      }`}
    >
      <div className="grid grid-cols-5 gap-2">
        {items.map((item) => (
          <div
            key={item.key}
            className={`rounded-xl border ${
              item.focus ? "border-cyan-400/20 bg-cyan-400/8" : "border-white/10 bg-white/5"
            } ${compact ? "px-2.5 py-1.5" : "px-3 py-2"}`}
          >
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-white/40">
              {item.label}
            </div>
            <div className={`${compact ? "text-xs" : "text-sm"} font-extrabold text-white leading-5`}>
              {item.value}
            </div>
          </div>
        ))}

        {showBanked ? (
          <div
            className={`rounded-xl border border-cyan-400/20 bg-cyan-400/8 ${
              compact ? "px-2.5 py-1.5" : "px-3 py-2"
            }`}
          >
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-cyan-200/50">
              BANKED
            </div>
            <div className={`${compact ? "text-xs" : "text-sm"} font-extrabold text-cyan-100 leading-5`}>
              {formatResourceValue(bankedMleo || 0)} MLEO
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AccordionSection({ title, subtitle, children, defaultOpen = false }) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-3xl border border-white/10 bg-white/5"
    >
      <summary className="cursor-pointer list-none px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">{title}</h2>
            {subtitle ? (
              <p className="mt-1 text-sm text-white/60">{subtitle}</p>
            ) : null}
          </div>
          <div className="rounded-xl bg-white/10 px-3 py-1 text-xs font-semibold text-white/70">
            <span className="group-open:hidden">OPEN</span>
            <span className="hidden group-open:inline">CLOSE</span>
          </div>
        </div>
      </summary>
      <div className="px-4 pb-4 sm:px-5 sm:pb-5">{children}</div>
    </details>
  );
}

function rewardText(reward) {
  return Object.entries(reward || {})
    .map(([k, v]) => `${k} ${fmt(v)}`)
    .join(" · ");
}

function getNextStep(state, derived, systemState, liveContracts = []) {
  const b = state.buildings || {};
  const energy = Number(state.resources?.ENERGY || 0);
  const energyCap = Number(derived?.energyCap || 0);
  const banked = Number(state.bankedMleo || 0);
  const expeditionReady = Number(state.expeditionReadyAt || 0) <= Date.now();
  const claimableContracts = liveContracts.filter((c) => c.done && !c.claimed).length;

  if (systemState === "critical") {
    return {
      title: "Stabilize the base",
      text: "You are in critical state. Maintenance and system recovery should come before expansion.",
    };
  }

  if (systemState === "warning" && (b.repairBay || 0) < 1) {
    return {
      title: "Build Repair Bay",
      text: "Your base is starting to feel pressure. Repair Bay will make stability management safer.",
    };
  }

  if (energyCap > 0 && energy <= energyCap * 0.08) {
    return {
      title: "Recover energy reserves",
      text: "Energy reserve is critically low. Refill now or allow systems to recover.",
    };
  }

  if ((b.tradeHub || 0) < 1) {
    return {
      title: "Unlock Trade Hub",
      text: "Trade Hub is your first real economy step. It gives Gold flow and makes the base feel alive.",
    };
  }

  if ((b.salvage || 0) < 1) {
    return {
      title: "Unlock Salvage Yard",
      text: "Salvage gives you Scrap and opens the road toward your first Refinery.",
    };
  }

  if ((b.powerCell || 0) < 1) {
    return {
      title: "Build Power Cell",
      text: "Power Cell keeps your base active longer and helps remove early energy frustration.",
    };
  }

  if ((b.refinery || 0) < 1) {
    return {
      title: "Build your first Refinery",
      text: "Your first Refinery is the moment BASE starts becoming a real MLEO support layer.",
    };
  }

  if (claimableContracts > 0) {
    return {
      title: "Claim contract rewards",
      text: "You already completed a live contract. Collect the support reward and keep momentum going.",
    };
  }

  if (
    expeditionReady &&
    Number(state.resources?.DATA || 0) >= 4 &&
    Number(state.resources?.ENERGY || 0) >= CONFIG.expeditionCost
  ) {
    return {
      title: "Launch expedition",
      text: "Your field team is ready. Expeditions are a good way to keep progression moving.",
    };
  }

  if (banked >= 120) {
    return {
      title: "Consider a shipment",
      text: "Banked MLEO is building up. You may be ready for a measured export to the shared vault.",
    };
  }

  if ((state.sentToday || 0) < 250) {
    return {
      title: "Ship MLEO to Shared Vault",
      text: "Move refined MLEO into the shared vault to support the wider ecosystem.",
    };
  }

  return {
    title: "Reinvest and expand",
    text: "Upgrade buildings, improve efficiency, and use utilities wisely to strengthen your base.",
  };
}

const INFO_COPY = {
  sharedVault: {
    title: "Shared Vault",
    focus: "Refinery + shipping + logistics scaling",
    text:
      "Shared Vault is the real MLEO balance you move out of BASE.\n\n" +
      "How it grows:\n" +
      "• Refinery creates banked MLEO inside BASE.\n" +
      "• Shipping moves that banked MLEO into Shared Vault.\n" +
      "• Logistics and Blueprint improve long-term shipment quality.\n\n" +
      "Important:\n" +
      "Banked MLEO is not the same as Shared Vault MLEO. Nothing reaches the vault until you ship it.",
    tips: {
      building: "Refinery",
      supportBuildings: ["Logistics Center", "Power Cell", "Quarry", "Salvage Yard"],
      research: "Logistics",
      supportResearch: ["Routing AI"],
      module: "Vault Compressor",
      operation: "Ship to Shared Vault",
      watch: "Strong shipping means nothing if Refinery is underfed.",
      actions: [
        "Feed Refinery with stable Ore + Scrap first.",
        "Upgrade Logistics when shipping starts to matter daily.",
        "Do not sit too long on banked MLEO if you need real vault progress.",
      ],
    },
    nextStep: {
      label: "Open Shipping",
      tab: "operations",
      target: "shipping",
      why: "Shipping is the final step that turns BASE progress into real Shared Vault MLEO.",
    },
  },

  bankedMleo: {
    title: "Base Banked",
    focus: "Refinery output before shipping",
    text:
      "Banked MLEO is created inside BASE and waits there until you ship it.\n\n" +
      "What controls it:\n" +
      "• Refinery level.\n" +
      "• Ore flow.\n" +
      "• Scrap flow.\n" +
      "• Enough Energy to keep Refinery running.\n\n" +
      "Important:\n" +
      "Refinery needs Ore, Scrap and Energy together. If one of them collapses, banked MLEO slows down.",
    tips: {
      building: "Refinery",
      supportBuildings: ["Quarry", "Salvage Yard", "Power Cell", "Logistics Center"],
      research: "Routing AI",
      supportResearch: ["Logistics"],
      module: "Vault Compressor",
      operation: "Ship to Shared Vault",
      watch: "Refinery is powerful, but it is also one of the heaviest systems in the base.",
      actions: [
        "Upgrade Refinery only when Ore and Scrap can feed it.",
        "Fix Energy pressure before forcing more conversion.",
        "Ship regularly once banked MLEO starts building up.",
      ],
    },
    nextStep: {
      label: "Upgrade Refinery",
      tab: "build",
      target: "refinery",
      why: "Refinery is the structure that directly creates banked MLEO.",
    },
  },

  commander: {
    title: "Commander Level",
    focus: "Upgrades + missions + expeditions + stable management",
    text:
      "Commander Level is your long-term BASE progression.\n\n" +
      "Main XP sources:\n" +
      "• Building upgrades.\n" +
      "• Daily missions.\n" +
      "• Expeditions.\n" +
      "• Good base control over time.\n\n" +
      "Important:\n" +
      "A messy base still grows, but a stable and active base levels faster and feels better.",
    tips: {
      building: "Arcade Hub",
      supportBuildings: ["HQ", "Expedition Bay"],
      research: "Arcade Ops",
      supportResearch: ["Field Ops"],
      module: "Arcade Relay",
      operation: "Daily Missions / Expeditions",
      watch: "Ignoring maintenance and energy slows overall progression rhythm.",
      actions: [
        "Claim mission rewards often.",
        "Use expeditions as XP + utility, not only for loot.",
        "Keep upgrading instead of sitting idle for too long.",
      ],
    },
    nextStep: {
      label: "Open Daily Missions",
      tab: "operations",
      target: "missions",
      why: "Missions are one of the most reliable repeatable XP sources.",
    },
  },

  data: {
    title: "DATA",
    focus: "Research Lab + support DATA structures + expeditions",
    text:
      "DATA is your strategic progression resource.\n\n" +
      "Main sources:\n" +
      "• Research Lab is the strongest long-term DATA engine.\n" +
      "• Miner Control and Arcade Hub add support DATA.\n" +
      "• Expeditions give burst DATA.\n" +
      "• Missions smooth out early progression.\n\n" +
      "Important:\n" +
      "DATA controls research pace, so weak DATA slows the whole advanced game.",
    tips: {
      building: "Research Lab",
      supportBuildings: ["Miner Control", "Arcade Hub", "Expedition Bay"],
      research: "Deep Scan",
      supportResearch: ["Token Discipline", "Arcade Ops"],
      module: "Arcade Relay",
      operation: "Field Expedition",
      watch: "Research Lab is strong, but it also adds Energy pressure.",
      actions: [
        "Build Research Lab as your main DATA lane.",
        "Use Miner Control and Arcade Hub as support, not as full replacements.",
        "Run expeditions when you need extra DATA bursts.",
      ],
    },
    nextStep: {
      label: "Upgrade Research Lab",
      tab: "build",
      target: "researchLab",
      why: "Research Lab is your strongest direct DATA generator.",
    },
  },

  energy: {
    title: "Energy",
    focus: "Power Cell + Coolant Loops + runtime control",
    text:
      "Energy powers passive production and many active systems.\n\n" +
      "Main rule:\n" +
      "• If total drain is higher than regen, the base starts choking.\n" +
      "• Power Cell is the long-term Energy fix.\n" +
      "• Coolant Loops adds extra cap and regen.\n" +
      "• Refill restores Energy now, but does not improve regen.\n\n" +
      "Important:\n" +
      "Heavy buildings should be paused or delayed if Energy cannot support them yet.",
    tips: {
      building: "Power Cell",
      supportBuildings: ["Repair Bay"],
      research: "Coolant Loops",
      supportResearch: ["Predictive Maintenance"],
      module: "",
      operation: "Emergency Refill / Pause heavy buildings",
      watch: ["Refinery", "Research Lab", "Quarry", "Trade Hub", "Salvage Yard"],
      actions: [
        "Upgrade Power Cell before scaling many heavy buildings together.",
        "Use Refill as recovery, not as your core Energy economy.",
        "Pause the heavy building causing pressure when Energy collapses.",
      ],
    },
    nextStep: {
      label: "Upgrade Power Cell",
      tab: "build",
      target: "powerCell",
      why: "Power Cell improves both Energy cap and Energy regeneration.",
    },
  },

  stability: {
    title: "Stability",
    focus: "Maintenance + Repair Bay + pressure control",
    text:
      "Stability is the health of your base.\n\n" +
      "How to protect it:\n" +
      "• Maintenance restores Stability directly.\n" +
      "• Repair Bay improves long-term stability recovery.\n" +
      "• Predictive Maintenance slows pressure growth.\n" +
      "• Miner Link helps reduce refinery-related stress.\n\n" +
      "Important:\n" +
      "Low Stability weakens the feel of the whole base and makes expansion riskier.",
    tips: {
      building: "Repair Bay",
      supportBuildings: ["Power Cell"],
      research: "Predictive Maintenance",
      supportResearch: ["Field Ops"],
      module: "Miner Link",
      operation: "Maintenance Cycle",
      watch: "Refinery pressure and ignoring maintenance are the fastest ways to destabilize the base.",
      actions: [
        "Use maintenance before Stability gets ugly.",
        "Build Repair Bay early if you plan a heavier mid-game base.",
        "Do not force Refinery scaling while Stability is already weak.",
      ],
    },
    nextStep: {
      label: "Perform maintenance",
      tab: "operations",
      target: "maintenance",
      why: "Maintenance is the fastest direct Stability recovery action.",
    },
  },

  ore: {
    title: "ORE",
    focus: "Quarry + Energy + Ore multipliers",
    text:
      "ORE is the main raw industrial resource in BASE.\n\n" +
      "How to grow it:\n" +
      "• Quarry is the main direct source.\n" +
      "• Energy must stay healthy so Quarry can keep running.\n" +
      "• Ore-focused research and modules multiply the lane.\n\n" +
      "Important:\n" +
      "Weak Ore slows building upgrades and also starves the Refinery.",
    tips: {
      building: "Quarry",
      supportBuildings: ["Power Cell", "Miner Control"],
      research: "Miner Sync",
      supportResearch: ["Field Ops"],
      module: "Servo Drill",
      operation: "",
      watch: "Quarry is one of the first places where Energy pressure becomes visible.",
      actions: [
        "Upgrade Quarry steadily instead of leaving Ore behind.",
        "Fix Energy before blaming Ore production alone.",
        "Take Servo Drill and Miner Sync when Ore becomes your main bottleneck.",
      ],
    },
    nextStep: {
      label: "Upgrade Quarry",
      tab: "build",
      target: "quarry",
      why: "Quarry is the main direct source of ORE.",
    },
  },

  gold: {
    title: "GOLD",
    focus: "Trade Hub + missions + expeditions",
    text:
      "GOLD is the main spendable economy resource in BASE.\n\n" +
      "How to grow it:\n" +
      "• Trade Hub gives steady direct GOLD.\n" +
      "• Missions and expeditions give flexible support.\n" +
      "• A healthy Gold loop keeps upgrades feeling smooth.\n\n" +
      "Important:\n" +
      "When GOLD is weak, the whole base starts feeling slow even if other resources look fine.",
    tips: {
      building: "Trade Hub",
      supportBuildings: ["Expedition Bay"],
      research: "Field Ops",
      supportResearch: ["Arcade Ops"],
      module: "",
      operation: "Field Expedition / Daily Missions",
      watch: "Do not overspend GOLD on recovery actions if your economy is already thin.",
      actions: [
        "Use Trade Hub as your stable main Gold lane.",
        "Use expeditions to smooth rough Gold moments.",
        "Keep GOLD balanced with Ore and Scrap instead of tunneling only one lane.",
      ],
    },
    nextStep: {
      label: "Upgrade Trade Hub",
      tab: "build",
      target: "tradeHub",
      why: "Trade Hub is the strongest direct GOLD source.",
    },
  },

  scrap: {
    title: "SCRAP",
    focus: "Salvage Yard + expeditions + refinery support",
    text:
      "SCRAP is a support resource that becomes more important as the base matures.\n\n" +
      "How to grow it:\n" +
      "• Salvage Yard is the main stable source.\n" +
      "• Expeditions help with burst Scrap.\n" +
      "• Strong Scrap is important for advanced systems and Refinery feeding.\n\n" +
      "Important:\n" +
      "Many players feel blocked in mid-game because Scrap falls behind without noticing.",
    tips: {
      building: "Salvage Yard",
      supportBuildings: ["Expedition Bay", "Refinery"],
      research: "Deep Scan",
      supportResearch: ["Field Ops"],
      module: "Miner Link",
      operation: "Field Expedition",
      watch: "Refinery scaling feels bad fast when Scrap cannot keep up.",
      actions: [
        "Do not leave Salvage too low while pushing advanced systems.",
        "Use expeditions when you need Scrap bursts.",
        "Keep Scrap healthy before pushing harder into Refinery.",
      ],
    },
    nextStep: {
      label: "Upgrade Salvage Yard",
      tab: "build",
      target: "salvage",
      why: "Salvage Yard is your main long-term SCRAP source.",
    },
  },
};

function InfoButton({ infoKey, setOpenInfoKey, className = "" }) {
  const info = INFO_COPY[infoKey];
  if (!info) return null;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setOpenInfoKey(infoKey);
      }}
      className={`absolute right-2.5 top-2.5 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-cyan-400/30 bg-slate-950/70 text-[12px] font-black text-cyan-200 shadow-[0_0_18px_rgba(34,211,238,0.08)] backdrop-blur-md transition hover:scale-105 hover:bg-cyan-500/18 ${className}`}
      aria-label={`About ${info.title}`}
    >
      i
    </button>
  );
}

const BASE_HOME_SCENE_ORDER = [
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

const BASE_HOME_SCENE_POSITIONS_MOBILE = {
  hq: { x: 50, y: 40 },

  powerCell: { x: 80, y: 8 },
  researchLab: { x: 51, y: 10 }, // LAB

  tradeHub: { x: 20, y: 5 },

  salvage: { x: 15, y: 31 },
  arcadeHub: { x: 50, y: 61 },   // ARC
  minerControl: { x: 16, y: 18 }, // MIN

  refinery: { x: 21, y: 47 },
  quarry: { x: 18, y: 62 },

  expeditionBay: { x: 85, y: 29 },
  logisticsCenter: { x: 86, y: 45 },
  repairBay: { x: 78, y: 60 },
};

const BASE_HOME_SCENE_POSITIONS_DESKTOP = {
  hq: { x: 50, y: 42 },

  tradeHub: { x: 25, y: 14 },
  salvage: { x: 17, y: 31 },
  refinery: { x: 24, y: 50 },
  quarry: { x: 17, y: 70 },

  minerControl: { x: 47, y: 65 }, // MIN
  arcadeHub: { x: 43, y: 20 },    // ARC

  powerCell: { x: 79, y: 14 },
  researchLab: { x: 65, y: 10 },  // LAB

  expeditionBay: { x: 86, y: 31 },
  logisticsCenter: { x: 79, y: 46 },
  repairBay: { x: 86, y: 70 },
};

const BASE_HOME_SCENE_IDENTITY = {
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

function getBaseSceneIdentity(key) {
  return (
    BASE_HOME_SCENE_IDENTITY[key] || {
      short: key?.slice(0, 3)?.toUpperCase?.() || "BASE",
      glow: "slate",
      icon: "•",
    }
  );
}

function getBaseSceneGlow(glow, state = "normal") {
  const palette = {
    emerald:
      "border-emerald-400/70 bg-emerald-950/45 text-emerald-100 shadow-[0_0_16px_rgba(16,185,129,0.35)]",
    amber:
      "border-amber-400/60 bg-amber-950/35 text-amber-100 shadow-[0_0_12px_rgba(245,158,11,0.28)]",
    yellow:
      "border-yellow-400/60 bg-yellow-950/35 text-yellow-100 shadow-[0_0_12px_rgba(250,204,21,0.28)]",
    lime:
      "border-lime-400/60 bg-lime-950/35 text-lime-100 shadow-[0_0_12px_rgba(132,204,22,0.28)]",
    cyan:
      "border-cyan-400/70 bg-cyan-950/35 text-cyan-100 shadow-[0_0_14px_rgba(34,211,238,0.35)]",
    violet:
      "border-violet-400/60 bg-violet-950/35 text-violet-100 shadow-[0_0_12px_rgba(167,139,250,0.28)]",
    indigo:
      "border-indigo-400/60 bg-indigo-950/35 text-indigo-100 shadow-[0_0_12px_rgba(99,102,241,0.28)]",
    teal:
      "border-teal-400/60 bg-teal-950/35 text-teal-100 shadow-[0_0_12px_rgba(45,212,191,0.28)]",
    orange:
      "border-orange-400/60 bg-orange-950/35 text-orange-100 shadow-[0_0_12px_rgba(251,146,60,0.28)]",
    sky: "border-sky-400/60 bg-sky-950/35 text-sky-100 shadow-[0_0_12px_rgba(56,189,248,0.28)]",
    slate:
      "border-slate-500/60 bg-slate-900/75 text-slate-200 shadow-[0_0_10px_rgba(148,163,184,0.15)]",
  };

  if (state === "warning") {
    return "border-amber-300/70 bg-amber-950/40 text-amber-100 shadow-[0_0_18px_rgba(251,191,36,0.35)]";
  }

  if (state === "critical") {
    return "border-rose-400/75 bg-rose-950/40 text-rose-100 shadow-[0_0_20px_rgba(244,63,94,0.35)]";
  }

  return palette[glow] || palette.slate;
}

function getBaseSceneNodeState(key, base, derived) {
  const energy = Number(base?.resources?.ENERGY || 0);
  const energyCap = Number(derived?.energyCap || 0);
  const stability = Number(base?.stability || 100);

  if (key === "powerCell") {
    if (energyCap > 0 && energy <= energyCap * 0.12) return "critical";
    if (energyCap > 0 && energy <= energyCap * 0.25) return "warning";
  }

  if (key === "repairBay") {
    if (stability < 50) return "critical";
    if (stability < 70) return "warning";
  }

  if (key === "refinery") {
    if (stability < 70) return "warning";
  }

  return "normal";
}

function BaseHomeFlowScene({ base, derived, selected, onSelect, layout = "mobile" }) {
  const scenePositions =
    layout === "desktop" ? BASE_HOME_SCENE_POSITIONS_DESKTOP : BASE_HOME_SCENE_POSITIONS_MOBILE;

  const isDesktop = layout === "desktop";

  const nodes = useMemo(() => {
    const buildings = base?.buildings || {};

    return BASE_HOME_SCENE_ORDER.filter((key) => {
      if (key === "hq") return true;
      return Number(buildings[key] || 0) > 0;
    }).map((key) => {
      const def = BUILDINGS.find((b) => b.key === key);
      const level =
        key === "hq" ? Math.max(1, Number(buildings[key] || 1)) : Number(buildings[key] || 0);

      return {
        key,
        level,
        name: def?.name || key,
        pos: scenePositions[key],
        identity: getBaseSceneIdentity(key),
        state: getBaseSceneNodeState(key, base, derived),
      };
    });
  }, [base, derived, layout]);

  const hq = nodes.find((n) => n.key === "hq") || {
    key: "hq",
    level: 1,
    name: "HQ",
    pos: scenePositions.hq,
    identity: getBaseSceneIdentity("hq"),
    state: "normal",
  };

  const links = nodes.filter((n) => n.key !== "hq" && n.pos);

  return (
    <div
      className={
        isDesktop
          ? "relative mx-auto w-full max-w-[1180px] aspect-[16/7] overflow-visible"
          : "relative mx-auto w-full max-w-md aspect-[3/5] overflow-hidden"
      }
    >
      {/* Background is rendered by the parent so the whole screen feels uniform */}

      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {links.map((node) => {
          const lineTone =
            node.state === "critical"
              ? { stroke: "rgba(244,63,94,0.22)", width: "0.58", dash: "2.2 1.3" }
              : node.state === "warning"
              ? { stroke: "rgba(251,191,36,0.18)", width: "0.5", dash: "1.6 1.4" }
              : { stroke: "rgba(34,211,238,0.16)", width: "0.45", dash: "1.2 1.8" };

          return (
            <line
              key={`line-${node.key}`}
              x1={hq.pos.x}
              y1={hq.pos.y}
              x2={node.pos.x}
              y2={node.pos.y}
              stroke={lineTone.stroke}
              strokeWidth={lineTone.width}
              strokeDasharray={lineTone.dash}
            />
          );
        })}

        {links.map((node) => {
          const dotFill =
            node.state === "critical"
              ? "rgba(244,63,94,0.65)"
              : node.state === "warning"
              ? "rgba(251,191,36,0.55)"
              : "rgba(34,211,238,0.55)";

          const r = node.state === "critical" ? "1.0" : node.state === "warning" ? "0.85" : "0.7";

          return (
            <circle
              key={`dot-${node.key}`}
              cx={(hq.pos.x + node.pos.x) / 2}
              cy={(hq.pos.y + node.pos.y) / 2}
              r={r}
              fill={selected === node.key ? "rgba(255,255,255,0.95)" : dotFill}
            />
          );
        })}
      </svg>

      {nodes.map((node) => {
        const isHq = node.key === "hq";
        const isSelected = selected === node.key;
        const classes = getBaseSceneGlow(node.identity.glow, node.state);

        return (
          <button
            key={node.key}
            type="button"
            onClick={() => onSelect(node.key)}
            title={node.name}
            className={`absolute -translate-x-1/2 -translate-y-1/2 border-2 font-bold transition duration-150 active:scale-95 ${
              isHq
                ? isDesktop
                  ? "min-w-[98px] rounded-[20px] px-5 py-3 text-[15px]"
                  : "min-w-[86px] rounded-2xl px-4 py-3 text-sm"
                : isDesktop
                ? "min-w-[74px] rounded-[16px] px-3 py-2 text-[11px]"
                : "min-w-[64px] rounded-xl px-2.5 py-2 text-[11px]"
            } ${classes} ${
              isSelected
                ? "ring-2 ring-white/80 ring-offset-2 ring-offset-slate-950 scale-[1.04]"
                : "hover:scale-[1.03]"
            }`}
            style={{
              left: `${node.pos.x}%`,
              top: `${node.pos.y}%`,
            }}
          >
            <div className="flex items-center justify-center gap-1.5">
              <span className={isHq ? "text-emerald-300" : ""}>{node.identity.icon}</span>
              <span className="uppercase tracking-[0.08em]">{node.identity.short}</span>
            </div>

            <div className={`mt-1 ${isHq ? "text-[11px]" : "text-[10px]"} opacity-85`}>
              Lv {node.level}
            </div>
          </button>
        );
      })}

      {/* Buildings online badge removed */}
    </div>
  );
}

export default function MleoBase() {
  const { isConnected, address } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { openAccountModal } = useAccountModal();

  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState(() => freshState());
  const [sharedVault, setSharedVault] = useState(0);
  const [toast, setToast] = useState("");
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [openInfoKey, setOpenInfoKey] = useState(null);
  const [buildInfo, setBuildInfo] = useState(null);
  const [highlightTarget, setHighlightTarget] = useState(null);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState(null);
  const [showReadyPanel, setShowReadyPanel] = useState(false);
  // showAllSuggestions removed: suggestions are always shown in full inside Ready Panel.

  // One open inner panel at a time (mobile)
  const [openInnerPanel, setOpenInnerPanel] = useState(null);
  const [structuresTab, setStructuresTab] = useState("core");

  const [desktopPanel, setDesktopPanel] = useState("overview");
  const [desktopCompact, setDesktopCompact] = useState(true);
  const [desktopPanelOpen, setDesktopPanelOpen] = useState(false);

  const [activeEvent, setActiveEvent] = useState(null);
  const [eventCooldownUntil, setEventCooldownUntil] = useState(0);
  const [nextShipBonus, setNextShipBonus] = useState(0);

  const [expeditionMode, setExpeditionMode] = useState("balanced");
  const [crewRole, setCrewRole] = useState(() => loadJson("mleo_base_profile_v1", {})?.crewRole || "engineer");
  const [commanderPath, setCommanderPath] = useState(() => loadJson("mleo_base_profile_v1", {})?.commanderPath || "industry");
  const [claimedContracts, setClaimedContracts] = useState(() => loadJson("mleo_base_claimed_contracts_v1", {}));
  const [devTab, setDevTab] = useState("crew");

  const actionLocksRef = useRef({});

  function isActionLocked(name) {
    return !!actionLocksRef.current[name];
  }

  async function runLockedAction(name, fn) {
    if (actionLocksRef.current[name]) return null;
    actionLocksRef.current[name] = true;
    try {
      return await fn();
    } finally {
      actionLocksRef.current[name] = false;
    }
  }

  const mobilePanelScrollRef = useRef(null);

  const activeInfo = openInfoKey ? INFO_COPY[openInfoKey] : null;
  const shownInfo = activeInfo || buildInfo;

  // When user opens a resource info panel (e.g. Energy), show an "UPGRADE" button
  // that jumps to the corresponding structure in the Build panel.
  const infoUpgradeBuildingKey = (() => {
    const info = activeInfo;
    const buildingName = info?.tips?.building;
    if (!buildingName) return null;

    const normalized = String(buildingName).trim().toLowerCase();
    const match = BUILDINGS.find((b) =>
      String(b?.name || "").trim().toLowerCase() === normalized
    );

    return match?.key || null;
  })();

  function toggleInnerPanel(panelKey) {
    setOpenInnerPanel((current) => (current === panelKey ? null : panelKey));
  }

  function isHighlightedTarget(target, highlightTarget) {
    return highlightTarget === target;
  }

  function getStructuresTabForTarget(target) {
    if (STRUCTURES_TAB_A.includes(target)) return "core";
    if (STRUCTURES_TAB_B.includes(target)) return "expansion";
    return null;
  }

  function getAlertNavigationTarget(item) {
    const key = item?.alertKey || item?.key;

    switch (key) {
      case "critical-stability":
      case "warning-stability":
      case "low-energy":
      case "ship-pressure":
        return { tab: "operations", target: "maintenance" };

      case "expedition-ready":
      case "expedition":
        return { tab: "operations", target: "expedition" };

      case "banked-ready":
        return { tab: "operations", target: "shipping" };

      case "contracts-ready":
      case "contracts":
        return { tab: "overview", target: "contracts" };

      case "missions":
        return { tab: "operations", target: "missions" };

      default:
        return { tab: "overview", target: "alerts" };
    }
  }

  function centerTargetInMobilePanel(targetEl) {
    const container = mobilePanelScrollRef.current;
    if (!container || !targetEl) return false;

    const containerRect = container.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();

    const currentScrollTop = container.scrollTop;
    const targetTopInsideContainer =
      targetRect.top - containerRect.top + currentScrollTop;

    const targetCenter =
      targetTopInsideContainer + targetRect.height / 2;

    const visibleAnchor =
      container.clientHeight * 0.42;

    const nextScrollTop = Math.max(0, targetCenter - visibleAnchor);

    container.scrollTo({
      top: nextScrollTop,
      behavior: "smooth",
    });

    return true;
  }

  function navigateToBaseTarget(step) {
    if (!step?.target) return;

    const targetTab =
      step.tab === "operations"
        ? "ops"
        : step.tab === "build"
        ? "build"
        : step.tab === "development"
        ? "build"
        : step.tab === "systems"
        ? "intel"
        : step.tab === "intel"
        ? "intel"
        : "overview";

    const targetInnerPanel = (() => {
      if (step.target === "shipping" || step.target === "maintenance" || step.target === "expedition") {
        return "ops-console";
      }

      if (step.target === "missions") {
        return "ops-missions";
      }

      if (step.target === "contracts") {
        return "overview-contracts";
      }

      if (step.target === "alerts") {
        return "overview-alerts";
      }

      if (step.target === "recommendation") {
        return "overview-recommendation";
      }

      if (
        step.target === "quarry" ||
        step.target === "tradeHub" ||
        step.target === "salvage" ||
        step.target === "refinery" ||
        step.target === "powerCell" ||
        step.target === "hq" ||
        step.target === "minerControl" ||
        step.target === "arcadeHub" ||
        step.target === "expeditionBay" ||
        step.target === "logisticsCenter" ||
        step.target === "researchLab" ||
        step.target === "repairBay"
      ) {
        return "build-structures";
      }

      if (
        step.target === "servoDrill" ||
        step.target === "vaultCompressor" ||
        step.target === "arcadeRelay" ||
        step.target === "minerLink" ||
        step.target === "coolant" ||
        step.target === "routing" ||
        step.target === "fieldOps" ||
        step.target === "minerSync" ||
        step.target === "arcadeOps" ||
        step.target === "logistics" ||
        step.target === "predictiveMaintenance" ||
        step.target === "deepScan" ||
        step.target === "tokenDiscipline"
      ) {
        return "build-development";
      }

      if (step.target === "crew" || step.target === "paths") {
        return "build-development";
      }

      return null;
    })();

    const targetStructuresTab = getStructuresTabForTarget(step.target);

    if (step.tab === "systems") {
      setOpenInfoKey(null);
      setBuildInfo(getSystemInfo(step.target));
    }

    try {
      const isMobile =
        typeof window !== "undefined" &&
        window.matchMedia("(max-width: 639px)").matches;

      if (step.target === "crew") {
        setDevTab("crew");
      }

      if (step.target === "paths") {
        setDevTab("paths");
      }

      if (targetStructuresTab) {
        setStructuresTab(targetStructuresTab);
      }

      if (isMobile) {
        openMobilePanel(targetTab);

        if (targetInnerPanel) {
          setOpenInnerPanel(targetInnerPanel);
        } else if (targetTab === "build") {
          setOpenInnerPanel("build-structures");
        }
      } else {
        openDesktopPanel(
          targetTab,
          targetInnerPanel || (targetTab === "build" ? "build-structures" : null)
        );
      }
    } catch {
      // no-op
    }

    setTimeout(() => {
      const missionFocusKey =
        step.target === "missions"
          ? (() => {
              // Pick the mission the player should collect now, otherwise the first mission.
              const sorted = [...DAILY_MISSIONS].sort((a, b) => {
                const aProgress = missionProgress[a.key] || 0;
                const aDone = aProgress >= a.target;
                const aClaimed = !!state.missionState?.claimed?.[a.key];
                const aReady = aDone && !aClaimed ? 1 : 0;

                const bProgress = missionProgress[b.key] || 0;
                const bDone = bProgress >= b.target;
                const bClaimed = !!state.missionState?.claimed?.[b.key];
                const bReady = bDone && !bClaimed ? 1 : 0;

                return bReady - aReady;
              });

              const firstReady = sorted.find((m) => {
                const progress = missionProgress[m.key] || 0;
                const done = progress >= m.target;
                const claimed = !!state.missionState?.claimed?.[m.key];
                return done && !claimed;
              });

              return firstReady?.key || sorted[0]?.key || null;
            })()
          : null;

      const targetForScroll = missionFocusKey || step.target;
      setHighlightTarget(targetForScroll);

      const el = document.querySelector(
        `[data-base-target="${targetForScroll}"]`
      );
      if (!el) return;

      const isMobile =
        typeof window !== "undefined" &&
        window.matchMedia("(max-width: 639px)").matches;

      if (isMobile) {
        const centered = centerTargetInMobilePanel(el);

        if (!centered) {
          el.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "nearest",
          });
        }
      } else {
        el.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        });
      }
    }, 320);

    setTimeout(() => {
      setHighlightTarget(null);
    }, 4200);
  }

  function normalizeInfoTipItems(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    return value ? [value] : [];
  }

  function hasInfoTipContent(tips) {
    if (!tips) return false;
    return [
      tips.building,
      tips.supportBuildings,
      tips.research,
      tips.supportResearch,
      tips.module,
      tips.operation,
      tips.watch,
      tips.actions,
    ].some((item) => normalizeInfoTipItems(item).length > 0);
  }

  function renderInfoTipRow(label, value) {
    const items = normalizeInfoTipItems(value);
    if (!items.length) return null;

    return (
      <div>
        <span className="font-semibold text-white">{label}:</span>{" "}
        {items.join(" · ")}
      </div>
    );
  }

  function handleInfoNextStep() {
    const info = shownInfo;
    if (!info?.nextStep) return;

    setOpenInfoKey(null);
    setBuildInfo(null);

    navigateToBaseTarget(info.nextStep);
  }

  function handleCommandHubItemClick(item) {
    const step = getAlertNavigationTarget(item);
    if (!step) return;
    setShowReadyPanel(false);
    navigateToBaseTarget(step);
  }

  useEffect(() => {
    let alive = true;

    async function boot() {
      try {
        const seed = freshState();
        const serverRes = await getBaseState();
        const saved = serverRes?.state || null;

        // Reset state if version is less than 6 (new starter pack) or reset flag is set
        const resetFlag =
          typeof window !== "undefined"
            ? window.localStorage.getItem("base_reset_flag") === "true"
            : false;
        const resetVersion =
          typeof window !== "undefined"
            ? window.localStorage.getItem("base_reset_version")
            : null;

        // If reset flag is set, treat saved version as 0 to force reset
        const savedVersion =
          resetFlag && resetVersion
            ? Number(resetVersion)
            : saved
            ? Number(saved.version || 0)
            : 0;
        const shouldReset = savedVersion < 6 || resetFlag;

        const initial =
          saved && !shouldReset
            ? sanitizeBaseState(normalizeServerState(saved, seed), seed)
            : sanitizeBaseState(seed, seed);

        const localProfile = loadJson("mleo_base_profile_v1", null);
        let initialMerged = localProfile
          ? {
              ...initial,
              crewRole: localProfile.crewRole || initial.crewRole,
              commanderPath: localProfile.commanderPath || initial.commanderPath,
            }
          : initial;
        initialMerged = applyStarterPackIfNeeded(initialMerged);

        if (!alive) return;

        // Clear reset flags after state is set (if they were used)
        if (resetFlag && typeof window !== "undefined") {
          window.localStorage.removeItem("base_reset_flag");
          window.localStorage.removeItem("base_reset_version");
        }

        setMounted(true);
        setState(initialMerged);

        const bal = await readVaultSafe();
        if (alive && bal != null) setSharedVault(bal);
      } catch (error) {
        console.error("BASE boot failed", error);
        if (!alive) return;
        setMounted(true);
        setState(sanitizeBaseState(freshState(), freshState()));
      }
    }

    boot();

    return () => {
      alive = false;
    };
  }, []);


  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (!mounted) return;

    let alive = true;

    async function refreshFromServer() {
      try {
        const res = await getBaseState();
        const serverState = res?.state;
        if (!alive || !serverState) return;

        setState((prev) => {
          const normalized = normalizeServerState(serverState, prev);
          const withStarter = applyStarterPackIfNeeded(normalized);

          return applyLevelUps({
            ...prev,
            ...withStarter,
            crewRole:
              serverState?.crewRole ??
              serverState?.crew_role ??
              withStarter?.crewRole ??
              prev?.crewRole ??
              "engineer",
            commanderPath:
              serverState?.commanderPath ??
              serverState?.commander_path ??
              withStarter?.commanderPath ??
              prev?.commanderPath ??
              "industry",
            missionState: {
              dailySeed:
                withStarter?.missionState?.dailySeed ||
                prev?.missionState?.dailySeed ||
                todayKey(),
              completed: {
                ...(prev?.missionState?.completed || {}),
                ...(withStarter?.missionState?.completed || {}),
              },
              claimed: {
                ...(prev?.missionState?.claimed || {}),
                ...(withStarter?.missionState?.claimed || {}),
              },
            },
          });
        });
      } catch (error) {
        console.error("BASE refresh failed", error);
      }
    }

    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        refreshFromServer();
      }
    }, 3000);

    const onFocus = () => {
      refreshFromServer();
    };

    const onStorage = async (event) => {
      if (event.key === "mleo_rush_core_v4" || event.key === "mleoMiningEconomy_v2.1") {
        const bal = await readVaultSafe();
        if (bal != null) setSharedVault(bal);
      }
    };

    const pollId = window.setInterval(async () => {
      const bal = await readVaultSafe();
      if (!Number.isFinite(bal) || bal < 0) return;
      setSharedVault((prev) => (Math.abs(prev - bal) > 1e-6 ? bal : prev));
    }, 4000);

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("storage", onStorage);

    return () => {
      alive = false;
      window.clearInterval(id);
      window.clearInterval(pollId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("storage", onStorage);
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    saveJson("mleo_base_claimed_contracts_v1", claimedContracts);
  }, [mounted, claimedContracts]);

  useEffect(() => {
    if (!mounted) return;
    saveJson("mleo_base_profile_v1", {
      crewRole: state.crewRole,
      commanderPath: state.commanderPath,
    });
  }, [mounted, state.crewRole, state.commanderPath]);

  const derived = useMemo(() => derive(state), [state]);
  const systemState = useMemo(() => getSystemState(state.stability), [state.stability]);
  const systemMeta = useMemo(() => systemStateMeta(systemState), [systemState]);
  const workerNextCost = useMemo(() => crewCost(state.crew), [state.crew]);

  const crewRoleInfo = useMemo(() => crewRoleMeta(crewRole), [crewRole]);
  const commanderPathInfo = useMemo(() => commanderPathMeta(commanderPath), [commanderPath]);

  const roleBonusText = useMemo(() => {
    if (crewRole === "engineer") return "Focus: stability + maintenance";
    if (crewRole === "logistician") return "Focus: shipments + export flow";
    if (crewRole === "researcher") return "Focus: DATA + analysis";
    if (crewRole === "scout") return "Focus: expedition identity";
    return "Focus: balanced command flow";
  }, [crewRole]);

  const commanderPathText = useMemo(() => {
    if (commanderPath === "industry") return "Command style: infrastructure and safer production.";
    if (commanderPath === "logistics") return "Command style: export discipline and vault flow.";
    if (commanderPath === "research") return "Command style: DATA and systems optimization.";
    return "Command style: wider MLEO ecosystem support.";
  }, [commanderPath]);

  const liveContracts = useMemo(() => {
    return LIVE_CONTRACTS.map((contract) => ({
      ...contract,
      done: contract.check(state, derived),
      claimed: !!claimedContracts[contract.key],
    }));
  }, [state, derived, claimedContracts]);

  const missionProgress = getMissionProgress(state);

  const readyCounts = useMemo(() => {
    const expeditionReadyNow =
      Number(state.expeditionReadyAt || 0) <= Date.now() &&
      Number(state.resources?.DATA || 0) >= 4 &&
      Number(state.resources?.ENERGY || 0) >= CONFIG.expeditionCost;

    const claimableContractsCount = liveContracts.filter(
      (c) => c.done && !c.claimed
    ).length;

    const claimableMissionsCount = DAILY_MISSIONS.filter((mission) => {
      const progress = missionProgress[mission.key] || 0;
      const done = progress >= mission.target;
      const claimed = !!state.missionState?.claimed?.[mission.key];
      return done && !claimed;
    }).length;

    return {
      expedition: expeditionReadyNow ? 1 : 0,
      contracts: claimableContractsCount,
      missions: claimableMissionsCount,
      shipment: 0,
      total: (expeditionReadyNow ? 1 : 0) + claimableContractsCount + claimableMissionsCount,
    };
  }, [state, liveContracts, missionProgress]);

  // command hub items use alerts; define after alerts below
  const blueprintCost = useMemo(
    () => Math.floor(CONFIG.blueprintBaseCost * Math.pow(CONFIG.blueprintGrowth, state.blueprintLevel)),
    [state.blueprintLevel]
  );

  function opButtonClass(isReady, isMuted = false) {
    if (isReady) {
      return "relative rounded-2xl border border-cyan-300/50 bg-cyan-400/85 text-slate-950 shadow-[0_0_16px_rgba(34,211,238,0.18)]";
    }

    if (isMuted) {
      return "rounded-2xl border border-white/10 bg-white/6 text-white/45";
    }

    return "rounded-2xl border border-white/10 bg-white/10 text-white/85";
  }

  const canShipNow = Number(state.bankedMleo || 0) >= 120;
  const canExpeditionNow =
    Number(state.expeditionReadyAt || 0) <= Date.now() &&
    Number(state.resources?.DATA || 0) >= 4 &&
    Number(state.resources?.ENERGY || 0) >= CONFIG.expeditionCost;

  const blueprintDataCost = 20 + Number(state.blueprintLevel || 0) * 6;
  const canBuyBlueprintNow = canAffordBlueprint(
    state,
    sharedVault,
    blueprintCost,
    blueprintDataCost
  );
  const needsRefillNow = Number(state.resources?.ENERGY || 0) < Math.max(35, Math.floor((derived.energyCap || 140) * 0.35));
  const needsMaintenanceNow = Number(state.stability || 100) <= 82;

  const operationsReadyCount =
    Number(canExpeditionNow) +
    Number(canShipNow);

  const expeditionLeft = Math.max(0, (state.expeditionReadyAt || 0) - Date.now());
  const overclockLeft = Math.max(0, (state.overclockUntil || 0) - Date.now());
  const alerts = useMemo(
    () => getAlerts(state, derived, systemState, liveContracts),
    [state, derived, systemState, liveContracts]
  );
  const desktopPriorityAlert = alerts[0] || null;

  const showExpeditions = (state.buildings?.hq || 0) >= 2;
  const showCrew = (state.buildings?.hq || 0) >= 3;
  const showAdvancedResearch = (state.blueprintLevel || 0) >= 1 || (state.buildings?.hq || 0) >= 3;

  const commandHubItems = useMemo(() => {
    const items = [];

    alerts.forEach((alert) => {
      items.push({
        key: `alert-${alert.key}`,
        type: "alert",
        tone: alert.tone || "info",
        alertKey: alert.key,
        title: alert.title,
        text: alert.text,
        count: 0,
      });
    });

    if (readyCounts.contracts > 0) {
      items.push({
        key: "contracts",
        type: "ready",
        tone: "success",
        title: "Contract reward ready",
        text: `${readyCounts.contracts} command contract${readyCounts.contracts > 1 ? "s are" : " is"} ready to claim.`,
        count: readyCounts.contracts,
      });
    }

    if (readyCounts.missions > 0) {
      items.push({
        key: "missions",
        type: "ready",
        tone: "success",
        title: "Mission reward ready",
        text: `${readyCounts.missions} daily mission${readyCounts.missions > 1 ? "s are" : " is"} ready to claim.`,
        count: readyCounts.missions,
      });
    }

    if (showExpeditions && readyCounts.expedition > 0) {
      items.push({
        key: "expedition",
        type: "ready",
        tone: "info",
        title: "Expedition ready",
        text: "Field team is available for deployment.",
        count: readyCounts.expedition,
      });
    }

    return items;
  }, [alerts, readyCounts, showExpeditions]);

  const primaryCommandItem = commandHubItems[0] || null;
  const commandHubCount = commandHubItems.length;

  const nextStep = useMemo(
    () => getNextStep(state, derived, systemState, liveContracts),
    [state, derived, systemState, liveContracts]
  );

  const availableStructuresCount = useMemo(() => {
    return BUILDINGS.filter((def) => {
      const level = Number(state.buildings?.[def.key] || 0);
      const cost = buildingCost(def, level);
      return unlocked(def, state) && canCoverCost(state.resources, cost);
    }).length;
  }, [state.buildings, state.resources]);

  const availableModulesCount = useMemo(() => {
    return MODULES.filter((def) => {
      return !state.modules?.[def.key] && canCoverCost(state.resources, def.cost);
    }).length;
  }, [state.modules, state.resources]);

  const availableResearchCount = useMemo(() => {
    return RESEARCH.filter((def) => {
      const hasPrereqs = !def.requires?.length || def.requires.every((k) => state.research?.[k]);
      return !state.research?.[def.key] && hasPrereqs && canCoverCost(state.resources, def.cost);
    }).length;
  }, [state.research, state.resources]);

  const availableBlueprintCount = canBuyBlueprintNow ? 1 : 0;

  const buildOpportunitiesCount =
    availableStructuresCount +
    availableModulesCount +
    availableResearchCount +
    availableBlueprintCount;

  const developmentAvailableCount =
    availableModulesCount + availableResearchCount;

  const structuresAvailableCount = availableStructuresCount;

  const supportAvailableCount = availableBlueprintCount;

  const operationsConsoleAvailableCount =
    Number(canExpeditionNow) +
    Number(canShipNow);

  const dailyMissionsAvailableCount = readyCounts.missions;

  const intelSummaryAvailableCount = [
    Number(state.totalMissionsDone || 0) > 0,
    Number(state.totalExpeditions || 0) > 0,
    Number(state.totalSharedSpent || 0) > 0,
    Number(state.totalBanked || 0) > 0,
  ].filter(Boolean).length;

  const intelLogAvailableCount = Math.min(
    Array.isArray(state.log) ? state.log.length : 0,
    99
  );

  const overviewRecommendationCount = 1;
  const overviewIdentityCount = 1;
  const liveContractsAvailableCount = readyCounts.contracts;

  const showToast = (message) => setToast(message);

  const updateState = (updater) => {
    setState((prev) => {
      const next = updater(prev);
      return next ?? prev;
    });
  };

  useEffect(() => {
    if (!mounted) return;
    if (activeEvent) return;

    const now = Date.now();
    if (now < eventCooldownUntil) return;

    const id = window.setTimeout(() => {
      setState((prev) => {
        const currentSystemState = getSystemState(prev.stability);
        const shouldFire =
          currentSystemState !== "normal" ||
          (prev.crew || 0) >= 2 ||
          (prev.buildings.logisticsCenter || 0) >= 1 ||
          (prev.buildings.expeditionBay || 0) >= 1 ||
          (prev.buildings.salvage || 0) >= 1 ||
          (prev.buildings.powerCell || 0) >= 1 ||
          (prev.buildings.refinery || 0) >= 1;

        if (!shouldFire) return prev;

        if (Math.random() > 0.42) return prev;

        const picked = pickLiveEvent(prev);
        if (picked) {
          setActiveEvent(picked);
          setEventCooldownUntil(Date.now() + EVENT_COOLDOWN_MS);
        }
        return prev;
      });
    }, 6000);

    return () => window.clearTimeout(id);
  }, [mounted, activeEvent, eventCooldownUntil, systemState]);

  useEffect(() => {
    if (!mounted) return;
    setCrewRole(state.crewRole || "engineer");
    setCommanderPath(state.commanderPath || "industry");
  }, [mounted, state.crewRole, state.commanderPath]);

  const resolveLiveEventChoice = (choice) => {
    if (!activeEvent || !choice) return;

    if (!canApplyEventChoice(state, choice, derived)) {
      showToast("Not enough resources for this decision.");
      return;
    }

    const effect = choice.effect || {};

    setState((prev) => {
      const currentDerived = derive(prev);
      const nextResources = applyResourceDelta(
        prev.resources,
        effect.resources || {},
        { ENERGY: currentDerived.energyCap }
      );

      let nextStability = clamp(
        Number(prev.stability || 100) + Number(effect.stability || 0),
        55,
        100
      );

      let nextOverclockUntil = prev.overclockUntil || 0;
      if (effect.tempBuff?.key === "surge_boost") {
        nextOverclockUntil = Math.max(nextOverclockUntil, Date.now() + (effect.tempBuff.untilMs || 0));
      }

      if (effect.nextShipBonus) {
        setNextShipBonus((prevBonus) => Math.max(prevBonus, effect.nextShipBonus));
      }

      return {
        ...prev,
        resources: nextResources,
        stability: nextStability,
        overclockUntil: nextOverclockUntil,
        log: pushLog(prev.log, choice.log || `${activeEvent.title}: ${choice.label}`),
      };
    });

    showToast(choice.label);
    setActiveEvent(null);
  };

  const handleCrewRoleChange = (roleKey) => {
    setCrewRole(roleKey);
    setState((prev) => ({
      ...prev,
      crewRole: roleKey,
      log: pushLog(prev.log, `Crew specialization changed to ${crewRoleMeta(roleKey).name}.`),
    }));
    saveBaseProfilePatch({ crewRole: roleKey });
    showToast(`Crew role: ${crewRoleMeta(roleKey).name}`);
  };

  const handleCommanderPathChange = (pathKey) => {
    setCommanderPath(pathKey);
    setState((prev) => ({
      ...prev,
      commanderPath: pathKey,
      log: pushLog(prev.log, `Commander path set to ${commanderPathMeta(pathKey).name}.`),
    }));
    saveBaseProfilePatch({ commanderPath: pathKey });
    showToast(`Commander path: ${commanderPathMeta(pathKey).name}`);
  };

  const claimContract = (key) => {
    const contract = LIVE_CONTRACTS.find((item) => item.key === key);
    if (!contract) return;

    const done = contract.check(state, derived);
    if (!done) {
      showToast("Contract is not complete yet.");
      return;
    }
    if (claimedContracts[key]) {
      showToast("Contract already claimed.");
      return;
    }

    setState((prev) => {
      const nextResources = { ...prev.resources };
      for (const [rk, rv] of Object.entries(contract.reward || {})) {
        if (rk === "XP") continue;
        nextResources[rk] = (nextResources[rk] || 0) + rv;
      }

      return applyLevelUps({
        ...prev,
        resources: nextResources,
        commanderXp: prev.commanderXp + Number(contract.reward?.XP || 0),
        log: pushLog(prev.log, `Contract claimed: ${contract.title}.`),
      });
    });

    setClaimedContracts((prev) => ({ ...prev, [key]: true }));
    showToast(`Contract claimed: ${contract.title}`);
  };

  const buyBuilding = async (key) => {
    return runLockedAction(`build:${key}`, async () => {
    const def = BUILDINGS.find((item) => item.key === key);
    if (!def) return;

    const level = state.buildings[key] || 0;
    if (!unlocked(def, state)) {
      showToast("Unlock earlier systems first.");
      return;
    }

    const cost = buildingCost(def, level);
    if (!canAfford(state.resources, cost)) {
      showToast("Not enough resources.");
      return;
    }

    try {
      const res = await buildBuilding(key);

      if (res?.success && res?.state) {
        setState((prev) => {
          const base = normalizeServerState(res.state, prev);

          const next = applyLevelUps({
            ...prev,
            ...base,
            crewRole: base?.crewRole ?? prev?.crewRole ?? "engineer",
            commanderPath: base?.commanderPath ?? prev?.commanderPath ?? "industry",
            missionState: {
              dailySeed:
                base?.missionState?.dailySeed ||
                prev?.missionState?.dailySeed ||
                todayKey(),
              completed: {
                ...(prev?.missionState?.completed || {}),
                ...(base?.missionState?.completed || {}),
              },
              claimed: {
                ...(prev?.missionState?.claimed || {}),
                ...(base?.missionState?.claimed || {}),
              },
            },
          });

          next.log = pushLog(
            next.log,
            `${def.name} upgraded to level ${res.new_level || level + 1}.`
          );
          return next;
        });

        showToast(`${def.name} upgraded to level ${res.new_level || level + 1}.`);
      } else {
        showToast(res?.message || "Build failed.");
      }
    } catch (error) {
      console.error("Build failed", error);
      showToast(error?.message || "Build action failed.");
    }
  });
  };

  const changeBuildingPowerMode = async (key, powerMode) => {
    return runLockedAction(`power:${key}:${powerMode}`, async () => {
      const def = BUILDINGS.find((item) => item.key === key);
      if (!def) return;

      if (!canThrottleBuilding(key)) {
        showToast("This structure does not support runtime power mode.");
        return;
      }

      const level = Number(state.buildings?.[key] || 0);
      if (level <= 0) {
        showToast("Build it first.");
        return;
      }

      const nextMode = normalizePowerMode(powerMode);
      const currentMode = getBuildingPowerMode(state, key);
      if (currentMode === nextMode) return;

      try {
        const res = await setBuildingPowerMode(key, nextMode);

        if (res?.success && res?.state) {
          setState((prev) => {
            const base = normalizeServerState(res.state, prev);

            const next = applyLevelUps({
              ...prev,
              ...base,
              crewRole: base?.crewRole ?? prev?.crewRole ?? "engineer",
              commanderPath:
                base?.commanderPath ?? prev?.commanderPath ?? "industry",
              missionState: {
                dailySeed:
                  base?.missionState?.dailySeed ||
                  prev?.missionState?.dailySeed ||
                  todayKey(),
                completed: {
                  ...(prev?.missionState?.completed || {}),
                  ...(base?.missionState?.completed || {}),
                },
                claimed: {
                  ...(prev?.missionState?.claimed || {}),
                  ...(base?.missionState?.claimed || {}),
                },
              },
            });

            next.log = pushLog(next.log, `${def.name} power set to ${nextMode}%.`);
            return next;
          });

          showToast(`${def.name} power set to ${nextMode}%.`);
        } else {
          showToast(res?.message || "Power mode update failed.");
        }
      } catch (error) {
        console.error("Power mode update failed", error);
        showToast(error?.message || "Power mode update failed.");
    }
  });
  };

  const hireCrew = async () => {
    return runLockedAction("hireCrew", async () => {
    const cost = crewCost(state.crew);

    if (!canAfford(state.resources, cost)) {
      showToast("Crew hiring needs more supplies.");
      return;
    }

    try {
      const res = await hireCrewAction();

      if (res?.success && res?.state) {
        setState((prev) => {
          const base = normalizeServerState(res.state, prev);

          const next = applyLevelUps({
            ...prev,
            ...base,
            crewRole: base?.crewRole ?? prev?.crewRole ?? "engineer",
            commanderPath: base?.commanderPath ?? prev?.commanderPath ?? "industry",
            missionState: {
              dailySeed:
                base?.missionState?.dailySeed ||
                prev?.missionState?.dailySeed ||
                todayKey(),
              completed: {
                ...(prev?.missionState?.completed || {}),
                ...(base?.missionState?.completed || {}),
              },
              claimed: {
                ...(prev?.missionState?.claimed || {}),
                ...(base?.missionState?.claimed || {}),
              },
            },
          });

          next.log = pushLog(
            next.log,
            `Crew hired. Team size is now ${res.new_crew || prev.crew + 1}.`
          );
          return next;
        });

        showToast(`Crew hired. Team size is now ${res.new_crew || state.crew + 1}.`);
      } else {
        showToast(res?.message || "Crew action failed.");
      }
    } catch (error) {
      console.error("Crew action failed", error);
      showToast(error?.message || "Crew action failed.");
    }
  });
  };

  const buyModule = async (key) => {
    return runLockedAction(`module:${key}`, async () => {
    const moduleDef = MODULES.find((item) => item.key === key);
    if (!moduleDef) return;

    if (state.modules[key]) {
      showToast("Module already installed.");
      return;
    }

    if (!canAfford(state.resources, moduleDef.cost)) {
      showToast("Module cost is not covered yet.");
      return;
    }

    try {
      const res = await installModule(key);

      if (res?.success && res?.state) {
        setState((prev) => {
          const base = normalizeServerState(res.state, prev);

          const next = applyLevelUps({
            ...prev,
            ...base,
            crewRole: base?.crewRole ?? prev?.crewRole ?? "engineer",
            commanderPath: base?.commanderPath ?? prev?.commanderPath ?? "industry",
            missionState: {
              dailySeed:
                base?.missionState?.dailySeed ||
                prev?.missionState?.dailySeed ||
                todayKey(),
              completed: {
                ...(prev?.missionState?.completed || {}),
                ...(base?.missionState?.completed || {}),
              },
              claimed: {
                ...(prev?.missionState?.claimed || {}),
                ...(base?.missionState?.claimed || {}),
              },
            },
          });

          next.log = pushLog(next.log, `${moduleDef.name} installed.`);
          return next;
        });

        showToast(`${moduleDef.name} installed.`);
      } else {
        showToast(res?.message || "Module install failed.");
      }
    } catch (error) {
      console.error("Module install failed", error);
      showToast(error?.message || "Module install failed.");
    }
  });
  };

  const buyResearch = async (key) => {
    return runLockedAction(`research:${key}`, async () => {
    const def = RESEARCH.find((item) => item.key === key);
    if (!def) return;

    if (state.research[key]) {
      showToast("Research already completed.");
      return;
    }

    if (def.requires?.some((item) => !state.research[item])) {
      showToast("Complete the prerequisite research first.");
      return;
    }

    if (!canAfford(state.resources, def.cost)) {
      showToast("Research lab needs more materials.");
      return;
    }

    try {
      const res = await researchTech(key);

      if (res?.success && res?.state) {
        setState((prev) => {
          const base = normalizeServerState(res.state, prev);

          const next = applyLevelUps({
            ...prev,
            ...base,
            crewRole: base?.crewRole ?? prev?.crewRole ?? "engineer",
            commanderPath: base?.commanderPath ?? prev?.commanderPath ?? "industry",
            missionState: {
              dailySeed:
                base?.missionState?.dailySeed ||
                prev?.missionState?.dailySeed ||
                todayKey(),
              completed: {
                ...(prev?.missionState?.completed || {}),
                ...(base?.missionState?.completed || {}),
              },
              claimed: {
                ...(prev?.missionState?.claimed || {}),
                ...(base?.missionState?.claimed || {}),
              },
            },
          });

          next.log = pushLog(next.log, `${def.name} research completed.`);
          return next;
        });

        showToast(`${def.name} research completed.`);
      } else {
        showToast(res?.message || "Research failed.");
      }
    } catch (error) {
      console.error("Research failed", error);
      showToast(error?.message || "Research action failed.");
    }
  });
  };

  const handleLaunchExpedition = async () => {
    return runLockedAction("expedition", async () => {
    const now = Date.now();
    if ((state.expeditionReadyAt || 0) > now) {
      showToast("Expedition team is still out in the field.");
      return;
    }
    if ((state.resources.ENERGY || 0) < CONFIG.expeditionCost) {
      showToast("Not enough energy for an expedition.");
      return;
    }
    if ((state.resources.DATA || 0) < 4) {
      showToast("Need 4 DATA to launch expedition.");
      return;
    }

    try {
      const res = await launchExpeditionAction();
      if (res?.success && res?.state) {
        const serverState = res.state;
        const loot = res.loot || {};

        setState((prev) => {
          const base = normalizeServerState(serverState, prev);
          const next = applyLevelUps({
            ...prev,
            ...base,
            crewRole: base?.crewRole ?? prev?.crewRole ?? "engineer",
            commanderPath: base?.commanderPath ?? prev?.commanderPath ?? "industry",
            expeditionReadyAt: base.expeditionReadyAt || prev.expeditionReadyAt,
            totalExpeditions: (prev.totalExpeditions || 0) + 1,
            missionState: {
              dailySeed:
                base?.missionState?.dailySeed ||
                prev?.missionState?.dailySeed ||
                todayKey(),
              completed: {
                ...(prev?.missionState?.completed || {}),
                ...(base?.missionState?.completed || {}),
              },
              claimed: {
                ...(prev?.missionState?.claimed || {}),
                ...(base?.missionState?.claimed || {}),
              },
            },
          });
          next.log = pushLog(
            next.log,
            `Expedition (${expeditionMode}) returned with ${loot.ore || 0} ORE, ${
              loot.gold || 0
            } GOLD, ${loot.scrap || 0} SCRAP, ${loot.data || 0} DATA${
              loot.bankedMleo ? ` and ${loot.bankedMleo} MLEO` : ""
            }.`
          );
          return next;
        });

        showToast(
          `Expedition (${expeditionMode}) returned with ${loot.ore || 0} ORE, ${loot.gold || 0} GOLD, ${loot.scrap || 0} SCRAP, ${loot.data || 0} DATA${loot.bankedMleo ? ` and ${loot.bankedMleo} MLEO` : ""}.`
        );
      } else {
        showToast(res?.message || "Expedition failed.");
      }
    } catch (error) {
      console.error("Expedition failed", error);
      showToast("Expedition action failed. Try again.");
    }
  });
  };

  const bankToSharedVault = async () => {
    return runLockedAction("ship", async () => {
    try {
      const res = await shipToVault();
      
      if (!res?.success) {
        showToast(res?.message || "Nothing ready to ship yet.");
        return;
      }

      if (res?.state) {
        const serverState = res.state;
        const latestVault = await readVaultSafe();
        if (latestVault != null) setSharedVault(latestVault);

        const shippedBase = Number(res.shipped || 0);
        const bonusAmount =
          nextShipBonus > 0 ? Math.floor(shippedBase * nextShipBonus) : 0;

        if (bonusAmount > 0) {
          await addToVault(bonusAmount, "mleo-base-logistics-bonus");
          const afterBonusVault = await readVaultSafe();
          if (afterBonusVault != null) setSharedVault(afterBonusVault);
        }

        setState((prev) => {
          const base = normalizeServerState(serverState, prev);
          const next = applyLevelUps({
            ...prev,
            ...base,
            crewRole: base?.crewRole ?? prev?.crewRole ?? "engineer",
            commanderPath: base?.commanderPath ?? prev?.commanderPath ?? "industry",
            missionState: {
              dailySeed:
                base?.missionState?.dailySeed ||
                prev?.missionState?.dailySeed ||
                todayKey(),
              completed: {
                ...(prev?.missionState?.completed || {}),
                ...(base?.missionState?.completed || {}),
              },
              claimed: {
                ...(prev?.missionState?.claimed || {}),
                ...(base?.missionState?.claimed || {}),
              },
            },
          });
          next.log = pushLog(
            next.log,
            `Shipped ${fmt(shippedBase)} MLEO to shared vault${
              bonusAmount > 0 ? ` (+${fmt(bonusAmount)} logistics bonus)` : ""
            }.`
          );
          return next;
        });

        setNextShipBonus(0);

        showToast(
          `+${fmt(shippedBase)} MLEO shipped${
            bonusAmount > 0 ? ` (+${fmt(bonusAmount)} bonus)` : ""
          }.`
        );
      } else {
        showToast(res?.message || "Ship failed.");
      }
    } catch (error) {
      console.error("Ship failed", error);
      const errorMessage = error?.message || "Nothing ready to ship yet.";
      showToast(errorMessage);
    }
  });
  };

  const buyBlueprint = async () => {
    return runLockedAction("blueprint", async () => {
    const dataCost = 20 + state.blueprintLevel * 6;
    if ((state.resources.DATA || 0) < dataCost) {
      showToast(`Need ${fmt(dataCost)} DATA.`);
      return;
    }
    try {
      const res = await spendFromVault("blueprint");
      if (res?.success && res?.state) {
        const serverState = res.state;
        const latestVault = await readVaultSafe();
        if (latestVault != null) setSharedVault(latestVault);
        setState((prev) => {
          const next = {
            ...prev,
            blueprintLevel: Number(serverState.blueprint_level || prev.blueprintLevel),
            resources: serverState.resources || prev.resources,
            commanderXp: Number(serverState.commander_xp || prev.commanderXp),
            commanderLevel: Number(serverState.commander_level || prev.commanderLevel),
            totalSharedSpent: Number(serverState.total_shared_spent || prev.totalSharedSpent),
            stats: { ...prev.stats, ...(serverState.stats || {}) },
            log: pushLog(prev.log, "Blueprint cache purchased."),
          };
          return applyLevelUps(next);
        });
        showToast("Blueprint upgraded. Daily shipping cap increased and banking efficiency improved.");
      } else {
        showToast(res?.message || "Blueprint purchase failed.");
      }
    } catch (error) {
      console.error("Blueprint purchase failed", error);
      showToast("Blueprint purchase failed. Try again.");
    }
  });
  };

  const activateOverclock = async () => {
    return runLockedAction("overclock", async () => {
    if ((state.resources.DATA || 0) < 12) {
      showToast("Need 12 DATA.");
      return;
    }
    try {
      const res = await spendFromVault("overclock");
      if (res?.success && res?.state) {
        const serverState = res.state;
        const latestVault = await readVaultSafe();
        if (latestVault != null) setSharedVault(latestVault);
        setState((prev) => {
          const next = {
            ...prev,
            overclockUntil: serverState.overclock_until ? new Date(serverState.overclock_until).getTime() : prev.overclockUntil,
            resources: serverState.resources || prev.resources,
            commanderXp: Number(serverState.commander_xp || prev.commanderXp),
            commanderLevel: Number(serverState.commander_level || prev.commanderLevel),
            totalSharedSpent: Number(serverState.total_shared_spent || prev.totalSharedSpent),
            stats: { ...prev.stats, ...(serverState.stats || {}) },
            log: pushLog(prev.log, "Overclock activated."),
          };
          return applyLevelUps(next);
        });
        showToast("Overclock engaged. Base output is temporarily boosted.");
      } else {
        showToast(res?.message || "Overclock failed.");
      }
    } catch (error) {
      console.error("Overclock failed", error);
      showToast("Overclock action failed. Try again.");
    }
  });
  };

  const refillEnergy = async () => {
    return runLockedAction("refill", async () => {
    const cap = derived.energyCap;
    if ((state.resources.ENERGY || 0) >= cap - 1) {
      showToast("Energy is already near full.");
      return;
    }
    if ((state.resources.DATA || 0) < 5) {
      showToast("Need 5 DATA.");
      return;
    }
    try {
      const res = await spendFromVault("refill");
      if (res?.success && res?.state) {
        const serverState = res.state;
        const latestVault = await readVaultSafe();
        if (latestVault != null) setSharedVault(latestVault);
        setState((prev) => {
          const next = {
            ...prev,
            resources: serverState.resources || prev.resources,
            commanderXp: Number(serverState.commander_xp || prev.commanderXp),
            commanderLevel: Number(serverState.commander_level || prev.commanderLevel),
            totalSharedSpent: Number(serverState.total_shared_spent || prev.totalSharedSpent),
            stats: { ...prev.stats, ...(serverState.stats || {}) },
            log: pushLog(prev.log, "Energy refilled."),
          };
          return applyLevelUps(next);
        });
        showToast("Energy reserves restored.");
      } else {
        showToast(res?.message || "Refill failed.");
      }
    } catch (error) {
      console.error("Refill failed", error);
      showToast("Refill action failed. Try again.");
    }
  });
  };

  const performMaintenance = async () => {
    return runLockedAction("maintenance", async () => {
    const cost = { GOLD: 42, SCRAP: 22, DATA: 5 };

    if (!hasResources(state.resources, cost)) {
      showToast("Need GOLD, SCRAP and DATA for maintenance.");
      return;
    }

    try {
      const res = await performMaintenanceAction();
      if (res?.success && res?.state) {
        const serverState = res.state;
        setState((prev) => {
          const next = {
            ...prev,
            resources: serverState.resources || prev.resources,
            stability: Number(serverState.stability || prev.stability),
            commanderXp: Number(serverState.commander_xp || prev.commanderXp),
            commanderLevel: Number(serverState.commander_level || prev.commanderLevel),
            stats: { ...prev.stats, ...(serverState.stats || {}) },
            log: pushLog(prev.log, "Maintenance completed. Base stability improved."),
          };
          return applyLevelUps(next);
        });
        showToast("Repair crews completed maintenance. Stability restored.");
      } else {
        showToast(res?.message || "Maintenance failed.");
      }
    } catch (error) {
      console.error("Maintenance failed", error);
      showToast("Maintenance action failed. Try again.");
    }
  });
  };

  const claimMission = async (missionKey) => {
    try {
      const payload = await claimBaseMission(missionKey);
      if (!payload?.success) {
        showToast(payload?.message || "Mission claim failed");
        return;
      }

      const serverState = payload?.state;
      if (!serverState) {
        // API can fail to return updated state even when it responds successfully.
        // Don't crash the UI; fall back to a safe retry path.
        showToast(payload?.message || "Mission claim failed (missing updated state).");
        return;
      }

      setState((prev) => {
        const normalized = normalizeServerState(serverState, prev);

        return applyLevelUps({
          ...prev,
          ...normalized,
          crewRole:
            serverState?.crewRole ??
            serverState?.crew_role ??
            normalized?.crewRole ??
            prev?.crewRole ??
            "engineer",
          commanderPath:
            serverState?.commanderPath ??
            serverState?.commander_path ??
            normalized?.commanderPath ??
            prev?.commanderPath ??
            "industry",
          missionState: {
            dailySeed:
              normalized?.missionState?.dailySeed ||
              prev?.missionState?.dailySeed ||
              todayKey(),
            completed: {
              ...(prev?.missionState?.completed || {}),
              ...(normalized?.missionState?.completed || {}),
            },
            claimed: {
              ...(prev?.missionState?.claimed || {}),
              ...(normalized?.missionState?.claimed || {}),
            },
          },
        });
      });

      showToast("Mission reward claimed.");
    } catch (error) {
      console.error("Mission claim failed", error);
      showToast(error?.message || "Mission claim failed");
    }
  };

  function quickTagToneClass(tone = "neutral") {
    switch (tone) {
      case "good":
        return "bg-emerald-500/10 text-emerald-200 border border-emerald-400/20";
      case "warn":
        return "bg-amber-500/10 text-amber-200 border border-amber-400/20";
      case "risk":
        return "bg-rose-500/10 text-rose-200 border border-rose-400/20";
      case "info":
        return "bg-cyan-500/10 text-cyan-200 border border-cyan-400/20";
      default:
        return "bg-white/10 text-white/75 border border-white/10";
    }
  }

  function renderQuickTags(tags = []) {
    if (!tags?.length) return null;

    return (
      <div className="mt-3 flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={`${tag.label}-${tag.tone || "neutral"}`}
            className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${quickTagToneClass(tag.tone)}`}
          >
            {tag.label}
          </span>
        ))}
      </div>
    );
  }

  function getModuleQuickTags(key) {
    switch (key) {
      case "servoDrill":
        return [
          { label: "best: ore", tone: "good" },
          { label: "pair: quarry", tone: "info" },
          { label: "watch: energy", tone: "warn" },
        ];
      case "vaultCompressor":
        return [
          { label: "best: shipping", tone: "good" },
          { label: "pair: logistics", tone: "info" },
          { label: "needs: banked", tone: "warn" },
        ];
      case "arcadeRelay":
        return [
          { label: "best: xp/data", tone: "good" },
          { label: "pair: arcade", tone: "info" },
          { label: "active play", tone: "neutral" },
        ];
      case "minerLink":
        return [
          { label: "best: refinery", tone: "good" },
          { label: "stability help", tone: "info" },
          { label: "pair: repair", tone: "warn" },
        ];
      default:
        return [];
    }
  }

  function getResearchQuickTags(key) {
    switch (key) {
      case "coolant":
        return [
          { label: "best: energy", tone: "good" },
          { label: "pair: power cell", tone: "info" },
        ];
      case "routing":
        return [
          { label: "best: bank flow", tone: "good" },
          { label: "pair: logistics", tone: "info" },
        ];
      case "fieldOps":
        return [
          { label: "crew boost", tone: "good" },
          { label: "mid-game", tone: "neutral" },
        ];
      case "minerSync":
        return [
          { label: "best: ore", tone: "good" },
          { label: "pair: quarry", tone: "info" },
        ];
      case "arcadeOps":
        return [
          { label: "best: expeditions", tone: "good" },
          { label: "active xp", tone: "info" },
        ];
      case "logistics":
        return [
          { label: "best: shipping", tone: "good" },
          { label: "needs: refinery", tone: "warn" },
        ];
      case "predictiveMaintenance":
        return [
          { label: "best: stability", tone: "good" },
          { label: "pair: repair bay", tone: "info" },
        ];
      case "deepScan":
        return [
          { label: "data bursts", tone: "good" },
          { label: "expeditions", tone: "info" },
        ];
      case "tokenDiscipline":
        return [
          { label: "advanced build", tone: "warn" },
          { label: "data + ship", tone: "good" },
          { label: "less raw bank", tone: "risk" },
        ];
      default:
        return [];
    }
  }

  function getMissionQuickTags(key) {
    switch (key) {
      case "upgrade_building":
        return [
          { label: "safe: power cell", tone: "good" },
          { label: "or hq", tone: "info" },
        ];
      case "run_expedition":
        return [
          { label: "cost: 36 energy", tone: "warn" },
          { label: "cost: 4 data", tone: "warn" },
        ];
      case "generate_data":
        return [
          { label: "main: research lab", tone: "good" },
          { label: "support: miner/arcade", tone: "info" },
        ];
      case "perform_maintenance":
        return [
          { label: "main: repair bay", tone: "good" },
          { label: "stability", tone: "info" },
        ];
      case "double_expedition":
        return [
          { label: "2 field runs", tone: "warn" },
          { label: "energy heavy", tone: "risk" },
        ];
      case "ship_mleo":
        return [
          { label: "needs: banked mleo", tone: "warn" },
          { label: "pair: logistics", tone: "info" },
        ];
      case "spend_vault":
        return [
          { label: "best: blueprint", tone: "good" },
          { label: "smart reinvest", tone: "info" },
        ];
      default:
        return [];
    }
  }

  function getCrewRoleQuickTags(roleKey) {
    switch (roleKey) {
      case "engineer":
        return [
          { label: "best: stability", tone: "good" },
          { label: "maintenance", tone: "info" },
          { label: "safe build", tone: "neutral" },
        ];
      case "logistician":
        return [
          { label: "best: shipping", tone: "good" },
          { label: "vault flow", tone: "info" },
          { label: "late-game", tone: "warn" },
        ];
      case "researcher":
        return [
          { label: "best: data", tone: "good" },
          { label: "analysis", tone: "info" },
          { label: "pair: lab", tone: "warn" },
        ];
      case "scout":
        return [
          { label: "best: expeditions", tone: "good" },
          { label: "field play", tone: "info" },
          { label: "light bonus", tone: "neutral" },
        ];
      case "operations":
        return [
          { label: "gold + scrap", tone: "good" },
          { label: "balanced", tone: "info" },
          { label: "safe mid-game", tone: "neutral" },
        ];
      default:
        return [];
    }
  }

  function getCommanderPathQuickTags(pathKey) {
    switch (pathKey) {
      case "industry":
        return [
          { label: "best: ore", tone: "good" },
          { label: "safer growth", tone: "info" },
          { label: "stable mid-game", tone: "neutral" },
        ];
      case "logistics":
        return [
          { label: "best: shipping", tone: "good" },
          { label: "vault flow", tone: "info" },
          { label: "needs banked", tone: "warn" },
        ];
      case "research":
        return [
          { label: "best: data", tone: "good" },
          { label: "systems", tone: "info" },
          { label: "advanced", tone: "warn" },
        ];
      case "ecosystem":
        return [
          { label: "gold + data", tone: "good" },
          { label: "broad synergy", tone: "info" },
          { label: "hybrid", tone: "neutral" },
        ];
      default:
        return [];
    }
  }

  function getCrewRoleStatLine(roleKey) {
    switch (roleKey) {
      case "engineer":
        return "+6% maintenance relief";
      case "logistician":
        return "+3% bank / ship bonus";
      case "researcher":
        return "+5% DATA multiplier";
      case "scout":
        return "+2% DATA multiplier";
      case "operations":
        return "+2% GOLD and +2% SCRAP";
      default:
        return "";
    }
  }

  function getCommanderPathStatLine(pathKey) {
    switch (pathKey) {
      case "industry":
        return "+3% ORE and +3% maintenance relief";
      case "logistics":
        return "+4% bank / ship bonus";
      case "research":
        return "+6% DATA multiplier";
      case "ecosystem":
        return "+1% GOLD and +2% DATA";
      default:
        return "";
    }
  }

  function getCrewRoleHint(roleKey) {
    switch (roleKey) {
      case "engineer":
        return "Best when Stability and maintenance are becoming annoying.";
      case "logistician":
        return "Best once shipping is part of your normal loop.";
      case "researcher":
        return "Best when DATA is your real bottleneck.";
      case "scout":
        return "Best for active expedition-oriented play.";
      case "operations":
        return "Best when you want a balanced economy boost.";
      default:
        return "";
    }
  }

  function getCommanderPathHint(pathKey) {
    switch (pathKey) {
      case "industry":
        return "Strong early/mid-game default for safer production growth.";
      case "logistics":
        return "Strong when Refinery + shipping are already online.";
      case "research":
        return "Strong for DATA-focused advanced progression.";
      case "ecosystem":
        return "Strong for hybrid play across economy and support systems.";
      default:
        return "";
    }
  }

  const dailyMissionsContent = (
    <div className="space-y-3">
      {[...DAILY_MISSIONS].sort((a, b) => {
        const aProgress = missionProgress[a.key] || 0;
        const aDone = aProgress >= a.target;
        const aClaimed = !!state.missionState?.claimed?.[a.key];
        const aReady = aDone && !aClaimed ? 1 : 0;
        
        const bProgress = missionProgress[b.key] || 0;
        const bDone = bProgress >= b.target;
        const bClaimed = !!state.missionState?.claimed?.[b.key];
        const bReady = bDone && !bClaimed ? 1 : 0;
        
        return bReady - aReady;
      }).map((mission) => {
        const progress = missionProgress[mission.key] || 0;
        const done = progress >= mission.target;
        const claimed = !!state.missionState?.claimed?.[mission.key];
        const ready = done && !claimed;
        return (
          <div
            key={mission.key}
            data-base-target={mission.key}
            className={`relative rounded-xl border p-2.5 ${
              ready
                ? "border-amber-400/40 bg-amber-500/10"
                : "border-white/10 bg-black/20"
            } ${
              highlightTarget === mission.key
                ? "ring-2 ring-amber-300/90 border-amber-300 bg-amber-400/10 shadow-[0_0_0_1px_rgba(252,211,77,0.45),0_0_28px_rgba(245,158,11,0.18)]"
                : ""
            }`}
          >
            <div className="absolute right-2.5 top-2.5 z-10">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setBuildInfo(getMissionInfo(mission));
                  setOpenInfoKey(null);
                }}
                className="flex h-6 w-6 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[11px] font-black text-cyan-200 transition hover:bg-cyan-500/20 hover:text-white"
                aria-label={`Open info for ${mission.name}`}
                title={`Info about ${mission.name}`}
              >
                i
              </button>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="pr-8">
                <div className="text-xs font-semibold">{mission.name}</div>
                <div className="mt-1 text-[11px] text-white/60">
                  Progress: {fmt(progress)} / {fmt(mission.target)}
                </div>
                <div className="mt-1 text-[11px] text-white/55">Potential reward: {rewardText(mission.reward)}</div>

                {renderQuickTags(getMissionQuickTags(mission.key))}

                <div className="mt-2 text-[11px] text-white/45">
                  {mission.key === "upgrade_building" && "Good moment to upgrade a real bottleneck, not a random building."}
                  {mission.key === "run_expedition" && "Only worth forcing when Energy and DATA are comfortable."}
                  {mission.key === "generate_data" && "Research Lab is the cleanest answer."}
                  {mission.key === "perform_maintenance" && "Best done before Stability starts feeling ugly."}
                  {mission.key === "double_expedition" && "Can drain tempo if Energy is already weak."}
                  {mission.key === "ship_mleo" && "First create banked MLEO, then ship."}
                  {mission.key === "spend_vault" && "Blueprint is the cleanest long-term spend path."}
                </div>
              </div>
              <button
                onClick={() => claimMission(mission.key)}
                disabled={!done || claimed}
                className={`shrink-0 rounded-xl px-3 py-1.5 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
                  ready
                    ? "bg-cyan-500 text-white hover:bg-cyan-400"
                    : "bg-white/10 hover:bg-white/20"
                }`}
              >
                {claimed ? "Claimed" : done ? "Claim" : "In Progress"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );

  // Used by Desktop "ops-console" inner panel.
  // Keep it presentation-only: the action handlers already contain the real game/server logic.
  const operationsConsoleContent = (
    <div className="grid gap-3 md:grid-cols-2">
      <div
        data-base-target="shipping"
        className={`relative flex h-full flex-col gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 ${
          highlightCard((state.bankedMleo || 0) >= 120, "success") || ""
        } ${isHighlightedTarget("shipping", highlightTarget) ? "ring-2 ring-cyan-300/90 border-cyan-300 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(103,232,249,0.45),0_0_28px_rgba(34,211,238,0.18)]" : ""}`}
      >
        <div className="absolute right-3 top-3 z-10">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setBuildInfo(getOperationsInfo("shipping"));
              setOpenInfoKey(null);
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[13px] font-black text-cyan-200 transition hover:bg-cyan-500/20 hover:text-white"
            aria-label="Open shipping info"
            title="Info about shipping"
          >
            i
          </button>
        </div>

        <div className="flex min-h-[88px] flex-col pr-8">
          <div className="text-sm font-semibold text-emerald-200">Ship to Shared Vault</div>
          <p className="mt-1 text-sm text-white/70">
            Move refined MLEO into the main vault with a daily softcut, so BASE supports Miners instead
            of replacing it.
          </p>
        </div>

        <button
          onClick={bankToSharedVault}
          disabled={!canShipNow}
          className={`mt-auto w-full rounded-2xl px-4 py-3.5 text-sm font-extrabold transition ${
            canShipNow ? "bg-emerald-600 text-white hover:bg-emerald-500" : "bg-white/10 text-white/45"
          }`}
        >
          Ship {fmt(state.bankedMleo || 0)} MLEO
        </button>
      </div>

      {showExpeditions ? (
        <div
          data-base-target="expedition"
          className={`relative flex h-full flex-col gap-3 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4 ${
            highlightCard(expeditionLeft <= 0 && (state.resources.DATA || 0) >= 4, "info") || ""
          } ${
            isHighlightedTarget("expedition", highlightTarget)
              ? "ring-2 ring-cyan-300/90 border-cyan-300 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(103,232,249,0.45),0_0_28px_rgba(34,211,238,0.18)]"
              : ""
          }`}
        >
          <div className="absolute right-3 top-3 z-10">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setBuildInfo(getOperationsInfo("expedition"));
                setOpenInfoKey(null);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[13px] font-black text-cyan-200 transition hover:bg-cyan-500/20 hover:text-white"
              aria-label="Open expedition info"
              title="Info about expedition"
            >
              i
            </button>
          </div>

          <div className="flex min-h-[88px] flex-col pr-8">
            <div className="text-sm font-semibold text-cyan-200">Field Expedition</div>
            <p className="mt-1 text-sm text-white/70">
              Potential rewards: Ore, Gold, Scrap, DATA, and sometimes banked MLEO. Typical outcome varies.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-[11px] font-bold text-cyan-200">
                COST: 36 ENERGY
              </span>
              <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-[11px] font-bold text-amber-200">
                COST: 4 DATA
              </span>
              <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-bold text-white/75">
                CD: 120s
              </span>
            </div>
          </div>

          <button
            onClick={handleLaunchExpedition}
            disabled={!canExpeditionNow}
            className={`mt-auto w-full rounded-2xl px-4 py-3.5 text-sm font-extrabold transition ${
              canExpeditionNow ? "bg-cyan-600 text-slate-950 hover:bg-cyan-500" : "bg-white/10 text-white/45"
            }`}
          >
            {expeditionLeft > 0
              ? `Expedition ${Math.ceil(expeditionLeft / 1000)}s`
              : "Launch Expedition"}
          </button>
        </div>
      ) : null}

      <div
        data-base-target="blueprint"
        className={`relative rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/10 p-4 ${
          highlightCard(canAffordBlueprint(state, sharedVault, blueprintCost, blueprintDataCost), "info") || ""
        }`}
      >
        <div className="absolute right-3 top-3 z-10">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setBuildInfo(getSystemInfo("blueprint"));
              setOpenInfoKey(null);
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[13px] font-black text-cyan-200 transition hover:bg-cyan-500/20 hover:text-white"
            aria-label="Open blueprint info"
            title="Info about blueprint"
          >
            i
          </button>
        </div>

        <div className="flex min-h-[88px] flex-col pr-8">
          <div className="text-sm font-semibold text-fuchsia-200">Blueprint Cache</div>
          <p className="mt-1 text-sm text-white/70">
            Costs {fmt(blueprintCost)} shared MLEO + {fmt(blueprintDataCost)} DATA. Raises banking efficiency
            and daily ship cap permanently.
          </p>
        </div>

        <button
          onClick={buyBlueprint}
          disabled={!canAffordBlueprint(state, sharedVault, blueprintCost, blueprintDataCost)}
          className={`mt-4 w-full rounded-2xl px-4 py-3.5 text-sm font-extrabold transition ${
            canAffordBlueprint(state, sharedVault, blueprintCost, blueprintDataCost)
              ? "bg-fuchsia-600 text-white hover:bg-fuchsia-500"
              : "bg-white/10 text-white/45"
          }`}
        >
          Buy Blueprint Lv {state.blueprintLevel + 1}
        </button>
      </div>

      <div
        data-base-target="maintenance"
        className={`relative rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 ${
          systemState === "critical" ? highlightCard(true, "critical") : systemState === "warning" ? highlightCard(true, "warning") : ""
        } ${isHighlightedTarget("maintenance", highlightTarget) ? "ring-2 ring-cyan-300/90 border-cyan-300 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(103,232,249,0.45),0_0_28px_rgba(34,211,238,0.18)]" : ""}`}
      >
        <div className="absolute right-3 top-3 z-10 flex gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setBuildInfo(getOperationsInfo("refill"));
              setOpenInfoKey(null);
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[11px] font-black text-cyan-200 transition hover:bg-cyan-500/20 hover:text-white"
            aria-label="Open refill info"
            title="Info about refill"
          >
            i
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setBuildInfo(getOperationsInfo("maintenance"));
              setOpenInfoKey(null);
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[13px] font-black text-cyan-200 transition hover:bg-cyan-500/20 hover:text-white"
            aria-label="Open maintenance info"
            title="Info about maintenance"
          >
            i
          </button>
        </div>

        <div className="flex min-h-[88px] flex-col pr-8">
          <div className="text-sm font-semibold text-amber-200">Shared Vault Utilities</div>
          <p className="mt-1 text-sm text-white/70">
            Spend shared MLEO on productivity instead of pure emissions.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-[11px] font-bold text-cyan-200">
              OVERCLOCK: 900 + 12 DATA
            </span>
            <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-[11px] font-bold text-amber-200">
              REFILL: 180 + 5 DATA
            </span>
            <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-bold text-white/75">
              MAINTAIN: STABILITY
            </span>
          </div>

          <p className="mt-2 text-xs text-white/55">
            Stability: {fmt(state.stability)}%
          </p>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <button
            onClick={activateOverclock}
            className="rounded-xl bg-amber-600 px-3 py-3 text-sm font-bold text-white hover:bg-amber-500"
          >
            {overclockLeft > 0
              ? `Overclock ${Math.ceil(overclockLeft / 1000)}s`
              : `Overclock ${fmt(CONFIG.overclockCost)}`}
          </button>

          <button
            onClick={refillEnergy}
            className="rounded-xl bg-white/10 px-3 py-3 text-sm font-bold text-white hover:bg-white/20"
          >
            Refill {fmt(CONFIG.refillCost)}
          </button>

          <button
            onClick={performMaintenance}
            className={`rounded-xl px-3 py-3 text-sm font-bold text-white ${
              systemState === "critical"
                ? "bg-rose-600 hover:bg-rose-500"
                : systemState === "warning"
                ? "bg-amber-600 hover:bg-amber-500"
                : "bg-white/10 hover:bg-white/20"
            }`}
          >
            Maintain
          </button>
        </div>
      </div>
    </div>
  );

  const crewModulesResearchContent = (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { key: "crew", label: "Crew" },
          { key: "modules", label: "Modules" },
          { key: "research", label: "Research" },
        ].map((tab) => {
          const active = devTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setDevTab(tab.key)}
              className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                active
                  ? "bg-cyan-500 text-white"
                  : "border border-white/10 bg-white/5 text-white/70"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {devTab === "crew" ? (
        <>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Crew</div>
            <div className="text-xs text-white/60">
              {state.crew} workers · global output bonus {(state.research.fieldOps ? 3 : 2) * state.crew}%
            </div>
          </div>
          <button
            onClick={hireCrew}
            className={`rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20 ${canCoverCost(state.resources, workerNextCost) ? "" : "opacity-70"}`}
          >
            Hire
          </button>
        </div>

              <div className="mt-2 text-[11px] font-black uppercase tracking-[0.18em] text-white/40">
                Next Cost
              </div>
              <ResourceCostRow cost={workerNextCost} resources={state.resources} />

              <div>
                <div className="mb-2 text-xs uppercase tracking-[0.18em] text-white/45">Crew Specialization</div>
                <div className="mb-3 text-[11px] text-white/35">
                  Profile preference: saved locally on this device for now.
                </div>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {CREW_ROLES.map((role) => {
                    const active = crewRole === role.key;
                    return (
                      <button
                        key={role.key}
                        onClick={() => handleCrewRoleChange(role.key)}
                        className={`relative rounded-xl border px-3 py-2.5 text-left transition ${
                          active
                            ? "border-cyan-400/60 bg-cyan-500/15"
                            : "border-white/10 bg-white/5 hover:bg-white/10"
                        }`}
                      >
                        <div className="absolute right-2 top-2 z-10">
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                            setBuildInfo(getCrewInfo(role.key));
                              setOpenInfoKey(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                e.stopPropagation();
                              setBuildInfo(getCrewInfo(role.key));
                                setOpenInfoKey(null);
                              }
                            }}
                            className="flex h-6 w-6 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[12px] font-black text-cyan-200 transition hover:bg-cyan-500/20 hover:text-white"
                            aria-label={`Open info for ${role.name}`}
                            title={`Info about ${role.name}`}
                          >
                            i
                          </span>
                        </div>
                        <div className="pr-8">
                          <div className="text-sm font-semibold text-white">{role.name}</div>
                          <div className="mt-1 text-xs text-white/60">{role.desc}</div>

                          {renderQuickTags(getCrewRoleQuickTags(role.key))}

                          <div className="mt-2 text-[11px] font-semibold text-cyan-200/85">
                            {getCrewRoleStatLine(role.key)}
                          </div>
                          <div className="mt-1 text-[11px] text-white/45">{getCrewRoleHint(role.key)}</div>

                          {active ? (
                            <div className="mt-2">
                              <AvailabilityBadge />
                            </div>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
        </div>
      </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-sm font-semibold text-white">Commander Path</div>
            <div className="mt-1 text-xs text-white/60">
              Choose a command identity for your base. This changes specialization, not the core economy.
            </div>
          <div className="mt-2 text-[11px] text-white/35">
            Profile preference: saved locally on this device for now.
            </div>

            <div className="mt-3 grid gap-2 lg:grid-cols-2">
              {COMMANDER_PATHS.map((path) => {
                const active = commanderPath === path.key;
                return (
                  <button
                    key={path.key}
                    onClick={() => handleCommanderPathChange(path.key)}
                    className={`relative rounded-xl border px-3 py-2.5 text-left transition ${
                      active
                        ? "border-cyan-400/60 bg-cyan-500/15"
                        : "border-white/10 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <div className="absolute right-2 top-2 z-10">
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          setBuildInfo(getCommanderPathInfo(path.key));
                          setOpenInfoKey(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            setBuildInfo(getCommanderPathInfo(path.key));
                            setOpenInfoKey(null);
                          }
                        }}
                        className="flex h-6 w-6 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[12px] font-black text-cyan-200 transition hover:bg-cyan-500/20 hover:text-white"
                        aria-label={`Open info for ${path.name}`}
                        title={`Info about ${path.name}`}
                      >
                        i
                      </span>
                    </div>
                    <div className="pr-8">
                      <div className="text-sm font-semibold text-white">{path.name}</div>
                      <div className="mt-1 text-xs text-white/60">{path.desc}</div>

                      {renderQuickTags(getCommanderPathQuickTags(path.key))}

                      <div className="mt-2 text-[11px] font-semibold text-cyan-200/85">
                        {getCommanderPathStatLine(path.key)}
                      </div>
                      <div className="mt-1 text-[11px] text-white/45">{getCommanderPathHint(path.key)}</div>

                      {active ? (
                        <div className="mt-2">
                          <AvailabilityBadge />
                        </div>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      ) : null}

      {devTab === "modules" ? (
        <div className="grid gap-2.5 xl:grid-cols-2">
        {MODULES.map((module) => {
          const owned = !!state.modules[module.key];
          const moduleAvailable = !owned && canCoverCost(state.resources, module.cost);

          return (
            <div
              key={module.key}
              data-base-target={module.key}
              className={`relative flex h-full flex-col gap-2 rounded-2xl border p-3.5 ${availabilityCardClass(moduleAvailable)} ${
                highlightTarget === module.key
                  ? "border-cyan-300/70 ring-2 ring-cyan-300/35 shadow-[0_0_0_1px_rgba(103,232,249,0.25)]"
                  : ""
              }`}
            >
              <div className="absolute right-2.5 top-2.5 z-10">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setBuildInfo(getDevelopmentInfo(module));
                    setOpenInfoKey(null);
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[13px] font-black text-cyan-200 transition hover:bg-cyan-500/20 hover:text-white"
                  aria-label={`Open info for ${module.name}`}
                  title={`Info about ${module.name}`}
                >
                  i
                </button>
              </div>

              <div className="flex min-h-0 flex-1 flex-col pr-8">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-semibold">{module.name}</div>
                  {moduleAvailable ? <AvailabilityBadge /> : null}
                </div>
                <div className="mt-1 text-xs text-white/60">{module.desc}</div>

                {renderQuickTags(getModuleQuickTags(module.key))}

                <div className="mt-2 text-[11px] text-white/45">
                  {module.key === "servoDrill" && "Use when Ore is slowing upgrades."}
                  {module.key === "vaultCompressor" && "Best once shipping is already active."}
                  {module.key === "arcadeRelay" && "Best for mission / expedition focused play."}
                  {module.key === "minerLink" && "Great before pushing Refinery too hard."}
                </div>
              </div>

              <div className="mt-auto shrink-0 border-t border-white/10 pt-3">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-white/40">
                  Cost
                </div>
                <ResourceCostRow cost={module.cost} resources={state.resources} />
                <button
                  onClick={() => buyModule(module.key)}
                  disabled={owned}
                  className={`mt-3 w-full rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40 ${
                    owned
                      ? "bg-white/10"
                      : canCoverCost(state.resources, module.cost)
                      ? "bg-white/10"
                      : "bg-white/10 opacity-70"
                  }`}
                >
                  {owned ? "Installed" : "Install"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      ) : null}

      {devTab === "research" ? (
      <div className="grid gap-2.5">
        {RESEARCH.map((item) => {
          const done = !!state.research[item.key];
          const locked = item.requires?.some((key) => !state.research[key]);
          const researchAvailable = !done && !locked && canCoverCost(state.resources, item.cost);

          return (
            <div
              key={item.key}
              data-base-target={item.key}
              className={`relative rounded-2xl border p-3.5 ${availabilityCardClass(researchAvailable)} ${
                highlightTarget === item.key
                  ? "border-cyan-300/70 ring-2 ring-cyan-300/35 shadow-[0_0_0_1px_rgba(103,232,249,0.25)]"
                  : ""
              }`}
            >
              <div className="absolute right-2.5 top-2.5 z-10">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setBuildInfo(getDevelopmentInfo(item));
                    setOpenInfoKey(null);
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[13px] font-black text-cyan-200 transition hover:bg-cyan-500/20 hover:text-white"
                  aria-label={`Open info for ${item.name}`}
                  title={`Info about ${item.name}`}
                >
                  i
                </button>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="pr-8">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-semibold">{item.name}</div>
                    {researchAvailable ? <AvailabilityBadge /> : null}
                  </div>

                  <div className="mt-1 text-xs text-white/60">{item.desc}</div>

                {renderQuickTags(getResearchQuickTags(item.key))}

                <div className="mt-2 text-[11px] text-white/45">
                  {item.key === "coolant" && "Early support research for Energy pressure."}
                  {item.key === "routing" && "Good once bank / shipping starts to matter."}
                  {item.key === "fieldOps" && "Bridge research into stronger mid-game support."}
                  {item.key === "minerSync" && "One of the cleanest Ore researches."}
                  {item.key === "arcadeOps" && "Best for active expedition players."}
                  {item.key === "logistics" && "Shipping research, not a raw economy fix."}
                  {item.key === "predictiveMaintenance" && "Top defensive research for heavy builds."}
                  {item.key === "deepScan" && "Best when expeditions are frequent."}
                  {item.key === "tokenDiscipline" && "Advanced tradeoff research, not for every build."}
                </div>

                  <div className="mt-2 text-[11px] font-black uppercase tracking-[0.18em] text-white/40">
                    Cost
                  </div>

                  <ResourceCostRow cost={item.cost} resources={state.resources} />
                </div>

                <button
                  onClick={() => buyResearch(item.key)}
                  disabled={done || locked}
                  className={`shrink-0 rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40 ${
                    done || locked
                      ? "bg-white/10"
                      : canCoverCost(state.resources, item.cost)
                      ? "bg-white/10"
                      : "bg-white/10 opacity-70"
                  }`}
                >
                  {done ? "Done" : locked ? "Locked" : "Research"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      ) : null}
    </div>
  );

  const BUILDING_INFO_COPY = {
    hq: {
      now(level) {
        return level <= 0
          ? "HQ is still at base state. Right now it mainly represents your command core and overall progression gate."
          : `HQ is currently level ${level}. It already improves your global base progression path and supports access to stronger systems.`;
      },
      next(level) {
        const next = level + 1;
        return `HQ level ${next} will push your command core forward, making advanced structures feel more natural to unlock and improving the overall quality of your progression route.`;
      },
      why: "HQ is one of the most important upgrades in the whole game because it controls access to stronger systems. When HQ is weak, the entire base feels slower and more limited.",
      linked: "Global progression · unlocking advanced structures · overall build pacing",
      impact: "A stronger HQ makes the whole base develop more smoothly. It does not just help one resource — it improves how fast your whole command center matures.",
      tips: {
        building: "Trade Hub",
        research: "Routing AI",
        module: "Miner Link",
        actions: [
          "Upgrade HQ when you feel your build path is starting to bottleneck.",
          "Use HQ upgrades to prepare for stronger mid-game structures.",
          "HQ is a progression anchor, not just a cosmetic level.",
        ],
      },
    },

    quarry: {
      now(level) {
        return level <= 0
          ? "Quarry is not built yet, so your base is missing a stable raw Ore engine."
          : `Quarry is currently level ${level}. It is already producing raw Ore and feeding your industrial chain.`;
      },
      next(level, building) {
        const next = level + 1;
        const ore = fmt((building.outputs?.ORE || 0) * next);
        return `Quarry level ${next} will raise your Ore flow to about ${ore}, which directly improves your construction rhythm.`;
      },
      why: "Quarry is your raw material backbone. If Ore production is weak, many other structures and upgrades will start feeling expensive and slow.",
      linked: "ORE production · construction economy · refinery support · long-term industrial growth",
      impact: "More Quarry levels speed up nearly everything that depends on Ore, so this is one of the best tempo upgrades in early and mid game.",
      tips: {
        building: "Trade Hub",
        research: "Miner Sync",
        module: "Servo Drill",
        actions: [
          "Build Quarry early if you want the base to feel active instead of stalled.",
          "Keep Quarry healthy before pushing expensive structures.",
          "Quarry pairs especially well with Refinery and Miner Control.",
        ],
      },
    },

    tradeHub: {
      now(level) {
        return level <= 0
          ? "Trade Hub is not built yet, so your base still lacks a stable Gold loop."
          : `Trade Hub is currently level ${level}. It already creates steady Gold income for construction and upgrades.`;
      },
      next(level, building) {
        const next = level + 1;
        const gold = fmt((building.outputs?.GOLD || 0) * next);
        return `Trade Hub level ${next} will raise Gold flow to about ${gold}, helping your economy stay liquid.`;
      },
      why: "Trade Hub reduces the feeling of being stuck. Gold is needed across the whole base, so stronger Gold flow makes the entire game feel smoother.",
      linked: "GOLD economy · building costs · unlock chain · support for Power Cell and Refinery",
      impact: "This upgrade improves economy stability. It makes future upgrades easier to sustain instead of forcing long waiting periods.",
      tips: {
        building: "Power Cell",
        research: "Routing AI",
        module: "Vault Compressor",
        actions: [
          "Trade Hub is one of the best upgrades when your base feels starved for spending power.",
          "Use it to support expansion into Scrap, Power and Refinery paths.",
          "A healthy Gold loop makes all other decisions easier.",
        ],
      },
    },

    salvage: {
      now(level) {
        return level <= 0
          ? "Salvage Yard is not built yet, so Scrap is still a weak point in your economy."
          : `Salvage Yard is currently level ${level}. It is already recovering Scrap for support systems and advanced builds.`;
      },
      next(level, building) {
        const next = level + 1;
        const scrap = fmt((building.outputs?.SCRAP || 0) * next);
        return `Salvage Yard level ${next} will improve Scrap recovery to about ${scrap}, making support upgrades easier to afford.`;
      },
      why: "Scrap becomes increasingly important as the base matures. Without Salvage, advanced structures and support systems start feeling blocked.",
      linked: "SCRAP recovery · advanced systems · Refinery input · expedition support",
      impact: "More Scrap improves your mid-game stability because many important upgrades depend on it.",
      tips: {
        building: "Refinery",
        research: "Field Ops",
        module: "Miner Link",
        actions: [
          "Upgrade Salvage when advanced structures start asking for more Scrap than you can comfortably supply.",
          "This is a strong bridge between early economy and mid-game systems.",
          "Salvage has especially good synergy with Refinery and Expedition Bay.",
        ],
      },
    },

    refinery: {
      now(level, building) {
        if (level <= 0) {
          return "Refinery is not built yet, so your base still cannot properly convert raw materials into banked MLEO.";
        }
        const ore = fmt((building.convert?.ORE || 0) * level);
        const scrap = fmt((building.convert?.SCRAP || 0) * level);
        const mleo = fmt((building.convert?.MLEO || 0) * level);
        return `Refinery is currently level ${level}. It is consuming about ${ore} ORE and ${scrap} SCRAP to support roughly ${mleo} banked MLEO potential.`;
      },
      next(level, building) {
        const next = level + 1;
        return `Refinery level ${next} increases conversion capacity and energy use. Improves long-term conversion toward banked MLEO.`;
      },
      why: "Refinery is the main bridge from infrastructure into banked MLEO. It should feel valuable, but still controlled — exactly what this game loop needs. When Stability drops into warning/critical range, Refinery becomes a pressure point: prioritize maintenance and Repair Bay before scaling harder.",
      linked: "ORE + SCRAP conversion · banked MLEO · shipping strategy · vault support",
      impact: "A stronger Refinery increases your ability to support the shared vault, but only if the rest of your economy can feed it. Low Stability makes Refinery scaling riskier and increases the need for proactive maintenance.",
      tips: {
        building: "Logistics Center",
        research: "Token Discipline",
        module: "Vault Compressor",
        actions: [
          "Only push Refinery hard if Ore, Scrap and energy support are already healthy.",
          "If Stability is weak, delay extra Refinery levels until you stabilize the base first.",
          "Refinery is strongest inside a balanced economy, not by itself.",
          "Pair it with Logistics if shipping becomes an important part of your loop.",
        ],
      },
    },

    powerCell: {
      now(level, building) {
        if (level <= 0) {
          return "Power Cell is not built yet, so your base is relying only on the default Energy cap and regeneration.";
        }
        const cap = fmt((building.power?.cap || 0) * level);
        const regen = fmt((building.power?.regen || 0) * level);
        return `Power Cell is currently level ${level}. It is adding about +${cap} Energy cap and +${regen} Energy regeneration.`;
      },
      next(level, building) {
        const next = level + 1;
        const cap = fmt((building.power?.cap || 0) * next);
        const regen = fmt((building.power?.regen || 0) * next);
        return `Power Cell level ${next} will raise this support to about +${cap} Energy cap and +${regen} Energy regeneration.`;
      },
      why: "Power Cell is one of the best comfort upgrades in the game. It reduces waiting, reduces pressure, and helps the whole base feel more alive.",
      linked: "ENERGY cap · ENERGY regen · action uptime · support for Quarry, Refinery and expeditions",
      impact: "Better energy support means less downtime and smoother progression. It is one of the cleanest upgrades for improving overall gameplay feel.",
      tips: {
        building: "Repair Bay",
        research: "Coolant Loops",
        module: "Miner Link",
        actions: [
          "Upgrade Power Cell when energy starts feeling like the main bottleneck.",
          "This is especially valuable if you are expanding production and expeditions together.",
          "Power Cell improves both efficiency and player comfort.",
        ],
      },
    },

    minerControl: {
      now(level, building) {
        if (level <= 0) {
          return "Miner Control is not built yet, so synergy with Miners is still limited.";
        }
        const data = fmt((building.outputs?.DATA || 0) * level);
        return `Miner Control is currently level ${level}. It is already improving Miners synergy and adding about ${data} DATA support.`;
      },
      next(level, building) {
        const next = level + 1;
        const data = fmt((building.outputs?.DATA || 0) * next);
        return `Miner Control level ${next} will push Miners synergy further and improve DATA support to about ${data}.`;
      },
      why: "This building is important because BASE should feel connected to Miners, not isolated from it. Miner Control makes that ecosystem link stronger.",
      linked: "Miners synergy · DATA support · ore conversion quality · ecosystem cohesion",
      impact: "The upgrade strengthens cross-system progression and makes BASE feel more integrated into the wider MLEO loop.",
      tips: {
        building: "Research Lab",
        research: "Miner Sync",
        module: "Servo Drill",
        actions: [
          "Upgrade Miner Control if you want BASE and Miners to feel more connected.",
          "This is a strategic upgrade, not just a raw output upgrade.",
          "Very strong when combined with Quarry and Research Lab.",
        ],
      },
    },

    arcadeHub: {
      now(level, building) {
        if (level <= 0) {
          return "Arcade Hub is not built yet, so the connection between activity and BASE progression is still weak.";
        }
        const data = fmt((building.outputs?.DATA || 0) * level);
        return `Arcade Hub is currently level ${level}. It is already helping convert activity into BASE progression and adds about ${data} DATA support.`;
      },
      next(level, building) {
        const next = level + 1;
        const data = fmt((building.outputs?.DATA || 0) * next);
        return `Arcade Hub level ${next} will improve that activity link and raise DATA support to about ${data}.`;
      },
      why: "Arcade Hub is valuable because it helps the whole MLEO ecosystem feel unified. It gives BASE a meaningful relationship with gameplay activity.",
      linked: "Arcade synergy · mission rewards · DATA flow · ecosystem progression",
      impact: "This makes BASE progression feel more connected to the rest of the project instead of being a separate screen with isolated upgrades.",
      tips: {
        building: "Expedition Bay",
        research: "Arcade Ops",
        module: "Arcade Relay",
        actions: [
          "Upgrade Arcade Hub when you want stronger ecosystem identity.",
          "Useful if missions and activity-based progression are becoming part of your main loop.",
          "Arcade Hub works especially well with DATA-focused growth.",
        ],
      },
    },

    expeditionBay: {
      now(level) {
        return level <= 0
          ? "Expedition Bay is not built yet, so expedition progression is still limited."
          : `Expedition Bay is currently level ${level}. It is already supporting stronger expeditions and better loot potential.`;
      },
      next(level) {
        const next = level + 1;
        return `Expedition Bay level ${next} will further improve expedition strength and reward quality, helping side progression feel more meaningful.`;
      },
      why: "Expedition Bay matters because expeditions are one of the best ways to keep the game loop interesting beyond passive production alone.",
      linked: "Expeditions · loot quality · side progression · resource recovery",
      impact: "This upgrade improves your side economy and keeps progression moving between larger infrastructure milestones.",
      tips: {
        building: "Repair Bay",
        research: "Deep Scan",
        module: "Arcade Relay",
        actions: [
          "Upgrade Expedition Bay when expeditions are part of your active routine.",
          "Strong choice if you want more varied progression instead of only passive growth.",
          "Pairs very well with DATA and Scrap-focused play.",
        ],
      },
    },

    logisticsCenter: {
      now(level, building) {
        if (level <= 0) {
          return "Logistics Center is not built yet, so shipment quality and export flow are still underdeveloped.";
        }
        const data = fmt((building.outputs?.DATA || 0) * level);
        return `Logistics Center is currently level ${level}. It is already improving shipment handling, export flow and adds about ${data} DATA support.`;
      },
      next(level, building) {
        const next = level + 1;
        const data = fmt((building.outputs?.DATA || 0) * next);
        return `Logistics Center level ${next} will improve shipment discipline further and raise DATA support to about ${data}.`;
      },
      why: "If BASE is going to support the shared vault in a controlled way, Logistics Center is a key structure. It makes shipping feel smarter, not just bigger. When Stability drops, logistics/export systems become more fragile and need proactive maintenance support.",
      linked: "Shipping quality · export handling · shared vault support · efficiency discipline",
      impact: "This upgrade improves late-game control and makes the path from banked MLEO to shipped value more stable and strategic. Low Stability increases pressure during export lanes, so keep Repair Bay and maintenance in sync.",
      tips: {
        building: "Refinery",
        research: "Logistics",
        module: "Vault Compressor",
        actions: [
          "Upgrade Logistics Center when shipping becomes a meaningful part of your economy.",
          "If Stability is low, focus on Maintenance/Repair Bay before pushing export lanes further.",
          "This is a control upgrade, not just a production upgrade.",
          "Best used alongside Refinery and Blueprint progression.",
        ],
      },
    },

    researchLab: {
      now(level, building) {
        if (level <= 0) {
          return "Research Lab is not built yet, so your DATA generation and advanced path support are still limited.";
        }
        const data = fmt((building.outputs?.DATA || 0) * level);
        return `Research Lab is currently level ${level}. It is already generating about ${data} DATA and supporting advanced progression paths.`;
      },
      next(level, building) {
        const next = level + 1;
        const data = fmt((building.outputs?.DATA || 0) * next);
        return `Research Lab level ${next} will improve DATA generation to about ${data} and strengthen your long-term optimization path.`;
      },
      why: "Research Lab is important because DATA gives depth to the economy. It helps the game scale through smarter progression instead of only more emissions. If Stability is weak, the advanced DATA lane can still work, but your base feels more fragile—prioritize maintenance and keep Repair Bay supported.",
      linked: "DATA generation · advanced research · long-term optimization · strategy depth",
      impact: "A stronger Research Lab improves your ability to unlock advanced systems and keeps progression feeling intelligent instead of flat. Low Stability makes advanced expansion feel riskier, so maintain rhythm instead of rushing levels.",
      tips: {
        building: "Miner Control",
        research: "Deep Scan",
        module: "Arcade Relay",
        actions: [
          "Upgrade Research Lab when you want stronger long-term progression tools.",
          "If Stability is low, slow down Research Lab scaling and do maintenance first.",
          "Very useful if advanced research paths are becoming your next milestone.",
          "One of the best structures for strategic scaling.",
        ],
      },
    },

    repairBay: {
      now(level) {
        return level <= 0
          ? "Repair Bay is not built yet, so your base has less support against maintenance pressure and stability loss."
          : `Repair Bay is currently level ${level}. It is already helping the base stay healthier and reducing maintenance pressure.`;
      },
      next(level) {
        const next = level + 1;
        return `Repair Bay level ${next} will strengthen stability support even more, making recovery easier and pressure safer to manage.`;
      },
      why: "Repair Bay is one of the best defensive upgrades in the game. It helps protect long-term efficiency instead of only chasing more output.",
      linked: "Stability · maintenance pressure · system health · safe scaling",
      impact: "A stronger Repair Bay keeps the base performing well over time and reduces the chance that instability becomes your real bottleneck.",
      tips: {
        building: "Power Cell",
        research: "Predictive Maintenance",
        module: "Miner Link",
        actions: [
          "Upgrade Repair Bay when your base starts feeling fragile under growth.",
          "Great choice if you are pushing multiple systems at once.",
          "Helps protect long-term efficiency and player comfort.",
        ],
      },
    },
  };

  const DEVELOPMENT_INFO_COPY = {
    servoDrill: {
      title: "Servo Drill",
      focus: "Direct Ore multiplier",
      text:
        "Servo Drill is a clean production module for your Ore lane.\n\n" +
        "What it helps:\n" +
        "• Makes Quarry output stronger.\n" +
        "• Helps early and mid-game construction feel smoother.\n" +
        "• Good when Ore is your first real bottleneck.\n\n" +
        "Important:\n" +
        "It boosts Ore output, but it does not solve Energy pressure by itself.",
      tips: {
        building: "Quarry",
        supportBuildings: ["Power Cell", "Miner Control"],
        research: "Miner Sync",
        supportResearch: ["Field Ops"],
        module: "Servo Drill",
        operation: "",
        watch: "If Quarry is starved by Energy, this module will not fix the root problem.",
        actions: [
          "Take Servo Drill when Ore is slowing your upgrades.",
          "Pair it with Miner Sync for a stronger Ore lane.",
          "Keep Power Cell healthy so the Ore lane can actually run.",
        ],
      },
      nextStep: {
        label: "Open Quarry",
        tab: "build",
        target: "quarry",
        why: "Servo Drill is strongest when Quarry is already part of your main economy.",
      },
    },

    vaultCompressor: {
      title: "Vault Compressor",
      focus: "Better bank and ship efficiency",
      text:
        "Vault Compressor improves the quality of your MLEO export loop.\n\n" +
        "What it helps:\n" +
        "• Better bank efficiency.\n" +
        "• Better ship yield.\n" +
        "• Stronger value from a mature Refinery + shipping setup.\n\n" +
        "Important:\n" +
        "It is most valuable after banked MLEO and shipping are already active.",
      tips: {
        building: "Refinery",
        supportBuildings: ["Logistics Center"],
        research: "Logistics",
        supportResearch: ["Routing AI"],
        module: "Vault Compressor",
        operation: "Ship to Shared Vault",
        watch: "This module is weak if your base is not producing enough banked MLEO yet.",
        actions: [
          "Install it once shipping becomes part of your normal loop.",
          "Pair it with Logistics Center for better export value.",
          "Do not prioritize it over fixing Ore, Scrap or Energy problems.",
        ],
      },
      nextStep: {
        label: "Open Shipping",
        tab: "operations",
        target: "shipping",
        why: "Vault Compressor becomes meaningful when you actively ship banked MLEO.",
      },
    },

    arcadeRelay: {
      title: "Arcade Relay",
      focus: "Mission XP and DATA support",
      text:
        "Arcade Relay supports the softer progression side of BASE.\n\n" +
        "What it helps:\n" +
        "• Better mission XP.\n" +
        "• Better DATA gain.\n" +
        "• Strong support for commander progression rhythm.\n\n" +
        "Important:\n" +
        "This is a progression helper, not a raw production engine.",
      tips: {
        building: "Arcade Hub",
        supportBuildings: ["Research Lab", "Expedition Bay"],
        research: "Arcade Ops",
        supportResearch: ["Deep Scan"],
        module: "Arcade Relay",
        operation: "Daily Missions / Field Expedition",
        watch: "It feels best in active play, not in a passive-only build.",
        actions: [
          "Take Arcade Relay when you are leaning into missions and DATA.",
          "Pair it with Arcade Hub for smoother commander growth.",
          "Use it when you want a lighter, more active-feeling progression loop.",
        ],
      },
      nextStep: {
        label: "Open Arcade Hub",
        tab: "build",
        target: "arcadeHub",
        why: "Arcade Relay fits best when Arcade Hub is already part of your build.",
      },
    },

    minerLink: {
      title: "Miner Link",
      focus: "Ore support and refinery stress relief",
      text:
        "Miner Link is a bridge module between raw industry and safer processing.\n\n" +
        "What it helps:\n" +
        "• More Ore output.\n" +
        "• Better Refinery-related stability handling.\n" +
        "• Stronger industrial flow in mid-game.\n\n" +
        "Important:\n" +
        "This is one of the best support modules if you want a production-heavy base without making Stability feel too fragile.",
      tips: {
        building: "Refinery",
        supportBuildings: ["Quarry", "Repair Bay"],
        research: "Predictive Maintenance",
        supportResearch: ["Miner Sync"],
        module: "Miner Link",
        operation: "Maintenance Cycle",
        watch: "It helps refinery stress, but it does not replace Repair Bay and good maintenance timing.",
        actions: [
          "Take Miner Link before pushing Refinery too hard.",
          "Pair it with Repair Bay for a safer industrial mid-game.",
          "Great choice when Ore and banked MLEO are both important to your plan.",
        ],
      },
      nextStep: {
        label: "Open Refinery",
        tab: "build",
        target: "refinery",
        why: "Miner Link becomes most valuable when Refinery is central to your build.",
      },
    },

    coolant: {
      title: "Coolant Loops",
      focus: "Early Energy support",
      text:
        "Coolant Loops is one of the cleanest early-game research upgrades.\n\n" +
        "What it helps:\n" +
        "• Adds Energy regen.\n" +
        "• Adds Energy cap.\n" +
        "• Makes early expansion less punishing.\n\n" +
        "Important:\n" +
        "This is support research, not a replacement for Power Cell.",
      tips: {
        building: "Power Cell",
        supportBuildings: ["Repair Bay"],
        research: "Coolant Loops",
        supportResearch: [],
        module: "",
        operation: "Emergency Refill",
        watch: "If you keep choking on Energy, Power Cell still matters more.",
        actions: [
          "Research this early if Energy feels too tight.",
          "Pair it with Power Cell for real stability.",
          "Great support before scaling heavy passive buildings.",
        ],
      },
      nextStep: {
        label: "Open Power Cell",
        tab: "build",
        target: "powerCell",
        why: "Coolant Loops is best when paired with your main Energy structure.",
      },
    },

    routing: {
      title: "Routing AI",
      focus: "Bank efficiency support",
      text:
        "Routing AI improves the quality of your bank flow.\n\n" +
        "What it helps:\n" +
        "• Better bank efficiency.\n" +
        "• Smoother export foundation.\n" +
        "• Better long-term value from shipping systems.\n\n" +
        "Important:\n" +
        "Routing AI is part of a shipping chain, not a standalone economy fix.",
      tips: {
        building: "Logistics Center",
        supportBuildings: ["Refinery"],
        research: "Routing AI",
        supportResearch: ["Logistics"],
        module: "Vault Compressor",
        operation: "Ship to Shared Vault",
        watch: "Weak Refinery output means this research has little to optimize.",
        actions: [
          "Take Routing AI when shipping starts to matter.",
          "Use it as setup for stronger logistics-focused progression.",
          "Good value once banked MLEO becomes steady.",
        ],
      },
      nextStep: {
        label: "Open Logistics Center",
        tab: "build",
        target: "logisticsCenter",
        why: "Routing AI supports the export systems around Logistics Center.",
      },
    },

    fieldOps: {
      title: "Field Ops",
      focus: "Role support and command scaling",
      text:
        "Field Ops strengthens the effect of crew identity and command planning.\n\n" +
        "What it helps:\n" +
        "• Improves crew-related support.\n" +
        "• Unlocks stronger advanced research lanes.\n" +
        "• Helps transition into a more structured mid-game.\n\n" +
        "Important:\n" +
        "Field Ops is a bridge research. It is more about enabling the next layer than giving one huge raw stat.",
      tips: {
        building: "HQ",
        supportBuildings: ["Expedition Bay", "Research Lab"],
        research: "Field Ops",
        supportResearch: ["Arcade Ops", "Predictive Maintenance"],
        module: "",
        operation: "",
        watch: "It shines more once your base already has a few active systems.",
        actions: [
          "Take it before advanced support research.",
          "Useful when your build is moving from early setup into real specialization.",
          "Pairs well with active mission and expedition play.",
        ],
      },
      nextStep: {
        label: "Open Development",
        tab: "development",
        target: "crew",
        why: "Field Ops supports the broader command identity layer.",
      },
    },

    minerSync: {
      title: "Miner Sync",
      focus: "Ore scaling and mission utility",
      text:
        "Miner Sync is one of the strongest direct Ore researches.\n\n" +
        "What it helps:\n" +
        "• More Ore output.\n" +
        "• Better industrial scaling.\n" +
        "• Extra daily mission support.\n\n" +
        "Important:\n" +
        "Excellent when Ore is the real bottleneck and you want both economy and progression flow.",
      tips: {
        building: "Quarry",
        supportBuildings: ["Power Cell", "Miner Control"],
        research: "Miner Sync",
        supportResearch: ["Field Ops"],
        module: "Servo Drill",
        operation: "",
        watch: "It boosts Ore, but does not solve weak Scrap or Energy by itself.",
        actions: [
          "Take Miner Sync when Quarry is already central to your base.",
          "Pair with Servo Drill for a much stronger Ore lane.",
          "Very useful if upgrades keep feeling Ore-starved.",
        ],
      },
      nextStep: {
        label: "Open Quarry",
        tab: "build",
        target: "quarry",
        why: "Miner Sync is built to strengthen your main Ore source.",
      },
    },

    arcadeOps: {
      title: "Arcade Ops",
      focus: "XP and expedition reward support",
      text:
        "Arcade Ops boosts active progression and expedition value.\n\n" +
        "What it helps:\n" +
        "• More commander XP.\n" +
        "• Better expedition rewards.\n" +
        "• Stronger active-play progression rhythm.\n\n" +
        "Important:\n" +
        "This research feels best when missions and expeditions are already a real part of your loop.",
      tips: {
        building: "Expedition Bay",
        supportBuildings: ["Arcade Hub"],
        research: "Arcade Ops",
        supportResearch: ["Deep Scan"],
        module: "Arcade Relay",
        operation: "Field Expedition",
        watch: "Less valuable in a passive-only style.",
        actions: [
          "Take Arcade Ops when expeditions are part of your core play.",
          "Pair it with Arcade Relay for a smoother active progression lane.",
          "Good research for players who like a livelier command rhythm.",
        ],
      },
      nextStep: {
        label: "Open Expedition Bay",
        tab: "build",
        target: "expeditionBay",
        why: "Arcade Ops works best when expeditions are already relevant.",
      },
    },

    logistics: {
      title: "Logistics",
      focus: "Shipping efficiency and export flow",
      text:
        "Logistics is one of the main export researches.\n\n" +
        "What it helps:\n" +
        "• Better ship efficiency.\n" +
        "• Smoother export rhythm.\n" +
        "• Better value from mature banked MLEO flow.\n\n" +
        "Important:\n" +
        "It is strongest after Refinery and shipping are already alive.",
      tips: {
        building: "Logistics Center",
        supportBuildings: ["Refinery"],
        research: "Logistics",
        supportResearch: ["Routing AI"],
        module: "Vault Compressor",
        operation: "Ship to Shared Vault",
        watch: "Shipping research feels weak when there is little banked MLEO to move.",
        actions: [
          "Take it once shipping becomes daily behavior.",
          "Pair it with Routing AI and Vault Compressor for a true export lane.",
          "Best when you already have something meaningful to ship.",
        ],
      },
      nextStep: {
        label: "Open Shipping",
        tab: "operations",
        target: "shipping",
        why: "This research directly supports the shipping loop.",
      },
    },

    predictiveMaintenance: {
      title: "Predictive Maintenance",
      focus: "Slower stability pressure growth",
      text:
        "Predictive Maintenance is a key defensive research for heavier bases.\n\n" +
        "What it helps:\n" +
        "• Slows maintenance pressure.\n" +
        "• Makes Repair Bay work better.\n" +
        "• Makes advanced production builds feel safer.\n\n" +
        "Important:\n" +
        "This is one of the best researches when you want Refinery and advanced systems without constant stability pain.",
      tips: {
        building: "Repair Bay",
        supportBuildings: ["Power Cell", "Refinery"],
        research: "Predictive Maintenance",
        supportResearch: ["Field Ops"],
        module: "Miner Link",
        operation: "Maintenance Cycle",
        watch: "It reduces pressure, but you still need to do maintenance when the base is stressed.",
        actions: [
          "Take this before pushing a heavy mid-game setup too far.",
          "Pair with Repair Bay for much better stability control.",
          "Especially useful if Refinery is becoming important.",
        ],
      },
      nextStep: {
        label: "Open Repair Bay",
        tab: "build",
        target: "repairBay",
        why: "Predictive Maintenance is strongest when Repair Bay is active in your build.",
      },
    },

    deepScan: {
      title: "Deep Scan",
      focus: "Expedition DATA and rare-find support",
      text:
        "Deep Scan makes expeditions more rewarding on the strategic side.\n\n" +
        "What it helps:\n" +
        "• More DATA from expeditions.\n" +
        "• Better rare findings.\n" +
        "• More value from active field play.\n\n" +
        "Important:\n" +
        "This is best for players who use expeditions for more than just occasional utility.",
      tips: {
        building: "Expedition Bay",
        supportBuildings: ["Research Lab", "Arcade Hub"],
        research: "Deep Scan",
        supportResearch: ["Arcade Ops"],
        module: "Arcade Relay",
        operation: "Field Expedition",
        watch: "If expeditions are rare in your playstyle, this research will feel niche.",
        actions: [
          "Take Deep Scan when expeditions are a real part of progression.",
          "Great for DATA-focused active play.",
          "Pairs well with Arcade Ops for a stronger field loop.",
        ],
      },
      nextStep: {
        label: "Open Expedition Bay",
        tab: "build",
        target: "expeditionBay",
        why: "Deep Scan is tied directly to expedition value.",
      },
    },

    tokenDiscipline: {
      title: "Token Discipline",
      focus: "Trade raw bank speed for higher quality support",
      text:
        "Token Discipline is an advanced balancing research.\n\n" +
        "What it helps:\n" +
        "• Higher DATA output.\n" +
        "• Better ship quality.\n" +
        "• A more controlled advanced economy style.\n\n" +
        "Tradeoff:\n" +
        "It reduces raw banked MLEO output while improving the quality of the broader strategic loop.",
      tips: {
        building: "Research Lab",
        supportBuildings: ["Logistics Center", "Refinery"],
        research: "Token Discipline",
        supportResearch: ["Logistics", "Deep Scan"],
        module: "Vault Compressor",
        operation: "Ship to Shared Vault",
        watch: "Do not take it blindly if you only care about raw banked MLEO speed.",
        actions: [
          "Choose this when you want a more advanced, balanced economy style.",
          "Strong for DATA + shipping synergy builds.",
          "Less attractive if your goal is only raw Refinery throughput.",
        ],
      },
      nextStep: {
        label: "Open Research Lab",
        tab: "build",
        target: "researchLab",
        why: "Token Discipline fits advanced builds that already value DATA and strategic flow.",
      },
    },
  };

  function getDevelopmentInfo(item) {
    return DEVELOPMENT_INFO_COPY[item.key] || {
      title: item.name,
      focus: "Development",
      text:
        `${item.name} is part of your BASE development layer.\n\n` +
        `Description:\n${item.desc}`,
      tips: {
        building: "",
        research: "",
        module: "",
        actions: [
          "Use this upgrade when it fits your current bottleneck.",
          "Pair it with related structures for better value.",
          "Use the recommended next step to jump to the right panel.",
        ],
      },
    };
  }

  const OPERATIONS_INFO_COPY = {
    shipping: {
      title: "Ship to Shared Vault",
      focus: "Move banked MLEO out of BASE",
      text:
        "Shipping transfers banked MLEO from BASE into the Shared Vault.\n\n" +
        "What improves it:\n" +
        "• More banked MLEO from Refinery.\n" +
        "• Better ship quality from Logistics Center.\n" +
        "• Better long-term export scaling from Blueprint and Logistics research.\n\n" +
        "Important:\n" +
        "Shipping is the final conversion step. No shipping means no real Shared Vault growth.",
      tips: {
        building: "Logistics Center",
        supportBuildings: ["Refinery"],
        research: "Logistics",
        supportResearch: ["Routing AI"],
        module: "Vault Compressor",
        operation: "Ship to Shared Vault",
        watch: "Banked MLEO sitting inside BASE is not yet real Shared Vault value.",
        actions: [
          "Make sure Refinery is feeding the lane first.",
          "Improve Logistics when shipping becomes part of your daily loop.",
          "Avoid wasting good shipping timing near cap pressure.",
        ],
      },
      nextStep: {
        label: "Open Refinery",
        tab: "build",
        target: "refinery",
        why: "Shipping matters only when Refinery is already producing banked MLEO.",
      },
    },

    expedition: {
      title: "Field Expedition",
      focus: "Spend Energy and DATA for mixed rewards",
      text:
        "Field Expedition is a controlled action that trades Energy for resource rewards.\n\n" +
        "What it gives:\n" +
        "• Ore, Gold, Scrap and DATA.\n" +
        "• A small chance for banked MLEO.\n" +
        "• Good mission and progression support.\n\n" +
        "Important:\n" +
        "Expeditions are best when your base can spare the Energy and you need mixed utility, not just one pure resource.",
      tips: {
        building: "Expedition Bay",
        supportBuildings: ["Power Cell"],
        research: "Arcade Ops",
        supportResearch: ["Deep Scan"],
        module: "Arcade Relay",
        operation: "Field Expedition",
        watch: "Do not burn Energy on expeditions when your production loop is already starving.",
        actions: [
          "Run expeditions for Scrap and DATA support.",
          "Use Expedition Bay when this lane becomes central to your strategy.",
          "Treat expeditions as flexible utility, not pure MLEO farming.",
        ],
      },
      nextStep: {
        label: "Open Expedition Bay",
        tab: "build",
        target: "expeditionBay",
        why: "Expedition Bay improves this action and makes it more rewarding.",
      },
    },

    refill: {
      title: "Emergency Refill",
      focus: "Restore Energy now, not permanently",
      text:
        "Emergency Refill restores Energy to your current cap.\n\n" +
        "What it does:\n" +
        "• Instantly fills ENERGY back to your current cap.\n" +
        "• Costs Shared Vault MLEO.\n" +
        "• Also consumes 5 DATA.\n" +
        "• Does not improve Energy regeneration.\n\n" +
        "Important:\n" +
        "Refill is a recovery button. It is not your long-term Energy engine.",
      tips: {
        building: "Power Cell",
        supportBuildings: ["Repair Bay"],
        research: "Coolant Loops",
        supportResearch: ["Predictive Maintenance"],
        module: "",
        operation: "Emergency Refill",
        watch: "If you need refill all the time, the real problem is usually Power Cell timing or heavy building pressure.",
        actions: [
          "Use Refill to recover tempo, not as your default Energy plan.",
          "Upgrade Power Cell to reduce refill dependence.",
          "Pause heavy buildings first when Energy keeps crashing.",
        ],
      },
      nextStep: {
        label: "Open Power Cell",
        tab: "build",
        target: "powerCell",
        why: "Power Cell is the real long-term fix when refill becomes too common.",
      },
    },

    maintenance: {
      title: "Maintenance Cycle",
      focus: "Direct Stability recovery and pressure control",
      text:
        "Maintenance keeps your BASE stable and prevents performance problems.\n\n" +
        "What it does:\n" +
        "• Maintenance restores stability directly.\n" +
        "• Repair Bay improves long-term stability support.\n" +
        "• Predictive Maintenance slows pressure growth.\n" +
        "• Miner Link helps when refinery load is part of the problem.\n\n" +
        "Important:\n" +
        "Maintenance works best before the base becomes unstable, not after everything is already under pressure.",
      tips: {
        building: "Repair Bay",
        supportBuildings: ["Power Cell"],
        research: "Predictive Maintenance",
        supportResearch: ["Field Ops"],
        module: "Miner Link",
        operation: "Maintenance Cycle",
        watch: "Heavy Refinery scaling with weak stability support is a common trap.",
        actions: [
          "Do maintenance before Stability drops too low.",
          "Use Repair Bay if you plan a heavier advanced base.",
          "Treat maintenance as prevention, not only emergency repair.",
        ],
      },
      nextStep: {
        label: "Open Repair Bay",
        tab: "build",
        target: "repairBay",
        why: "Repair Bay is the structure that best supports long-term Stability control.",
      },
    },
  };

  const MISSION_INFO_COPY = {
    upgrade_building: {
      title: "Mission: Upgrade 1 building",
      focus: "Simple progression teaching mission",
      text:
        "This mission rewards you for keeping the base moving.\n\n" +
        "Why it matters:\n" +
        "• Encourages active growth.\n" +
        "• Helps new players avoid sitting idle too long.\n" +
        "• Good early mission because it teaches the upgrade loop naturally.",
      tips: {
        building: "Any useful current bottleneck building",
        supportBuildings: ["HQ", "Power Cell", "Quarry"],
        research: "",
        supportResearch: [],
        module: "",
        operation: "",
        watch: "Do not force a bad upgrade only to complete the mission.",
        actions: [
          "Use this mission to justify a useful upgrade you already need.",
          "Power Cell and Quarry are often safe early picks.",
          "Treat the mission as guidance, not as a trap.",
        ],
      },
      nextStep: {
        label: "Open Structures",
        tab: "build",
        target: "hq",
        why: "This mission is completed through your normal building upgrades.",
      },
    },

    run_expedition: {
      title: "Mission: Complete 1 expedition",
      focus: "Reward active field play",
      text:
        "This mission pushes the player into expeditions in a soft, understandable way.\n\n" +
        "Why it matters:\n" +
        "• Gives a reason to use the field system.\n" +
        "• Supports mixed-resource progression.\n" +
        "• Feels more active and fun than pure passive waiting.",
      tips: {
        building: "Expedition Bay",
        supportBuildings: ["Power Cell"],
        research: "Arcade Ops",
        supportResearch: ["Deep Scan"],
        module: "Arcade Relay",
        operation: "Field Expedition",
        watch: "Do not force expeditions when Energy is already choking the base.",
        actions: [
          "Use this mission when expedition costs are comfortable.",
          "Good mission for Scrap and DATA support.",
          "Better once Expedition Bay is online.",
        ],
      },
      nextStep: {
        label: "Open Expedition",
        tab: "operations",
        target: "expedition",
        why: "This mission is completed directly through expedition play.",
      },
    },

    generate_data: {
      title: "Mission: Generate 12 DATA",
      focus: "Teach the strategic value of DATA",
      text:
        "This mission highlights DATA as a real progression lane, not just a side stat.\n\n" +
        "Why it matters:\n" +
        "• Encourages Research Lab and support DATA systems.\n" +
        "• Teaches that advanced progress depends on DATA pace.\n" +
        "• Helps players notice weak DATA economy earlier.",
      tips: {
        building: "Research Lab",
        supportBuildings: ["Miner Control", "Arcade Hub"],
        research: "Deep Scan",
        supportResearch: ["Arcade Ops"],
        module: "Arcade Relay",
        operation: "Field Expedition",
        watch: "Weak DATA usually slows the whole advanced game quietly.",
        actions: [
          "Use Research Lab as the main answer.",
          "Support with Miner Control and Arcade Hub.",
          "Expeditions can help when you need a burst.",
        ],
      },
      nextStep: {
        label: "Open Research Lab",
        tab: "build",
        target: "researchLab",
        why: "Research Lab is the main long-term DATA structure.",
      },
    },

    perform_maintenance: {
      title: "Mission: Perform 1 maintenance",
      focus: "Teach preventive stability play",
      text:
        "This mission teaches that maintenance is part of normal healthy play, not only emergency repair.\n\n" +
        "Why it matters:\n" +
        "• Encourages players to care about Stability earlier.\n" +
        "• Makes the defensive side of the game feel rewarded.\n" +
        "• Prevents players from learning the system only through failure.",
      tips: {
        building: "Repair Bay",
        supportBuildings: ["Power Cell"],
        research: "Predictive Maintenance",
        supportResearch: ["Field Ops"],
        module: "Miner Link",
        operation: "Maintenance Cycle",
        watch: "Waiting too long usually makes maintenance feel reactive instead of smart.",
        actions: [
          "Do maintenance before the base feels damaged.",
          "Great mission for teaching stability habits.",
          "Especially useful when Refinery is becoming active.",
        ],
      },
      nextStep: {
        label: "Open Maintenance",
        tab: "operations",
        target: "maintenance",
        why: "This mission is completed directly through the maintenance action.",
      },
    },

    double_expedition: {
      title: "Mission: Launch 2 expeditions",
      focus: "Push deeper into the active field loop",
      text:
        "This mission is a stronger version of the expedition rhythm.\n\n" +
        "Why it matters:\n" +
        "• Rewards more active command play.\n" +
        "• Makes expedition investment feel more useful.\n" +
        "• Supports Scrap and DATA recovery routes.",
      tips: {
        building: "Expedition Bay",
        supportBuildings: ["Power Cell", "Arcade Hub"],
        research: "Arcade Ops",
        supportResearch: ["Deep Scan"],
        module: "Arcade Relay",
        operation: "Field Expedition",
        watch: "Only worth forcing if your Energy and DATA can comfortably support it.",
        actions: [
          "Best when expeditions are already part of your play loop.",
          "Avoid pushing this mission if Energy is unstable.",
          "Good mission for active players, less important for passive styles.",
        ],
      },
      nextStep: {
        label: "Open Expedition",
        tab: "operations",
        target: "expedition",
        why: "This mission is fully tied to expedition activity.",
      },
    },

    ship_mleo: {
      title: "Mission: Ship 60 MLEO",
      focus: "Teach the export loop clearly",
      text:
        "This mission teaches that BASE progress becomes real vault progress only after shipping.\n\n" +
        "Why it matters:\n" +
        "• Connects Refinery to Shared Vault clearly.\n" +
        "• Encourages real use of the export loop.\n" +
        "• Helps players understand banked vs shipped value.",
      tips: {
        building: "Refinery",
        supportBuildings: ["Logistics Center", "Quarry", "Salvage Yard"],
        research: "Logistics",
        supportResearch: ["Routing AI"],
        module: "Vault Compressor",
        operation: "Ship to Shared Vault",
        watch: "Do not focus on shipping if banked MLEO generation is still weak.",
        actions: [
          "Build enough banked MLEO first.",
          "Use Logistics support when shipping becomes regular.",
          "Excellent mission for teaching the full MLEO loop.",
        ],
      },
      nextStep: {
        label: "Open Shipping",
        tab: "operations",
        target: "shipping",
        why: "This mission is completed through the shipping action.",
      },
    },

    spend_vault: {
      title: "Mission: Spend 50 MLEO from vault",
      focus: "Teach reinvestment instead of only hoarding",
      text:
        "This mission teaches that Shared Vault is also meant to be reinvested, not only stored.\n\n" +
        "Why it matters:\n" +
        "• Encourages Blueprint and other vault actions.\n" +
        "• Makes the vault feel alive instead of static.\n" +
        "• Helps players understand long-term reinvestment decisions.",
      tips: {
        building: "Logistics Center",
        supportBuildings: ["Refinery"],
        research: "Logistics",
        supportResearch: ["Routing AI"],
        module: "Vault Compressor",
        operation: "Blueprint / Refill / Overclock",
        watch: "Spending vault value blindly can hurt if the base is not ready to use the benefit well.",
        actions: [
          "Blueprint is the cleanest long-term spend.",
          "Refill is emergency recovery, not ideal routine spending.",
          "This mission is about smart reinvestment, not random spending.",
        ],
      },
      nextStep: {
        label: "Open Blueprint",
        tab: "systems",
        target: "blueprint",
        why: "Blueprint is the most natural long-term Shared Vault spend path.",
      },
    },
  };

  function getOperationsInfo(key) {
    return OPERATIONS_INFO_COPY[key] || {
      title: "Operations",
      focus: "Operations action",
      text: "This action is part of your BASE operations loop.",
      tips: { building: "", research: "", module: "", actions: [] },
    };
  }

  function getMissionInfo(mission) {
    return MISSION_INFO_COPY[mission.key] || {
      title: mission.name,
      focus: "Daily Mission",
      text: `This mission tracks your daily BASE progress.\n\nTarget: ${mission.target}`,
      tips: { building: "", research: "", module: "", actions: [] },
    };
  }

  const CREW_INFO_COPY = {
    engineer: {
      title: "Engineer",
      focus: "Stability + maintenance support",
      text:
        "Engineer is the safest crew role for a base that is starting to feel heavy.\n\n" +
        "What it helps:\n" +
        "• Stronger maintenance relief.\n" +
        "• Better support for Repair Bay style play.\n" +
        "• Safer scaling when Refinery or advanced buildings add pressure.",
      tips: {
        building: "Repair Bay",
        supportBuildings: ["Power Cell"],
        research: "Predictive Maintenance",
        supportResearch: ["Field Ops"],
        module: "Miner Link",
        operation: "Maintenance Cycle",
        watch: "Best defensive role, but it does not solve weak Energy by itself.",
        actions: [
          "Use Engineer when Stability is your main pain point.",
          "Great with Repair Bay and Predictive Maintenance.",
          "Safer choice than greedier roles for fragile builds.",
        ],
      },
      nextStep: {
        label: "Open Repair Bay",
        tab: "build",
        target: "repairBay",
        why: "Engineer works best in stability-focused builds.",
      },
    },

    logistician: {
      title: "Logistician",
      focus: "Shipping + vault flow",
      text:
        "Logistician is the export-focused crew role.\n\n" +
        "What it helps:\n" +
        "• Better bank / ship value.\n" +
        "• Stronger Shared Vault conversion.\n" +
        "• Better fit for mature Refinery loops.",
      tips: {
        building: "Logistics Center",
        supportBuildings: ["Refinery"],
        research: "Logistics",
        supportResearch: ["Routing AI"],
        module: "Vault Compressor",
        operation: "Ship to Shared Vault",
        watch: "Feels weak if you are not producing and shipping enough yet.",
        actions: [
          "Choose this when shipping matters daily.",
          "Great once banked MLEO production is stable.",
          "Not ideal if your base is still struggling with basics.",
        ],
      },
      nextStep: {
        label: "Open Shipping",
        tab: "operations",
        target: "shipping",
        why: "Logistician is strongest in a real export loop.",
      },
    },

    researcher: {
      title: "Researcher",
      focus: "DATA + advanced progression",
      text:
        "Researcher is the cleanest role for strategic DATA-focused growth.\n\n" +
        "What it helps:\n" +
        "• Higher DATA multiplier.\n" +
        "• Better fit for research-heavy builds.\n" +
        "• Good when advanced progression is slowing down.",
      tips: {
        building: "Research Lab",
        supportBuildings: ["Miner Control", "Arcade Hub"],
        research: "Deep Scan",
        supportResearch: ["Arcade Ops", "Token Discipline"],
        module: "Arcade Relay",
        operation: "Field Expedition",
        watch: "Great for DATA, but not a direct fix for weak Ore / Scrap / Energy.",
        actions: [
          "Choose this when DATA is holding back your build.",
          "Best with Research Lab already online.",
          "Strong in more advanced strategic play.",
        ],
      },
      nextStep: {
        label: "Open Research Lab",
        tab: "build",
        target: "researchLab",
        why: "Researcher is best when your DATA engine matters.",
      },
    },

    scout: {
      title: "Scout",
      focus: "Field identity + expedition support",
      text:
        "Scout is a lighter, more active-play role.\n\n" +
        "What it helps:\n" +
        "• Small DATA support.\n" +
        "• Better thematic fit for expeditions.\n" +
        "• Good for players who like a more active command rhythm.",
      tips: {
        building: "Expedition Bay",
        supportBuildings: ["Arcade Hub"],
        research: "Arcade Ops",
        supportResearch: ["Deep Scan"],
        module: "Arcade Relay",
        operation: "Field Expedition",
        watch: "This is a flavor-forward role with a lighter raw bonus than the others.",
        actions: [
          "Best for expedition-oriented playstyles.",
          "Use it when you want the game to feel more active and field-focused.",
          "Less efficient than Researcher if you only care about raw DATA scaling.",
        ],
      },
      nextStep: {
        label: "Open Expedition",
        tab: "operations",
        target: "expedition",
        why: "Scout fits players who lean into the field loop.",
      },
    },

    operations: {
      title: "Operations Chief",
      focus: "Balanced Gold + Scrap support",
      text:
        "Operations Chief is the most balanced economy role.\n\n" +
        "What it helps:\n" +
        "• Better Gold flow.\n" +
        "• Better Scrap flow.\n" +
        "• Smooth overall base rhythm without leaning too hard into one lane.",
      tips: {
        building: "Trade Hub",
        supportBuildings: ["Salvage Yard"],
        research: "Field Ops",
        supportResearch: [],
        module: "",
        operation: "",
        watch: "Balanced and safe, but less specialized than Engineer / Logistician / Researcher.",
        actions: [
          "Good default if you want a smoother mid-game economy.",
          "Useful when both Gold and Scrap feel tight together.",
          "Great role for players who do not want to over-specialize too early.",
        ],
      },
      nextStep: {
        label: "Open Trade Hub",
        tab: "build",
        target: "tradeHub",
        why: "Operations Chief supports the broader economy instead of one niche lane.",
      },
    },
  };

  const COMMANDER_PATH_INFO_COPY = {
    industry: {
      title: "Industry Path",
      focus: "Safer ORE growth + steadier infrastructure",
      text:
        "Industry is the safest all-around commander path for production-first play.\n\n" +
        "What it helps:\n" +
        "• Higher ORE output.\n" +
        "• Slightly better maintenance relief.\n" +
        "• Smoother infrastructure pacing for early and mid-game.",
      tips: {
        building: "Quarry",
        supportBuildings: ["Power Cell", "Repair Bay"],
        research: "Miner Sync",
        supportResearch: ["Predictive Maintenance"],
        module: "Servo Drill",
        operation: "",
        watch: "Safe and strong, but not the best path for shipping or pure DATA play.",
        actions: [
          "Great default path for most players.",
          "Very good when Ore is blocking upgrades.",
          "Pairs well with stable industrial expansion.",
        ],
      },
      nextStep: {
        label: "Open Quarry",
        tab: "build",
        target: "quarry",
        why: "Industry Path supports the Ore lane directly.",
      },
    },

    logistics: {
      title: "Logistics Path",
      focus: "Bank bonus + export identity",
      text:
        "Logistics is the commander path for shipping-focused progression.\n\n" +
        "What it helps:\n" +
        "• Better bank / ship bonus.\n" +
        "• Better fit for mature Refinery loops.\n" +
        "• Strong Shared Vault identity.",
      tips: {
        building: "Logistics Center",
        supportBuildings: ["Refinery"],
        research: "Logistics",
        supportResearch: ["Routing AI"],
        module: "Vault Compressor",
        operation: "Ship to Shared Vault",
        watch: "Feels weak if your base is not actually exporting much yet.",
        actions: [
          "Best once banked MLEO and shipping are already meaningful.",
          "Excellent for players centered on Shared Vault growth.",
          "Not the best early-game path.",
        ],
      },
      nextStep: {
        label: "Open Shipping",
        tab: "operations",
        target: "shipping",
        why: "Logistics Path is directly tied to export flow.",
      },
    },

    research: {
      title: "Research Path",
      focus: "Higher DATA and systems optimization",
      text:
        "Research is the strongest commander path for DATA-focused advanced play.\n\n" +
        "What it helps:\n" +
        "• Higher DATA multiplier.\n" +
        "• Better fit for Research Lab builds.\n" +
        "• Strong late-game strategic identity.",
      tips: {
        building: "Research Lab",
        supportBuildings: ["Miner Control", "Arcade Hub"],
        research: "Deep Scan",
        supportResearch: ["Token Discipline", "Arcade Ops"],
        module: "Arcade Relay",
        operation: "Field Expedition",
        watch: "Best when DATA matters; weaker if your real bottleneck is still Energy or raw materials.",
        actions: [
          "Choose this when DATA is central to your strategy.",
          "Excellent for advanced progression and research-heavy builds.",
          "Pairs very well with Research Lab and expedition support.",
        ],
      },
      nextStep: {
        label: "Open Research Lab",
        tab: "build",
        target: "researchLab",
        why: "Research Path is strongest with a real DATA engine.",
      },
    },

    ecosystem: {
      title: "Ecosystem Path",
      focus: "Hybrid support across economy and DATA",
      text:
        "Ecosystem is the broadest hybrid path.\n\n" +
        "What it helps:\n" +
        "• Slight Gold bonus.\n" +
        "• Slight DATA bonus.\n" +
        "• Better thematic fit for broader MLEO synergy play.",
      tips: {
        building: "Arcade Hub",
        supportBuildings: ["Miner Control", "Trade Hub"],
        research: "Field Ops",
        supportResearch: ["Arcade Ops"],
        module: "Arcade Relay",
        operation: "",
        watch: "Flexible but less explosive than a specialized path.",
        actions: [
          "Good hybrid choice for players who want broad support.",
          "Useful when you do not want to lock into one main lane yet.",
          "Pairs nicely with mixed Miners / Arcade / economy identity.",
        ],
      },
      nextStep: {
        label: "Open Arcade Hub",
        tab: "build",
        target: "arcadeHub",
        why: "Ecosystem Path fits the broader support identity of the base.",
      },
    },
  };

  const CONTRACT_INFO_COPY = {
    stability_watch: {
      title: "Contract: Stability Watch",
      focus: "Keep stability at 85%+",
      text:
        "This contract rewards safe base management.\n\n" +
        "How to complete it:\n" +
        "• Keep stability at or above 85%.\n" +
        "• Avoid risky event choices when already under pressure.\n" +
        "• Use maintenance before things slip too far.",
      tips: {
        building: "Repair Bay",
        research: "Predictive Maintenance",
        module: "Miner Link",
        actions: [
          "Preventing instability is easier than repairing it later.",
          "Engineer role also fits this contract well.",
          "Good contract for safer steady growth.",
        ],
      },
      nextStep: {
        label: "Open Maintenance",
        tab: "operations",
        target: "maintenance",
        why: "Maintenance is the most direct way to protect this contract.",
      },
    },

    energy_ready: {
      title: "Contract: Energy Reserve",
      focus: "Keep energy above 45% of cap",
      text:
        "This contract rewards stable Energy control.\n\n" +
        "How to complete it:\n" +
        "• Keep current Energy above 45% of your cap.\n" +
        "• Avoid wasting Energy on too many expeditions.\n" +
        "• Improve cap and regeneration so the reserve is easier to maintain.",
      tips: {
        building: "Power Cell",
        research: "Coolant Loops",
        module: "",
        actions: [
          "Best done with stronger regen, not only with refill.",
          "Refill can save the contract, but should not be the whole plan.",
          "Good contract for disciplined play.",
        ],
      },
      nextStep: {
        label: "Open Power Cell",
        tab: "build",
        target: "powerCell",
        why: "Power Cell is the long-term answer for better energy reserve.",
      },
    },

    banking_cycle: {
      title: "Contract: Banking Cycle",
      focus: "Reach 120 banked MLEO before shipping",
      text:
        "This contract teaches patience and timing.\n\n" +
        "How to complete it:\n" +
        "• Let banked MLEO build up to at least 120.\n" +
        "• Do not ship too early.\n" +
        "• Use Refinery and supporting systems first, then export.",
      tips: {
        building: "Refinery",
        research: "Logistics",
        module: "Vault Compressor",
        actions: [
          "This contract is about timing, not just production.",
          "Great for teaching better shipment discipline.",
          "Best with Logistician role or Logistics path.",
        ],
      },
      nextStep: {
        label: "Open Refinery",
        tab: "build",
        target: "refinery",
        why: "Refinery output is what makes this contract possible.",
      },
    },

    field_readiness: {
      title: "Contract: Field Readiness",
      focus: "Be expedition-ready with 4+ DATA",
      text:
        "This contract rewards balanced field preparation.\n\n" +
        "How to complete it:\n" +
        "• Keep expedition off cooldown.\n" +
        "• Hold at least 4 DATA.\n" +
        "• Avoid spending DATA too aggressively before you are ready.",
      tips: {
        building: "Expedition Bay",
        research: "Arcade Ops",
        module: "Arcade Relay",
        actions: [
          "Great contract for active expedition players.",
          "Requires both readiness and resource discipline.",
          "Scout and Researcher styles both fit well here.",
        ],
      },
      nextStep: {
        label: "Open Expedition",
        tab: "operations",
        target: "expedition",
        why: "This contract depends directly on expedition readiness.",
      },
    },
  };

  const EVENT_INFO_COPY = {
    reactor_surge: {
      title: "Event: Reactor Surge",
      focus: "Stability vs short-term power spike",
      text:
        "Reactor Surge is a classic risk-versus-reward event.\n\n" +
        "What it means:\n" +
        "• Safe choice protects stability.\n" +
        "• Aggressive choice gives short-term output but hurts stability.\n" +
        "• Best decision depends on your current system state.",
      tips: {
        building: "Power Cell",
        research: "Predictive Maintenance",
        module: "",
        actions: [
          "Choose safe when already near warning or critical state.",
          "Choose aggressive only when systems are healthy enough.",
          "This event teaches stability discipline.",
        ],
      },
      nextStep: {
        label: "Open Power Cell",
        tab: "build",
        target: "powerCell",
        why: "Power-related systems are central to handling this event well.",
      },
    },

    salvage_signal: {
      title: "Event: Salvage Signal",
      focus: "Field opportunity with risk/reward choice",
      text:
        "Salvage Signal is a field decision event.\n\n" +
        "What it means:\n" +
        "• One choice is usually safer and more controlled.\n" +
        "• Another can be more rewarding but may cost stability or resources.\n" +
        "• Best when you understand your current resource pressure.",
      tips: {
        building: "Salvage",
        research: "",
        module: "",
        actions: [
          "Safer choice is better when the base is under pressure.",
          "Aggressive choice is better only when you can absorb downside.",
          "Good event for flexible resource players.",
        ],
      },
    },

    crew_dispute: {
      title: "Event: Crew Dispute",
      focus: "Crew harmony vs short-term resource tradeoff",
      text:
        "Crew Dispute is about command leadership.\n\n" +
        "What it means:\n" +
        "• Some choices protect stability and team rhythm.\n" +
        "• Others save resources now but can weaken control.\n" +
        "• The right choice depends on how pressured your base already is.",
      tips: {
        building: "HQ",
        research: "Field Ops",
        module: "",
        actions: [
          "Safer leadership is better when the base is already unstable.",
          "Aggressive saving is only good when you have room for risk.",
          "This event reinforces command identity.",
        ],
      },
      nextStep: {
        label: "Open HQ",
        tab: "build",
        target: "hq",
        why: "Crew and leadership choices connect naturally to HQ progression.",
      },
    },

    logistics_window: {
      title: "Event: Logistics Window",
      focus: "Temporary shipment opportunity",
      text:
        "Logistics Window is a timing event around shipping value.\n\n" +
        "What it means:\n" +
        "• It can improve the next shipment if used well.\n" +
        "• Sometimes skipping is smarter if you are not ready to capitalize.\n" +
        "• Best decision depends on your current banked MLEO and ship timing.",
      tips: {
        building: "Logistics Center",
        research: "Logistics",
        module: "Vault Compressor",
        actions: [
          "Best used when shipment is already close and meaningful.",
          "Skipping is fine if your pipeline is not ready.",
          "This event rewards export discipline.",
        ],
      },
      nextStep: {
        label: "Open Shipping",
        tab: "operations",
        target: "shipping",
        why: "This event matters most when your next shipment timing is relevant.",
      },
    },
  };

  function getCrewInfo(roleOrKey) {
    const key = typeof roleOrKey === "string" ? roleOrKey : roleOrKey?.key;
    const fallbackTitle =
      typeof roleOrKey === "string"
        ? String(roleOrKey)
        : roleOrKey?.name || "Crew Role";

    return CREW_INFO_COPY[key] || {
      title: fallbackTitle,
      focus: "Crew Role",
      text:
        typeof roleOrKey === "string"
          ? "This role shapes how your base feels to play."
          : roleOrKey?.desc || "This role shapes how your base feels to play.",
      tips: { building: "", research: "", module: "", actions: [] },
    };
  }

  function getCommanderPathInfo(pathOrKey) {
    const key =
      typeof pathOrKey === "string" ? pathOrKey : pathOrKey?.key;
    const fallbackTitle =
      typeof pathOrKey === "string"
        ? String(pathOrKey)
        : pathOrKey?.name || "Commander Path";

    return COMMANDER_PATH_INFO_COPY[key] || {
      title: fallbackTitle,
      focus: "Commander Path",
      text:
        typeof pathOrKey === "string"
          ? "This path shapes your broader strategy."
          : pathOrKey?.desc || "This path shapes your broader strategy.",
      tips: { building: "", research: "", module: "", actions: [] },
    };
  }

  function getContractInfo(contract) {
    return CONTRACT_INFO_COPY[contract.key] || {
      title: contract.title,
      focus: "Live Contract",
      text: contract.desc,
      tips: { building: "", research: "", module: "", actions: [] },
    };
  }

  function getEventInfo(event) {
    return EVENT_INFO_COPY[event.key] || {
      title: event.title,
      focus: "Live Event",
      text: event.text,
      tips: { building: "", research: "", module: "", actions: [] },
    };
  }

  const SYSTEM_INFO_COPY = {
    blueprint: {
      title: "Blueprint Cache",
      focus: "Permanent shipping support upgrade",
      text:
        "Blueprint is a long-term reinvestment system.\n\n" +
        "What it improves:\n" +
        "• Better bank / ship efficiency.\n" +
        "• Higher daily ship cap.\n" +
        "• Better value from a strong shipping loop.\n\n" +
        "Important:\n" +
        "Blueprint is strongest after your Refinery and shipping lane already work well.",
      tips: {
        building: "Logistics Center",
        supportBuildings: ["Refinery"],
        research: "Logistics",
        supportResearch: ["Routing AI"],
        module: "Vault Compressor",
        operation: "Ship to Shared Vault",
        watch: "Blueprint is reinvestment, not emergency recovery.",
        actions: [
          "Take Blueprint when shipping is already part of your main economy.",
          "Do not prioritize it over broken Energy or Stability.",
          "Blueprint becomes stronger as export flow becomes consistent.",
        ],
      },
      nextStep: {
        label: "Open Shipping",
        tab: "operations",
        target: "shipping",
        why: "Blueprint matters most when you actively use the shipping pipeline.",
      },
    },

    crewSummary: {
      title: "Crew Role Summary",
      focus: "Your current support style",
      text:
        "Crew Role changes what kind of help your base gets most naturally.\n\n" +
        "Examples:\n" +
        "• Engineer helps stability handling.\n" +
        "• Logistician supports export flow.\n" +
        "• Researcher supports DATA.\n" +
        "• Scout supports field identity.\n" +
        "• Operations helps economy balance.\n\n" +
        "Important:\n" +
        "Role should match your current bottleneck, not just your favorite theme.",
      tips: {
        building: "Match role to bottleneck",
        supportBuildings: ["Repair Bay for Engineer", "Logistics Center for Logistician", "Research Lab for Researcher"],
        research: "Field Ops",
        supportResearch: [],
        module: "",
        operation: "Review role when progression slows",
        watch: "A good role still needs the right buildings behind it.",
        actions: [
          "Use Engineer when stability is becoming a problem.",
          "Use Logistician when shipping becomes central.",
          "Use Researcher when DATA and research pacing are your focus.",
        ],
      },
      nextStep: {
        label: "Open Development",
        tab: "development",
        target: "crew",
        why: "Crew Role belongs to your development identity controls.",
      },
    },

    commanderSummary: {
      title: "Commander Path Summary",
      focus: "Your high-level strategic direction",
      text:
        "Commander Path shows what style your base is leaning toward.\n\n" +
        "Main paths:\n" +
        "• Industry for safer production growth.\n" +
        "• Logistics for export and vault flow.\n" +
        "• Research for DATA and analysis.\n" +
        "• Ecosystem for broader MLEO synergy.\n\n" +
        "Important:\n" +
        "Path works best when your upgrades actually match it.",
      tips: {
        building: "Match path to core lane",
        supportBuildings: [
          "Quarry / Refinery for Industry",
          "Logistics Center for Logistics",
          "Research Lab for Research",
          "Miner Control / Arcade Hub for Ecosystem",
        ],
        research: "Field Ops",
        supportResearch: ["Logistics", "Deep Scan", "Miner Sync"],
        module: "",
        operation: "Review path when strategy changes",
        watch: "Path is not a free bonus lane if your build goes the opposite way.",
        actions: [
          "Industry is safer for production-heavy play.",
          "Logistics is stronger when Shared Vault shipping matters.",
          "Research is better when DATA scaling is central.",
        ],
      },
      nextStep: {
        label: "Open Development",
        tab: "development",
        target: "paths",
        why: "Commander Path is part of your development planning layer.",
      },
    },

    baseProfile: {
      title: "Base Profile",
      focus: "A readable summary of your current maturity",
      text:
        "Base Profile is a simple stage label for your outpost.\n\n" +
        "What it tells you:\n" +
        "• Whether you are still early.\n" +
        "• Whether your command center is maturing.\n" +
        "• Whether the base already has enough systems to feel structured.\n\n" +
        "Important:\n" +
        "This is not a stat bonus. It is a readability tool for the player.",
      tips: {
        building: "HQ",
        supportBuildings: ["Power Cell", "Refinery", "Research Lab"],
        research: "",
        supportResearch: [],
        module: "",
        operation: "",
        watch: "Use this as a stage marker, not as a performance stat.",
        actions: [
          "Read it as overall progression, not as raw power.",
          "A higher profile usually means more systems are now worth connecting together.",
          "Good for helping players feel long-term growth.",
        ],
      },
    },

    shipDiscipline: {
      title: "Ship Discipline",
      focus: "How much shipping pressure you already used today",
      text:
        "Ship Discipline compares today's shipped amount to your current cap.\n\n" +
        "What it helps with:\n" +
        "• Reading export pressure.\n" +
        "• Timing shipments more smartly.\n" +
        "• Understanding when softcut starts to matter more.\n\n" +
        "Important:\n" +
        "The cap is not the only thing that matters. Timing and efficiency still matter too.",
      tips: {
        building: "Logistics Center",
        supportBuildings: ["Refinery"],
        research: "Logistics",
        supportResearch: ["Routing AI"],
        module: "Vault Compressor",
        operation: "Ship to Shared Vault",
        watch: "Shipping too aggressively near cap can feel less efficient.",
        actions: [
          "Use this card to pace exports.",
          "Blueprint and Logistics make shipping more forgiving over time.",
          "Good timing can matter almost as much as raw quantity.",
        ],
      },
      nextStep: {
        label: "Open Shipping",
        tab: "operations",
        target: "shipping",
        why: "This card exists to support your shipping timing decisions.",
      },
    },

    commandAlerts: {
      title: "Command Alerts",
      focus: "What needs attention right now",
      text:
        "Command Alerts explain the most important pressure or opportunity in your base.\n\n" +
        "Typical alerts:\n" +
        "• Energy pressure.\n" +
        "• Stability pressure.\n" +
        "• Expedition readiness.\n" +
        "• Shipping pressure.\n" +
        "• Claimable rewards.\n\n" +
        "Important:\n" +
        "Alerts are guidance, not orders. They help the player focus without taking control away.",
      tips: {
        building: "Power Cell / Repair Bay",
        supportBuildings: ["Expedition Bay", "Logistics Center"],
        research: "",
        supportResearch: [],
        module: "",
        operation: "Open the system causing the alert",
        watch: "Do not follow alerts blindly if your long-term plan says something else.",
        actions: [
          "Treat critical alerts first.",
          "Use alerts to reduce confusion, especially in early and mid game.",
          "Alerts should support decisions, not replace strategy.",
        ],
      },
    },

    nextStepCard: {
      title: "Recommended Next Step",
      focus: "The best immediate move for the current state",
      text:
        "This card suggests the strongest immediate action based on your current base state.\n\n" +
        "What it helps with:\n" +
        "• Reducing confusion.\n" +
        "• Teaching progression naturally.\n" +
        "• Helping players move forward without reading everything.\n\n" +
        "Important:\n" +
        "It points to the next good move, not the only valid move.",
      tips: {
        building: "Depends on bottleneck",
        supportBuildings: [
          "Power Cell for Energy",
          "Repair Bay for Stability",
          "Refinery for banked MLEO",
          "Research Lab for DATA",
        ],
        research: "Depends on lane",
        supportResearch: [
          "Coolant Loops",
          "Predictive Maintenance",
          "Logistics",
          "Miner Sync",
        ],
        module: "Depends on lane",
        operation: "Use the suggested button jump",
        watch: "This is immediate guidance, not full long-term planning.",
        actions: [
          "Great for new players.",
          "Good for mid-game when the base starts feeling complex.",
          "Use it as guidance while still keeping freedom to choose your own route.",
        ],
      },
    },
  };

  function getSystemInfo(key) {
    return SYSTEM_INFO_COPY[key] || {
      title: "System Info",
      focus: "Game system",
      text: "This panel explains an important system in your BASE interface.",
      tips: { building: "", research: "", module: "", actions: [] },
    };
  }

  const getBuildingInfo = (building) => {
    const level = Number(state.buildings?.[building.key] || 0);
    const info = BUILDING_INFO_COPY[building.key];

    if (!info) {
      return {
        title: `${building.name} · Lv ${level}`,
        focus: "Build Structure",
        text: (
          <div className="space-y-4 text-sm leading-7 text-white/85">
            <div>
              <div className="mb-1 text-xs font-black uppercase tracking-[0.24em] text-cyan-300/80">
                1. What it gives now
              </div>
              <div>{building.desc}</div>
            </div>

            <div>
              <div className="mb-1 text-xs font-black uppercase tracking-[0.24em] text-cyan-300/80">
                2. What the next upgrade gives
              </div>
              <div>Improves this structure further and supports stronger progression.</div>
            </div>

            <div>
              <div className="mb-1 text-xs font-black uppercase tracking-[0.24em] text-cyan-300/80">
                3. Why upgrade it
              </div>
              <div>Supports long-term base growth.</div>
            </div>

            <div>
              <div className="mb-1 text-xs font-black uppercase tracking-[0.24em] text-cyan-300/80">
                4. Linked resources / systems
              </div>
              <div>General base progression</div>
            </div>

            <div>
              <div className="mb-1 text-xs font-black uppercase tracking-[0.24em] text-cyan-300/80">
                5. Progression impact
              </div>
              <div>Improves long-term efficiency and pacing.</div>
            </div>
          </div>
        ),
        tips: {
          building: "HQ",
          research: "Routing AI",
          module: "Miner Link",
          actions: ["Upgrade when this lane becomes important to your progression."],
        },
      };
    }

    return {
      title: `${building.name} · Lv ${level}`,
      focus: "Build Structure",
      text: (
        <div className="space-y-4 text-sm leading-7 text-white/85">
          <div>
            <div className="mb-1 text-xs font-black uppercase tracking-[0.24em] text-cyan-300/80">
              1. What it gives now
            </div>
            <div>{info.now(level, building)}</div>
          </div>

          <div>
            <div className="mb-1 text-xs font-black uppercase tracking-[0.24em] text-cyan-300/80">
              2. What the next upgrade gives
            </div>
            <div>{info.next(level, building)}</div>
          </div>

          <div>
            <div className="mb-1 text-xs font-black uppercase tracking-[0.24em] text-cyan-300/80">
              3. Why upgrade it
            </div>
            <div>{info.why}</div>
          </div>

          <div>
            <div className="mb-1 text-xs font-black uppercase tracking-[0.24em] text-cyan-300/80">
              4. Linked resources / systems
            </div>
            <div>{info.linked}</div>
          </div>

          <div>
            <div className="mb-1 text-xs font-black uppercase tracking-[0.24em] text-cyan-300/80">
              5. Progression impact
            </div>
            <div>{info.impact}</div>
          </div>

          <div>
            <div className="mb-1 text-xs font-black uppercase tracking-[0.24em] text-cyan-300/80">
              Energy / runtime
            </div>
            <div className="text-white/85">
              {getBuildingEnergyLine(building, level, getBuildingPowerMode(state, building.key))}
            </div>

            <div className="mt-2 text-sm text-white/70">
              {getBuildingPowerLine(building.key, getBuildingPowerMode(state, building.key))}
            </div>

            {canThrottleBuilding(building.key) && level > 0 ? (
              <div className="mt-3 grid grid-cols-5 gap-2">
                {BUILDING_POWER_STEPS.map((mode) => {
                  const active = getBuildingPowerMode(state, building.key) === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => changeBuildingPowerMode(building.key, mode)}
                      className={`rounded-xl border px-2 py-2 text-xs font-bold transition ${
                        active
                          ? "border-cyan-300/50 bg-cyan-500/15 text-cyan-200"
                          : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                      }`}
                    >
                      {mode}%
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      ),
      tips: info.tips,
    };
  };

  const visibleStructures =
    structuresTab === "core"
      ? BUILDINGS.filter((item) => STRUCTURES_TAB_A.includes(item.key))
      : BUILDINGS.filter((item) => STRUCTURES_TAB_B.includes(item.key));

  const baseStructuresContent = (
    <div>
      <div className="mb-3 flex gap-2">
        <button
          onClick={() => setStructuresTab("core")}
          className={`rounded-2xl px-4 py-2 text-sm font-bold transition ${
            structuresTab === "core"
              ? "bg-cyan-400 text-slate-950"
              : "border border-white/10 bg-white/5 text-white/75"
          }`}
        >
          Core
        </button>
        <button
          onClick={() => setStructuresTab("expansion")}
          className={`rounded-2xl px-4 py-2 text-sm font-bold transition ${
            structuresTab === "expansion"
              ? "bg-cyan-400 text-slate-950"
              : "border border-white/10 bg-white/5 text-white/75"
          }`}
        >
          Expansion
        </button>
      </div>

      <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
        {visibleStructures.map((building) => {
          const level = state.buildings[building.key] || 0;
          const nextLevel = level + 1;
          const cost = buildingCost(building, level);
          const isUnlocked = unlocked(building, state);
          const ready = isUnlocked && canAfford(state.resources, cost);
          const powerMode = getBuildingPowerMode(state, building.key);
          const canThrottle = canThrottleBuilding(building.key);

          const reqNameMap = {
            hq: "HQ",
            quarry: "Quarry",
            tradeHub: "Trade Hub",
            salvage: "Salvage",
            refinery: "Refinery",
            powerCell: "Power Cell",
            minerControl: "Miner Ctrl",
            arcadeHub: "Arcade Hub",
            expeditionBay: "Expedition Bay",
            logisticsCenter: "Logistics",
            researchLab: "Research Lab",
            repairBay: "Repair Bay",
          };

          const requirementsText = building.requires?.length
            ? building.requires
                .map((req) => `${reqNameMap[req.key] || req.key} Lv ${req.lvl}`)
                .join(" · ")
            : "";

          const buttonText = ready
            ? "Upgrade"
            : isUnlocked
            ? "Need resources"
            : "Need requirements";

          return (
            <div
              key={building.key}
              data-base-target={building.key}
              className={`flex min-h-[328px] flex-col rounded-xl border p-3 ${availabilityCardClass(ready)} ${
                highlightTarget === building.key
                  ? "border-cyan-300/70 ring-2 ring-cyan-300/35 shadow-[0_0_0_1px_rgba(103,232,249,0.25)]"
                  : ""
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 pr-2">
                  <div className="line-clamp-1 h-[20px] text-[15px] font-semibold leading-5 text-white">
                    {building.name}
                  </div>
                </div>

                <div className="shrink-0 flex flex-col items-end gap-1">
                  <div className="h-[28px] flex items-center justify-end">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setBuildInfo(getBuildingInfo(building));
                        setOpenInfoKey(null);
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[13px] font-black text-cyan-200 transition hover:bg-cyan-500/20 hover:text-white"
                      aria-label={`Open info for ${building.name}`}
                      title={`Info about ${building.name}`}
                    >
                      i
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-1 flex items-center justify-between">
                <div className="rounded-full bg-white/10 px-2 py-1 text-[11px] font-semibold text-white/65">
                  Lv {level}
                </div>

                <div className="h-[24px] flex items-center">
                  {ready ? <AvailabilityBadge /> : null}
                </div>
              </div>

              <div className="mt-1 h-[38px] overflow-hidden text-[11px] leading-[1.2rem] text-white/60 line-clamp-2">
                {building.desc}
              </div>

              <div className="mt-1.5 min-h-[24px] max-h-[24px] overflow-hidden">
                <div className="flex flex-wrap gap-1.5">
                  <div className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/70">
                    {buildingRoleTag(building.key)}
                  </div>
                  <div className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[11px] font-semibold text-cyan-200">
                    {buildingSynergyTag(building.key)}
                  </div>
                </div>
              </div>

              <div className="mt-2 h-[22px]">
                <div className="inline-flex w-fit rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] text-white/65">
                  {sectorStatusForBuilding(building.key, state).toUpperCase()}
                </div>
              </div>

              <div className="mt-1.5 h-[18px] text-[11px] font-medium text-cyan-200/85">
                Next Lv {nextLevel}
              </div>

              <div className="mt-1 h-[14px] text-[10px] font-black uppercase tracking-[0.18em] text-white/40">
                Cost
              </div>

              <ResourceCostRow cost={cost} resources={state.resources} />

              <div className="mt-auto flex flex-col justify-end pt-0 pb-3">
                <div className="text-[10px] font-semibold text-white/50">
                  {getBuildingEnergyLine(building, level, powerMode)}
                </div>
                <div className="mt-1 text-[10px] font-semibold text-cyan-200/70">
                  {getBuildingPowerLine(building.key, powerMode)}
                </div>

                <div className="mt-2 flex w-full flex-col gap-2">
                  {canThrottle && level > 0 ? (
                    <div className="grid grid-cols-5 gap-1.5">
                      {BUILDING_POWER_STEPS.map((mode) => {
                        const active = powerMode === mode;
                        return (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => changeBuildingPowerMode(building.key, mode)}
                            className={`rounded-lg border px-1.5 py-1.5 text-[10px] font-bold transition ${
                              active
                                ? "border-cyan-300/50 bg-cyan-500/15 text-cyan-200"
                                : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                            }`}
                          >
                            {mode}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    // Keep exact visual spacing for buildings without power % controls.
                    <div className="grid grid-cols-5 gap-1.5 opacity-0 pointer-events-none">
                      {BUILDING_POWER_STEPS.map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          disabled
                          className="rounded-lg border border-white/10 bg-white/5 px-1.5 py-1.5 text-[10px] font-bold text-white/70"
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={() => buyBuilding(building.key)}
                    disabled={!ready}
                    className={`w-full rounded-xl px-3 py-2 text-xs font-semibold leading-none transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40 ${
                      canCoverCost(state.resources, cost)
                        ? "bg-white/10"
                        : "bg-white/10 opacity-70"
                    }`}
                  >
                    {buttonText}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const buildSupportSystemsContent = (
    <div className="space-y-3">
      <div className={`relative rounded-2xl border p-3.5 ${availabilityCardClass(canBuyBlueprintNow)}`}>
        <div className="absolute right-2 top-2 z-10">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setBuildInfo(getSystemInfo("blueprint"));
              setOpenInfoKey(null);
            }}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[11px] font-black text-cyan-200 transition hover:bg-cyan-500/20 hover:text-white"
            aria-label="Open blueprint info"
            title="Info about blueprint"
          >
            i
          </button>
        </div>
        <div className="flex min-h-[20px] flex-col pr-8">
          <div className="flex items-start justify-between gap-2">
            <div className="text-base font-bold text-white">Blueprint Cache</div>
            {canBuyBlueprintNow ? <AvailabilityBadge /> : null}
          </div>
          <div className="mt-1 text-sm text-white/65">
            Upgrade your shipment capacity and long-term bank efficiency.
          </div>
          <div className="mt-3 text-[11px] font-black uppercase tracking-[0.18em] text-white/40">
            Cost
          </div>
          <div className="mt-1 text-xs font-semibold text-white/80">
            {fmt(blueprintCost)} shared MLEO · DATA {fmt(blueprintDataCost)}
          </div>
        </div>
        <button
          onClick={buyBlueprint}
          className="mt-3 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-white/15"
        >
          Buy Blueprint Lv {Number(state.blueprintLevel || 0) + 1}
        </button>
        <div className="mt-1 min-h-[20px] text-center text-[10px] leading-4 text-white/45">
          {canBuyBlueprintNow ? "Ready to purchase" : "Need more shared MLEO or DATA"}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={activateOverclock}
          className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3.5 text-sm font-extrabold text-white hover:bg-white/15"
        >
          Overclock
        </button>
        <button
          onClick={refillEnergy}
          className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3.5 text-sm font-extrabold text-white hover:bg-white/15"
        >
          Refill
        </button>
      </div>

      <button
        onClick={performMaintenance}
        className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3.5 text-sm font-extrabold text-white hover:bg-white/15"
      >
        Maintain
      </button>
    </div>
  );

  const progressSummaryContent = (
    <div className="grid gap-2 md:grid-cols-2">
      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="font-semibold text-white">Totals</div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-white/70">
          <div>
            <div className="text-white/45 text-xs uppercase tracking-[0.16em]">Shipped</div>
            <div className="mt-1 font-semibold text-white">{fmt(state.totalBanked)} MLEO</div>
          </div>
          <div>
            <div className="text-white/45 text-xs uppercase tracking-[0.16em]">Vault Spent</div>
            <div className="mt-1 font-semibold text-white">{fmt(state.totalSharedSpent)} MLEO</div>
          </div>
          <div>
            <div className="text-white/45 text-xs uppercase tracking-[0.16em]">Expeditions</div>
            <div className="mt-1 font-semibold text-white">{fmt(state.totalExpeditions)}</div>
          </div>
          <div>
            <div className="text-white/45 text-xs uppercase tracking-[0.16em]">Missions</div>
            <div className="mt-1 font-semibold text-white">{fmt(state.totalMissionsDone)}</div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="font-semibold text-white">Identity Snapshot</div>
        <div className="mt-3 space-y-2 text-sm text-white/70">
          <div><span className="text-white/45">Crew role:</span> {crewRoleInfo.name}</div>
          <div><span className="text-white/45">Commander path:</span> {commanderPathInfo.name}</div>
          <div><span className="text-white/45">System state:</span> {systemMeta.label}</div>
          <div><span className="text-white/45">Base profile:</span> {state.crew >= 5 ? "Developed Command" : state.crew >= 2 ? "Growing Outpost" : "Early Outpost"}</div>
        </div>
      </div>
    </div>
  );

  const handleResetGame = async () => {
    if (!confirm("Are you sure you want to reset the game? This will start fresh with the new starter pack.")) {
      return;
    }
    
    try {
      // Set flag in localStorage to force reset on next load
      // Also set version to 0 to force reset even if server has version 5
      if (typeof window !== "undefined") {
        window.localStorage.setItem("base_reset_flag", "true");
        window.localStorage.setItem("base_reset_version", "0");
      }
      
      // Reset local state immediately
      const fresh = freshState();
      setState(fresh);
      setToast("Game reset! Reloading...");
      
      // Reload page immediately to apply reset
      window.location.reload();
    } catch (error) {
      console.error("Reset failed", error);
      setToast("Reset failed. Please refresh the page.");
    }
  };

  const openMobilePanel = (panel) => {
    setOpenInnerPanel(null);
    setMobilePanel(panel);
  };

  const openCommandHubTarget = (item) => {
    if (!item) return;

    setShowReadyPanel(false);

    if (item.key === "expedition" || item.key === "shipment") {
      openMobilePanel("ops");
      setOpenInnerPanel("ops-console");
      return;
    }

    if (item.key === "contracts") {
      openMobilePanel("overview");
      setOpenInnerPanel("overview-contracts");
      return;
    }

    if (item.key === "missions") {
      openMobilePanel("ops");
      setOpenInnerPanel("ops-missions");
      return;
    }

    if (item.type === "alert") {
      if (
        item.alertKey === "critical-stability" ||
        item.alertKey === "warning-stability" ||
        item.alertKey === "low-energy" ||
        item.alertKey === "ship-pressure"
      ) {
        openMobilePanel("ops");
        setOpenInnerPanel("ops-console");
        return;
      }

      if (item.alertKey === "expedition-ready" || item.alertKey === "banked-ready") {
        openMobilePanel("ops");
        setOpenInnerPanel("ops-console");
        return;
      }

      if (item.alertKey === "contracts-ready") {
        openMobilePanel("overview");
        setOpenInnerPanel("overview-contracts");
        return;
      }
    }
  };

  const closeMobilePanel = () => {
    setOpenInnerPanel(null);
    setMobilePanel(null);
  };

  const closeDesktopPanel = () => {
    setOpenInnerPanel(null);
    setDesktopPanelOpen(false);
  };

  const openDesktopPanel = (panel, inner = null) => {
    const defaults = {
      overview: "overview-contracts",
      ops: "ops-console",
      build: "build-structures",
      intel: "intel-summary",
    };

    setDesktopPanel(panel);
    setOpenInnerPanel(inner ?? defaults[panel] ?? null);
    setDesktopPanelOpen(true);
  };

  const desktopPanelTitle =
    desktopPanel === "overview"
      ? "Overview"
      : desktopPanel === "ops"
      ? "Operations"
      : desktopPanel === "build"
      ? "Build"
      : desktopPanel === "intel"
      ? "Intel"
      : "";

  const mobilePanelTitle =
    mobilePanel === "overview"
      ? "Overview"
      : mobilePanel === "ops"
      ? "Operations"
      : mobilePanel === "build"
      ? "Build"
      : mobilePanel === "intel"
      ? "Intel"
      : "";

  const desktopHudItems = [
    { label: "ORE", value: fmt(state.resources?.ORE || 0), tone: "normal", infoKey: "ore" },
    { label: "GOLD", value: fmt(state.resources?.GOLD || 0), tone: "normal", infoKey: "gold" },
    { label: "SCRAP", value: fmt(state.resources?.SCRAP || 0), tone: "normal", infoKey: "scrap" },
    { label: "DATA", value: fmt(state.resources?.DATA || 0), tone: "normal", infoKey: "data" },
    {
      label: "ENERGY",
      value: `${fmt(Math.floor(state.resources?.ENERGY || 0))}/${fmt(derived.energyCap || 0)}`,
      tone: "focus",
      infoKey: "energy",
    },
    {
      label: "MLEO",
      value: fmt(state.bankedMleo || 0),
      tone: "focus",
      infoKey: "bankedMleo",
    },
    {
      label: "STAB",
      value: `${fmt(state.stability || 0)}%`,
      tone: "focus",
      infoKey: "stability",
    },
    {
      label: "READY",
      value: fmt(readyCounts.total || 0),
      tone: "focus",
      infoKey: null,
    },
  ];

  const openHomeFlowTarget = (target) => {
    const infoTargets = new Set([
      "sharedVault",
      "bankedMleo",
      "commander",
      "data",
      "energy",
      "stability",
      "ore",
      "gold",
      "scrap",
    ]);

    if (infoTargets.has(target)) {
      setOpenInfoKey(target);
      return;
    }

    const isDesktopViewport =
      typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches;

    const routePanel = (panel, inner) => {
      if (isDesktopViewport) {
        openDesktopPanel(panel, inner);
      } else {
        openMobilePanel(panel);
        setOpenInnerPanel(inner || null);
      }
    };

    if (target === "shipping") {
      routePanel("ops", "ops-console");
      setBuildInfo(getOperationsInfo("shipping"));
      return;
    }

    if (target === "maintenance") {
      routePanel("ops", "ops-console");
      setBuildInfo(getOperationsInfo("maintenance"));
      return;
    }

    if (target === "research-center") {
      routePanel("build", "build-development");
      setBuildInfo(getSystemInfo("blueprint"));
      return;
    }

    const building = BUILDINGS.find((item) => item.key === target);

    if (building) {
      const tab = getStructuresTabForTarget(target);
      if (tab) setStructuresTab(tab);

      routePanel("build", "build-structures");

      if (!isDesktopViewport) {
        setOpenInfoKey(null);
        setBuildInfo(null);

        // Highlight + scroll the exact building card inside the build panel.
        // This matches the OLD mobile behavior: jumping to the relevant upgrade and
        // showing a temporary glow for a few seconds.
        setHighlightTarget(target);
        setTimeout(() => {
          const el = document.querySelector(`[data-base-target="${target}"]`);
          if (!el) return;

          const centered = centerTargetInMobilePanel(el);
          if (!centered) {
            el.scrollIntoView({
              behavior: "smooth",
              block: "center",
              inline: "nearest",
            });
          }
        }, 320);

        setTimeout(() => setHighlightTarget(null), 4200);
      } else {
        // Desktop: only highlight + scroll the exact upgrade card.
        // Info window must open only via the "i" button (not from the flow map click).
        setOpenInfoKey(null);
        setBuildInfo(null);

        setHighlightTarget(target);
        setTimeout(() => {
          const selector = `[data-base-target="${target}"]`;
          let attempts = 0;
          const maxAttempts = 8;

          const tryScroll = () => {
            const el = document.querySelector(selector);
            if (el) {
              el.scrollIntoView({
                behavior: "smooth",
                block: "center",
                inline: "nearest",
              });
              return;
            }

            attempts += 1;
            if (attempts <= maxAttempts) setTimeout(tryScroll, 160);
          };

          tryScroll();
        }, 320);

        setTimeout(() => setHighlightTarget(null), 4200);
      }

      return;
    }
  };

  const homeFlowSections = useMemo(() => {
    const b = state.buildings || {};
    const research = state.research || {};
    const researchCount = Object.values(research).filter(Boolean).length;
    const lowEnergy =
      Number(state.resources?.ENERGY || 0) <= Number(derived.energyCap || 0) * 0.25;
    const criticalEnergy =
      Number(state.resources?.ENERGY || 0) <= Number(derived.energyCap || 0) * 0.12;
    const stabilityValue = Number(state.stability || 100);

    const supportState = stabilityValue < 50 ? "critical" : stabilityValue < 70 ? "warning" : "active";

    const energyState = criticalEnergy ? "critical" : lowEnergy ? "warning" : "active";

    const ghostNode = (key, label, tone, unlockHint) => ({
      key,
      label,
      note: unlockHint,
      tone,
      state: "ghost",
      ghost: true,
      visible: true,
    });

    return {
      core: {
        key: "hq",
        label: "HQ",
        note: `Lv ${Math.max(1, Number(b.hq || 1))}`,
        tone: "core",
        state: "active",
        visible: true,
        badge: "Core",
      },

      primary: [
        (b.quarry || 0) > 0
          ? {
              key: "quarry",
              label: "Quarry",
              note: `Lv ${b.quarry || 0}`,
              tone: "industry",
              state: "active",
              visible: true,
              badge: "Ore",
            }
          : null,
        (b.tradeHub || 0) > 0
          ? {
              key: "tradeHub",
              label: "Trade Hub",
              note: `Lv ${b.tradeHub || 0}`,
              tone: "economy",
              state: "active",
              visible: true,
              badge: "Gold",
            }
          : ghostNode("tradeHub-ghost", "Trade Hub", "economy", "Unlock later"),
        (b.salvage || 0) > 0
          ? {
              key: "salvage",
              label: "Salvage",
              note: `Lv ${b.salvage || 0}`,
              tone: "industry",
              state: "active",
              visible: true,
              badge: "Scrap",
            }
          : ghostNode("salvage-ghost", "Salvage", "industry", "Unlock later"),
        (b.powerCell || 0) > 0
          ? {
              key: "powerCell",
              label: "Power Cell",
              note: `Lv ${b.powerCell || 0}`,
              tone: "support",
              state: energyState,
              visible: true,
              badge: lowEnergy ? "Low energy" : "Power",
            }
          : ghostNode("powerCell-ghost", "Power Cell", "support", "Power route"),
      ].filter(Boolean),

      systems: [
        (b.refinery || 0) > 0
          ? {
              key: "refinery",
              label: "Refinery",
              note: `Lv ${b.refinery || 0}`,
              tone: "economy",
              state: stabilityValue < 70 ? "warning" : "active",
              visible: true,
              badge: "MLEO",
            }
          : ghostNode("refinery-ghost", "Refinery", "economy", "Convert output"),
        (b.researchLab || 0) > 0
          ? {
              key: "researchLab",
              label: "Research Lab",
              note: `Lv ${b.researchLab || 0}`,
              tone: "intel",
              state: researchCount > 0 ? "active" : "normal",
              visible: true,
              badge: researchCount > 0 ? `${researchCount} tech` : "Research",
            }
          : ghostNode("researchLab-ghost", "Research Lab", "intel", "Unlock tech"),
        (b.repairBay || 0) > 0
          ? {
              key: "repairBay",
              label: "Repair Bay",
              note: `Lv ${b.repairBay || 0}`,
              tone: "support",
              state: supportState,
              visible: true,
              badge: stabilityValue < 70 ? "Repair" : "Stable",
            }
          : ghostNode("repairBay-ghost", "Repair Bay", "support", "Stability"),
        (b.logisticsCenter || 0) > 0
          ? {
              key: "logisticsCenter",
              label: "Logistics",
              note: `Lv ${b.logisticsCenter || 0}`,
              tone: "support",
              state: "active",
              visible: true,
              badge: "Flow",
            }
          : ghostNode("logisticsCenter-ghost", "Logistics", "support", "Efficiency"),
      ].filter(Boolean),

      advanced: [
        (b.minerControl || 0) > 0
          ? {
              key: "minerControl",
              label: "Miner Control",
              note: `Lv ${b.minerControl || 0}`,
              tone: "intel",
              state: "active",
              visible: true,
              badge: "Miners",
            }
          : null,
        (b.arcadeHub || 0) > 0
          ? {
              key: "arcadeHub",
              label: "Arcade Hub",
              note: `Lv ${b.arcadeHub || 0}`,
              tone: "intel",
              state: "active",
              visible: true,
              badge: "Arcade",
            }
          : null,
        (b.expeditionBay || 0) > 0
          ? {
              key: "expeditionBay",
              label: "Expedition",
              note: `Lv ${b.expeditionBay || 0}`,
              tone: "economy",
              state: "active",
              visible: true,
              badge: "Runs",
            }
          : null,
      ].filter(Boolean),

      actions: [
        {
          key: "shipping",
          label: "Shipping",
          note: `${fmt(state.bankedMleo || 0)} MLEO`,
          tone: "economy",
          state: (state.bankedMleo || 0) > 0 ? "active" : "normal",
          visible: true,
          badge: (state.bankedMleo || 0) > 0 ? "Ready" : "Idle",
        },
        {
          key: "maintenance",
          label: "Maintenance",
          note: `${fmt(state.stability || 0)}%`,
          tone: "support",
          state: supportState,
          visible: true,
          badge: supportState === "active" ? "OK" : "Check",
        },
        {
          key: "research-center",
          label: "Research",
          note: researchCount > 0 ? `${researchCount} unlocked` : "Open tree",
          tone: "intel",
          state: researchCount > 0 ? "active" : "normal",
          visible: (b.researchLab || 0) > 0 || researchCount > 0,
          badge: researchCount > 0 ? "Live" : "Tree",
        },
      ].filter((item) => item.visible),
    };
  }, [
    state.buildings,
    state.research,
    state.bankedMleo,
    state.stability,
    state.resources,
    derived.energyCap,
  ]);

  const flowToneClass = (tone, state = "normal") => {
    let base = "border-sky-400/25 bg-sky-500/10 text-sky-100";

    if (tone === "core") {
      base = "border-cyan-400/35 bg-cyan-500/12 text-cyan-100";
    } else if (tone === "industry") {
      base = "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    } else if (tone === "economy") {
      base = "border-violet-400/25 bg-violet-500/10 text-violet-100";
    } else if (tone === "support") {
      base = "border-amber-300/25 bg-amber-400/10 text-amber-100";
    }

    if (state === "ghost") {
      return "border-white/8 bg-white/[0.03] text-white/38";
    }

    if (state === "warning") {
      return `${base} ring-1 ring-amber-300/40 shadow-[0_0_18px_rgba(251,191,36,0.10)]`;
    }

    if (state === "critical") {
      return `${base} ring-1 ring-rose-400/45 shadow-[0_0_20px_rgba(244,63,94,0.14)]`;
    }

    if (state === "active") {
      return `${base} shadow-[0_0_18px_rgba(34,211,238,0.08)]`;
    }

    return base;
  };

  const renderFlowNode = (node, options = {}) => {
    const { wide = false, center = false, compact = false } = options;
    const isGhost = node.state === "ghost" || node.ghost;

    return (
      <button
        key={node.key}
        type="button"
        onClick={() => {
          if (!isGhost) openHomeFlowTarget(node.key);
        }}
        className={`group relative rounded-2xl border px-3 text-center shadow-[0_0_0_1px_rgba(255,255,255,0.02)] transition duration-150 ${
          isGhost ? "cursor-default opacity-75" : "hover:scale-[1.02] active:scale-[0.99]"
        } ${flowToneClass(node.tone, node.state)} ${
          wide ? "w-full" : center ? "w-[48%] max-w-[220px]" : "flex-1 min-w-[96px]"
        } ${compact ? "py-2.5" : "py-3.5"}`}
      >
        <div className="pointer-events-none absolute inset-x-3 top-0 h-px bg-white/10 opacity-50" />

        {node.badge ? (
          <div className="mb-2 flex justify-center">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] ${
                isGhost
                  ? "border border-white/10 bg-white/[0.04] text-white/40"
                  : "border border-white/10 bg-white/10 text-white/70"
              }`}
            >
              {node.badge}
            </span>
          </div>
        ) : null}

        <div className="text-[11px] font-black uppercase tracking-[0.14em]">{node.label}</div>
        <div className="mt-1 text-xs opacity-80">{node.note}</div>

        {node.state === "warning" && !isGhost && (
          <div className="mt-2 inline-flex items-center rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-100">
            Alert
          </div>
        )}

        {node.state === "critical" && !isGhost && (
          <div className="mt-2 inline-flex items-center rounded-full border border-rose-300/30 bg-rose-300/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-rose-100">
            Critical
          </div>
        )}
      </button>
    );
  };

  const getBaseFlowSummary = () => {
    const energy = Number(state.resources?.ENERGY || 0);
    const energyCap = Number(derived.energyCap || 0);
    const stability = Number(state.stability || 100);
    const researchCount = Object.values(state.research || {}).filter(Boolean).length;
    const buildingCount = Object.values(state.buildings || {}).reduce(
      (sum, value) => sum + (Number(value) > 0 ? 1 : 0),
      0
    );

    if (energyCap > 0 && energy <= energyCap * 0.12) {
      return {
        title: "Base under pressure",
        text: "Energy is critically low. Power and maintenance systems need attention.",
        tone: "critical",
      };
    }

    if (stability < 50) {
      return {
        title: "Base integrity unstable",
        text: "Repair Bay and maintenance actions should be prioritized.",
        tone: "critical",
      };
    }

    if (energyCap > 0 && energy <= energyCap * 0.25) {
      return {
        title: "Energy running low",
        text: "Power Cell upgrades can stabilize production flow.",
        tone: "warning",
      };
    }

    if (stability < 70) {
      return {
        title: "Maintenance recommended",
        text: "The base is operating, but system stability is under pressure.",
        tone: "warning",
      };
    }

    if (researchCount > 0) {
      return {
        title: "Base network active",
        text: `${buildingCount} systems online • ${researchCount} research unlocks active`,
        tone: "active",
      };
    }

    return {
      title: "Base network stable",
      text: `${buildingCount} systems online and ready for expansion`,
      tone: "normal",
    };
  };

  const getBaseFlowSummaryClass = (tone) => {
    if (tone === "critical") {
      return "border-rose-400/30 bg-rose-500/10 text-rose-100";
    }
    if (tone === "warning") {
      return "border-amber-300/30 bg-amber-400/10 text-amber-100";
    }
    if (tone === "active") {
      return "border-cyan-400/30 bg-cyan-500/10 text-cyan-100";
    }
    return "border-white/10 bg-white/[0.04] text-white/80";
  };

  const baseFlowSummary = getBaseFlowSummary();

  const mobileTopStats = [
    {
      key: "scrap",
      infoKey: "scrap",
      label: "Scrap",
      value: fmt(state.resources.SCRAP),
    },
    {
      key: "gold",
      infoKey: "gold",
      label: "Gold",
      value: fmt(state.resources.GOLD),
    },
    {
      key: "ore",
      infoKey: "ore",
      label: "Ore",
      value: fmt(state.resources.ORE),
    },
    {
      key: "data",
      infoKey: "data",
      label: "Data",
      value: fmt(state.resources.DATA),
    },
    {
      key: "stability",
      infoKey: "stability",
      label: "Stability",
      value: `${fmt(state.stability)}%`,
    },
    {
      key: "energy",
      infoKey: "energy",
      label: "Energy",
      value: `${fmt(state.resources.ENERGY)}/${fmt(derived.energyCap)}`,
    },
    {
      key: "bankedMleo",
      infoKey: "bankedMleo",
      label: "Banked",
      value: `${fmt(state.bankedMleo)}`,
    },
    {
      key: "sharedVault",
      infoKey: "sharedVault",
      label: "Vault",
      value: `${fmt(sharedVault)}`,
    },
  ];

  const activityLogContent = (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/mleo-miners" className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/20">
          Open Miners
        </Link>
        <Link href="/arcade" className="rounded-xl border border-sky-500/25 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-200 hover:bg-sky-500/20">
          Open Arcade
        </Link>
        <button
          onClick={handleResetGame}
          className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200 hover:bg-rose-500/20"
        >
          Reset Game
        </button>
      </div>
      <div className="space-y-2">
        {(state.log || []).slice(0, 4).map((entry) => (
          <div key={entry.id} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/75">
            <div>{entry.text}</div>
            <div className="mt-1 text-xs text-white/40">{new Date(entry.ts).toLocaleTimeString()}</div>
          </div>
        ))}
      </div>
    </>
  );

  if (!mounted) {
    return (
      <Layout title="MLEO BASE">
        <div className="grid min-h-screen place-items-center text-white">Loading MLEO BASE...</div>
      </Layout>
    );
  }

  return (
    <Layout title="MLEO BASE">
      <main className="h-[100dvh] overflow-hidden overflow-x-hidden bg-[#07111f] text-white sm:min-h-screen sm:h-auto sm:overflow-visible lg:h-[100dvh] lg:overflow-hidden">
        <div className="mx-auto max-w-7xl px-4 py-6 pb-24 sm:px-6 lg:flex lg:h-full lg:flex-col lg:px-8 lg:pb-32">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              {/* Title pill removed for a cleaner V3 look */}
              <div className="mt-3 flex items-center justify-between sm:block">
                <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{CONFIG.title}</h1>
                <div className="flex items-center gap-2 sm:hidden">
                  <Link
                    href="/mining"
                    className="rounded-2xl border border-white/15 bg-white/5 px-4 h-[35px] flex items-center text-sm font-semibold hover:bg-white/10"
                  >
                    Hub
                  </Link>
                  <button
                    onClick={() => setMobileMenuOpen(true)}
                    className="relative flex h-[35px] w-[35px] items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"
                    aria-label="Open menu"
                  >
                    <span className="text-[22px] leading-none">☰</span>
                    {readyCounts.total > 0 && (
                      <span className="absolute -right-1 -top-1 inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-cyan-400 px-1 text-[10px] font-black text-slate-950">
                        {readyCounts.total}
                      </span>
                    )}
                  </button>
                </div>
              </div>
              {/* subtitle removed */}
            </div>

            <div className="hidden sm:flex flex-wrap items-center gap-2 sm:justify-start">
              <Link
                href="/mining"
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold hover:bg-white/10"
              >
                Hub
              </Link>

              <button
                type="button"
                onClick={() => {
                  if (commandHubCount > 0) setShowReadyPanel(true);
                }}
                className={`rounded-2xl border px-4 py-2.5 transition ${
                  commandHubCount > 0
                    ? `cursor-pointer shadow-[0_0_24px_rgba(34,211,238,0.18)] hover:border-cyan-400/80 ${
                        primaryCommandItem?.type === "alert"
                          ? alertToneClasses(primaryCommandItem.tone)
                          : "border-cyan-400/60 bg-cyan-500/10 hover:bg-cyan-500/15"
                      }`
                    : "border-white/10 bg-white/5"
                } ${commandHubCount > 0 ? "animate-pulse" : ""}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-bold text-white">
                        {primaryCommandItem?.title || "Base is stable"}
                      </div>

                      {commandHubCount > 0 ? (
                        <span className="inline-flex min-w-[24px] items-center justify-center rounded-full bg-cyan-400 px-1.5 py-0.5 text-[10px] font-bold text-slate-950">
                          {commandHubCount}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div
                    className={`shrink-0 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                      commandHubCount > 0
                        ? "bg-cyan-500 text-white hover:bg-cyan-400"
                        : "bg-white/10 text-white/80"
                    }`}
                  >
                    {commandHubCount > 0 ? "OPEN" : "OK"}
                  </div>
                </div>
              </button>

              <button
                onClick={() => setShowHowToPlay(true)}
                className="rounded-xl border border-blue-500/25 bg-blue-500/10 px-4 py-2.5 text-sm font-semibold text-blue-200 hover:bg-blue-500/20"
              >
                HOW TO PLAY
              </button>

              <button
                type="button"
                onClick={() => setOpenInfoKey("sharedVault")}
                className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/20"
                title="Shared Vault"
              >
                VAULT {fmt(sharedVault)} MLEO
              </button>

              {isConnected ? (
                <button
                  onClick={() => openAccountModal?.()}
                  className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold hover:bg-white/20"
                >
                  {address?.slice(0, 6)}…{address?.slice(-4)}
                </button>
              ) : (
                <button
                  onClick={() => openConnectModal?.()}
                  className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold hover:bg-rose-500"
                >
                  Connect
                </button>
              )}
            </div>
          </div>

          {null}

          {/* Desktop */}
          <div className="mt-6 hidden sm:grid grid-cols-2 lg:hidden gap-3 xl:items-stretch">
            <div className="relative">
              <InfoButton
                infoKey="sharedVault"
                setOpenInfoKey={setOpenInfoKey}
              />
              <MetricCard
                label="Shared Vault"
                value={`${fmt(sharedVault)} MLEO`}
                note="Shared across Miners, Arcade and Online."
                accent="emerald"
              />
            </div>

            <div className="relative">
              <InfoButton
                infoKey="bankedMleo"
                setOpenInfoKey={setOpenInfoKey}
              />
              <MetricCard
                label="Base Banked"
                value={`${fmt(state.bankedMleo)} MLEO`}
                note="Refined here, then shipped."
                accent="violet"
              />
            </div>

            <div className="relative">
              <InfoButton
                infoKey="commander"
                setOpenInfoKey={setOpenInfoKey}
              />
              <MetricCard
                label="Commander"
                value={`Lv ${state.commanderLevel}`}
                note={`${fmt(state.commanderXp)} / ${fmt(xpForLevel(state.commanderLevel))} XP`}
                accent="sky"
              />
            </div>

            <div
              className={`h-full w-full ${highlightCard(
                (state.resources.ENERGY || 0) <= derived.energyCap * 0.25,
                "warning"
              )}`}
            >
              <div className="relative">
                <InfoButton
                  infoKey="energy"
                  setOpenInfoKey={setOpenInfoKey}
                />

                <MetricCard
                  label="Energy"
                  value={`${fmt(state.resources.ENERGY)} / ${fmt(derived.energyCap)}`}
                  note={`Regen ${derived.energyRegen.toFixed(2)}/s`}
                  accent="slate"
                />
              </div>
            </div>

            <div
              className={`h-full w-full ${
                highlightCard(systemState === "critical", "critical") ||
                highlightCard(systemState === "warning", "warning")
              }`}
            >
              <div className="relative">
                <InfoButton
                  infoKey="stability"
                  setOpenInfoKey={setOpenInfoKey}
                />

                <MetricCard
                  label="Stability"
                  value={`${fmt(state.stability)}%`}
                  note={systemMeta.label}
                  accent={systemMeta.accent}
                />
              </div>
            </div>

            <div className="relative">
              <InfoButton
                infoKey="data"
                setOpenInfoKey={setOpenInfoKey}
              />
              <MetricCard
                label="Data"
                value={fmt(state.resources.DATA)}
                note={`x${derived.dataMult.toFixed(2)} progression`}
                accent="sky"
              />
            </div>
          </div>

          {/* Removed: desktop duplicate ORE/GOLD/SCRAP metric cards */}

          {/* Desktop Home Scene */}
          <div className="hidden">
            <div className="rounded-[30px] border border-white/10 bg-slate-950/72 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl">
              <div className="grid gap-4 xl:grid-cols-[1.12fr_0.88fr]">
                <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-300/70">
                        Desktop Flow
                  </div>
                      <div className="mt-1 text-2xl font-black text-white">Command Center</div>
                  </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/75">
                      4 fixed windows
                </div>
                  </div>

                    <button
                    type="button"
                      onClick={() => {
                      if (commandHubCount > 0) {
                          openDesktopPanel("ops", "ops-console");
                      }
                    }}
                    className={`mt-4 w-full rounded-3xl border px-4 py-3 text-left transition ${
                      commandHubCount > 0
                        ? `shadow-[0_0_24px_rgba(34,211,238,0.18)] hover:border-cyan-400/80 ${
                            primaryCommandItem?.type === "alert"
                              ? alertToneClasses(primaryCommandItem.tone)
                              : "border-cyan-400/60 bg-cyan-500/10 hover:bg-cyan-500/15"
                          }`
                        : "border-white/10 bg-white/5"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className="text-base font-bold text-white">
                            {primaryCommandItem?.title || "Base is stable"}
                  </div>
                          {commandHubCount > 0 ? (
                            <span className="inline-flex min-w-[24px] items-center justify-center rounded-full bg-cyan-400 px-1.5 py-0.5 text-[10px] font-black text-slate-950">
                              {commandHubCount}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-sm text-white/65">
                          {primaryCommandItem?.text ||
                            "Everything important should stay visible without scrolling the page."}
                </div>
              </div>

                      <div
                        className={`shrink-0 rounded-2xl px-3 py-2 text-xs font-semibold transition ${
                          commandHubCount > 0
                            ? "bg-cyan-500 text-white hover:bg-cyan-400"
                            : "bg-white/10 text-white/80"
                        }`}
                      >
                        {commandHubCount > 0 ? "OPEN" : "OK"}
                </div>
                </div>
                  </button>

                  <div className="mt-4 grid grid-cols-3 gap-3 xl:grid-cols-6">
                    {mobileTopStats.map((item) => (
                  <button
                        key={item.key}
                        type="button"
                        onClick={() => openHomeFlowTarget(item.key)}
                        className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-left transition hover:bg-white/[0.08]"
                      >
                        <div className="text-[10px] uppercase tracking-[0.16em] text-white/45">
                          {item.label}
                        </div>
                        <div className="mt-1 text-sm font-bold text-white">{item.value}</div>
                  </button>
                    ))}
                </div>

                  <div className="mt-4">
                    <BaseHomeFlowScene
                      base={state}
                      derived={derived}
                      selected={highlightTarget}
                      onSelect={openHomeFlowTarget}
                      layout="desktop"
                    />
                </div>
              </div>

                <div className="grid grid-cols-2 gap-3 auto-rows-fr">
                  <div className="relative">
                    <InfoButton infoKey="sharedVault" setOpenInfoKey={setOpenInfoKey} />
                    <MetricCard
                      label="Shared Vault"
                      value={`${fmt(sharedVault)} MLEO`}
                      note="Shared across Miners, Arcade and Online."
                      accent="emerald"
                    />
                </div>

                  <div className="relative">
                    <InfoButton infoKey="bankedMleo" setOpenInfoKey={setOpenInfoKey} />
                    <MetricCard
                      label="Base Banked"
                      value={`${fmt(state.bankedMleo)} MLEO`}
                      note="Refined here, then shipped."
                      accent="violet"
                    />
                </div>

                    <div
                    className={`h-full w-full ${highlightCard(
                      (state.resources.ENERGY || 0) <= derived.energyCap * 0.25,
                      "warning"
                      )}`}
                    >
                    <div className="relative">
                      <InfoButton infoKey="energy" setOpenInfoKey={setOpenInfoKey} />
                      <MetricCard
                        label="Energy"
                        value={`${fmt(state.resources.ENERGY)} / ${fmt(derived.energyCap)}`}
                        note={`Regen ${derived.energyRegen.toFixed(2)}/s`}
                        accent="slate"
                      />
                        </div>
                        </div>

                  <div
                    className={`h-full w-full ${
                      highlightCard(systemState === "critical", "critical") ||
                      highlightCard(systemState === "warning", "warning")
                    }`}
                  >
                    <div className="relative">
                      <InfoButton infoKey="stability" setOpenInfoKey={setOpenInfoKey} />
                      <MetricCard
                        label="Stability"
                        value={`${fmt(state.stability)}%`}
                        note={systemMeta.label}
                        accent={systemMeta.accent}
                      />
                </div>
              </div>

                        <button
                    type="button"
                    onClick={() => openDesktopPanel("overview", "overview-recommendation")}
                    className="rounded-2xl border border-cyan-400/20 bg-cyan-500/8 p-4 text-left transition hover:bg-cyan-500/12"
                  >
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-200/70">
                      Next step
                      </div>
                    <div className="mt-1 text-sm font-bold text-white">{nextStep.title}</div>
                    <div className="mt-1 text-xs text-white/60">{nextStep.text}</div>
                  </button>

                              <button
                                type="button"
                    onClick={() => openDesktopPanel("overview", "overview-contracts")}
                    className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left transition hover:bg-white/[0.08]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/45">
                        Live contracts
                            </div>
                      {liveContractsAvailableCount > 0 ? (
                        <span className="inline-flex min-w-[22px] items-center justify-center rounded-full bg-cyan-400 px-1.5 py-0.5 text-[10px] font-black text-slate-950">
                          {liveContractsAvailableCount}
                        </span>
                          ) : null}
                            </div>
                    <div className="mt-1 text-sm font-bold text-white">
                      {liveContractsAvailableCount > 0
                        ? `${liveContractsAvailableCount} reward${
                            liveContractsAvailableCount > 1 ? "s" : ""
                          } ready`
                        : "No rewards ready"}
                            </div>
                    <div className="mt-1 text-xs text-white/60">Open the window to claim or review.</div>
                  </button>
                          </div>
                            </div>
            </div>
          </div>

          {/* Desktop Fixed Nav */}
          <div className="fixed inset-x-0 bottom-0 z-[118] hidden px-6 pb-6 pt-3">
            <div className="mx-auto max-w-4xl rounded-3xl border border-white/10 bg-slate-950/88 p-2 shadow-[0_-8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
              <div className="grid grid-cols-4 gap-2">
                {[
                  { key: "overview", label: "Overview", badge: readyCounts.contracts + readyCounts.missions },
                  { key: "ops", label: "Operations", badge: readyCounts.expedition + readyCounts.shipment },
                  { key: "build", label: "Build", badge: buildOpportunitiesCount },
                  { key: "intel", label: "Intel", badge: 0 },
                ].map((tab) => {
                  const active = desktopPanelOpen && desktopPanel === tab.key;
                  const hasBadge = Number(tab.badge || 0) > 0;

                                return (
                                  <button
                      key={tab.key}
                      onClick={() => openDesktopPanel(tab.key)}
                      className={`relative rounded-2xl px-4 py-3 text-sm font-bold transition ${
                        active
                          ? "bg-cyan-500 text-white"
                          : hasBadge
                          ? "border border-cyan-400/40 bg-cyan-500/10 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.12)]"
                          : "border border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                      }`}
                    >
                      {tab.label}
                      {hasBadge ? (
                        <span className="absolute -right-1 -top-1 inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-cyan-400 px-1 text-[10px] font-black text-slate-950">
                          {tab.badge}
                        </span>
                      ) : null}
                                  </button>
                                );
                              })}
                            </div>
                        </div>
                    </div>

          {/* Desktop Panel Overlay */}
          {desktopPanelOpen ? (
            <div className="fixed inset-0 z-[117] bg-black/55 backdrop-blur-sm">
              <div className="absolute inset-x-6 top-[88px] bottom-[106px]">
                <div className="mx-auto h-full max-w-6xl rounded-[30px] border border-white/10 bg-[#0b1526] shadow-2xl">
                  <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-300/70">
                        Desktop Window
                          </div>
                      <div className="mt-1 text-2xl font-black text-white">{desktopPanelTitle}</div>
                        </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <WindowBankedBadge value={state.bankedMleo || 0} />
                        <button
                        onClick={closeDesktopPanel}
                        className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white/90 hover:bg-white/10"
                      >
                        Close
                        </button>
                    </div>
                      </div>

                  <div className="h-[calc(100%-81px)] overflow-y-auto px-5 py-4">
                    {desktopPanel === "overview" ? (
  <div className="flex h-full flex-col gap-3">
    <div
      className={"rounded-2xl border px-3.5 py-3 " + getBaseFlowSummaryClass(baseFlowSummary.tone)}
    >
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-75">
        Base Status
      </div>
      <div className="mt-1 text-sm font-semibold">{baseFlowSummary.title}</div>
      <div className="mt-1 text-xs opacity-80">{baseFlowSummary.text}</div>
    </div>

    <div className="grid grid-cols-4 gap-2 xl:grid-cols-8">
      {mobileTopStats.map((item) => (
        <div
          key={item.key}
          className="relative min-h-[64px] rounded-2xl border border-white/10 bg-white/5 px-3 py-2"
        >
          <InfoButton
            infoKey={item.infoKey || item.key}
            setOpenInfoKey={setOpenInfoKey}
            className="right-2 top-2 h-6 w-6 text-[11px]"
          />

                                <button
                                  type="button"
            onClick={() => setOpenInfoKey(item.infoKey || item.key)}
            className="block w-full text-left"
          >
            <div className="pr-7 text-[10px] font-black uppercase tracking-[0.16em] text-white/40">
              {item.label}
                              </div>

            <div className="mt-1 pr-6 text-sm font-extrabold text-white xl:text-[15px]">
              {item.value}
                              </div>
                              </button>
                            </div>
                          ))}
                        </div>

    <div className="min-h-0 flex-1 rounded-[26px] border border-white/10 bg-[#07111f]/80 p-4">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300/70">
            Command Flow Map
                        </div>
          <div className="mt-1 text-lg font-black text-white">Live Base Network</div>
          <div className="mt-1 text-sm text-white/65">
            Clicking a structure opens the matching panel, while this main screen stays clean and wide.
          </div>
                    </div>

        <div className="flex gap-2">
                            <button
                              type="button"
            onClick={() => openDesktopPanel("ops", "ops-console")}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
          >
            Operations
                            </button>

                            <button
                              type="button"
            onClick={() => openDesktopPanel("build", "build-structures")}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
          >
            Build
                            </button>
                          </div>
                          </div>

      <BaseHomeFlowScene
        base={state}
        derived={derived}
        selected={highlightTarget}
        onSelect={openHomeFlowTarget}
        layout="desktop"
      />
                    </div>
                  </div>
                ) : null}
                {desktopPanel === "ops" ? (
                      <div className="space-y-3">
                        <BaseResourceBar
                          resources={state.resources}
                          energy={state.resources?.ENERGY || 0}
                          energyCap={derived.energyCap || 140}
                          bankedMleo={state.bankedMleo || 0}
                          compact
                          showBanked={false}
                        />

                        <div
                          className={`rounded-3xl border p-3.5 transition ${buildSectionCardClass(
                            operationsConsoleAvailableCount > 0
                          )}`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <div className="text-lg font-bold text-white">Operations Console</div>
                                <SectionAvailabilityBadge count={operationsConsoleAvailableCount} />
                      </div>
                              {openInnerPanel !== "ops-console" ? (
                                <div className="mt-1 text-sm text-white/60">
                                  {sectionStatusHint("operations-console", {
                                    expedition: readyCounts.expedition > 0,
                                    ship: readyCounts.shipment > 0,
                                    refill: readyCounts.refill > 0,
                                    maintain: readyCounts.maintenance > 0,
                                  })}
                                </div>
                              ) : null}
                      </div>
                      <button
                              onClick={() => toggleInnerPanel("ops-console")}
                              className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                      >
                              {openInnerPanel === "ops-console" ? "CLOSE" : "OPEN"}
                      </button>
                    </div>
                          {openInnerPanel === "ops-console" && (
                            <div className="mt-3">{operationsConsoleContent}</div>
                          )}
                      </div>

                        <div
                          data-base-target="missions"
                          className={`rounded-3xl border p-3.5 transition ${buildSectionCardClass(
                            dailyMissionsAvailableCount > 0
                          )} ${
                            isHighlightedTarget("missions", highlightTarget)
                              ? "ring-2 ring-amber-300/90 border-amber-300 bg-amber-400/10 shadow-[0_0_0_1px_rgba(252,211,77,0.45),0_0_28px_rgba(245,158,11,0.18)]"
                              : ""
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <div className="text-lg font-bold text-white">Daily Missions</div>
                                <SectionAvailabilityBadge count={dailyMissionsAvailableCount} />
                      </div>
                              {openInnerPanel !== "ops-missions" ? (
                                <div className="mt-1 text-sm text-white/60">
                                  {sectionStatusHint("daily-missions", { count: dailyMissionsAvailableCount })}
                    </div>
                    ) : null}
                      </div>
                      <button
                              onClick={() => toggleInnerPanel("ops-missions")}
                              className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                            >
                              {openInnerPanel === "ops-missions" ? "CLOSE" : "OPEN"}
                      </button>
                    </div>
                          {openInnerPanel === "ops-missions" && (
                            <div className="mt-3">{dailyMissionsContent}</div>
                          )}
                      </div>
                      </div>
                    ) : null}

                    {desktopPanel === "build" ? (
                      <div className="space-y-3">
                        <BaseResourceBar
                          resources={state.resources}
                          energy={state.resources?.ENERGY || 0}
                          energyCap={derived.energyCap || 140}
                          bankedMleo={state.bankedMleo || 0}
                          compact
                          showBanked={false}
                        />

                        <div
                          className={`rounded-3xl border p-3.5 transition ${buildSectionCardClass(
                            developmentAvailableCount > 0
                          )}`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <div className="text-lg font-bold text-white">Development</div>
                                <SectionAvailabilityBadge count={developmentAvailableCount} />
                      </div>
                              {openInnerPanel !== "build-development" ? (
                                <div className="mt-1 text-sm text-white/60">
                                  {buildSectionHint("development", {
                                    modules: availableModulesCount,
                                    research: availableResearchCount,
                                  })}
                    </div>
                              ) : null}
                        </div>
                        <button
                              onClick={() => toggleInnerPanel("build-development")}
                              className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                            >
                              {openInnerPanel === "build-development" ? "CLOSE" : "OPEN"}
                        </button>
                      </div>
                          {openInnerPanel === "build-development" && (
                            <div className="mt-3">{crewModulesResearchContent}</div>
                      )}
                    </div>

                        <div
                          className={`rounded-3xl border p-3.5 transition ${buildSectionCardClass(
                            structuresAvailableCount > 0
                          )}`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <div className="text-lg font-bold text-white">Base Structures</div>
                                <SectionAvailabilityBadge count={structuresAvailableCount} />
                          </div>
                              {openInnerPanel !== "build-structures" ? (
                                <div className="mt-1 text-sm text-white/60">
                                  {buildSectionHint("structures", {
                                    structures: availableStructuresCount,
                                  })}
                                </div>
                              ) : null}
                        </div>
                        <button
                              onClick={() => toggleInnerPanel("build-structures")}
                              className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                        >
                          {openInnerPanel === "build-structures" ? "CLOSE" : "OPEN"}
                        </button>
                      </div>
                          {openInnerPanel === "build-structures" && (
                            <div className="mt-3">{baseStructuresContent}</div>
                      )}
                    </div>

                        <div
                          className={`rounded-3xl border p-3.5 transition ${buildSectionCardClass(
                            supportAvailableCount > 0
                          )}`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <div className="text-lg font-bold text-white">Support Systems</div>
                                <SectionAvailabilityBadge count={supportAvailableCount} />
                            </div>
                              {openInnerPanel !== "build-support" ? (
                                <div className="mt-1 text-sm text-white/60">
                                  {buildSectionHint("support", {
                                    support: availableBlueprintCount,
                                  })}
                                </div>
                              ) : null}
                          </div>
                          <button
                              onClick={() => toggleInnerPanel("build-support")}
                              className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                            >
                              {openInnerPanel === "build-support" ? "CLOSE" : "OPEN"}
                          </button>
                        </div>
                          {openInnerPanel === "build-support" ? (
                            <div className="mt-3">{buildSupportSystemsContent}</div>
                          ) : null}
                    </div>
                  </div>
                ) : null}

                {desktopPanel === "intel" ? (
                      <div className="space-y-3">
                        <BaseResourceBar
                          resources={state.resources}
                          energy={state.resources?.ENERGY || 0}
                          energyCap={derived.energyCap || 140}
                          bankedMleo={state.bankedMleo || 0}
                          compact
                          showBanked={false}
                        />
                        <div
                          className={`rounded-3xl border p-3.5 transition ${buildSectionCardClass(
                            intelSummaryAvailableCount > 0
                          )}`}
                            >
                              <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-lg font-bold text-white">Progress Summary</div>
                              {openInnerPanel !== "intel-summary" ? (
                                <div className="mt-1 text-sm text-white/60">
                                  Key progress and identity data
                                  </div>
                              ) : null}
                          </div>
                          <button
                              onClick={() => toggleInnerPanel("intel-summary")}
                              className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                          >
                            {openInnerPanel === "intel-summary" ? "CLOSE" : "OPEN"}
                          </button>
                        </div>
                          {openInnerPanel === "intel-summary" && (
                            <div className="mt-3">{progressSummaryContent}</div>
                        )}
                      </div>

                        <div
                          className={`rounded-3xl border p-3.5 transition ${buildSectionCardClass(
                            intelLogAvailableCount > 0
                          )}`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-lg font-bold text-white">Activity Log</div>
                              {openInnerPanel !== "intel-log" ? (
                                <div className="mt-1 text-sm text-white/60">
                                  Recent events and milestones
                            </div>
                              ) : null}
                          </div>
                          <button
                              onClick={() => toggleInnerPanel("intel-log")}
                              className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                          >
                            {openInnerPanel === "intel-log" ? "CLOSE" : "OPEN"}
                          </button>
                        </div>
                          {openInnerPanel === "intel-log" && (
                            <div className="mt-3">{activityLogContent}</div>
                          )}
                    </div>
                  </div>
                ) : null}
              </div>
          </div>
              </div>
            </div>
          ) : null}

          {/* Desktop Command Center */}
          <>
            <div className="mt-4 hidden min-h-0 flex-1 lg:block">
              <div
                className="relative h-[calc(100dvh-190px)] overflow-hidden rounded-[30px] border border-white/10 bg-slate-950/78 shadow-[0_18px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl"
                style={{
                  background: `
                    radial-gradient(circle at 50% 50%, rgba(16,185,129,0.10) 0%, rgba(16,185,129,0.04) 12%, transparent 24%),
                    radial-gradient(circle at 50% 50%, rgba(34,211,238,0.08) 0%, transparent 40%),
                    linear-gradient(180deg, rgba(2,6,23,0.96) 0%, rgba(8,15,30,0.98) 42%, rgba(2,6,23,0.99) 100%),
                    repeating-linear-gradient(90deg, rgba(148,163,184,0.045) 0, rgba(148,163,184,0.045) 1px, transparent 1px, transparent 26px),
                    repeating-linear-gradient(0deg, rgba(148,163,184,0.04) 0, rgba(148,163,184,0.04) 1px, transparent 1px, transparent 26px)
                  `,
                }}
              >
                <div className="absolute inset-0 p-6">
                  <div className="mx-auto flex h-full max-w-[1320px] flex-col">
                    <div className="mb-2 grid grid-cols-4 gap-2 xl:grid-cols-8">
                      {desktopHudItems.map((item) => {
                        const focus = item.tone === "focus";

                        return (
                          <button
                            key={item.label}
                            type="button"
                            onClick={() => {
                              if (item.infoKey) {
                                openHomeFlowTarget(item.infoKey);
                              } else {
                                openDesktopPanel("ops", "ops-console");
                              }
                            }}
                            className={`min-h-[60px] rounded-2xl border px-3 py-2 text-left transition hover:bg-white/10 ${
                              focus
                                ? "border-cyan-400/20 bg-cyan-400/8"
                                : "border-white/10 bg-white/5"
                            }`}
                          >
                            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">
                              {item.label}
                            </div>

                            <div className="mt-1 text-sm font-extrabold text-white xl:text-[15px]">
                              {item.value}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="min-h-0 flex-1 -mt-1">
                      <BaseHomeFlowScene
                        base={state}
                        derived={derived}
                        selected={highlightTarget}
                        onSelect={openHomeFlowTarget}
                        layout="desktop"
                      />
                  </div>
                          </div>
                          </div>
                          </div>
                      </div>

            {/* Desktop Fixed Nav */}
            <div className="fixed inset-x-0 bottom-0 z-[118] hidden lg:block px-6 pb-6 pt-3">
              <div className="mx-auto max-w-5xl rounded-3xl border border-white/10 bg-slate-950/88 p-2 shadow-[0_-8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { key: "overview", label: "Overview", badge: readyCounts.contracts + readyCounts.missions },
                    { key: "ops", label: "Operations", badge: readyCounts.expedition + readyCounts.shipment },
                    { key: "build", label: "Build", badge: buildOpportunitiesCount },
                    { key: "intel", label: "Intel", badge: 0 },
                  ].map((tab) => {
                    const active = desktopPanelOpen && desktopPanel === tab.key;
                    const hasBadge = Number(tab.badge || 0) > 0;

                    return (
                    <button
                        key={tab.key}
                        onClick={() => openDesktopPanel(tab.key)}
                        className={`relative rounded-2xl px-4 py-3 text-sm font-bold transition ${
                          active
                            ? "bg-cyan-500 text-white"
                            : hasBadge
                            ? "border border-cyan-400/40 bg-cyan-500/10 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.12)]"
                            : "border border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                        }`}
                      >
                        {tab.label}
                        {hasBadge ? (
                          <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-cyan-400 px-1 text-[10px] font-black text-slate-950">
                            {tab.badge}
                          </span>
                        ) : null}
                    </button>
                    );
                  })}
                </div>
                </div>
              </div>
          </>

          {shownInfo ? (
            <div
              className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/78 backdrop-blur-sm px-4 lg:items-stretch lg:justify-end lg:px-0"
              onClick={() => {
                setOpenInfoKey(null);
                setBuildInfo(null);
              }}
            >
              <div
                className="relative w-full max-w-md max-h-[78vh] overflow-y-auto rounded-3xl border border-cyan-400/20 bg-slate-950/95 p-5 shadow-[0_20px_80px_rgba(0,0,0,0.6)] backdrop-blur-xl lg:max-h-none lg:h-full lg:w-[430px] lg:max-w-none lg:rounded-none lg:rounded-l-[28px] lg:border-y-0 lg:border-r-0 lg:border-l lg:p-6"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => {
                    setOpenInfoKey(null);
                    setBuildInfo(null);
                  }}
                  className="absolute right-4 top-4 z-30 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 text-2xl font-bold text-white/85 backdrop-blur-md transition hover:bg-white/10"
                  aria-label="Close info"
                >
                  ×
                </button>

                <div className="sticky top-0 z-20 -mx-5 -mt-5 mb-4 border-b border-white/10 bg-slate-950/92 px-5 pt-5 pb-3 backdrop-blur-xl lg:-mx-6 lg:-mt-6 lg:px-6 lg:pt-6">
                  <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-cyan-200/70">
                    MLEO BASE INFO
                  </div>

                  <div className="mt-2 pr-16">
                    <div className="flex items-end gap-3">
                      <div className="text-4xl font-black leading-none text-white">
                        {shownInfo.title}
                      </div>

                      {infoUpgradeBuildingKey ? (
                        <button
                          type="button"
                          onClick={() => openHomeFlowTarget(infoUpgradeBuildingKey)}
                          className="mb-1 rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[12px] font-bold text-white/85 hover:bg-white/10"
                        >
                          UPGRADE
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {shownInfo?.focus ? (
                    <div className="mt-2 pr-16 text-sm leading-6 text-cyan-200/80">
                      <span className="font-semibold text-white">Focus:</span> {shownInfo.focus}
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                  <div className="whitespace-pre-line text-sm leading-7 text-white/80">
                    {shownInfo.text}
                  </div>

                  {hasInfoTipContent(shownInfo?.tips) ? (
                    <div className="mt-4 border-t border-white/10 pt-4">
                      <div className="grid gap-2 text-sm text-white/78">
                        {renderInfoTipRow("Main building", shownInfo?.tips?.building)}
                        {renderInfoTipRow("Support buildings", shownInfo?.tips?.supportBuildings)}
                        {renderInfoTipRow("Main research", shownInfo?.tips?.research)}
                        {renderInfoTipRow("Support research", shownInfo?.tips?.supportResearch)}
                        {renderInfoTipRow("Best module", shownInfo?.tips?.module)}
                        {renderInfoTipRow("Best operation", shownInfo?.tips?.operation)}
                        {renderInfoTipRow("Watch out", shownInfo?.tips?.watch)}
                      </div>

                      {normalizeInfoTipItems(shownInfo?.tips?.actions).length ? (
                        <div className="mt-4">
                          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-cyan-200/70">
                            Quick actions
                          </div>

                          <ul className="mt-2 space-y-1.5 text-sm leading-6 text-white/78">
                            {normalizeInfoTipItems(shownInfo?.tips?.actions).map((item) => (
                              <li key={item} className="flex gap-2">
                                <span className="mt-[8px] h-1.5 w-1.5 rounded-full bg-cyan-300/90" />
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {shownInfo?.nextStep ? (
                    <button
                      type="button"
                      onClick={handleInfoNextStep}
                      className="mt-4 flex w-full items-start justify-between rounded-2xl border border-cyan-400/20 bg-cyan-500/8 px-4 py-3 text-left transition hover:bg-cyan-500/14"
                    >
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-200/70">
                          Recommended next step
                        </div>
                        <div className="mt-1 text-base font-semibold text-white">
                          {shownInfo.nextStep.label}
                        </div>
                        {shownInfo.nextStep.why ? (
                          <div className="mt-1 text-sm text-white/68">
                            Why: {shownInfo.nextStep.why}
                          </div>
                        ) : null}
                      </div>

                      <div className="ml-4 pt-1 text-cyan-200/80">→</div>
                    </button>
                  ) : null}
                </div>

                <div className="sticky bottom-0 z-20 -mx-5 mt-5 flex justify-end bg-transparent px-5 pb-6 pt-3 pointer-events-none lg:-mx-6 lg:px-6">
                  <button
                    type="button"
                    onClick={() => {
                      setOpenInfoKey(null);
                      setBuildInfo(null);
                    }}
                    className="pointer-events-auto rounded-2xl border border-cyan-400/20 bg-slate-950/85 px-5 py-3 text-base font-semibold text-white shadow-[0_6px_18px_rgba(0,0,0,0.18)] backdrop-blur-md transition hover:bg-cyan-500/15"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {/* Mobile */}
          <div
            className="relative mt-4 space-y-3 sm:hidden overscroll-none pb-28"
            style={{
              background: `
                radial-gradient(circle at 50% 56%, rgba(16,185,129,0.18) 0%, rgba(16,185,129,0.08) 14%, transparent 24%),
                radial-gradient(circle at 50% 56%, rgba(34,211,238,0.10) 0%, transparent 42%),
                linear-gradient(180deg, rgba(2,6,23,0.95) 0%, rgba(8,15,30,0.96) 42%, rgba(2,6,23,0.98) 100%),
                repeating-linear-gradient(90deg, rgba(148,163,184,0.06) 0, rgba(148,163,184,0.06) 1px, transparent 1px, transparent 22px),
                repeating-linear-gradient(0deg, rgba(148,163,184,0.05) 0, rgba(148,163,184,0.05) 1px, transparent 1px, transparent 22px)
              `,
            }}
          >
            <div
              onClick={() => {
                if (commandHubCount > 0) setShowReadyPanel(true);
              }}
              className={`rounded-2xl border px-4 py-2 transition ${
                commandHubCount > 0
                  ? `cursor-pointer shadow-[0_0_24px_rgba(34,211,238,0.18)] hover:border-cyan-400/80 ${
                      primaryCommandItem?.type === "alert"
                        ? alertToneClasses(primaryCommandItem.tone)
                        : "border-cyan-400/60 bg-cyan-500/10 hover:bg-cyan-500/15"
                    }`
                  : "border-white/10 bg-white/5"
              } ${commandHubCount > 0 ? "animate-pulse" : ""}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-bold text-white">
                      {primaryCommandItem?.title || "Base is stable"}
                    </div>
                    {commandHubCount > 0 && (
                      <span className="inline-flex min-w-[24px] items-center justify-center rounded-full bg-cyan-400 px-1.5 py-0.5 text-[10px] font-bold text-black">
                        {commandHubCount}
                      </span>
                    )}
                  </div>
                </div>

                <div
                  className={`shrink-0 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                    commandHubCount > 0
                      ? "bg-cyan-500 text-white hover:bg-cyan-400"
                      : "bg-white/10 text-white/80"
                  }`}
                >
                  {commandHubCount > 0 ? "OPEN" : "OK"}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto no-scrollbar">
              <div className="flex gap-2 pb-1">
                {mobileTopStats.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => openHomeFlowTarget(item.infoKey || item.key)}
                    className="shrink-0 min-w-[78px] rounded-2xl border border-white/10 bg-white/[0.04] px-2 py-1.5 text-left"
                  >
                    <div className="text-[10px] uppercase tracking-[0.16em] text-white/45">
                      {item.label}
                    </div>
                    <div className="mt-1 text-sm font-bold text-white">{item.value}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-2">
              <BaseHomeFlowScene
                base={state}
                derived={derived}
                selected={highlightTarget}
                onSelect={openHomeFlowTarget}
              />
            </div>
          </div>

          {/* Mobile Bottom Nav - fixed above panels so switching doesn't require closing */}
          <div className="fixed inset-x-0 bottom-0 z-[120] px-3 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 sm:hidden">
            <div className="mx-auto max-w-md rounded-3xl border border-white/10 bg-slate-950/88 p-2 shadow-[0_-8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
              <div className="grid grid-cols-4 gap-2">
                {[
                  { key: "overview", label: "Overview", badge: readyCounts.contracts + readyCounts.missions },
                  { key: "ops", label: "Operations", badge: readyCounts.expedition + readyCounts.shipment },
                  { key: "build", label: "Build", badge: buildOpportunitiesCount },
                  { key: "intel", label: "Intel", badge: 0 },
                ].map((tab) => {
                  const active = mobilePanel === tab.key;
                  const hasBadge = Number(tab.badge || 0) > 0;

                  return (
                    <button
                      key={tab.key}
                      onClick={() => openMobilePanel(tab.key)}
                      className={`relative rounded-2xl px-3 py-3 text-xs font-bold transition ${
                        active
                          ? "bg-cyan-500 text-white"
                          : hasBadge
                          ? "border border-cyan-400/40 bg-cyan-500/10 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.12)]"
                          : "border border-white/10 bg-white/5 text-white/70"
                      }`}
                    >
                      {tab.label}
                      {hasBadge ? (
                        <span className="absolute -right-1 -top-1 inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-cyan-400 px-1 text-[10px] font-black text-slate-950">
                          {tab.badge}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Mobile Panel Overlay */}
          {mobilePanel ? (
            <div className="fixed inset-0 z-[115] bg-black/55 backdrop-blur-sm sm:hidden">
              <div className="absolute inset-x-0 bottom-0 top-[84px] rounded-t-[28px] border border-white/10 bg-[#0b1526] shadow-2xl">
                <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-lg font-bold text-white">{mobilePanelTitle}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <WindowBankedBadge value={state.bankedMleo || 0} />
                    <button
                      onClick={closeMobilePanel}
                      className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-bold text-white/90 hover:bg-white/10"
                    >
                      Close
                    </button>
                  </div>
                </div>

                <div
                  ref={mobilePanelScrollRef}
                  className="h-[calc(100%-73px)] overflow-y-auto px-4 py-4 pb-28"
                >
                  {/* Ready Now Summary Block */}
                  {readyCounts.total > 0 && (
                    <div className="mb-4 rounded-2xl border border-cyan-400/40 bg-cyan-400/10 p-3">
                      <div className="mb-2 text-sm font-semibold text-cyan-200">Ready now</div>
                      <div className="space-y-2">
                        {readyCounts.missions > 0 && (
                          <button
                            onClick={() => {
                              openMobilePanel("ops");
                              setOpenInnerPanel("ops-missions");
                            }}
                            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left hover:bg-white/10"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="text-sm font-bold text-white">
                                  {readyCounts.missions} Mission reward{readyCounts.missions > 1 ? "s" : ""} ready
                                </div>
                                <div className="mt-1 text-xs text-white/60">
                                  Open Daily Missions to claim it.
                                </div>
                              </div>
                              <span className="text-cyan-300 text-lg font-bold">›</span>
                            </div>
                          </button>
                        )}
                        {readyCounts.contracts > 0 && (
                          <button
                            onClick={() => {
                              openMobilePanel("overview");
                              setOpenInnerPanel("overview-contracts");
                            }}
                            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left hover:bg-white/10"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="text-sm font-bold text-white">
                                  {readyCounts.contracts} Contract{readyCounts.contracts > 1 ? "s" : ""} ready
                                </div>
                                <div className="mt-1 text-xs text-white/60">
                                  Open Live Contracts to claim.
                                </div>
                              </div>
                              <span className="text-cyan-300 text-lg font-bold">›</span>
                            </div>
                          </button>
                        )}
                        {showExpeditions && readyCounts.expedition > 0 ? (
                          <button
                            onClick={() => {
                              openMobilePanel("ops");
                              setOpenInnerPanel("ops-console");
                            }}
                            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left hover:bg-white/10"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="text-sm font-bold text-white">Expedition ready</div>
                                <div className="mt-1 text-xs text-white/60">
                                  Open Operations Console to launch.
                                </div>
                              </div>
                              <span className="text-cyan-300 text-lg font-bold">›</span>
                            </div>
                          </button>
                        ) : null}
                      </div>
                    </div>
                  )}

                  {mobilePanel === "overview" ? (
                    <div className="space-y-3">
                      <BaseResourceBar
                        resources={state.resources}
                        energy={state.resources?.ENERGY || 0}
                        energyCap={derived.energyCap || 140}
                        bankedMleo={state.bankedMleo || 0}
                        compact
                        showBanked={false}
                      />
                      <div
                        className={`rounded-3xl border p-3.5 transition ${buildSectionCardClass(
                          overviewRecommendationCount > 0
                        )}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-lg font-bold text-white">Next Recommended Step</div>
                            {openInnerPanel !== "overview-recommendation" ? (
                              <div className="mt-1 text-sm text-white/60">
                                Suggested next action for your base
                              </div>
                            ) : null}
                          </div>
                          <button
                            onClick={() => toggleInnerPanel("overview-recommendation")}
                            className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                          >
                            {openInnerPanel === "overview-recommendation" ? "CLOSE" : "OPEN"}
                          </button>
                        </div>
                        {openInnerPanel === "overview-recommendation" && (
                          <div className="mt-3 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4">
                            <div className="text-base font-bold text-white">{nextStep.title}</div>
                            <div className="mt-1 text-sm text-white/70">{nextStep.text}</div>
                          </div>
                        )}
                      </div>

                      {buildOpportunitiesCount > 0 ? (
                        <button
                          onClick={() => openMobilePanel("build")}
                          className="w-full rounded-3xl border border-cyan-400/20 bg-cyan-500/6 p-4 text-left shadow-[0_0_18px_rgba(34,211,238,0.06)]"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-lg font-extrabold text-white">Build opportunities</div>
                              <div className="mt-1 text-sm text-cyan-100/75">
                                {availableStructuresCount > 0 ? `${availableStructuresCount} structures` : null}
                                {availableStructuresCount > 0 && availableModulesCount > 0 ? " · " : null}
                                {availableModulesCount > 0 ? `${availableModulesCount} modules` : null}
                                {(availableStructuresCount > 0 || availableModulesCount > 0) && availableResearchCount > 0 ? " · " : null}
                                {availableResearchCount > 0 ? `${availableResearchCount} research` : null}
                                {(availableStructuresCount > 0 || availableModulesCount > 0 || availableResearchCount > 0) && availableBlueprintCount > 0 ? " · " : null}
                                {availableBlueprintCount > 0 ? "blueprint ready" : null}
                              </div>
                            </div>
                            <span className="inline-flex min-w-7 h-7 items-center justify-center rounded-full bg-cyan-400 px-2 text-xs font-black text-slate-950">
                              {buildOpportunitiesCount}
                            </span>
                          </div>
                        </button>
                      ) : null}

                      {showCrew ? (
                      <div
                        className={`rounded-3xl border p-3.5 transition ${buildSectionCardClass(
                          overviewIdentityCount > 0
                        )}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-lg font-bold text-white">Command Identity</div>
                            {openInnerPanel !== "overview-identity" ? (
                              <div className="mt-1 text-sm text-white/60">
                                Current crew role and commander path
                              </div>
                            ) : null}
                          </div>
                          <button
                            onClick={() => toggleInnerPanel("overview-identity")}
                            className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                          >
                            {openInnerPanel === "overview-identity" ? "CLOSE" : "OPEN"}
                          </button>
                        </div>
                        {openInnerPanel === "overview-identity" && (
                          <div className="mt-3 grid gap-3">
                            <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                              <div className="text-sm font-semibold text-white">{crewRoleInfo.name}</div>
                              <div className="mt-1 text-xs text-white/60">{roleBonusText}</div>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                              <div className="text-sm font-semibold text-white">{commanderPathInfo.name}</div>
                              <div className="mt-1 text-xs text-white/60">{commanderPathText}</div>
                            </div>
                          </div>
                        )}
                      </div>
                      ) : null}

                      <div
                        data-base-target="contracts"
                        className={`rounded-3xl border p-3.5 transition ${buildSectionCardClass(
                          liveContractsAvailableCount > 0
                        )} ${
                          isHighlightedTarget("contracts", highlightTarget)
                            ? "ring-2 ring-cyan-300/90 border-cyan-300 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(103,232,249,0.45),0_0_28px_rgba(34,211,238,0.18)]"
                            : ""
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="text-lg font-bold text-white">Live Contracts</div>
                              <SectionAvailabilityBadge count={liveContractsAvailableCount} />
                            </div>
                            {openInnerPanel !== "overview-contracts" ? (
                              <div className="mt-1 text-sm text-white/60">
                                {liveContractsAvailableCount > 0
                                  ? `${liveContractsAvailableCount} contract reward${liveContractsAvailableCount > 1 ? "s" : ""} ready`
                                  : "No contract rewards ready right now"}
                              </div>
                            ) : null}
                          </div>
                          <button
                            onClick={() => toggleInnerPanel("overview-contracts")}
                            className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                          >
                            {openInnerPanel === "overview-contracts" ? "CLOSE" : "OPEN"}
                          </button>
                        </div>
                        {openInnerPanel === "overview-contracts" && (
                          <div className="mt-3 grid gap-2">
                            {[...liveContracts].sort((a, b) => {
                              const aReady = a.done && !a.claimed ? 1 : 0;
                              const bReady = b.done && !b.claimed ? 1 : 0;
                              return bReady - aReady;
                            }).map((contract) => (
                              <div
                                key={contract.key}
                                className={`rounded-2xl border border-white/10 bg-black/20 p-3 ${
                                  contract.done && !contract.claimed ? highlightCard(true, "success") : ""
                                }`}
                              >
                                <div className="text-sm font-semibold text-white">{contract.title}</div>
                                <div className="mt-1 text-xs text-white/60">{contract.rewardText}</div>
                                <button
                                  onClick={() => claimContract(contract.key)}
                                  disabled={!contract.done || contract.claimed}
                                  className="mt-3 w-full rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20 disabled:opacity-40"
                                >
                                  {contract.claimed ? "Claimed" : contract.done ? "Claim" : "In Progress"}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {mobilePanel === "ops" ? (
                    <div className="space-y-3">
                      <BaseResourceBar
                        resources={state.resources}
                        energy={state.resources?.ENERGY || 0}
                        energyCap={derived.energyCap || 140}
                        bankedMleo={state.bankedMleo || 0}
                        compact
                        showBanked={false}
                      />
                      <div
                        className={`rounded-3xl border p-3.5 transition ${buildSectionCardClass(
                          operationsConsoleAvailableCount > 0
                        )}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="text-lg font-bold text-white">Operations Console</div>
                              <SectionAvailabilityBadge count={operationsConsoleAvailableCount} />
                            </div>
                            {openInnerPanel !== "ops-console" ? (
                              <div className="mt-1 text-sm text-white/60">
                                {sectionStatusHint("operations-console", {
                                  expedition: canExpeditionNow,
                                  ship: canShipNow,
                                  refill: needsRefillNow,
                                  maintain: needsMaintenanceNow,
                                })}
                              </div>
                            ) : null}
                          </div>
                          <button
                            onClick={() => toggleInnerPanel("ops-console")}
                            className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                          >
                            {openInnerPanel === "ops-console" ? "CLOSE" : "OPEN"}
                          </button>
                        </div>
                        {openInnerPanel === "ops-console" && (
                          <div className="mt-3 grid gap-3">
                            <div
                              data-base-target="shipping"
                              className={`relative rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 ${
                                highlightCard((state.bankedMleo || 0) >= 120, "success")
                              } ${
                                isHighlightedTarget("shipping", highlightTarget)
                                  ? "ring-2 ring-cyan-300/90 border-cyan-300 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(103,232,249,0.45),0_0_28px_rgba(34,211,238,0.18)]"
                                  : ""
                              }`}
                            >
                              <div className="absolute right-3 top-3 z-10">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setBuildInfo(getOperationsInfo("shipping"));
                                    setOpenInfoKey(null);
                                  }}
                                  className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[13px] font-black text-cyan-200 transition hover:bg-cyan-500/20 hover:text-white"
                                  aria-label="Open shipping info"
                                  title="Info about shipping"
                                >
                                  i
                                </button>
                              </div>
                              <div className="flex min-h-[84px] flex-col pr-8">
                                <div className="text-sm font-semibold text-emerald-200">
                                  Ship to Shared Vault
                                </div>
                                <p className="mt-1 text-sm text-white/70">
                                  Move refined MLEO into the main vault with a daily softcut, so BASE
                                  supports Miners instead of replacing it.
                                </p>
                              </div>

                              <button
                                onClick={bankToSharedVault}
                                disabled={!canShipNow}
                                className={`mt-4 w-full rounded-2xl px-4 py-3.5 text-sm font-extrabold transition ${
                                  canShipNow
                                    ? "bg-emerald-600 text-white hover:bg-emerald-500"
                                    : "bg-white/10 text-white/45"
                                }`}
                              >
                                Ship {fmt(state.bankedMleo || 0)} MLEO
                              </button>
                            </div>

                            {showExpeditions ? (
                            <div
                              data-base-target="expedition"
                              className={`relative rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4 ${
                                highlightCard(
                                  expeditionLeft <= 0 && (state.resources.DATA || 0) >= 4,
                                  "info"
                                )
                              } ${
                                isHighlightedTarget("expedition", highlightTarget)
                                  ? "ring-2 ring-cyan-300/90 border-cyan-300 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(103,232,249,0.45),0_0_28px_rgba(34,211,238,0.18)]"
                                  : ""
                              }`}
                            >
                              <div className="absolute right-3 top-3 z-10">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setBuildInfo(getOperationsInfo("expedition"));
                                    setOpenInfoKey(null);
                                  }}
                                  className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[13px] font-black text-cyan-200 transition hover:bg-cyan-500/20 hover:text-white"
                                  aria-label="Open expedition info"
                                  title="Info about expedition"
                                >
                                  i
                                </button>
                              </div>
                              <div className="flex min-h-[84px] flex-col pr-8">
                                <div className="text-sm font-semibold text-cyan-200">
                                  Field Expedition
                                </div>
                                <p className="mt-1 text-sm text-white/70">
                                  Potential rewards: Ore, Gold, Scrap, DATA, and sometimes banked MLEO. Typical outcome varies.
                                </p>

                                <div className="mt-3 flex flex-wrap gap-2">
                                  <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-[11px] font-bold text-cyan-200">
                                    COST: 36 ENERGY
                                  </span>
                                  <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-[11px] font-bold text-amber-200">
                                    COST: 4 DATA
                                  </span>
                                  <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-bold text-white/75">
                                    CD: 120s
                                  </span>
                                </div>
                              </div>

                              <button
                                onClick={handleLaunchExpedition}
                                disabled={!canExpeditionNow}
                                className={`mt-4 w-full rounded-2xl px-4 py-3.5 text-sm font-extrabold transition ${
                                  canExpeditionNow
                                    ? "bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                                    : "bg-white/10 text-white/45"
                                }`}
                              >
                                {expeditionLeft > 0
                                  ? `Expedition ${Math.ceil(expeditionLeft / 1000)}s`
                                  : "Launch Expedition"}
                              </button>
                            </div>
                            ) : null}

                            <div
                              data-base-target="blueprint"
                              className={`relative rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/10 p-4 ${
                                highlightCard(
                                  canAffordBlueprint(state, sharedVault, blueprintCost, blueprintDataCost),
                                  "info"
                                )
                              } ${
                                isHighlightedTarget("blueprint", highlightTarget)
                                  ? "ring-2 ring-cyan-300/90 border-cyan-300 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(103,232,249,0.45),0_0_28px_rgba(34,211,238,0.18)]"
                                  : ""
                              }`}
                            >
                              <div className="absolute right-3 top-3 z-10">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setBuildInfo(getSystemInfo("blueprint"));
                                    setOpenInfoKey(null);
                                  }}
                                  className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[13px] font-black text-cyan-200 transition hover:bg-cyan-500/20 hover:text-white"
                                  aria-label="Open blueprint info"
                                  title="Info about blueprint"
                                >
                                  i
                                </button>
                              </div>
                              <div className="flex min-h-[84px] flex-col pr-8">
                                <div className="text-sm font-semibold text-fuchsia-200">
                                  Blueprint Cache
                                </div>
                                <p className="mt-1 text-sm text-white/70">
                                  Costs {fmt(blueprintCost)} shared MLEO + {fmt(blueprintDataCost)} DATA. Raises banking
                                  efficiency and daily ship cap permanently.
                                </p>
                              </div>

                              <button
                                onClick={buyBlueprint}
                                disabled={
                                  !canAffordBlueprint(state, sharedVault, blueprintCost, blueprintDataCost)
                                }
                                className={`mt-4 w-full rounded-2xl px-4 py-3.5 text-sm font-extrabold transition ${
                                  canAffordBlueprint(state, sharedVault, blueprintCost, blueprintDataCost)
                                    ? "bg-fuchsia-600 text-white hover:bg-fuchsia-500"
                                    : "bg-white/10 text-white/45"
                                }`}
                              >
                                Buy Blueprint Lv {state.blueprintLevel + 1}
                              </button>
                            </div>

                            <div
                              data-base-target="maintenance"
                              className={`relative rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 ${
                                systemState === "critical"
                                  ? highlightCard(true, "critical")
                                  : systemState === "warning"
                                  ? highlightCard(true, "warning")
                                  : ""
                              } ${
                                isHighlightedTarget("maintenance", highlightTarget)
                                  ? "ring-2 ring-cyan-300/90 border-cyan-300 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(103,232,249,0.45),0_0_28px_rgba(34,211,238,0.18)]"
                                  : ""
                              }`}
                            >
                              <div className="absolute right-3 top-3 z-10 flex gap-1">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setBuildInfo(getOperationsInfo("refill"));
                                    setOpenInfoKey(null);
                                  }}
                                  className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[11px] font-black text-cyan-200 transition hover:bg-cyan-500/20 hover:text-white"
                                  aria-label="Open refill info"
                                  title="Info about refill"
                                >
                                  i
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setBuildInfo(getOperationsInfo("maintenance"));
                                    setOpenInfoKey(null);
                                  }}
                                  className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[13px] font-black text-cyan-200 transition hover:bg-cyan-500/20 hover:text-white"
                                  aria-label="Open maintenance info"
                                  title="Info about maintenance"
                                >
                                  i
                                </button>
                              </div>
                              <div className="flex min-h-[84px] flex-col pr-8">
                                <div className="text-sm font-semibold text-amber-200">
                                  Shared Vault Utilities
                                </div>
                                <p className="mt-1 text-sm text-white/70">
                                  Spend shared MLEO on productivity instead of pure emissions.
                                </p>

                                <div className="mt-3 flex flex-wrap gap-2">
                                  <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-[11px] font-bold text-cyan-200">
                                    OVERCLOCK: 900 + 12 DATA
                                  </span>
                                  <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-[11px] font-bold text-amber-200">
                                    REFILL: 180 + 5 DATA
                                  </span>
                                  <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-bold text-white/75">
                                    MAINTAIN: STABILITY
                                  </span>
                                </div>
                                <p className="mt-2 text-xs text-white/55">
                                  Stability: {fmt(state.stability)}%
                                </p>
                              </div>

                              <div className="mt-4 grid grid-cols-3 gap-2">
                                <button
                                  onClick={activateOverclock}
                                  className="rounded-xl bg-amber-600 px-3 py-3 text-xs font-bold text-white hover:bg-amber-500"
                                >
                                  {overclockLeft > 0
                                    ? `Overclock ${Math.ceil(overclockLeft / 1000)}s`
                                    : `Overclock ${fmt(CONFIG.overclockCost)}`}
                                </button>

                                <button
                                  onClick={refillEnergy}
                                  className="rounded-xl bg-white/10 px-3 py-3 text-xs font-bold text-white hover:bg-white/20"
                                >
                                  Refill {fmt(CONFIG.refillCost)}
                                </button>

                                <button
                                  onClick={performMaintenance}
                                  className={`rounded-xl px-3 py-3 text-xs font-bold text-white ${
                                    systemState === "critical"
                                      ? "bg-rose-600 hover:bg-rose-500"
                                      : systemState === "warning"
                                      ? "bg-amber-600 hover:bg-amber-500"
                                      : "bg-white/10 hover:bg-white/20"
                                  }`}
                                >
                                  Maintain
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      <div
                        className={`rounded-3xl border p-3.5 transition ${buildSectionCardClass(
                          dailyMissionsAvailableCount > 0
                        )}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="text-lg font-bold text-white">Daily Missions</div>
                              <SectionAvailabilityBadge count={dailyMissionsAvailableCount} />
                            </div>
                            {openInnerPanel !== "ops-missions" ? (
                              <div className="mt-1 text-sm text-white/60">
                                {sectionStatusHint("daily-missions", {
                                  count: dailyMissionsAvailableCount,
                                })}
                              </div>
                            ) : null}
                          </div>
                          <button
                            onClick={() => toggleInnerPanel("ops-missions")}
                            className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                          >
                            {openInnerPanel === "ops-missions" ? "CLOSE" : "OPEN"}
                          </button>
                        </div>
                        {openInnerPanel === "ops-missions" && (
                          <div className="mt-3">{dailyMissionsContent}</div>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {mobilePanel === "build" ? (
                    <div className="space-y-3">
                      <BaseResourceBar
                        resources={state.resources}
                        energy={state.resources?.ENERGY || 0}
                        energyCap={derived.energyCap || 140}
                        bankedMleo={state.bankedMleo || 0}
                        compact
                        showBanked={false}
                      />
                      <div
                        className={`rounded-3xl border p-3.5 transition ${buildSectionCardClass(
                          developmentAvailableCount > 0
                        )}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="text-lg font-bold text-white">Development</div>
                              <SectionAvailabilityBadge count={developmentAvailableCount} />
                            </div>
                            {openInnerPanel !== "build-development" ? (
                              <div className="mt-1 text-sm text-white/60">
                                {buildSectionHint("development", {
                                  modules: availableModulesCount,
                                  research: availableResearchCount,
                                })}
                              </div>
                            ) : null}
                          </div>
                          <button
                            onClick={() => toggleInnerPanel("build-development")}
                            className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                          >
                            {openInnerPanel === "build-development" ? "CLOSE" : "OPEN"}
                          </button>
                        </div>
                        {openInnerPanel === "build-development" && (
                          <div className="mt-3">{crewModulesResearchContent}</div>
                        )}
                      </div>

                      <div
                        className={`rounded-3xl border p-3.5 transition ${buildSectionCardClass(
                          structuresAvailableCount > 0
                        )}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="text-lg font-bold text-white">Base Structures</div>
                              <SectionAvailabilityBadge count={structuresAvailableCount} />
                            </div>
                            {openInnerPanel !== "build-structures" ? (
                              <div className="mt-1 text-sm text-white/60">
                                {buildSectionHint("structures", {
                                  structures: availableStructuresCount,
                                })}
                              </div>
                            ) : null}
                          </div>
                          <button
                            onClick={() => toggleInnerPanel("build-structures")}
                            className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                          >
                            {openInnerPanel === "build-structures" ? "CLOSE" : "OPEN"}
                          </button>
                        </div>
                        {openInnerPanel === "build-structures" && (
                          <div className="mt-3">{baseStructuresContent}</div>
                        )}
                      </div>

                      <div
                        className={`rounded-3xl border p-3.5 transition ${buildSectionCardClass(
                          supportAvailableCount > 0
                        )}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="text-lg font-bold text-white">Support Systems</div>
                              <SectionAvailabilityBadge count={supportAvailableCount} />
                            </div>
                            {openInnerPanel !== "build-support" ? (
                              <div className="mt-1 text-sm text-white/60">
                                {buildSectionHint("support", {
                                  support: availableBlueprintCount,
                                })}
                              </div>
                            ) : null}
                          </div>
                          <button
                            onClick={() => toggleInnerPanel("build-support")}
                            className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                          >
                            {openInnerPanel === "build-support" ? "CLOSE" : "OPEN"}
                          </button>
                        </div>
                        {openInnerPanel === "build-support" ? (
                          <div className="mt-3">{buildSupportSystemsContent}</div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {mobilePanel === "intel" ? (
                    <div className="space-y-3">
                      <BaseResourceBar
                        resources={state.resources}
                        energy={state.resources?.ENERGY || 0}
                        energyCap={derived.energyCap || 140}
                        bankedMleo={state.bankedMleo || 0}
                        compact
                        showBanked={false}
                      />
                      <div
                        className={`rounded-3xl border p-3.5 transition ${buildSectionCardClass(
                          intelSummaryAvailableCount > 0
                        )}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-lg font-bold text-white">Progress Summary</div>
                            {openInnerPanel !== "intel-summary" ? (
                              <div className="mt-1 text-sm text-white/60">
                                Key progress and identity data
                              </div>
                            ) : null}
                          </div>
                          <button
                            onClick={() => toggleInnerPanel("intel-summary")}
                            className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                          >
                            {openInnerPanel === "intel-summary" ? "CLOSE" : "OPEN"}
                          </button>
                        </div>
                        {openInnerPanel === "intel-summary" && (
                          <div className="mt-3">{progressSummaryContent}</div>
                        )}
                      </div>

                      <div
                        className={`rounded-3xl border p-3.5 transition ${buildSectionCardClass(
                          intelLogAvailableCount > 0
                        )}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-lg font-bold text-white">Activity Log</div>
                            {openInnerPanel !== "intel-log" ? (
                              <div className="mt-1 text-sm text-white/60">
                                Recent events and milestones
                              </div>
                            ) : null}
                          </div>
                          <button
                            onClick={() => toggleInnerPanel("intel-log")}
                            className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                          >
                            {openInnerPanel === "intel-log" ? "CLOSE" : "OPEN"}
                          </button>
                        </div>
                        {openInnerPanel === "intel-log" && (
                          <div className="mt-3">{activityLogContent}</div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {/* Mobile Menu */}
          {mobileMenuOpen ? (
            <div
              className="fixed inset-0 z-[116] bg-black/60 backdrop-blur-sm sm:hidden"
              onClick={() => setMobileMenuOpen(false)}
            >
              <div
                className="absolute right-4 top-[84px] w-[88%] max-w-sm rounded-3xl border border-white/10 bg-[#0b1526] p-4 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between">
                  <div className="text-lg font-bold text-white">Menu</div>
                  <button
                    onClick={() => setMobileMenuOpen(false)}
                    className="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20"
                  >
                    Close
                  </button>
                </div>

                <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-200">
                  MLEO ecosystem command hub
                </div>

                <div className="mt-4 space-y-3">
                  <button
                    onClick={() => {
                      setShowHowToPlay(true);
                      setMobileMenuOpen(false);
                    }}
                    className="w-full rounded-2xl border border-blue-500/25 bg-blue-500/10 px-4 py-3 text-left text-sm font-semibold text-blue-200 hover:bg-blue-500/20"
                  >
                    HOW TO PLAY
                  </button>

                  {isConnected ? (
                    <button
                      onClick={() => {
                        openAccountModal?.();
                        setMobileMenuOpen(false);
                      }}
                      className="w-full rounded-2xl bg-white/10 px-4 py-3 text-left text-sm font-semibold text-white hover:bg-white/20"
                    >
                      Wallet: {address?.slice(0, 6)}…{address?.slice(-4)}
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        openConnectModal?.();
                        setMobileMenuOpen(false);
                      }}
                      className="w-full rounded-2xl bg-rose-600 px-4 py-3 text-left text-sm font-semibold text-white hover:bg-rose-500"
                    >
                      Connect Wallet
                    </button>
                  )}

                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-white/45">Player</div>
                    <div className="mt-2 text-sm text-white/80">Commander Lv {state.commanderLevel}</div>
                    <div className="mt-1 text-xs text-white/55">{commanderPathInfo.name}</div>
                    <div className="mt-1 text-xs text-white/55">{crewRoleInfo.name}</div>
                  </div>

                  <Link
                    href="/arcade"
                    className="block w-full rounded-2xl border border-sky-500/25 bg-sky-500/10 px-4 py-3 text-left text-sm font-semibold text-sky-200 hover:bg-sky-500/20"
                  >
                    Open Arcade
                  </Link>

                  <Link
                    href="/mleo-miners"
                    className="block w-full rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-left text-sm font-semibold text-emerald-200 hover:bg-emerald-500/20"
                  >
                    Open Miners
                  </Link>

                  <button
                    onClick={handleResetGame}
                    className="w-full rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-left text-sm font-semibold text-rose-200 hover:bg-rose-500/20"
                  >
                    Reset Game
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {/* Mobile Ready Panel */}
          {showReadyPanel ? (
            <div
              className="fixed inset-0 z-[117] bg-black/60 backdrop-blur-sm"
                onClick={() => setShowReadyPanel(false)}
            >
              <div
                className="absolute inset-x-4 top-[110px] rounded-3xl border border-white/10 bg-[#0b1526] p-4 shadow-2xl lg:inset-x-auto lg:left-1/2 lg:-translate-x-1/2 lg:w-full lg:max-w-6xl lg:top-[88px] lg:bottom-[106px] lg:rounded-[30px] lg:p-5 lg:overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-lg font-bold text-white">Best next step</div>
                    <div className="mt-1 text-xs text-white/60">
                      {commandHubCount > 0 ? "Primary alert or action" : "Nothing needs attention right now."}
                    </div>
                  </div>

                  <button
                    onClick={() => setShowReadyPanel(false)}
                    className="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20"
                  >
                    Close
                  </button>
                </div>

                <div
                  data-base-target="alerts"
                  className={`mt-4 space-y-3 ${
                    isHighlightedTarget("alerts", highlightTarget)
                      ? "rounded-3xl ring-2 ring-cyan-300/90 border-cyan-300 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(103,232,249,0.45),0_0_28px_rgba(34,211,238,0.18)] p-2"
                      : ""
                  }`}
                >
                  {commandHubItems.length ? (
                    <>
                      {commandHubItems.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => handleCommandHubItemClick(item)}
                          className={`block w-full rounded-2xl border p-3 text-left transition hover:bg-white/10 ${
                            item.type === "alert"
                              ? alertToneClasses(item.tone)
                              : "border-white/10 bg-black/20"
                          } ${
                            isHighlightedTarget(
                              getAlertNavigationTarget(item)?.target,
                              highlightTarget
                            )
                              ? "ring-2 ring-cyan-300/90 border-cyan-300 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(103,232,249,0.45),0_0_28px_rgba(34,211,238,0.18)]"
                              : ""
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-white">{item.title}</div>
                              <div className="mt-1 text-xs text-white/65">{item.text}</div>
                            </div>

                            <div className="shrink-0 flex items-center gap-2">
                              {item.count > 0 ? (
                                <span className="inline-flex min-w-[22px] items-center justify-center rounded-full bg-cyan-400 px-1.5 py-0.5 text-[10px] font-bold text-black">
                                  {item.count}
                                </span>
                              ) : null}
                              <span className="text-cyan-300 text-lg font-bold">›</span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </>
                  ) : (
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
                      Nothing needs attention right now.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {false && (
            <>
              {/* Desktop - Next Recommended Step & Live Event */}
              <div
                className={`mt-4 hidden rounded-3xl border p-4 sm:block ${
                  systemState === "critical"
                    ? "border-rose-500/25 bg-rose-500/10"
                    : systemState === "warning"
                    ? "border-amber-500/25 bg-amber-500/10"
                    : "border-cyan-500/20 bg-cyan-500/10"
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-cyan-200/80">
                      Next Recommended Step
                    </div>
                    <div className="mt-1 text-lg font-bold text-white">{nextStep.title}</div>
                    <div className="mt-1 text-sm text-white/70">{nextStep.text}</div>
                  </div>
                  <div className="rounded-2xl bg-black/20 px-4 py-3 text-sm text-white/75">
                    <div>Commander Lv {state.commanderLevel}</div>
                    <div className="mt-1 text-xs text-white/55">{commanderPathInfo.name}</div>
                  </div>
                </div>
              </div>

              {activeEvent || nextShipBonus > 0 ? (
                <div className="relative mt-4 hidden rounded-3xl border border-white/10 bg-white/5 p-4 sm:block">
                  {activeEvent ? (
                    <div className="absolute right-3 top-3 z-10">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setBuildInfo(getEventInfo(activeEvent));
                          setOpenInfoKey(null);
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[13px] font-black text-cyan-200 transition hover:bg-cyan-500/20 hover:text-white"
                        aria-label={`Open info for ${activeEvent.title}`}
                        title={`Info about ${activeEvent.title}`}
                      >
                        i
                      </button>
                    </div>
                  ) : null}
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className={activeEvent ? "pr-8" : ""}>
                      <div className="text-xs uppercase tracking-[0.18em] text-cyan-200/80">
                        Live Command Event
                      </div>
                      <div className="mt-1 text-lg font-bold text-white">
                        {activeEvent ? activeEvent.title : "Logistics boost active"}
                      </div>
                      <div className="mt-1 text-sm text-white/70">
                        {activeEvent
                          ? activeEvent.text
                          : "A previous command decision improved your next vault shipment."}
                      </div>
                    </div>

                    {nextShipBonus > 0 ? (
                      <div className="rounded-2xl bg-emerald-500/15 px-4 py-3 text-sm text-emerald-200">
                        Next ship bonus: +{Math.round(nextShipBonus * 100)}%
                      </div>
                    ) : null}
                  </div>

                  {activeEvent ? (
                    <div className="mt-4 grid gap-2 md:grid-cols-3">
                      {activeEvent.choices.map((choice) => {
                        const allowed = canApplyEventChoice(state, choice, derived);
                        return (
                          <button
                            key={choice.key}
                            onClick={() => resolveLiveEventChoice(choice)}
                            disabled={!allowed}
                            className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-left text-sm font-semibold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <div>{choice.label}</div>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-4 hidden xl:grid xl:grid-cols-4 gap-3">
                <div className="relative rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="absolute right-3 top-3 z-10">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setBuildInfo(getCrewInfo(crewRoleInfo));
                        setOpenInfoKey(null);
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[13px] font-black text-cyan-200 transition hover:bg-cyan-500/20 hover:text-white"
                      aria-label={`Open info for ${crewRoleInfo.name}`}
                      title={`Info about ${crewRoleInfo.name}`}
                    >
                      i
                    </button>
                  </div>
                  <div className="pr-8">
                    <div className="text-xs uppercase tracking-[0.18em] text-white/45">Crew Role</div>
                    <div className="mt-1 text-lg font-bold text-white">{crewRoleInfo.name}</div>
                    <div className="mt-1 text-xs text-white/60">{roleBonusText}</div>
                  </div>
                </div>

                <div className="relative rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="absolute right-3 top-3 z-10">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setBuildInfo(getCommanderPathInfo(commanderPathInfo));
                        setOpenInfoKey(null);
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[13px] font-black text-cyan-200 transition hover:bg-cyan-500/20 hover:text-white"
                      aria-label={`Open info for ${commanderPathInfo.name}`}
                      title={`Info about ${commanderPathInfo.name}`}
                    >
                      i
                    </button>
                  </div>
                  <div className="pr-8">
                    <div className="text-xs uppercase tracking-[0.18em] text-white/45">Commander Path</div>
                    <div className="mt-1 text-lg font-bold text-white">{commanderPathInfo.name}</div>
                    <div className="mt-1 text-xs text-white/60">{commanderPathText}</div>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-white/45">Base Profile</div>
                  <div className="mt-1 text-lg font-bold text-white">
                    {state.crew >= 5 ? "Developed Command" : state.crew >= 2 ? "Growing Outpost" : "Early Outpost"}
                  </div>
                  <div className="mt-1 text-xs text-white/60">Identity shaped by buildings, role and path.</div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-white/45">Ship Discipline</div>
                  <div className="mt-1 text-lg font-bold text-white">
                    {fmt(state.sentToday)} / {fmt(derived.shipCap)}
                  </div>
                  <div className="mt-1 text-xs text-white/60">Softcut and cap remain active.</div>
                </div>
              </div>

              {/* Desktop - Flow Map */}
              <div className="hidden xl:block">
                <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-4">
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs uppercase tracking-[0.18em] text-white/55">
                        Command Flow Map
                      </div>
                      <div className="mt-1 text-lg font-bold text-white">
                        Live Base Network
                      </div>
                    <div className="mt-1 text-sm text-white/65">
                        Click any active building to jump straight into its existing build window.
                    </div>
                  </div>

                    <button
                      type="button"
                      onClick={() => openDesktopPanel("build")}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
                    >
                      Build
                    </button>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
                    <div className="space-y-3">
                      <div
                        className={`rounded-2xl border px-3.5 py-3 ${getBaseFlowSummaryClass(
                          baseFlowSummary.tone
                        )}`}
                      >
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-75">
                          Base Status
                            </div>
                        <div className="mt-1 text-sm font-semibold">{baseFlowSummary.title}</div>
                        <div className="mt-1 text-xs opacity-80">{baseFlowSummary.text}</div>
                          </div>

                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => openHomeFlowTarget("maintenance")}
                          className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center text-[11px] font-semibold text-white/85 hover:bg-white/[0.08]"
                        >
                          Maintenance
                        </button>

                        <button
                          type="button"
                          onClick={() => openHomeFlowTarget("research-center")}
                          className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center text-[11px] font-semibold text-white/85 hover:bg-white/[0.08]"
                        >
                          Research
                        </button>

                        <button
                          type="button"
                          onClick={() => openHomeFlowTarget("shipping")}
                          className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center text-[11px] font-semibold text-white/85 hover:bg-white/[0.08]"
                        >
                          Shipping
                        </button>
                          </div>

                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <div className="text-[10px] uppercase tracking-[0.16em] text-white/45">
                          Visible rule
                        </div>
                          <div className="mt-2 text-xs text-white/70">
                          Only buildings the player already built are shown on the map.
                          </div>
                        </div>
                    </div>

                    <BaseHomeFlowScene
                      base={state}
                      derived={derived}
                      selected={highlightTarget}
                      onSelect={openHomeFlowTarget}
                    />
                  </div>
                </div>
              </div>

              {/* Desktop - Live Contracts */}
              <div className="hidden xl:block">
                <div
                  data-base-target="contracts"
                  className={`mt-4 rounded-3xl border border-white/10 bg-white/5 p-4 ${
                    isHighlightedTarget("contracts", highlightTarget)
                      ? "ring-2 ring-cyan-300/90 border-cyan-300 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(103,232,249,0.45),0_0_28px_rgba(34,211,238,0.18)]"
                      : ""
                  }`}
                >
                  <div className="mb-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-white/55">Live Contracts</div>
                    <div className="mt-1 text-lg font-bold text-white">Command Objectives</div>
                    <div className="mt-1 text-sm text-white/65">
                      Short support contracts that reward healthy base behavior without turning BASE into an aggressive faucet.
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {liveContracts.map((contract) => (
                      <div
                        key={contract.key}
                        className={`relative flex min-h-[180px] flex-col rounded-2xl border border-white/10 bg-black/20 p-4 ${
                          contract.done && !contract.claimed ? highlightCard(true, "success") : ""
                        }`}
                      >
                        <div className="absolute right-3 top-3 z-10">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setBuildInfo(getContractInfo(contract));
                              setOpenInfoKey(null);
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[13px] font-black text-cyan-200 transition hover:bg-cyan-500/20 hover:text-white"
                            aria-label={`Open info for ${contract.title}`}
                            title={`Info about ${contract.title}`}
                          >
                            i
                          </button>
                        </div>
                        <div className="pr-8">
                          <div className="text-sm font-semibold text-white">{contract.title}</div>
                          <div className="mt-1 text-xs text-white/60">{contract.desc}</div>
                        </div>

                        <div className="mt-auto">
                          <div className="mb-3 text-xs text-cyan-200/80">{contract.rewardText}</div>
                          <button
                            onClick={() => claimContract(contract.key)}
                            disabled={!contract.done || contract.claimed}
                            className="w-full rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {contract.claimed ? "Claimed" : contract.done ? "Claim Contract" : "In Progress"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Desktop - Operations + Missions */}
              <div className="mt-4 hidden xl:grid xl:grid-cols-[1fr_0.92fr] gap-4">
                <Section
                  title="Operations Console"
                  subtitle={`Ship cap today: ${fmt(state.sentToday)} / ${fmt(derived.shipCap)} MLEO. Utilities and exports keep BASE productive without becoming an uncontrolled faucet.`}
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    <div
                      data-base-target="shipping"
                      className={`relative flex h-full flex-col gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 ${
                        highlightCard((state.bankedMleo || 0) >= 120, "success")
                      } ${
                        isHighlightedTarget("shipping", highlightTarget)
                          ? "ring-2 ring-cyan-300/90 border-cyan-300 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(103,232,249,0.45),0_0_28px_rgba(34,211,238,0.18)]"
                          : ""
                      }`}
                    >
                      <div className="absolute right-3 top-3 z-10">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setBuildInfo(getOperationsInfo("shipping"));
                            setOpenInfoKey(null);
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[13px] font-black text-cyan-200 transition hover:bg-cyan-500/20 hover:text-white"
                          aria-label="Open shipping info"
                          title="Info about shipping"
                        >
                          i
                        </button>
                      </div>
                      <div className="flex min-h-[88px] flex-col pr-8">
                        <div className="text-sm font-semibold text-emerald-200">Ship to Shared Vault</div>
                        <p className="mt-1 text-sm text-white/70">
                          Move refined MLEO into the main vault with a daily softcut, so BASE supports Miners instead of replacing it.
                        </p>
                      </div>
                      <button
                        onClick={bankToSharedVault}
                        className="mt-auto w-full rounded-2xl bg-emerald-600 px-4 py-3.5 text-sm font-extrabold shadow-lg shadow-emerald-900/30 transition hover:bg-emerald-500"
                      >
                        Ship {fmt(state.bankedMleo)} MLEO
                      </button>
                    </div>

                    {showExpeditions ? (
                    <div
                      data-base-target="expedition"
                      className={`relative flex h-full flex-col gap-3 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4 ${
                        highlightCard(expeditionLeft <= 0 && (state.resources.DATA || 0) >= 4, "info")
                      } ${
                        isHighlightedTarget("expedition", highlightTarget)
                          ? "ring-2 ring-cyan-300/90 border-cyan-300 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(103,232,249,0.45),0_0_28px_rgba(34,211,238,0.18)]"
                          : ""
                      }`}
                    >
                      <div className="absolute right-3 top-3 z-10">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setBuildInfo(getOperationsInfo("expedition"));
                            setOpenInfoKey(null);
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[13px] font-black text-cyan-200 transition hover:bg-cyan-500/20 hover:text-white"
                          aria-label="Open expedition info"
                          title="Info about expedition"
                        >
                          i
                        </button>
                      </div>
                      <div className="flex min-h-[88px] flex-col pr-8">
                        <div className="text-sm font-semibold text-cyan-200">Field Expedition</div>
                        <p className="mt-1 text-sm text-white/70">
                          Potential rewards: Ore, Gold, Scrap, DATA, and sometimes banked MLEO. Typical outcome varies.
                        </p>

                        <div className="mt-3 grid grid-cols-3 gap-2">
                          {["balanced", "scan", "salvage"].map((mode) => (
                            <button
                              key={mode}
                              onClick={() => setExpeditionMode(mode)}
                              className={`rounded-xl px-3 py-2 text-xs font-bold transition ${
                                expeditionMode === mode
                                  ? "bg-cyan-500 text-white"
                                  : "bg-white/10 text-white/75 hover:bg-white/20"
                              }`}
                            >
                              {mode.toUpperCase()}
                            </button>
                          ))}
                      </div>

                        <div className="mt-2 text-xs text-white/55">
                          Current mode: {expeditionMode.toUpperCase()}
                        </div>
                      </div>

                      <button
                        onClick={handleLaunchExpedition}
                        disabled={!canExpeditionNow}
                        className="mt-auto w-full rounded-2xl bg-cyan-600 px-4 py-3.5 text-sm font-extrabold shadow-lg shadow-cyan-900/30 transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {expeditionLeft > 0 ? `Ready in ${Math.ceil(expeditionLeft / 1000)}s` : "Launch Expedition"}
                      </button>
                    </div>
                    ) : null}

                    <div className="relative flex h-full flex-col gap-3 rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/10 p-4">
                      <div className="absolute right-3 top-3 z-10">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setBuildInfo(getSystemInfo("blueprint"));
                            setOpenInfoKey(null);
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[13px] font-black text-cyan-200 transition hover:bg-cyan-500/20 hover:text-white"
                          aria-label="Open blueprint info"
                          title="Info about blueprint"
                        >
                          i
                        </button>
                      </div>
                      <div className="flex min-h-[88px] flex-col pr-8">
                        <div className="text-sm font-semibold text-fuchsia-200">Blueprint Cache</div>
                        <p className="mt-1 text-sm text-white/70">
                          Costs {fmt(blueprintCost)} shared MLEO + {fmt(blueprintDataCost)} DATA. Raises banking efficiency and daily ship cap permanently.
                        </p>
                      </div>
                      <button
                        onClick={buyBlueprint}
                        disabled={!canAffordBlueprint(state, sharedVault, blueprintCost, blueprintDataCost)}
                        className={`mt-auto w-full rounded-xl px-4 py-3 text-sm font-bold transition ${
                          canAffordBlueprint(state, sharedVault, blueprintCost, blueprintDataCost)
                            ? "bg-fuchsia-600 hover:bg-fuchsia-500"
                            : "bg-white/10 text-white/45"
                        }`}
                      >
                        Buy Blueprint Lv {state.blueprintLevel + 1}
                      </button>
                    </div>

                    <div
                      data-base-target="maintenance"
                      className={`relative flex h-full flex-col gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 ${
                        systemState === "critical"
                          ? highlightCard(true, "critical")
                          : systemState === "warning"
                          ? highlightCard(true, "warning")
                          : ""
                      } ${
                        isHighlightedTarget("maintenance", highlightTarget)
                          ? "ring-2 ring-cyan-300/90 border-cyan-300 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(103,232,249,0.45),0_0_28px_rgba(34,211,238,0.18)]"
                          : ""
                      }`}
                    >
                      <div className="absolute right-3 top-3 z-10 flex gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setBuildInfo(getOperationsInfo("refill"));
                            setOpenInfoKey(null);
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[11px] font-black text-cyan-200 transition hover:bg-cyan-500/20 hover:text-white"
                          aria-label="Open refill info"
                          title="Info about refill"
                        >
                          i
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setBuildInfo(getOperationsInfo("maintenance"));
                            setOpenInfoKey(null);
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[13px] font-black text-cyan-200 transition hover:bg-cyan-500/20 hover:text-white"
                          aria-label="Open maintenance info"
                          title="Info about maintenance"
                        >
                          i
                        </button>
                      </div>
                      <div className="flex min-h-[88px] flex-col pr-8">
                        <div className="text-sm font-semibold text-amber-200">Shared Vault Utilities</div>
                        <p className="mt-1 text-sm text-white/70">
                          Spend shared MLEO on productivity instead of pure emissions.
                        </p>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-[11px] font-bold text-cyan-200">
                            OVERCLOCK: 900 + 12 DATA
                          </span>
                          <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-[11px] font-bold text-amber-200">
                            REFILL: 180 + 5 DATA
                          </span>
                          <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-bold text-white/75">
                            MAINTAIN: STABILITY
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-white/55">
                          Stability: {fmt(state.stability)}%
                        </p>
                      </div>

                      <div className="mt-auto grid grid-cols-3 gap-2 pt-1">
                        <button onClick={activateOverclock} className="rounded-xl bg-amber-600 px-3 py-3 text-sm font-bold hover:bg-amber-500">
                          {overclockLeft > 0 ? `Overclock ${Math.ceil(overclockLeft / 1000)}s` : `Overclock ${fmt(CONFIG.overclockCost)}`}
                        </button>
                        <button onClick={refillEnergy} className="rounded-xl bg-white/10 px-3 py-3 text-sm font-bold hover:bg-white/20">
                          Refill {fmt(CONFIG.refillCost)}
                        </button>
                        <button
                          onClick={performMaintenance}
                          className={`rounded-xl px-3 py-3 text-sm font-bold ${
                            systemState === "critical"
                              ? "bg-rose-600 hover:bg-rose-500"
                              : systemState === "warning"
                              ? "bg-amber-600 hover:bg-amber-500"
                              : "bg-white/10 hover:bg-white/20"
                          }`}
                        >
                          Maintain
                        </button>
                      </div>
                    </div>
                  </div>
                </Section>

                <div
                  data-base-target="missions"
                  className={`${
                    isHighlightedTarget("missions", highlightTarget)
                      ? "rounded-3xl ring-2 ring-amber-300/90 border-amber-300 bg-amber-400/10 shadow-[0_0_0_1px_rgba(252,211,77,0.45),0_0_28px_rgba(245,158,11,0.18)]"
                      : ""
                  }`}
                >
                  <Section
                    title="Daily Missions"
                    subtitle="Daily goals give players direction without turning BASE into an aggressive faucet."
                  >
                    {dailyMissionsContent}
                  </Section>
                </div>
              </div>

              {/* Desktop - Development + Base Structures */}
              <div className="mt-4 hidden xl:grid xl:grid-cols-[1fr_1fr] gap-4">
                  <Section
                    title="Crew, Modules & Research"
                  subtitle="Shape your long-term command identity through crew, modules and research."
                  >
                    {crewModulesResearchContent}
                  </Section>

                  <Section
                    title="Base Structures"
                  subtitle="Upgrade structures, unlock stronger systems and shape your command base."
                  >
                    {baseStructuresContent}
                  </Section>
              </div>

              {/* Desktop - Progress + Log */}
              <div className="mt-4 hidden xl:grid xl:grid-cols-[1fr_0.85fr] gap-4">
                  <Section
                    title="Progress Summary"
                  subtitle="BASE should feel like a live control room with sectors, contracts, identity and operational pressure."
                  >
                    {progressSummaryContent}
                  </Section>

                <Section title="Activity Log" subtitle="Recent system activity.">
                    {activityLogContent}
                  </Section>
              </div>
            </>
          )}
        </div>

        {toast ? (
          <div className="fixed left-1/2 top-20 z-[120] -translate-x-1/2 rounded-2xl border border-emerald-400/30 bg-emerald-500/20 px-5 py-3 text-sm font-semibold text-white shadow-2xl backdrop-blur">
            {toast}
          </div>
        ) : null}

        {showHowToPlay ? (
          <div
            className="fixed inset-0 z-[130] flex items-center justify-center bg-black/80 p-4"
            onClick={() => setShowHowToPlay(false)}
          >
            <div
              className="w-full max-w-4xl max-h-[88vh] overflow-auto rounded-3xl border border-white/10 bg-[#0d1626] p-4 text-white shadow-2xl sm:p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black sm:text-3xl">How to Play - MLEO BASE</h2>
                  <p className="mt-2 text-sm text-white/65">
                    Build infrastructure, manage stability, refine resources, and support the shared MLEO vault with controlled strategy.
                  </p>
                </div>
                <button
                  onClick={() => setShowHowToPlay(false)}
                  className="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20"
                >
                  Close
                </button>
              </div>

              <div className="mt-6 space-y-6 text-sm leading-7 text-white/80">
                <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4">
                  <p>
                    <strong className="text-white">MLEO BASE</strong> is the strategic command center of the MLEO ecosystem.
                    It is built around planning, progression, sector control, contracts, stability management and measured support
                    of the shared MLEO vault.
                  </p>
                  <p className="mt-3">
                    Your job is to run a live command room: build infrastructure, manage system pressure, refine resources,
                    respond to alerts, complete support contracts and decide when shipping is actually smart.
                  </p>
                </div>

                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                  <h3 className="text-base font-bold text-white">Quick Start</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-white/80">
                    <li>Build Trade Hub first to start Gold flow</li>
                    <li>Then unlock Salvage Yard for Scrap</li>
                    <li>Build Power Cell to reduce energy pressure</li>
                    <li>Your first Refinery opens the road to Banked MLEO</li>
                  </ul>
                </div>

                <section>
                  <h3 className="text-lg font-bold text-white">1. What is MLEO BASE?</h3>
                  <p className="mt-2">
                    MLEO BASE is a support-management and progression game inside the MLEO ecosystem.
                  </p>
                  <p className="mt-2">Instead of fast arcade reactions, BASE focuses on:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li>building and upgrading structures</li>
                    <li>managing energy and stability</li>
                    <li>producing and refining resources</li>
                    <li>launching expeditions</li>
                    <li>completing missions</li>
                    <li>supporting Miners and Arcade through long-term infrastructure</li>
                    <li>growing the shared vault in a controlled way</li>
                  </ul>
                  <p className="mt-2">
                    BASE is designed to work <strong className="text-white">with Miners and Arcade</strong>, not replace them.
                  </p>
                </section>

                <section>
                  <h3 className="text-lg font-bold text-white">2. Your Main Goal</h3>
                  <p className="mt-2">
                    Your objective is to turn a small outpost into a strong and efficient MLEO command base.
                  </p>
                  <p className="mt-2">You do this by:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li>gathering core resources</li>
                    <li>keeping energy healthy</li>
                    <li>maintaining base stability</li>
                    <li>unlocking better systems</li>
                    <li>refining resources into banked MLEO</li>
                    <li>deciding when to reinvest and when to ship</li>
                  </ul>
                  <p className="mt-2">
                    Success in BASE is not about rushing. It is about building a system that stays efficient over time.
                  </p>
                </section>

                <section>
                  <h3 className="text-lg font-bold text-white">3. Core Resources</h3>
                  <p className="mt-2">Your base runs on multiple resources, and each one has a different role:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li><strong className="text-white">ORE</strong> - core industrial material</li>
                    <li><strong className="text-white">GOLD</strong> - premium construction and upgrade resource</li>
                    <li><strong className="text-white">SCRAP</strong> - support material used for systems and maintenance</li>
                    <li><strong className="text-white">DATA</strong> - strategic resource for advanced operations</li>
                    <li><strong className="text-white">ENERGY</strong> - the power that keeps your base active</li>
                    <li><strong className="text-white">Banked MLEO</strong> - refined MLEO still stored inside BASE</li>
                  </ul>
                  <p className="mt-2">
                    A healthy base is built on balance. If you ignore one layer, your long-term growth becomes weaker.
                  </p>
                </section>

                <section>
                  <h3 className="text-lg font-bold text-white">4. Energy and Stability</h3>
                  <p className="mt-2">
                    Energy controls how much your base can do. Stability controls how well your base performs.
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li>Low energy slows production and activity</li>
                    <li>Low stability reduces efficiency across the base</li>
                    <li>Maintenance helps restore strong performance</li>
                  </ul>
                  <p className="mt-2">
                    If you want strong long-term output, do not ignore upkeep. A stable base always performs better than an overloaded base.
                  </p>
                </section>

                <section>
                  <h3 className="text-lg font-bold text-white">5. Buildings and Progression</h3>
                  <p className="mt-2">
                    Buildings are the heart of BASE progression. Different structures improve different parts of your economy.
                  </p>
                  <p className="mt-2">Examples of what buildings help with:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li>resource production</li>
                    <li>energy support</li>
                    <li>refining</li>
                    <li>expedition power</li>
                    <li>research and DATA output</li>
                    <li>maintenance and recovery</li>
                    <li>shipping quality and control</li>
                  </ul>
                  <p className="mt-2">
                    Upgrading buildings is one of the main ways to shape your long-term strategy.
                  </p>
                </section>

                <section>
                  <h3 className="text-lg font-bold text-white">6. What DATA Does</h3>
                  <p className="mt-2">
                    <strong className="text-white">DATA</strong> is a strategic control resource.
                  </p>
                  <p className="mt-2">It is used to support advanced actions such as:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li>blueprint progression</li>
                    <li>overclock activation</li>
                    <li>energy refill support</li>
                    <li>expedition launches</li>
                    <li>advanced research paths</li>
                    <li>maintenance-related systems</li>
                  </ul>
                  <p className="mt-2">
                    DATA is important because it adds depth without simply printing more MLEO.
                  </p>
                </section>

                <section>
                  <h3 className="text-lg font-bold text-white">7. Refinery and Banked MLEO</h3>
                  <p className="mt-2">
                    The Refinery converts raw resources into <strong className="text-white">banked MLEO</strong>.
                  </p>
                  <p className="mt-2">
                    Banked MLEO is still inside BASE. It is not the same as shared vault MLEO.
                  </p>
                  <p className="mt-2">That means the loop is:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li>produce resources</li>
                    <li>refine into banked MLEO</li>
                    <li>decide whether to reinvest or ship part of it</li>
                  </ul>
                  <p className="mt-2">
                    This makes BASE a controlled system, not an unlimited faucet.
                  </p>
                </section>

                <section>
                  <h3 className="text-lg font-bold text-white">8. Shipping to the Shared Vault</h3>
                  <p className="mt-2">
                    Shipping moves part of your banked MLEO into the <strong className="text-white">shared vault</strong>.
                  </p>
                  <p className="mt-2">Why it matters:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li>it connects BASE to the wider MLEO ecosystem</li>
                    <li>it supports your shared balance used across the platform</li>
                    <li>it keeps BASE tied to long-term ecosystem utility</li>
                  </ul>
                  <p className="mt-2">
                    Shipping is controlled by a <strong className="text-white">daily cap and softcut system</strong>.
                    This means big exports become less efficient over time, so smart pacing matters.
                  </p>
                </section>

                <section>
                  <h3 className="text-lg font-bold text-white">9. Expeditions</h3>
                  <p className="mt-2">
                    Expeditions are active operations that cost energy and support progression.
                  </p>
                  <p className="mt-2">They can reward you with:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li>ORE</li>
                    <li>GOLD</li>
                    <li>SCRAP</li>
                    <li>DATA</li>
                    <li>and sometimes a small amount of banked MLEO</li>
                  </ul>
                  <p className="mt-2">
                    Expeditions are mainly a progression tool, not a primary payout system.
                  </p>
                </section>

                <section>
                  <h3 className="text-lg font-bold text-white">10. Maintenance</h3>
                  <p className="mt-2">
                    Maintenance keeps your base stable and efficient.
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li>skipping upkeep lowers overall performance</li>
                    <li>repair and maintenance improve stability</li>
                    <li>smart upkeep protects long-term production</li>
                  </ul>
                  <p className="mt-2">
                    Maintenance is not a punishment. It is part of running a serious base.
                  </p>
                </section>

                <section>
                  <h3 className="text-lg font-bold text-white">11. Commander Level</h3>
                  <p className="mt-2">
                    As you play, you earn Commander XP and increase your Commander Level.
                  </p>
                  <p className="mt-2">
                    This reflects your long-term progression inside BASE and gives the game a stronger sense of growth beyond raw token output.
                  </p>
                </section>

                <section>
                  <h3 className="text-lg font-bold text-white">12. Daily Missions</h3>
                  <p className="mt-2">
                    Daily missions guide players into healthy gameplay loops.
                  </p>
                  <p className="mt-2">Examples include:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li>upgrade a building</li>
                    <li>ship MLEO</li>
                    <li>generate DATA</li>
                    <li>run expeditions</li>
                    <li>perform maintenance</li>
                    <li>spend shared vault MLEO on utility</li>
                  </ul>
                  <p className="mt-2">
                    Missions push players toward activity, reinvestment, and smart ecosystem use.
                  </p>
                </section>

                <section>
                  <h3 className="text-lg font-bold text-white">13. Best Beginner Strategy</h3>
                  <ol className="mt-2 list-decimal space-y-1 pl-5">
                    <li>Stabilize your raw resource income first</li>
                    <li>Do not ignore energy support</li>
                    <li>Build DATA production early enough</li>
                    <li>Use expeditions for progression, not spam</li>
                    <li>Unlock refining only when your base economy is ready</li>
                    <li>Ship in measured amounts instead of rushing exports</li>
                    <li>Use maintenance to protect long-term efficiency</li>
                    <li>Reinvest part of your gains into permanent systems</li>
                  </ol>
                </section>

                <section>
                  <h3 className="text-lg font-bold text-white">14. How BASE Fits the Ecosystem</h3>
                  <p className="mt-2">
                    <strong className="text-white">Miners</strong> focuses on mining-style growth and core generation.
                  </p>
                  <p className="mt-2">
                    <strong className="text-white">Arcade</strong> focuses on fast activity, sessions, and player engagement.
                  </p>
                  <p className="mt-2">
                    <strong className="text-white">MLEO BASE</strong> is the strategic layer: infrastructure, refinement, maintenance,
                    research, missions, shipping control, and system-wide support.
                  </p>
                  <p className="mt-2">
                    Together, these three layers create a deeper and healthier ecosystem.
                  </p>
                </section>

                <section>
                  <h3 className="text-lg font-bold text-white">15. Final Advice</h3>
                  <p className="mt-2">
                    MLEO BASE rewards patience, planning, efficiency, and reinvestment.
                  </p>
                  <p className="mt-2">
                    Do not think of BASE as a fast reward tab. Think of it as the command room that helps the whole MLEO ecosystem grow in a smarter way.
                  </p>
                </section>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </Layout>
  );
}
