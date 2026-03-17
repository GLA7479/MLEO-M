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
    energyUse: 1.1,
    outputs: { ORE: 2.0 },
  },
  {
    key: "tradeHub",
    name: "Trade Hub",
    desc: "Keeps the base liquid with steady Gold income.",
    baseCost: { GOLD: 100, ORE: 30 },
    growth: 1.2,
    energyUse: 1.2,
    outputs: { GOLD: 1.0 },
    requires: [{ key: "quarry", lvl: 1 }],
  },
  {
    key: "salvage",
    name: "Salvage Yard",
    desc: "Recovers Scrap for advanced systems.",
    baseCost: { GOLD: 150, ORE: 90 },
    growth: 1.22,
    energyUse: 1.5,
    outputs: { SCRAP: 0.8 },
    requires: [{ key: "quarry", lvl: 2 }],
  },
  {
    key: "refinery",
    name: "Refinery",
    desc: "Converts Ore + Scrap into bankable MLEO.",
    baseCost: { GOLD: 280, ORE: 180, SCRAP: 35 },
    growth: 1.25,
    energyUse: 2.6,
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
    power: { cap: 30, regen: 1.1 },
    requires: [{ key: "tradeHub", lvl: 1 }],
  },
  {
    key: "minerControl",
    name: "Miner Control",
    desc: "Improves synergy with Miners and increases ore conversion quality.",
    baseCost: { GOLD: 320, ORE: 120, SCRAP: 40 },
    growth: 1.22,
    energyUse: 0.6,
    outputs: { DATA: 0.18 },
    requires: [{ key: "hq", lvl: 2 }],
  },
  {
    key: "arcadeHub",
    name: "Arcade Hub",
    desc: "Turns activity into base progression and improves mission rewards.",
    baseCost: { GOLD: 360, ORE: 90, SCRAP: 50 },
    growth: 1.24,
    energyUse: 0.8,
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
    energyUse: 0.7,
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
    energyUse: 0.8,
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
    energyUse: 0.8,
    outputs: {},
    requires: [{ key: "hq", lvl: 2 }, { key: "powerCell", lvl: 1 }],
  },
];

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
    desc: "+0.8 Energy regen and +15 Energy cap.",
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
    reward: { XP: 45, DATA: 10 },
  },
];

const CONFIG = {
  title: "MLEO BASE",
  subtitle: "Command your MLEO base, connect Miners + Arcade, and grow your shared vault.",
  startingGold: 260,
  baseEnergyCap: 140,
  baseEnergyRegen: 3.2,
  dailyShipCap: 12_000,
  expeditionCost: 36,
  expeditionCooldownMs: 120_000,
  overclockCost: 900,
  overclockDurationMs: 8 * 60 * 1000,
  refillCost: 300,
  blueprintBaseCost: 2_500,
  blueprintGrowth: 1.85,
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
  if (value < 60) return "critical";
  if (value < 85) return "warning";
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
  if (stability < 60 && ["refinery", "researchLab", "logisticsCenter"].includes(key)) return "critical";
  if (stability < 85 && ["repairBay", "powerCell", "refinery"].includes(key)) return "warning";
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

  if (energyCap > 0 && energy <= energyCap * 0.12) {
    alerts.push({
      key: "low-energy",
      tone: "warning",
      title: "Critical energy reserve",
      text: "Energy reserve is critically low. Refill now or allow systems to recover.",
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
  if (tone === "critical") return "border-rose-500/35 bg-rose-500/12 text-rose-200";
  if (tone === "warning") return "border-amber-500/35 bg-amber-500/12 text-amber-200";
  if (tone === "success") return "border-emerald-500/35 bg-emerald-500/12 text-emerald-200";
  return "border-sky-500/35 bg-sky-500/12 text-sky-200";
}

function highlightCard(condition, mode = "info") {
  if (!condition) return "";
  if (mode === "critical") return "ring-2 ring-rose-400/40 shadow-[0_0_0_1px_rgba(251,113,133,0.15)]";
  if (mode === "warning") return "ring-2 ring-amber-400/35 shadow-[0_0_0_1px_rgba(251,191,36,0.12)]";
  if (mode === "success") return "ring-2 ring-emerald-400/35 shadow-[0_0_0_1px_rgba(52,211,153,0.12)]";
  return "ring-2 ring-cyan-400/30 shadow-[0_0_0_1px_rgba(34,211,238,0.12)]";
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
  const out = {};
  for (const [key, value] of Object.entries(def.baseCost || {})) {
    out[key] = Math.ceil(value * factor);
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

function softcutFactor(used, cap) {
  if (cap <= 0) return 1;
  const ratio = used / cap;
  for (const step of DAILY_SOFTCUT) {
    if (ratio <= step.upto) return step.factor;
  }
  return 0.16;
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
    const value = await getBaseVaultBalance();
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
    lastTickAt: Date.now(),
    lastHiddenAt: 0,
    resources: {
      ORE: 45,
      GOLD: CONFIG.startingGold,
      SCRAP: 12,
      ENERGY: CONFIG.baseEnergyCap,
      DATA: 6,
    },
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

function normalizeServerState(raw, prevState = null) {
  const seed = freshState();
  const prev = prevState || null;

  if (!raw) {
    return prev ? { ...seed, ...prev } : seed;
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

  return {
    ...seed,
    ...(prev || {}),
    ...raw,

    version: Number(raw.version ?? prev?.version ?? seed.version),
    lastDay: raw.lastDay || raw.last_day || prev?.lastDay || seed.lastDay,

    lastTickAt: lastTick,
    lastHiddenAt: 0,

    resources: raw.resources || prev?.resources || seed.resources,
    buildings: raw.buildings || prev?.buildings || seed.buildings,
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
    totalSharedSpent: Number(
      raw.totalSharedSpent ?? raw.total_shared_spent ?? prev?.totalSharedSpent ?? 0
    ),

    stability: Number(raw.stability ?? prev?.stability ?? 100),
    expeditionReadyAt: expeditionReady,
    overclockUntil,

    missionState: raw.missionState || raw.mission_state || prev?.missionState || seed.missionState,
    log: raw.log || prev?.log || seed.log,
  };
}

function derive(state, now = Date.now()) {
  const powerLevel = state.buildings.powerCell || 0;
  const hqLevel = state.buildings.hq || 1;
  const minerLink = state.buildings.minerControl || 0;
  const arcadeLink = state.buildings.arcadeHub || 0;
  const researchLabLevel = state.buildings.researchLab || 0;
  const repairBayLevel = state.buildings.repairBay || 0;
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
  let bankBonus = 1 + state.blueprintLevel * 0.08;
  let maintenanceRelief = 1 + repairBayLevel * 0.08;

  if (crewRole === "engineer") {
    maintenanceRelief *= 1.06;
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
    state.blueprintLevel * 5000;

  const minersBonus = {
    offlineRetention: minerLink * 0.015,
    oreQuality: minerLink * 0.02,
  };

  const arcadeSupport = {
    missionBoost: arcadeLink * 0.015,
    retrySupport: arcadeLink * 0.005,
  };

  return {
    energyCap: CONFIG.baseEnergyCap + powerLevel * 24 + (state.research.coolant ? 15 : 0),
    energyRegen: CONFIG.baseEnergyRegen + powerLevel * 0.75 + (state.research.coolant ? 0.8 : 0),
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
  const reserveEnergy = Math.max(24, Math.floor(d.energyCap * 0.18));
  const dataBefore = next.resources.DATA || 0;

  next.resources.ENERGY = clamp(next.resources.ENERGY + d.energyRegen * dt, 0, d.energyCap);

  const runBuilding = (key, producer) => {
    const level = next.buildings[key] || 0;
    if (!level) return;
    producer(level);
  };

  runBuilding("quarry", (level) => {
    const energyNeed = 0.9 * level * dt;
    if (next.resources.ENERGY < energyNeed) return;
    next.resources.ENERGY -= energyNeed;
    next.resources.ORE += 2.0 * level * d.oreMult * effective;
  });

  runBuilding("tradeHub", (level) => {
    const energyNeed = 1.2 * level * dt;
    if (next.resources.ENERGY < energyNeed) return;
    next.resources.ENERGY -= energyNeed;
    next.resources.GOLD += 1.0 * level * d.goldMult * effective;
  });

  runBuilding("salvage", (level) => {
    const energyNeed = 1.15 * level * dt;
    if (next.resources.ENERGY < energyNeed) return;
    next.resources.ENERGY -= energyNeed;
    next.resources.SCRAP += 0.8 * level * d.scrapMult * effective;
  });

  runBuilding("minerControl", (level) => {
    const energyNeed = 0.45 * level * dt;
    if (next.resources.ENERGY - energyNeed < reserveEnergy) return;
    next.resources.ENERGY -= energyNeed;
    next.resources.DATA += 0.18 * level * d.dataMult * effective;
  });

  runBuilding("arcadeHub", (level) => {
    const energyNeed = 0.55 * level * dt;
    if (next.resources.ENERGY - energyNeed < reserveEnergy) return;
    next.resources.ENERGY -= energyNeed;
    next.resources.DATA += 0.15 * level * d.dataMult * effective;
  });

  runBuilding("researchLab", (level) => {
    const energyNeed = 0.55 * level * dt;
    if (next.resources.ENERGY - energyNeed < reserveEnergy) return;
    next.resources.ENERGY -= energyNeed;
    next.resources.DATA += 0.28 * level * d.dataMult * effective;
  });

  runBuilding("logisticsCenter", (level) => {
    const energyNeed = 0.45 * level * dt;
    if (next.resources.ENERGY - energyNeed < reserveEnergy) return;
    next.resources.ENERGY -= energyNeed;
    next.resources.DATA += 0.08 * level * d.dataMult * effective;
  });

  runBuilding("repairBay", (level) => {
    const energyNeed = 0.45 * level * dt;
    if (next.resources.ENERGY < energyNeed) return;
    next.resources.ENERGY -= energyNeed;
    next.stability = Math.min(100, (next.stability || 100) + 0.02 * level * effective);
  });

  runBuilding("refinery", (level) => {
    const energyNeed = 2.2 * level * dt;
    const oreNeed = 1.8 * level * effective;
    const scrapNeed = 0.7 * level * effective;
    if (next.resources.ENERGY - energyNeed < reserveEnergy) return;
    if (next.resources.ORE < oreNeed || next.resources.SCRAP < scrapNeed) return;
    next.resources.ENERGY -= energyNeed;
    next.resources.ORE -= oreNeed;
    next.resources.SCRAP -= scrapNeed;
    next.bankedMleo += 0.10 * level * d.mleoMult * effective;
  });

  const elapsedMinutes = dt / 60;
  const decayMultiplier = 1 / (d.maintenanceRelief || 1);
  next.maintenanceDue = (next.maintenanceDue || 0) + elapsedMinutes * 0.2 * decayMultiplier;

  if ((next.maintenanceDue || 0) >= 1) {
    const decaySteps = Math.floor(next.maintenanceDue);
    next.maintenanceDue -= decaySteps;
    next.stability = Math.max(55, (next.stability || 100) - decaySteps * 0.15);
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

  if (energyCap > 0 && energy <= energyCap * 0.12) {
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
    focus: "Refinery + shipping + logistics",
    text:
      "Shared Vault is your main MLEO balance across the ecosystem.\n\n" +
      "How to grow it:\n" +
      "• Produce banked MLEO in the Refinery.\n" +
      "• Keep Ore and Scrap production strong.\n" +
      "• Ship MLEO into the Shared Vault.\n" +
      "• Improve logistics and shipment quality.",
    tips: {
      building: "Refinery + Logistics Center",
      research: "Logistics",
      module: "Vault Compressor",
      actions: [
        "Upgrade Refinery",
        "Upgrade Logistics Center",
        "Ship regularly",
        "Keep Ore + Scrap production high",
      ],
    },
    nextStep: {
      label: "Open Logistics / Shipping",
      tab: "operations",
      target: "shipping",
      why: "Shipping is how banked MLEO reaches Shared Vault.",
    },
  },

  bankedMleo: {
    title: "Base Banked",
    focus: "Refinery + Ore + Scrap",
    text:
      "Banked MLEO is produced inside BASE by the Refinery and stays here until shipped.\n\n" +
      "How to gain more banked MLEO:\n" +
      "• Upgrade Refinery.\n" +
      "• Increase Ore production.\n" +
      "• Increase Scrap production.\n" +
      "• Keep enough Energy available.",
    tips: {
      building: "Refinery",
      research: "Routing AI",
      module: "Vault Compressor",
      actions: [
        "Upgrade Quarry",
        "Upgrade Salvage Yard",
        "Upgrade Refinery",
        "Keep Energy from stalling production",
      ],
    },
    nextStep: {
      label: "Upgrade Refinery",
      tab: "build",
      target: "refinery",
      why: "Refinery converts Ore and Scrap into banked MLEO.",
    },
  },

  commander: {
    title: "Commander Level",
    focus: "Upgrades + missions + expeditions",
    text:
      "Commander Level reflects your long-term progression in BASE.\n\n" +
      "How to level up faster:\n" +
      "• Upgrade buildings.\n" +
      "• Complete daily missions.\n" +
      "• Launch expeditions.\n" +
      "• Keep the base active and maintained.",
    tips: {
      building: "Arcade Hub",
      research: "Arcade Ops",
      module: "Arcade Relay",
      actions: [
        "Claim daily missions",
        "Launch expeditions often",
        "Keep upgrading structures",
        "Do maintenance instead of ignoring stability",
      ],
    },
    nextStep: {
      label: "Open Daily Missions",
      tab: "operations",
      target: "missions",
      why: "Missions are one of the fastest repeatable XP sources.",
    },
  },

  data: {
    title: "DATA",
    focus: "Research Lab + expeditions + daily missions",
    text:
      "DATA is your strategic progression resource.\n\n" +
      "Main ways to gain DATA:\n" +
      "• Research Lab is your strongest long-term DATA generator.\n" +
      "• Miner Control and Arcade Hub add supporting DATA income.\n" +
      "• Expeditions give burst DATA and rare findings.\n" +
      "• Daily missions help smooth early progression.",
    tips: {
      building: "Research Lab",
      research: "Deep Scan / Token Discipline",
      module: "Arcade Relay",
      actions: [
        "Upgrade Research Lab first",
        "Then scale Miner Control + Arcade Hub",
        "Run expeditions for extra DATA",
        "Complete DATA missions every day",
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
    focus: "Power Cell + Coolant Loops",
    text:
      "Energy powers the whole base.\n\n" +
      "How to get more Energy:\n" +
      "• Wait for passive regeneration.\n" +
      "• Upgrade Power Cell.\n" +
      "• Unlock energy research.\n" +
      "• Avoid draining energy on weak timing.",
    tips: {
      building: "Power Cell",
      research: "Coolant Loops",
      module: "",
      actions: [
        "Upgrade Power Cell early",
        "Unlock Coolant Loops quickly",
        "Do not overrun energy-heavy systems",
        "Recover before big pushes",
      ],
    },
    nextStep: {
      label: "Upgrade Power Cell",
      tab: "build",
      target: "powerCell",
      why: "Power Cell increases Energy cap and regeneration.",
    },
  },

  stability: {
    title: "Stability",
    focus: "Maintenance + Repair Bay + safe choices",
    text:
      "Stability shows how healthy and efficient your base is.\n\n" +
      "How to keep Stability high:\n" +
      "• Perform maintenance regularly.\n" +
      "• Upgrade Repair Bay.\n" +
      "• Choose safer event outcomes.\n" +
      "• Avoid risky pushes when the base is stressed.",
    tips: {
      building: "Repair Bay",
      research: "Predictive Maintenance",
      module: "Miner Link",
      actions: [
        "Use maintenance before Stability gets low",
        "Upgrade Repair Bay",
        "Choose safe event outcomes",
        "Avoid overpushing during weak Stability",
      ],
    },
    nextStep: {
      label: "Perform maintenance",
      tab: "operations",
      target: "maintenance",
      why: "Maintenance is the fastest direct way to recover Stability.",
    },
  },

  ore: {
    title: "ORE",
    focus: "Quarry + Energy + Miner Sync",
    text:
      "ORE is one of the main raw resources in BASE.\n\n" +
      "How to gain more ORE:\n" +
      "• Build and upgrade Quarry.\n" +
      "• Keep enough Energy available.\n" +
      "• Install ORE-focused modules.\n" +
      "• Unlock ORE-focused research.",
    tips: {
      building: "Quarry",
      research: "Miner Sync",
      module: "Servo Drill",
      actions: [
        "Upgrade Quarry steadily",
        "Keep Energy available",
        "Install Servo Drill",
        "Unlock Miner Sync early",
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
      "GOLD is the main economy resource in BASE.\n\n" +
      "How to gain more GOLD:\n" +
      "• Upgrade Trade Hub.\n" +
      "• Complete GOLD-reward daily missions.\n" +
      "• Launch expeditions.\n" +
      "• Use economy-related events.",
    tips: {
      building: "Trade Hub",
      research: "Field Ops",
      module: "",
      actions: [
        "Upgrade Trade Hub often",
        "Claim GOLD-reward missions",
        "Run expeditions consistently",
        "Keep GOLD balanced with other resources",
      ],
    },
    nextStep: {
      label: "Upgrade Trade Hub",
      tab: "build",
      target: "tradeHub",
      why: "Trade Hub is your strongest direct GOLD source.",
    },
  },

  scrap: {
    title: "SCRAP",
    focus: "Salvage Yard + expeditions",
    text:
      "SCRAP is an advanced support resource.\n\n" +
      "How to gain more SCRAP:\n" +
      "• Build and upgrade Salvage Yard.\n" +
      "• Run expeditions.\n" +
      "• Complete SCRAP-reward missions.\n" +
      "• Take salvage-related event rewards.",
    tips: {
      building: "Salvage Yard",
      research: "Deep Scan",
      module: "Miner Link",
      actions: [
        "Upgrade Salvage Yard",
        "Run expeditions often",
        "Take salvage rewards when available",
        "Keep SCRAP strong for refinery systems",
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

  // One open inner panel at a time (mobile)
  const [openInnerPanel, setOpenInnerPanel] = useState(null);
  const [structuresTab, setStructuresTab] = useState("core");

  const [desktopPanel, setDesktopPanel] = useState("ops");
  const [desktopCompact, setDesktopCompact] = useState(true);

  const [activeEvent, setActiveEvent] = useState(null);
  const [eventCooldownUntil, setEventCooldownUntil] = useState(0);
  const [nextShipBonus, setNextShipBonus] = useState(0);

  const [expeditionMode, setExpeditionMode] = useState("balanced");
  const [crewRole, setCrewRole] = useState(() => loadJson("mleo_base_profile_v1", {})?.crewRole || "engineer");
  const [commanderPath, setCommanderPath] = useState(() => loadJson("mleo_base_profile_v1", {})?.commanderPath || "industry");
  const [claimedContracts, setClaimedContracts] = useState(() => loadJson("mleo_base_claimed_contracts_v1", {}));
  const [devTab, setDevTab] = useState("crew");

  const mobilePanelScrollRef = useRef(null);

  const activeInfo = openInfoKey ? INFO_COPY[openInfoKey] : null;
  const shownInfo = activeInfo || buildInfo;

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

    const visibleCenter =
      container.clientHeight / 2;

    const nextScrollTop = Math.max(0, targetCenter - visibleCenter);

    container.scrollTo({
      top: nextScrollTop,
      behavior: "smooth",
    });

    return true;
  }

  function handleInfoNextStep() {
    const info = shownInfo;
    if (!info?.nextStep) return;

    const step = info.nextStep;

    const targetTab =
      step.tab === "operations"
        ? "ops"
        : step.tab === "build"
        ? "build"
        : step.tab === "development"
        ? "build"
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
        setDesktopPanel(targetTab);

        if (targetInnerPanel) {
          setOpenInnerPanel(targetInnerPanel);
        } else if (targetTab === "build") {
          setOpenInnerPanel("build-structures");
        }
      }
    } catch {
      // no-op
    }

    setOpenInfoKey(null);
    setBuildInfo(null);

    setTimeout(() => {
      setHighlightTarget(step.target);

      const el = document.querySelector(`[data-base-target="${step.target}"]`);
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
          saved && !shouldReset ? normalizeServerState(saved, seed) : seed;

        const localProfile = loadJson("mleo_base_profile_v1", null);
        const initialMerged = localProfile
          ? {
              ...initial,
              crewRole: localProfile.crewRole || initial.crewRole,
              commanderPath: localProfile.commanderPath || initial.commanderPath,
            }
          : initial;

        if (!alive) return;

        // Clear reset flags after state is set (if they were used)
        if (resetFlag && typeof window !== "undefined") {
          window.localStorage.removeItem("base_reset_flag");
          window.localStorage.removeItem("base_reset_version");
        }

        setMounted(true);
        setState(initialMerged);

        const bal = await readVaultSafe();
        if (alive) setSharedVault(bal);
      } catch (error) {
        console.error("BASE boot failed", error);
        if (!alive) return;
        setMounted(true);
        setState(freshState());
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
        setSharedVault(bal);
      }
    };

    const pollId = window.setInterval(async () => {
      const bal = await readVaultSafe();
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

    if (readyCounts.expedition > 0) {
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
  }, [alerts, readyCounts]);

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
  };

  const hireCrew = async () => {
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
  };

  const buyModule = async (key) => {
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
  };

  const buyResearch = async (key) => {
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
  };

  const handleLaunchExpedition = async () => {
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
  };

  const bankToSharedVault = async () => {
    try {
      const res = await shipToVault();
      
      if (!res?.success) {
        showToast(res?.message || "Nothing ready to ship yet.");
        return;
      }

      if (res?.state) {
        const serverState = res.state;
        const latestVault = await readVaultSafe();
        setSharedVault(latestVault);

        const shippedBase = Number(res.shipped || 0);
        const bonusAmount =
          nextShipBonus > 0 ? Math.floor(shippedBase * nextShipBonus) : 0;

        if (bonusAmount > 0) {
          await addToVault(bonusAmount, "mleo-base-logistics-bonus");
          const afterBonusVault = await readVaultSafe();
          setSharedVault(afterBonusVault);
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
  };

  const buyBlueprint = async () => {
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
        setSharedVault(latestVault);
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
  };

  const activateOverclock = async () => {
    if ((state.resources.DATA || 0) < 12) {
      showToast("Need 12 DATA.");
      return;
    }
    try {
      const res = await spendFromVault("overclock");
      if (res?.success && res?.state) {
        const serverState = res.state;
        const latestVault = await readVaultSafe();
        setSharedVault(latestVault);
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
  };

  const refillEnergy = async () => {
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
      const res = await spendFromVault("refill", cap);
      if (res?.success && res?.state) {
        const serverState = res.state;
        const latestVault = await readVaultSafe();
        setSharedVault(latestVault);
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
  };

  const performMaintenance = async () => {
    const cost = { GOLD: 60, SCRAP: 35, DATA: 10 };

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
  };

  const claimMission = async (missionKey) => {
    try {
      const payload = await claimBaseMission(missionKey);
      const serverState = payload?.state;

      if (!serverState) {
        throw new Error("Missing updated base state");
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
          <div key={mission.key} className={`relative rounded-xl border p-2.5 ${
            ready
              ? "border-cyan-400/40 bg-cyan-500/10"
              : "border-white/10 bg-black/20"
          }`}>
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
                <div className="mt-1 text-[11px] text-white/55">Reward: {rewardText(mission.reward)}</div>
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
                              setBuildInfo(getCrewInfo(role));
                              setOpenInfoKey(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                e.stopPropagation();
                                setBuildInfo(getCrewInfo(role));
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
                          setBuildInfo(getCommanderPathInfo(path));
                          setOpenInfoKey(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            setBuildInfo(getCommanderPathInfo(path));
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
        const ore = fmt((building.convert?.ORE || 0) * next);
        const scrap = fmt((building.convert?.SCRAP || 0) * next);
        const mleo = fmt((building.convert?.MLEO || 0) * next);
        return `Refinery level ${next} will increase conversion pressure to about ${ore} ORE and ${scrap} SCRAP, while raising banked MLEO potential to about ${mleo}.`;
      },
      why: "Refinery is the main bridge from infrastructure into banked MLEO. It should feel valuable, but still controlled — exactly what this game loop needs.",
      linked: "ORE + SCRAP conversion · banked MLEO · shipping strategy · vault support",
      impact: "A stronger Refinery increases your ability to support the shared vault, but only if the rest of your economy can feed it.",
      tips: {
        building: "Logistics Center",
        research: "Token Discipline",
        module: "Vault Compressor",
        actions: [
          "Only push Refinery hard if Ore, Scrap and energy support are already healthy.",
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
      why: "If BASE is going to support the shared vault in a controlled way, Logistics Center is a key structure. It makes shipping feel smarter, not just bigger.",
      linked: "Shipping quality · export handling · shared vault support · efficiency discipline",
      impact: "This upgrade improves late-game control and makes the path from banked MLEO to shipped value more stable and strategic.",
      tips: {
        building: "Refinery",
        research: "Logistics",
        module: "Vault Compressor",
        actions: [
          "Upgrade Logistics Center when shipping becomes a meaningful part of your economy.",
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
      why: "Research Lab is important because DATA gives depth to the economy. It helps the game scale through smarter progression instead of only more emissions.",
      linked: "DATA generation · advanced research · long-term optimization · strategy depth",
      impact: "A stronger Research Lab improves your ability to unlock advanced systems and keeps progression feeling intelligent instead of flat.",
      tips: {
        building: "Miner Control",
        research: "Deep Scan",
        module: "Arcade Relay",
        actions: [
          "Upgrade Research Lab when you want stronger long-term progression tools.",
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
      focus: "Ore production boost",
      text:
        "Servo Drill is a production module focused on Quarry efficiency.\n\n" +
        "What it does:\n" +
        "• Increases Ore output.\n" +
        "• Helps early and mid-game resource flow.\n" +
        "• Makes Refinery support easier because Ore becomes more stable.\n\n" +
        "Best use:\n" +
        "Install it when Ore is your bottleneck or when you want to prepare for stronger Refinery cycles.",
      tips: {
        building: "Quarry",
        research: "Miner Sync",
        module: "Servo Drill",
        actions: [
          "Upgrade Quarry first if Ore is still weak.",
          "Install Servo Drill when you want smoother Ore flow.",
          "Use it to support Refinery and future upgrades.",
        ],
      },
      nextStep: {
        label: "Open Quarry",
        tab: "build",
        target: "quarry",
        why: "Servo Drill is strongest when Quarry production is already active.",
      },
    },

    vaultCompressor: {
      title: "Vault Compressor",
      focus: "Bank efficiency + shipping support",
      text:
        "Vault Compressor is an economy module focused on better MLEO flow.\n\n" +
        "What it does:\n" +
        "• Improves bank efficiency.\n" +
        "• Adds support to shipment quality.\n" +
        "• Helps turn BASE progress into stronger Shared Vault results.\n\n" +
        "Best use:\n" +
        "Very good once your Refinery is active and you are shipping regularly.",
      tips: {
        building: "Refinery",
        research: "Logistics",
        module: "Vault Compressor",
        actions: [
          "Build Refinery first.",
          "Ship regularly to feel the value of this module.",
          "Pair it with Logistics research for stronger export flow.",
        ],
      },
      nextStep: {
        label: "Open Shipping",
        tab: "operations",
        target: "shipping",
        why: "This module matters most when banked MLEO is already moving into the Shared Vault.",
      },
    },

    arcadeRelay: {
      title: "Arcade Relay",
      focus: "XP + DATA support",
      text:
        "Arcade Relay is a progression module that supports missions and strategic growth.\n\n" +
        "What it does:\n" +
        "• Improves mission XP.\n" +
        "• Improves DATA gain.\n" +
        "• Helps BASE feel more connected to wider progression systems.\n\n" +
        "Best use:\n" +
        "Install it when you want faster commander growth and smarter long-term scaling.",
      tips: {
        building: "Arcade Hub",
        research: "Arcade Ops",
        module: "Arcade Relay",
        actions: [
          "Run missions consistently.",
          "Use it when commander XP matters more.",
          "Pair it with Arcade Hub and Research Lab progression.",
        ],
      },
      nextStep: {
        label: "Open Daily Missions",
        tab: "operations",
        target: "missions",
        why: "Arcade Relay is most noticeable when you actively claim mission rewards.",
      },
    },

    minerLink: {
      title: "Miner Link",
      focus: "Ore quality + refinery stability",
      text:
        "Miner Link is a synergy module between raw resource growth and safer processing.\n\n" +
        "What it does:\n" +
        "• Improves Ore output.\n" +
        "• Supports Refinery stability.\n" +
        "• Helps the whole production loop feel smoother.\n\n" +
        "Best use:\n" +
        "Great when your economy starts depending on both Quarry and Refinery at the same time.",
      tips: {
        building: "Miner Control",
        research: "Miner Sync",
        module: "Miner Link",
        actions: [
          "Use it once your base becomes more production-heavy.",
          "Excellent before bigger Refinery scaling.",
          "Best when Ore and stability both matter.",
        ],
      },
      nextStep: {
        label: "Open Miner Control",
        tab: "build",
        target: "minerControl",
        why: "Miner Link works best as part of your wider Miners synergy path.",
      },
    },

    coolant: {
      title: "Coolant Loops",
      focus: "Energy cap + regeneration",
      text:
        "Coolant Loops is one of the most useful early research upgrades in BASE.\n\n" +
        "What it does:\n" +
        "• Increases Energy regeneration.\n" +
        "• Increases Energy cap.\n" +
        "• Makes the whole base feel less stalled.\n\n" +
        "Best use:\n" +
        "Research this early if you often feel that Energy is slowing everything down.",
      tips: {
        building: "Power Cell",
        research: "Coolant Loops",
        module: "",
        actions: [
          "Take this early if Energy feels frustrating.",
          "Pair it with Power Cell upgrades.",
          "Use it before scaling multiple active systems.",
        ],
      },
      nextStep: {
        label: "Open Power Cell",
        tab: "build",
        target: "powerCell",
        why: "Power Cell and Coolant Loops are your main Energy foundation.",
      },
    },

    routing: {
      title: "Routing AI",
      focus: "Bank efficiency",
      text:
        "Routing AI improves how efficiently your BASE economy converts progress into useful output.\n\n" +
        "What it does:\n" +
        "• Improves bank efficiency.\n" +
        "• Helps economy flow feel smarter and cleaner.\n" +
        "• Unlocks stronger follow-up research paths.\n\n" +
        "Best use:\n" +
        "Strong choice once you want a more optimized economy instead of only raw production.",
      tips: {
        building: "Refinery",
        research: "Routing AI",
        module: "Vault Compressor",
        actions: [
          "Use it after stabilizing your basic production.",
          "Good before deep economy scaling.",
          "Helps unlock several stronger research branches.",
        ],
      },
      nextStep: {
        label: "Open Refinery",
        tab: "build",
        target: "refinery",
        why: "Bank efficiency becomes more meaningful once Refinery flow is active.",
      },
    },

    fieldOps: {
      title: "Field Ops",
      focus: "Crew bonus scaling",
      text:
        "Field Ops improves how effective your crew becomes over time.\n\n" +
        "What it does:\n" +
        "• Increases crew bonus value.\n" +
        "• Strengthens progression through command identity.\n" +
        "• Supports stronger mid-game scaling.\n\n" +
        "Best use:\n" +
        "Research it when crew investment is becoming part of your main plan.",
      tips: {
        building: "HQ",
        research: "Field Ops",
        module: "",
        actions: [
          "Hire crew before expecting full value.",
          "Useful once command growth matters more.",
          "Helps multiple systems at once through crew scaling.",
        ],
      },
      nextStep: {
        label: "Open HQ",
        tab: "build",
        target: "hq",
        why: "Field Ops fits best into a stronger command-centered base.",
      },
    },

    minerSync: {
      title: "Miner Sync",
      focus: "Ore output + mission support",
      text:
        "Miner Sync is a research path for better Ore momentum and stronger daily progression.\n\n" +
        "What it does:\n" +
        "• Improves Ore output.\n" +
        "• Adds support to daily mission flow.\n" +
        "• Makes the base feel more productive and active.\n\n" +
        "Best use:\n" +
        "Great when Ore demand is rising and you want better progression rhythm.",
      tips: {
        building: "Quarry",
        research: "Miner Sync",
        module: "Servo Drill",
        actions: [
          "Use it when Ore keeps running short.",
          "Excellent together with Servo Drill.",
          "Helpful before stronger Refinery expansion.",
        ],
      },
      nextStep: {
        label: "Open Quarry",
        tab: "build",
        target: "quarry",
        why: "Miner Sync is strongest when Quarry is already part of your main economy.",
      },
    },

    arcadeOps: {
      title: "Arcade Ops",
      focus: "Commander XP + expedition rewards",
      text:
        "Arcade Ops improves strategic progression and reward quality.\n\n" +
        "What it does:\n" +
        "• Increases commander XP gains.\n" +
        "• Improves expedition rewards.\n" +
        "• Supports wider ecosystem progression.\n\n" +
        "Best use:\n" +
        "Take it when you want BASE to feel more rewarding beyond raw resources.",
      tips: {
        building: "Arcade Hub",
        research: "Arcade Ops",
        module: "Arcade Relay",
        actions: [
          "Best for XP-focused progression.",
          "Use it if expeditions are part of your main routine.",
          "Strong long-term growth research.",
        ],
      },
      nextStep: {
        label: "Open Expedition",
        tab: "operations",
        target: "expedition",
        why: "Arcade Ops becomes more visible when you actively run expeditions.",
      },
    },

    logistics: {
      title: "Logistics",
      focus: "Ship efficiency",
      text:
        "Logistics is a direct shipment research upgrade.\n\n" +
        "What it does:\n" +
        "• Improves ship efficiency.\n" +
        "• Makes export flow smoother.\n" +
        "• Helps Shared Vault growth feel cleaner and more efficient.\n\n" +
        "Best use:\n" +
        "Very useful once you are shipping often and want better return from each export cycle.",
      tips: {
        building: "Logistics Center",
        research: "Logistics",
        module: "Vault Compressor",
        actions: [
          "Use it once you ship regularly.",
          "Very strong with Logistics Center upgrades.",
          "Supports long-term Shared Vault growth.",
        ],
      },
      nextStep: {
        label: "Open Logistics Center",
        tab: "build",
        target: "logisticsCenter",
        why: "This research is most valuable when your shipment system is already developed.",
      },
    },

    predictiveMaintenance: {
      title: "Predictive Maintenance",
      focus: "Slower decay + safer base",
      text:
        "Predictive Maintenance is a defensive research that protects long-term performance.\n\n" +
        "What it does:\n" +
        "• Slows maintenance decay.\n" +
        "• Improves Repair Bay value.\n" +
        "• Makes large bases easier to manage.\n\n" +
        "Best use:\n" +
        "Excellent when the base starts feeling fragile or you are juggling many active systems.",
      tips: {
        building: "Repair Bay",
        research: "Predictive Maintenance",
        module: "Miner Link",
        actions: [
          "Take it when stability starts slipping more often.",
          "Very useful for safer scaling.",
          "Great with Repair Bay upgrades.",
        ],
      },
      nextStep: {
        label: "Open Repair Bay",
        tab: "build",
        target: "repairBay",
        why: "This research has the best impact when Repair Bay is part of your setup.",
      },
    },

    deepScan: {
      title: "Deep Scan",
      focus: "More DATA + better rare findings",
      text:
        "Deep Scan is a research path for stronger strategic rewards.\n\n" +
        "What it does:\n" +
        "• Improves DATA from expeditions.\n" +
        "• Improves rare discovery quality.\n" +
        "• Strengthens advanced progression routes.\n\n" +
        "Best use:\n" +
        "Good for players who want more strategic value from expeditions instead of only basic rewards.",
      tips: {
        building: "Research Lab",
        research: "Deep Scan",
        module: "Arcade Relay",
        actions: [
          "Use it if expeditions are frequent.",
          "Very good for DATA-focused progression.",
          "Supports advanced research pacing.",
        ],
      },
      nextStep: {
        label: "Open Expedition",
        tab: "operations",
        target: "expedition",
        why: "Deep Scan is felt most clearly through active expedition loops.",
      },
    },

    tokenDiscipline: {
      title: "Token Discipline",
      focus: "Lower raw MLEO + stronger DATA + better ship quality",
      text:
        "Token Discipline is an advanced balancing research.\n\n" +
        "What it does:\n" +
        "• Reduces raw banked MLEO output.\n" +
        "• Increases DATA output.\n" +
        "• Improves shipment quality.\n\n" +
        "Best use:\n" +
        "This is for a smarter, more controlled economy. It is less about raw speed and more about healthier long-term scaling.",
      tips: {
        building: "Research Lab",
        research: "Token Discipline",
        module: "Vault Compressor",
        actions: [
          "Take it when you want strategic depth over raw output.",
          "Good for controlled long-term economy balance.",
          "Best for advanced BASE identity.",
        ],
      },
      nextStep: {
        label: "Open Research Lab",
        tab: "build",
        target: "researchLab",
        why: "Token Discipline belongs to a more advanced DATA-driven build path.",
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
      focus: "Move BASE profit into your main MLEO vault",
      text:
        "Shipping transfers banked MLEO from BASE into the Shared Vault.\n\n" +
        "What it does:\n" +
        "• Converts BASE progress into real usable vault balance.\n" +
        "• Lets BASE support the wider MLEO ecosystem.\n" +
        "• Uses a daily softcut so the system stays balanced.\n\n" +
        "Best use:\n" +
        "Ship when your banked MLEO is healthy and you want to move progress out of BASE without sitting on it too long.",
      tips: {
        building: "Logistics Center",
        research: "Logistics",
        module: "Vault Compressor",
        actions: [
          "Refinery must produce banked MLEO first.",
          "Shipping is stronger when Logistics Center is upgraded.",
          "Do not confuse banked MLEO with Shared Vault MLEO.",
        ],
      },
      nextStep: {
        label: "Open Refinery",
        tab: "build",
        target: "refinery",
        why: "Shipping becomes useful only after Refinery is feeding banked MLEO.",
      },
    },

    expedition: {
      title: "Field Expedition",
      focus: "Spend Energy to gain mixed rewards",
      text:
        "Field Expedition is a controlled action that trades Energy for resource rewards.\n\n" +
        "What it does:\n" +
        "• Consumes Energy.\n" +
        "• Can return Ore, Gold, Scrap and DATA.\n" +
        "• Only has a small chance to add banked MLEO directly.\n\n" +
        "Best use:\n" +
        "Run expeditions when Energy is healthy and you want flexible resource growth, especially Scrap and DATA support.",
      tips: {
        building: "Expedition Bay",
        research: "Arcade Ops",
        module: "Arcade Relay",
        actions: [
          "Do not waste expeditions when Energy is low.",
          "Expeditions are better for mixed utility than direct MLEO farming.",
          "Use them to support missions, DATA flow and resource recovery.",
        ],
      },
      nextStep: {
        label: "Open Expedition Bay",
        tab: "build",
        target: "expeditionBay",
        why: "Expedition Bay improves this action and makes expedition play more valuable.",
      },
    },

    refill: {
      title: "Emergency Refill",
      focus: "Buy back Energy when your base is stalled",
      text:
        "Emergency Refill restores Energy by spending Gold.\n\n" +
        "What it does:\n" +
        "• Gives immediate Energy back.\n" +
        "• Helps restart production or action loops.\n" +
        "• Costs Gold, so it is a recovery tool and not something to spam.\n\n" +
        "Best use:\n" +
        "Use it when Energy is your bottleneck and the refill helps you unlock better actions than the Gold you spend.",
      tips: {
        building: "Power Cell",
        research: "Coolant Loops",
        module: "",
        actions: [
          "Prefer better Energy scaling before relying on refill too often.",
          "Use refill to recover tempo, not as your default Energy economy.",
          "Power Cell + Coolant Loops reduce how often you need it.",
        ],
      },
      nextStep: {
        label: "Open Power Cell",
        tab: "build",
        target: "powerCell",
        why: "Power Cell is the long-term solution when refill is needed too often.",
      },
    },

    maintenance: {
      title: "Maintenance Cycle",
      focus: "Protect base stability and avoid system pressure",
      text:
        "Maintenance keeps your BASE stable and prevents performance problems.\n\n" +
        "What it does:\n" +
        "• Restores or protects stability.\n" +
        "• Helps prevent warning or critical states.\n" +
        "• Makes larger bases safer to run.\n\n" +
        "Best use:\n" +
        "Use maintenance before stability drops too far. It is much better as prevention than as a late emergency fix.",
      tips: {
        building: "Repair Bay",
        research: "Predictive Maintenance",
        module: "Miner Link",
        actions: [
          "Do not wait for critical state before maintaining.",
          "Refinery and active systems make stability more important.",
          "Repair Bay and maintenance research make this much stronger.",
        ],
      },
      nextStep: {
        label: "Open Repair Bay",
        tab: "build",
        target: "repairBay",
        why: "Repair Bay is the structure that best supports stable long-term base growth.",
      },
    },
  };

  const MISSION_INFO_COPY = {
    upgrade_building: {
      title: "Mission: Upgrade 1 building",
      focus: "Progress the base by improving any structure",
      text:
        "This mission completes when you upgrade any building by one level.\n\n" +
        "Good ways to finish it:\n" +
        "• Upgrade cheap early structures.\n" +
        "• Use it together with your current bottleneck.\n" +
        "• Do not force an expensive upgrade only for the mission if it slows your economy.",
      tips: {
        building: "HQ",
        research: "",
        module: "",
        actions: [
          "Cheap structures are often the fastest mission completion.",
          "Use this mission to push real progression, not random spending.",
          "Good early options are Quarry, Trade Hub or Power Cell.",
        ],
      },
      nextStep: {
        label: "Open Structures",
        tab: "build",
        target: "hq",
        why: "Any structure upgrade can complete this mission.",
      },
    },

    run_expedition: {
      title: "Mission: Complete 1 expedition",
      focus: "Use Operations to gain mixed rewards",
      text:
        "This mission completes after launching and resolving one expedition.\n\n" +
        "Good for:\n" +
        "• Scrap and DATA support.\n" +
        "• Flexible progression.\n" +
        "• Combining mission progress with resource gain.",
      tips: {
        building: "Expedition Bay",
        research: "Arcade Ops",
        module: "Arcade Relay",
        actions: [
          "Make sure Energy is high enough first.",
          "This mission is usually efficient because it also gives useful loot.",
          "Very good when you also need Scrap or DATA.",
        ],
      },
      nextStep: {
        label: "Open Expedition",
        tab: "operations",
        target: "expedition",
        why: "This is the exact action that completes the mission.",
      },
    },

    generate_data: {
      title: "Mission: Generate 12 DATA",
      focus: "Grow your research and advanced progression",
      text:
        "This mission tracks DATA generation over time.\n\n" +
        "Best ways to do it:\n" +
        "• Upgrade Research Lab.\n" +
        "• Use Miner Control and Arcade Hub.\n" +
        "• Run expeditions and DATA-support systems.",
      tips: {
        building: "Research Lab",
        research: "Deep Scan",
        module: "Arcade Relay",
        actions: [
          "Research Lab is the clearest DATA structure.",
          "Expeditions can help finish this mission faster.",
          "DATA is more valuable later, so this mission is strong long-term.",
        ],
      },
      nextStep: {
        label: "Open Research Lab",
        tab: "build",
        target: "researchLab",
        why: "Research Lab is one of the best ways to improve DATA flow.",
      },
    },

    perform_maintenance: {
      title: "Mission: Perform 1 maintenance",
      focus: "Protect stability and keep systems healthy",
      text:
        "This mission completes when you run one maintenance action.\n\n" +
        "Why it matters:\n" +
        "• Encourages safer base management.\n" +
        "• Helps avoid losing momentum through instability.\n" +
        "• Rewards good control, not only expansion.",
      tips: {
        building: "Repair Bay",
        research: "Predictive Maintenance",
        module: "",
        actions: [
          "Best done before stability gets dangerous.",
          "A healthy base grows better than a rushed unstable base.",
          "Use this mission as a reminder to maintain regularly.",
        ],
      },
      nextStep: {
        label: "Open Maintenance",
        tab: "operations",
        target: "maintenance",
        why: "Maintenance action completes this mission directly.",
      },
    },

    double_expedition: {
      title: "Mission: Launch 2 expeditions",
      focus: "Spend Energy for repeated field progress",
      text:
        "This mission needs two expeditions, so it is more demanding than the basic expedition mission.\n\n" +
        "Best use:\n" +
        "Complete it when your Energy economy is stable and you want extra field rewards anyway.",
      tips: {
        building: "Expedition Bay",
        research: "Arcade Ops",
        module: "Arcade Relay",
        actions: [
          "Avoid this when your Energy economy is weak.",
          "Much better once Power Cell and regen are stronger.",
          "Good mission when you need Scrap and DATA together.",
        ],
      },
      nextStep: {
        label: "Open Expedition",
        tab: "operations",
        target: "expedition",
        why: "You need repeated expedition usage to finish this mission.",
      },
    },

    ship_mleo: {
      title: "Mission: Ship 60 MLEO",
      focus: "Move base value into the shared vault",
      text:
        "This mission tracks shipped MLEO from BASE into the Shared Vault.\n\n" +
        "To complete it:\n" +
        "• Produce banked MLEO with Refinery.\n" +
        "• Keep enough output ready.\n" +
        "• Use shipping when the amount is available.",
      tips: {
        building: "Refinery",
        research: "Logistics",
        module: "Vault Compressor",
        actions: [
          "This mission depends on your production loop, not only on clicking ship.",
          "Refinery + shipping upgrades make it much easier.",
          "Good mission because it also strengthens your main vault.",
        ],
      },
      nextStep: {
        label: "Open Shipping",
        tab: "operations",
        target: "shipping",
        why: "Shipping is the action that converts banked MLEO into mission progress.",
      },
    },

    spend_vault: {
      title: "Mission: Spend 50 MLEO from vault",
      focus: "Use shared vault resources strategically",
      text:
        "This mission completes when you spend MLEO from the Shared Vault.\n\n" +
        "What it teaches:\n" +
        "• Vault MLEO is not only for saving.\n" +
        "• Some progression systems are worth reinvesting into.\n" +
        "• Smart spending can be part of progress, not a loss.",
      tips: {
        building: "",
        research: "",
        module: "",
        actions: [
          "Do not spend vault blindly only for the mission.",
          "Use it when the upgrade or action is actually useful.",
          "Best when combined with systems that need vault investment.",
        ],
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
        "Engineer is the safest crew specialization for keeping the base healthy.\n\n" +
        "What it does:\n" +
        "• Helps with stability-focused play.\n" +
        "• Makes maintenance-oriented progression feel stronger.\n" +
        "• Good when the base starts becoming larger and more fragile.\n\n" +
        "Best use:\n" +
        "Choose Engineer when your base often drops into warning state or when safe scaling matters more than aggression.",
      tips: {
        building: "Repair Bay",
        research: "Predictive Maintenance",
        module: "Miner Link",
        actions: [
          "Best for players who want fewer risky moments.",
          "Very useful when Refinery and active systems are growing.",
          "Good default role for safer long-term expansion.",
        ],
      },
      nextStep: {
        label: "Open Repair Bay",
        tab: "build",
        target: "repairBay",
        why: "Engineer fits best into a maintenance-first base style.",
      },
    },

    logistician: {
      title: "Logistician",
      focus: "Shipping + export discipline",
      text:
        "Logistician is the best crew role for vault movement and export rhythm.\n\n" +
        "What it does:\n" +
        "• Supports shipment preparation.\n" +
        "• Helps you think around ship timing and export flow.\n" +
        "• Good when BASE is already producing enough to ship consistently.\n\n" +
        "Best use:\n" +
        "Choose it when shipping is central to your strategy and you want smoother Shared Vault support.",
      tips: {
        building: "Logistics Center",
        research: "Logistics",
        module: "Vault Compressor",
        actions: [
          "Best when Refinery is already feeding banked MLEO.",
          "Strong for players focused on shared vault growth.",
          "Less useful early if shipping is still weak.",
        ],
      },
      nextStep: {
        label: "Open Logistics Center",
        tab: "build",
        target: "logisticsCenter",
        why: "This role shines once your shipping pipeline is developed.",
      },
    },

    researcher: {
      title: "Researcher",
      focus: "DATA + system analysis",
      text:
        "Researcher is the smartest specialization for long-term scaling and DATA-focused progression.\n\n" +
        "What it does:\n" +
        "• Improves the value of DATA-centered play.\n" +
        "• Supports advanced research identity.\n" +
        "• Helps long-term optimization more than raw early speed.\n\n" +
        "Best use:\n" +
        "Choose it when you want better strategic growth instead of only direct production.",
      tips: {
        building: "Research Lab",
        research: "Deep Scan",
        module: "Arcade Relay",
        actions: [
          "Strongest in mid-game and later.",
          "Good when expeditions and DATA both matter.",
          "Ideal for advanced and smarter base pacing.",
        ],
      },
      nextStep: {
        label: "Open Research Lab",
        tab: "build",
        target: "researchLab",
        why: "Researcher works best with a true DATA engine behind it.",
      },
    },

    scout: {
      title: "Scout",
      focus: "Expedition identity + field awareness",
      text:
        "Scout is the field-operations role of the base.\n\n" +
        "What it does:\n" +
        "• Supports expedition identity.\n" +
        "• Fits flexible play with more field activity.\n" +
        "• Good for players who like mixed rewards instead of only static production.\n\n" +
        "Best use:\n" +
        "Choose Scout when expeditions are a regular part of your loop and you want the base to feel more active.",
      tips: {
        building: "Expedition Bay",
        research: "Arcade Ops",
        module: "Arcade Relay",
        actions: [
          "Strong for mixed utility progression.",
          "Great when Scrap and DATA are often needed.",
          "Not ideal if you mostly play passively.",
        ],
      },
      nextStep: {
        label: "Open Expedition",
        tab: "operations",
        target: "expedition",
        why: "Scout is felt best through repeated expedition use.",
      },
    },

    operations: {
      title: "Operations Chief",
      focus: "Balanced control room rhythm",
      text:
        "Operations Chief is the most balanced crew role.\n\n" +
        "What it does:\n" +
        "• Supports overall command rhythm.\n" +
        "• Helps when you want a flexible identity instead of one narrow specialization.\n" +
        "• Fits broad play across production, maintenance and field actions.\n\n" +
        "Best use:\n" +
        "Choose it when you want an all-round command style and are still learning what your strongest path is.",
      tips: {
        building: "HQ",
        research: "Field Ops",
        module: "",
        actions: [
          "Good default pick when unsure.",
          "Useful for mixed and evolving builds.",
          "A strong role while learning the game flow.",
        ],
      },
      nextStep: {
        label: "Open HQ",
        tab: "build",
        target: "hq",
        why: "Operations Chief matches a broad command-centered identity.",
      },
    },
  };

  const COMMANDER_PATH_INFO_COPY = {
    industry: {
      title: "Commander Path: Industry",
      focus: "Production-first base identity",
      text:
        "Industry is a production-focused command path.\n\n" +
        "What it means:\n" +
        "• Stronger emphasis on infrastructure and output.\n" +
        "• Better fit for stable production growth.\n" +
        "• Good when you want the base to feel like a resource engine first.",
      tips: {
        building: "Quarry",
        research: "Miner Sync",
        module: "Servo Drill",
        actions: [
          "Best for resource-heavy players.",
          "Good when Ore and processing are your main bottlenecks.",
          "Strong early and mid-game path.",
        ],
      },
      nextStep: {
        label: "Open Quarry",
        tab: "build",
        target: "quarry",
        why: "Industry starts with stronger raw production foundations.",
      },
    },

    logistics: {
      title: "Commander Path: Logistics",
      focus: "Shipment timing + vault movement",
      text:
        "Logistics is a commander path centered on exports and timing.\n\n" +
        "What it means:\n" +
        "• Stronger identity around shipping and vault support.\n" +
        "• Better fit for disciplined export cycles.\n" +
        "• Good when BASE exists mainly to support the wider MLEO ecosystem.",
      tips: {
        building: "Logistics Center",
        research: "Logistics",
        module: "Vault Compressor",
        actions: [
          "Best once banked MLEO is already consistent.",
          "Very useful for shared vault-focused players.",
          "Less important if exports are still weak.",
        ],
      },
      nextStep: {
        label: "Open Shipping",
        tab: "operations",
        target: "shipping",
        why: "This path matters most when shipment decisions are already central.",
      },
    },

    research: {
      title: "Commander Path: Research",
      focus: "DATA + smart long-term optimization",
      text:
        "Research is a slower but smarter command identity.\n\n" +
        "What it means:\n" +
        "• Focuses on DATA, system analysis and advanced scaling.\n" +
        "• Better for players who like planning and optimization.\n" +
        "• Less about raw speed and more about quality of progression.",
      tips: {
        building: "Research Lab",
        research: "Deep Scan",
        module: "Arcade Relay",
        actions: [
          "Best for strategic players.",
          "Works well with expeditions and DATA loops.",
          "A strong late-oriented identity.",
        ],
      },
      nextStep: {
        label: "Open Research Lab",
        tab: "build",
        target: "researchLab",
        why: "Research path is built around DATA-driven progression.",
      },
    },

    ecosystem: {
      title: "Commander Path: Ecosystem",
      focus: "Synergy with Miners, Arcade and wider MLEO structure",
      text:
        "Ecosystem is the most connected commander path.\n\n" +
        "What it means:\n" +
        "• Supports broader MLEO identity.\n" +
        "• Fits players who want BASE to feel connected to the rest of the project.\n" +
        "• Best for synergy-minded progression rather than narrow specialization.",
      tips: {
        building: "Arcade Hub",
        research: "Arcade Ops",
        module: "Arcade Relay",
        actions: [
          "Great for cross-system identity.",
          "Best when you want BASE to feel like part of a larger ecosystem.",
          "Strong thematic path for project cohesion.",
        ],
      },
      nextStep: {
        label: "Open Arcade Hub",
        tab: "build",
        target: "arcadeHub",
        why: "Ecosystem path is felt most clearly through connected systems.",
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

  function getCrewInfo(role) {
    return CREW_INFO_COPY[role.key] || {
      title: role.name,
      focus: "Crew Role",
      text: role.desc,
      tips: { building: "", research: "", module: "", actions: [] },
    };
  }

  function getCommanderPathInfo(path) {
    return COMMANDER_PATH_INFO_COPY[path.key] || {
      title: path.name,
      focus: "Commander Path",
      text: path.desc,
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
      focus: "Permanent support upgrade for shipping and banking",
      text:
        "Blueprint Cache is a long-term investment system.\n\n" +
        "What it does:\n" +
        "• Costs Shared Vault MLEO and DATA.\n" +
        "• Permanently improves banking efficiency.\n" +
        "• Permanently raises your daily ship cap.\n\n" +
        "Best use:\n" +
        "Buy Blueprint when you already have a stable BASE loop and want stronger long-term export performance instead of only short-term gains.",
      tips: {
        building: "Refinery",
        research: "Logistics",
        module: "Vault Compressor",
        actions: [
          "Blueprint is a reinvestment tool, not a panic button.",
          "Best when shipping already matters to your economy.",
          "Good for players who want stronger long-term BASE value.",
        ],
      },
      nextStep: {
        label: "Open Shipping",
        tab: "operations",
        target: "shipping",
        why: "Blueprint matters most when you actively use your shipping pipeline.",
      },
    },

    crewSummary: {
      title: "Crew Role Summary",
      focus: "Your active command specialization",
      text:
        "This card shows the crew role currently shaping your base style.\n\n" +
        "What it means:\n" +
        "• Your role reflects how your command team approaches the base.\n" +
        "• It helps define whether your build feels safer, smarter, more export-focused or more field-focused.\n" +
        "• It is part of your identity layer, not just flavor text.",
      tips: {
        building: "HQ",
        research: "Field Ops",
        module: "",
        actions: [
          "Use this card to remember what style your base is currently leaning into.",
          "Change role when your bottlenecks change.",
          "This summary works together with Commander Path.",
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
      focus: "Your strategic base identity",
      text:
        "This card shows the strategic direction of your command path.\n\n" +
        "What it means:\n" +
        "• It reflects whether your base is leaning toward Industry, Logistics, Research or Ecosystem.\n" +
        "• It helps define how the base should feel overall.\n" +
        "• It is a strategy identity marker for the player.",
      tips: {
        building: "HQ",
        research: "Field Ops",
        module: "",
        actions: [
          "Use this as your high-level strategic reminder.",
          "Path should match what systems you are investing in most.",
          "Role and Path together explain your base identity.",
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
      focus: "A simple label for your current stage of growth",
      text:
        "Base Profile is a readable summary of how developed your outpost currently is.\n\n" +
        "What it means:\n" +
        "• Early Outpost means the base is still in its first growth stage.\n" +
        "• Growing Outpost means the command structure is maturing.\n" +
        "• Developed Command means your base has enough depth to feel like a real command center.\n\n" +
        "Best use:\n" +
        "This is not a direct stat bonus card. It helps the player understand the current maturity of the base.",
      tips: {
        building: "HQ",
        research: "",
        module: "",
        actions: [
          "Think of this as a stage label, not a currency.",
          "It helps players feel progression in a readable way.",
          "Useful for understanding whether you are still early or already structured.",
        ],
      },
    },

    shipDiscipline: {
      title: "Ship Discipline",
      focus: "Tracks daily shipment pressure and efficiency",
      text:
        "Ship Discipline shows how much you have already shipped today compared to your cap.\n\n" +
        "What it means:\n" +
        "• The left value is how much you already sent today.\n" +
        "• The right value is your current daily ship cap.\n" +
        "• Softcut still applies, so shipping too aggressively can become less efficient.\n\n" +
        "Best use:\n" +
        "Use this card to decide whether it is worth shipping now or waiting for a better moment.",
      tips: {
        building: "Logistics Center",
        research: "Logistics",
        module: "Vault Compressor",
        actions: [
          "Do not treat cap as the only rule; timing still matters.",
          "Blueprint upgrades make this card more forgiving over time.",
          "Very useful for teaching better shipping discipline.",
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
      focus: "Why the game is warning or guiding you right now",
      text:
        "Command Alerts summarize what currently needs your attention.\n\n" +
        "What they usually mean:\n" +
        "• Energy pressure.\n" +
        "• Stability risk.\n" +
        "• Shipping opportunity.\n" +
        "• Contract or mission progress.\n\n" +
        "Best use:\n" +
        "Treat alerts as guidance, not as strict orders. They are there to help players understand what matters right now.",
      tips: {
        building: "HQ",
        research: "",
        module: "",
        actions: [
          "Good for new players who are not sure where to focus next.",
          "Alerts should support decisions, not replace strategy.",
          "Useful when the game starts feeling overloaded.",
        ],
      },
    },

    nextStepCard: {
      title: "Recommended Next Step",
      focus: "The game's current guidance for your best move",
      text:
        "This card gives the player a suggested next move based on the current base state.\n\n" +
        "What it means:\n" +
        "• It points to the most helpful immediate action.\n" +
        "• It reduces confusion during complex progression.\n" +
        "• It should explain why that step matters now.",
      tips: {
        building: "HQ",
        research: "",
        module: "",
        actions: [
          "This is especially helpful in early and mid-game.",
          "Players should feel guided without losing freedom.",
          "Good candidate for a permanent info button because the game is complex.",
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
              className={`flex h-[252px] flex-col rounded-xl border p-3 ${availabilityCardClass(ready)} ${
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

              <div className="mt-auto flex flex-col justify-end pt-0 pb-2">
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

                <div
                  className={`mt-1.5 min-h-[18px] text-[11px] font-semibold ${
                    !isUnlocked
                      ? "text-amber-300"
                      : ready
                      ? "text-emerald-300"
                      : "text-white/55"
                  }`}
                >
                  {!isUnlocked && requirementsText
                    ? `Requires: ${requirementsText}`
                    : ready
                    ? "Ready to upgrade"
                    : isUnlocked
                    ? "Need more resources"
                    : ""}
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

  const openDesktopPanel = (panel, inner = null) => {
    setDesktopPanel(panel);
    setOpenInnerPanel(inner || null);
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
      <main className="h-[100dvh] overflow-hidden overflow-x-hidden bg-[#07111f] text-white sm:min-h-screen sm:h-auto sm:overflow-visible">
        <div className="mx-auto max-w-7xl px-4 py-6 pb-24 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-200">
                MLEO ecosystem command hub
              </div>
              <div className="mt-3 flex items-center justify-between sm:block">
                <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{CONFIG.title}</h1>
                <div className="flex items-center gap-2 sm:hidden">
                  <Link href="/mining" className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold hover:bg-white/10">
                    Hub
                  </Link>
                  <button
                    onClick={() => setMobileMenuOpen(true)}
                    className="relative flex h-[46px] w-[46px] items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"
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

          {/* Desktop Command Center */}
          <div className="mt-4 hidden lg:flex lg:min-h-[640px] lg:max-h-[calc(100vh-104px)] lg:gap-3">
            {/* LEFT SIDEBAR */}
            <aside className="w-[184px] shrink-0 lg:flex lg:h-full lg:flex-col lg:gap-2">
              <div className="space-y-2.5">
                <div className="rounded-[28px] border border-white/10 bg-slate-950/75 p-3 backdrop-blur-xl">
                  <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-300/70">
                    Command
                  </div>
                  <div className="mt-2 space-y-2">
                    {[
                      { key: "overview", label: "Overview" },
                      { key: "ops", label: "Operations" },
                      { key: "build", label: "Build" },
                      { key: "intel", label: "Intel" },
                    ].map((item) => {
                      const active = desktopPanel === item.key;
                      return (
                        <button
                          key={item.key}
                          onClick={() => openDesktopPanel(item.key)}
                          className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-[13px] font-semibold transition ${
                            active
                              ? "bg-cyan-400 text-slate-950"
                              : "border border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                          }`}
                        >
                          <span>{item.label}</span>
                          {item.key === "overview" && liveContractsAvailableCount > 0 ? (
                            <span className="rounded-full bg-black/15 px-2 py-0.5 text-[11px] font-bold">
                              {liveContractsAvailableCount}
                            </span>
                          ) : null}
                          {item.key === "ops" && readyCounts.total > 0 ? (
                            <span className="rounded-full bg-black/15 px-2 py-0.5 text-[11px] font-bold">
                              {readyCounts.total}
                            </span>
                          ) : null}
                          {item.key === "build" && buildOpportunitiesCount > 0 ? (
                            <span className="rounded-full bg-black/15 px-2 py-0.5 text-[11px] font-bold">
                              {buildOpportunitiesCount}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-[28px] border border-cyan-400/25 bg-cyan-500/10 p-3.5 backdrop-blur-xl">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-200/70">
                    Ready Now
                  </div>
                  <div className="mt-2 text-3xl font-black text-white">
                    {readyCounts.total}
                  </div>
                  <div className="mt-1 text-xs text-white/65">
                    Immediate actions and rewards available
                  </div>

                  <div className="mt-3 flex flex-col gap-2">
                    <button
                      onClick={() => {
                        if (canExpeditionNow || canShipNow || needsRefillNow || needsMaintenanceNow) {
                          openDesktopPanel("ops", "ops-console");
                        } else if (dailyMissionsAvailableCount > 0) {
                          openDesktopPanel("ops", "ops-missions");
                        } else if (liveContractsAvailableCount > 0) {
                          openDesktopPanel("overview", "overview-contracts");
                        } else if (buildOpportunitiesCount > 0) {
                          openDesktopPanel("build", "build-structures");
                        } else {
                          openDesktopPanel("overview");
                        }
                      }}
                      className="rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 hover:bg-cyan-300"
                    >
                      Open Ready
                    </button>

                    <button
                      onClick={() => setDesktopCompact((v) => !v)}
                      className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10"
                    >
                      {desktopCompact ? "Detailed View" : "Compact View"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-auto rounded-[28px] border border-white/10 bg-slate-950/75 p-3 backdrop-blur-xl">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300/70">
                  Commander
                </div>
                <div className="mt-1.5 text-[28px] font-black leading-none text-white">
                  Lv {state.commanderLevel}
                </div>
                <div className="mt-2 text-sm text-white/75">{commanderPathInfo.name}</div>
                <div className="mt-0.5 text-xs text-white/55">{crewRoleInfo.name}</div>

                <div className="mt-3 grid grid-cols-1 gap-1.5">
                  <Link
                    href="/arcade"
                    className="flex h-10 w-full items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 text-sm font-semibold text-white hover:bg-white/10"
                  >
                    Open Arcade
                  </Link>
                  <Link
                    href="/mleo-miners"
                    className="flex h-10 w-full items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 text-sm font-semibold text-white hover:bg-white/10"
                  >
                    Open Miners
                  </Link>
                  <button
                    onClick={handleResetGame}
                    className="flex h-10 w-full items-center justify-center rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 text-sm font-semibold text-rose-200 hover:bg-rose-500/20"
                  >
                    Reset Game
                  </button>
                </div>
              </div>
            </aside>

            {/* MAIN AREA */}
            <section className="min-w-0 flex-1 rounded-[28px] border border-white/10 bg-slate-950/75 backdrop-blur-xl shadow-[0_18px_60px_rgba(0,0,0,0.28)] lg:flex lg:flex-col lg:min-h-0">
              {/* TOP HUD */}
              <div className="border-b border-white/10 px-3 py-2.5">
                <div className="grid grid-cols-4 gap-2 xl:grid-cols-8">
                  {desktopHudItems.map((item) => {
                    const focus = item.tone === "focus";

                    return (
                      <div
                        key={item.label}
                        className={`relative min-h-[64px] rounded-2xl border ${
                          focus
                            ? "border-cyan-400/20 bg-cyan-400/8"
                            : "border-white/10 bg-white/5"
                        } px-3 py-2`}
                      >
                        {item.infoKey ? (
                          <InfoButton
                            infoKey={item.infoKey}
                            setOpenInfoKey={setOpenInfoKey}
                            className="right-2 top-2 h-6 w-6 text-[11px]"
                          />
                        ) : null}

                        <div className="pr-7 text-[10px] font-black uppercase tracking-[0.16em] text-white/40">
                          {item.label}
                        </div>

                        <div className="mt-1 pr-6 text-sm font-extrabold text-white xl:text-[15px]">
                          {item.value}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* PANEL HEADER */}
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b border-white/10 px-3.5 py-2.5">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-300/70">
                    Desktop Command Center
                  </div>
                  <div className="mt-0.5 text-xl font-black text-white">
                    {desktopPanelTitle}
                  </div>
                </div>

                <div className="flex justify-center">
                  <button
                    onClick={() => setOpenInnerPanel(null)}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
                  >
                    Reset Section
                  </button>
                </div>

                <div className="flex justify-end">
                  {desktopPriorityAlert ? (
                    <div
                      className={`hidden xl:flex min-w-0 max-w-[420px] items-center rounded-2xl border px-3 py-2 ${alertToneClasses(
                        desktopPriorityAlert.tone
                      )}`}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-xs font-bold">
                          {desktopPriorityAlert.title}
                        </div>
                        <div className="truncate text-[11px] text-white/75">
                          {desktopPriorityAlert.text}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* PANEL BODY */}
              <div className="min-h-0 flex-1 overflow-y-auto p-3.5 pr-2.5 pb-4">
                {desktopPanel === "overview" ? (
                  <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300/70">
                        Next Step
                      </div>
                      <div className="mt-2 text-xl font-black text-white">{nextStep.title}</div>
                      <div className="mt-2 text-sm text-white/70">{nextStep.text}</div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          onClick={() => openDesktopPanel("ops", "ops-console")}
                          className="rounded-2xl bg-cyan-500 px-4 py-3 text-sm font-bold text-white hover:bg-cyan-400"
                        >
                          Open Ops
                        </button>
                        <button
                          onClick={() => openDesktopPanel("build", "build-structures")}
                          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10"
                        >
                          Open Build
                        </button>
                      </div>

                      {(activeEvent || nextShipBonus > 0) && !desktopCompact ? (
                        <div className="relative mt-4 rounded-2xl border border-fuchsia-400/20 bg-fuchsia-500/10 p-3">
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
                          <div className={activeEvent ? "pr-8" : ""}>
                            <div className="text-sm font-bold text-white">
                              {activeEvent ? activeEvent.title : "Logistics boost active"}
                            </div>
                            <div className="mt-1 text-xs text-white/70">
                              {activeEvent ? activeEvent.text : "A previous command decision improved your next vault shipment."}
                            </div>
                          </div>

                          {nextShipBonus > 0 ? (
                            <div className="mt-2 text-xs font-bold text-fuchsia-200">
                              Next ship bonus: +{Math.round(nextShipBonus * 100)}%
                            </div>
                          ) : null}

                          {activeEvent ? (
                            <div className="mt-3 grid gap-2">
                              {activeEvent.choices.map((choice) => {
                                const allowed = canApplyEventChoice(state, choice, derived);
                                return (
                                  <button
                                    key={choice.key}
                                    onClick={() => resolveLiveEventChoice(choice)}
                                    disabled={!allowed}
                                    className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-left text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-40"
                                  >
                                    {choice.label}
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <div className="mb-3 flex items-center justify-between">
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300/70">
                            Contracts
                          </div>
                          <div className="mt-1 text-lg font-black text-white">Live Objectives</div>
                        </div>
                        <button
                          onClick={() =>
                            setOpenInnerPanel(openInnerPanel === "overview-contracts" ? null : "overview-contracts")
                          }
                          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
                        >
                          {openInnerPanel === "overview-contracts" ? "CLOSE" : "OPEN"}
                        </button>
                      </div>

                      {openInnerPanel === "overview-contracts" || !desktopCompact ? (
                        <div className="grid gap-3">
                          {liveContracts.map((contract) => (
                            <div
                              key={contract.key}
                              className="relative rounded-2xl border border-white/10 bg-black/20 p-3"
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
                                <div className="text-sm font-bold text-white">{contract.title}</div>
                                {!desktopCompact ? (
                                  <div className="mt-1 text-xs text-white/65">{contract.desc}</div>
                                ) : null}
                                <div className="mt-1 text-xs text-cyan-200/80">{contract.rewardText}</div>
                              </div>
                              <button
                                onClick={() => claimContract(contract.key)}
                                disabled={!contract.done || contract.claimed}
                                className="mt-3 w-full rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20 disabled:opacity-40"
                              >
                                {contract.claimed ? "Claimed" : contract.done ? "Claim Contract" : "In Progress"}
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-white/65">
                          {liveContractsAvailableCount > 0
                            ? `${liveContractsAvailableCount} contract reward${liveContractsAvailableCount > 1 ? "s" : ""} ready`
                            : "No contract rewards ready right now"}
                        </div>
                      )}
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3 xl:col-span-2">
                      <div className="grid gap-4 md:grid-cols-4">
                        <div className="relative rounded-2xl border border-white/10 bg-black/20 p-3">
                          <div className="absolute right-2 top-2 z-10">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setBuildInfo(getSystemInfo("crewSummary"));
                                setOpenInfoKey(null);
                              }}
                              className="flex h-6 w-6 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[11px] font-black text-cyan-200 transition hover:bg-cyan-500/20 hover:text-white"
                              aria-label="Open crew role summary info"
                              title="Info about crew role"
                            >
                              i
                            </button>
                          </div>
                          <div className="pr-7">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">Crew Role</div>
                            <div className="mt-1 text-sm font-bold text-white">{crewRoleInfo.name}</div>
                            <div className="mt-1 text-xs text-white/60">{roleBonusText}</div>
                          </div>
                        </div>
                        <div className="relative rounded-2xl border border-white/10 bg-black/20 p-3">
                          <div className="absolute right-2 top-2 z-10">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setBuildInfo(getSystemInfo("commanderSummary"));
                                setOpenInfoKey(null);
                              }}
                              className="flex h-6 w-6 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[11px] font-black text-cyan-200 transition hover:bg-cyan-500/20 hover:text-white"
                              aria-label="Open commander path summary info"
                              title="Info about commander path"
                            >
                              i
                            </button>
                          </div>
                          <div className="pr-7">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">Commander Path</div>
                            <div className="mt-1 text-sm font-bold text-white">{commanderPathInfo.name}</div>
                            <div className="mt-1 text-xs text-white/60">{commanderPathText}</div>
                          </div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                          <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">Base Profile</div>
                          <div className="mt-1 text-sm font-bold text-white">
                            {state.crew >= 5 ? "Developed Command" : state.crew >= 2 ? "Growing Outpost" : "Early Outpost"}
                          </div>
                          <div className="mt-1 text-xs text-white/60">Identity shaped by buildings, role and path.</div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                          <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">Ship Discipline</div>
                          <div className="mt-1 text-sm font-bold text-white">
                            {fmt(state.sentToday)} / {fmt(derived.shipCap)}
                          </div>
                          <div className="mt-1 text-xs text-white/60">Softcut and cap remain active.</div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                {desktopPanel === "ops" ? (
                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className={`rounded-2xl border border-white/10 bg-white/5 p-3 ${highlightTarget === "shipping" ? "ring-2 ring-cyan-300/35" : ""}`}>
                      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300/70">
                        Shipping
                      </div>
                      <div className="mt-1 text-lg font-black text-white">Ship to Shared Vault</div>
                      <div className="mt-2 text-sm text-white/65">
                        Move refined MLEO into the shared vault. Daily cap and softcut apply, so later shipments may convert less efficiently.
                      </div>
                      <button
                        onClick={bankToSharedVault}
                        disabled={!canShipNow}
                        className="mt-4 w-full rounded-2xl bg-cyan-500 px-4 py-3 text-sm font-bold text-white hover:bg-cyan-400 disabled:opacity-40"
                      >
                        Ship {fmt(state.bankedMleo)} MLEO
                      </button>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300/70">
                        Expedition
                      </div>
                      <div className="mt-1 text-lg font-black text-white">Field Expedition</div>
                      <div className="mt-2 text-sm text-white/65">
                        Spend {CONFIG.expeditionCost} energy for resources, DATA and rare findings.
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
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

                      <button
                        onClick={handleLaunchExpedition}
                        disabled={expeditionLeft > 0 || !canExpeditionNow}
                        className="mt-4 w-full rounded-2xl bg-white/10 px-4 py-3 text-sm font-bold text-white hover:bg-white/20 disabled:opacity-40"
                      >
                        {expeditionLeft > 0 ? `Ready in ${Math.ceil(expeditionLeft / 1000)}s` : "Launch Expedition"}
                      </button>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300/70">
                        Blueprint
                      </div>
                      <div className="mt-1 text-lg font-black text-white">Blueprint Cache</div>
                      <div className="mt-2 text-sm text-white/65">
                        Costs {fmt(blueprintCost)} shared MLEO + {fmt(blueprintDataCost)} DATA and improves long-term efficiency.
                      </div>
                      <button
                        onClick={buyBlueprint}
                        disabled={!canAffordBlueprint(state, sharedVault, blueprintCost, blueprintDataCost)}
                        className={`mt-4 w-full rounded-2xl px-4 py-3 text-sm font-bold transition ${
                          canAffordBlueprint(state, sharedVault, blueprintCost, blueprintDataCost)
                            ? "bg-fuchsia-600 text-white hover:bg-fuchsia-500"
                            : "bg-white/10 text-white/45"
                        }`}
                      >
                        Buy Blueprint Lv {state.blueprintLevel + 1}
                      </button>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300/70">
                        Utilities
                      </div>
                      <div className="mt-1 text-lg font-black text-white">Base Support</div>
                      <div className="mt-2 text-sm text-white/65">
                        Stability: {fmt(state.stability)}% · keep systems healthy and productive.
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-2">
                        <button
                          onClick={activateOverclock}
                          className="rounded-xl bg-white/10 px-3 py-3 text-xs font-bold text-white hover:bg-white/20"
                        >
                          {overclockLeft > 0 ? `Overclock ${Math.ceil(overclockLeft / 1000)}s` : `Overclock ${fmt(CONFIG.overclockCost)}`}
                        </button>
                        <button
                          onClick={refillEnergy}
                          className="rounded-xl bg-white/10 px-3 py-3 text-xs font-bold text-white hover:bg-white/20"
                        >
                          Refill {fmt(CONFIG.refillCost)}
                        </button>
                        <button
                          onClick={performMaintenance}
                          className="rounded-xl bg-white/10 px-3 py-3 text-xs font-bold text-white hover:bg-white/20"
                        >
                          Maintain
                        </button>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3 xl:col-span-2">
                      <div className="mb-3 flex items-center justify-between">
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300/70">
                            Daily Missions
                          </div>
                          <div className="mt-1 text-lg font-black text-white">Mission Queue</div>
                        </div>
                        <button
                          onClick={() =>
                            setOpenInnerPanel(openInnerPanel === "ops-missions" ? null : "ops-missions")
                          }
                          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
                        >
                          {openInnerPanel === "ops-missions" ? "CLOSE" : "OPEN"}
                        </button>
                      </div>

                      {openInnerPanel === "ops-missions" || !desktopCompact ? (
                        <div>{dailyMissionsContent}</div>
                      ) : (
                        <div className="text-sm text-white/65">
                          {sectionStatusHint("daily-missions", { count: dailyMissionsAvailableCount })}
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}

                {desktopPanel === "build" ? (
                  <div className="grid gap-4">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <div className="mb-3 flex items-center justify-between">
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300/70">
                            Structures
                          </div>
                          <div className="mt-1 text-lg font-black text-white">Base Upgrades</div>
                        </div>
                        <button
                          onClick={() =>
                            setOpenInnerPanel(openInnerPanel === "build-structures" ? null : "build-structures")
                          }
                          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
                        >
                          {openInnerPanel === "build-structures" ? "CLOSE" : "OPEN"}
                        </button>
                      </div>

                      {openInnerPanel === "build-structures" || !desktopCompact ? (
                        <div>{baseStructuresContent}</div>
                      ) : (
                        <div className="text-sm text-white/65">
                          {buildSectionHint("structures", { structures: availableStructuresCount })}
                        </div>
                      )}
                    </div>

                    <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="mb-3 flex items-center justify-between">
                          <div>
                            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300/70">
                              Development
                            </div>
                            <div className="mt-1 text-lg font-black text-white">Modules & Research</div>
                          </div>
                          <button
                            onClick={() =>
                              setOpenInnerPanel(openInnerPanel === "build-development" ? null : "build-development")
                            }
                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
                          >
                            {openInnerPanel === "build-development" ? "CLOSE" : "OPEN"}
                          </button>
                        </div>

                        {openInnerPanel === "build-development" || !desktopCompact ? (
                          <div>{crewModulesResearchContent}</div>
                        ) : (
                          <div className="text-sm text-white/65">
                            {buildSectionHint("development", {
                              modules: availableModulesCount,
                              research: availableResearchCount,
                            })}
                          </div>
                        )}
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300/70">
                          Support Systems
                        </div>
                        <div>{buildSupportSystemsContent}</div>
                      </div>
                    </div>
                  </div>
                ) : null}

                {desktopPanel === "intel" ? (
                  <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300/70">
                        Command Schematic
                      </div>
                      <div className="mt-1 text-lg font-black text-white">Base Sectors</div>
                      <div className="mt-2 grid gap-3">
                        {[
                          { key: "hq", label: "HQ Core" },
                          { key: "refinery", label: "Refinery Sector" },
                          { key: "logisticsCenter", label: "Logistics Sector" },
                          { key: "researchLab", label: "Research Sector" },
                          { key: "repairBay", label: "Repair Sector" },
                          { key: "expeditionBay", label: "Expedition Sector" },
                          { key: "minerControl", label: "Miner Link Sector" },
                          { key: "arcadeHub", label: "Arcade Link Sector" },
                        ].map((sector) => {
                          const status = sectorStatusForBuilding(sector.key, state);
                          const level = Number(state.buildings?.[sector.key] || 0);
                          return (
                            <div
                              key={sector.key}
                              className="rounded-2xl border border-white/10 bg-black/20 p-3"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <div className="text-sm font-bold text-white">{sector.label}</div>
                                  <div className="mt-1 text-xs text-white/60">
                                    {buildingSynergyTag(sector.key)}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-xs font-bold text-white/70">Lv {level}</div>
                                  <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-cyan-200/70">
                                    {status}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid gap-4">
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="mb-3 flex items-center justify-between">
                          <div>
                            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300/70">
                              Progress
                            </div>
                            <div className="mt-1 text-lg font-black text-white">Summary</div>
                          </div>
                          <button
                            onClick={() =>
                              setOpenInnerPanel(openInnerPanel === "intel-summary" ? null : "intel-summary")
                            }
                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
                          >
                            {openInnerPanel === "intel-summary" ? "CLOSE" : "OPEN"}
                          </button>
                        </div>

                        {openInnerPanel === "intel-summary" || !desktopCompact ? (
                          <div>{progressSummaryContent}</div>
                        ) : (
                          <div className="text-sm text-white/65">Key progress and identity data.</div>
                        )}
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="mb-3 flex items-center justify-between">
                          <div>
                            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300/70">
                              Activity Log
                            </div>
                            <div className="mt-1 text-lg font-black text-white">Recent Events</div>
                          </div>
                          <button
                            onClick={() =>
                              setOpenInnerPanel(openInnerPanel === "intel-log" ? null : "intel-log")
                            }
                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
                          >
                            {openInnerPanel === "intel-log" ? "CLOSE" : "OPEN"}
                          </button>
                        </div>

                        {openInnerPanel === "intel-log" || !desktopCompact ? (
                          <div>{activityLogContent}</div>
                        ) : (
                          <div className="text-sm text-white/65">
                            Recent events and milestones.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          </div>

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

                  <div className="mt-2 pr-16 text-4xl font-black leading-none text-white">
                    {shownInfo.title}
                  </div>

                  {shownInfo?.focus ? (
                    <div className="mt-2 pr-16 text-sm leading-6 text-cyan-200/80">
                      <span className="font-semibold text-white">Focus:</span>{" "}
                      {shownInfo.focus}
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                  <div className="whitespace-pre-line text-sm leading-7 text-white/80">
                    {shownInfo.text}
                  </div>

                  {shownInfo?.tips ? (
                    <div className="mt-4 border-t border-white/10 pt-4">
                      <div className="grid gap-2 text-sm text-white/78">
                        {shownInfo?.tips?.building ? (
                          <div>
                            <span className="font-semibold text-white">Best building:</span>{" "}
                            {shownInfo.tips.building}
                          </div>
                        ) : null}

                        {shownInfo?.tips?.research ? (
                          <div>
                            <span className="font-semibold text-white">Best research:</span>{" "}
                            {shownInfo.tips.research}
                          </div>
                        ) : null}

                        {shownInfo?.tips?.module ? (
                          <div>
                            <span className="font-semibold text-white">Best module:</span>{" "}
                            {shownInfo.tips.module}
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-4">
                        <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-cyan-200/70">
                          Quick actions
                        </div>

                        <ul className="mt-2 space-y-1.5 text-sm leading-6 text-white/78">
                          {shownInfo.tips.actions.map((item) => (
                            <li key={item} className="flex gap-2">
                              <span className="mt-[8px] h-1.5 w-1.5 rounded-full bg-cyan-300/90" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
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
          <div className="relative mt-4 space-y-3 sm:hidden overscroll-none pb-0">

            <div
              onClick={() => {
                if (commandHubCount > 0) setShowReadyPanel(true);
              }}
              className={`rounded-2xl border px-4 py-3 transition ${
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
                  <div className="mt-0.5 text-xs text-white/75">
                    {primaryCommandItem?.text || "Nothing needs attention right now."}
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

            <div className="grid grid-cols-1 gap-3">
              <div className="relative">
                <InfoButton
                  infoKey="sharedVault"
                  setOpenInfoKey={setOpenInfoKey}
                />
                <MetricCard
                  label="Shared Vault"
                  value={`${fmt(sharedVault)} MLEO`}
                  note="Shared across the MLEO ecosystem."
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
            </div>

            <div className="grid grid-cols-2 gap-3">
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
                  compact
                />
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
                  compact
                />
              </div>

              <div className={`w-full ${highlightCard((state.resources.ENERGY || 0) <= derived.energyCap * 0.25, "warning")}`}>
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
                    compact
                  />
                </div>
            </div>

              <div className={`w-full ${highlightCard(systemState === "critical", "critical") || highlightCard(systemState === "warning", "warning")}`}>
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
                    compact
                  />
                </div>
            </div>
          </div>

            <div className="mt-auto grid grid-cols-3 gap-2">
              <div className="relative rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
                <InfoButton
                  infoKey="ore"
                  setOpenInfoKey={setOpenInfoKey}
                />
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">Ore</div>
                <div className="mt-1 text-sm font-bold text-white">{fmt(state.resources.ORE)}</div>
              </div>
              <div className="relative rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
                <InfoButton
                  infoKey="gold"
                  setOpenInfoKey={setOpenInfoKey}
                />
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">Gold</div>
                <div className="mt-1 text-sm font-bold text-white">{fmt(state.resources.GOLD)}</div>
              </div>
              <div className="relative rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
                <InfoButton
                  infoKey="scrap"
                  setOpenInfoKey={setOpenInfoKey}
                />
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">Scrap</div>
                <div className="mt-1 text-sm font-bold text-white">{fmt(state.resources.SCRAP)}</div>
              </div>
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
                        {readyCounts.expedition > 0 && (
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
                        )}
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

                      <div
                        className={`rounded-3xl border p-3.5 transition ${buildSectionCardClass(
                          liveContractsAvailableCount > 0
                        )}`}
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
                                  Spend {CONFIG.expeditionCost} energy for Ore, Gold, Scrap, DATA and
                                  only a small chance of banked MLEO.
                                </p>

                                <div className="mt-3 flex flex-wrap gap-2">
                                  <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold text-white/75">
                                    BALANCED
                                  </span>
                                  <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold text-white/75">
                                    SCAN
                                  </span>
                                  <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold text-white/75">
                                    SALVAGE
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
              className="fixed inset-0 z-[117] bg-black/60 backdrop-blur-sm sm:hidden"
              onClick={() => setShowReadyPanel(false)}
            >
              <div
                className="absolute inset-x-4 top-[110px] rounded-3xl border border-white/10 bg-[#0b1526] p-4 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-lg font-bold text-white">Command Hub</div>
                    <div className="mt-1 text-xs text-white/60">
                      Alerts, rewards and live actions currently available.
                    </div>
                  </div>

                  <button
                    onClick={() => setShowReadyPanel(false)}
                    className="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20"
                  >
                    Close
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  {commandHubItems.length ? (
                    commandHubItems.map((item) => (
                      <button
                        key={item.key}
                        onClick={() => openCommandHubTarget(item)}
                        className={`block w-full rounded-2xl border p-3 text-left hover:bg-white/10 ${
                          item.type === "alert"
                            ? alertToneClasses(item.tone)
                            : "border-white/10 bg-black/20"
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
                    ))
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

              {/* Desktop - Command Schematic */}
              <div className="hidden xl:block">
                <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-4">
                  <div className="mb-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-white/55">Command Schematic</div>
                    <div className="mt-1 text-lg font-bold text-white">Base Sectors</div>
                    <div className="mt-1 text-sm text-white/65">
                      A live overview of core sectors, support links and current operational state.
                    </div>
                  </div>

                  <div className="grid gap-3 xl:grid-cols-4">
                    {[
                      { key: "hq", label: "HQ Core" },
                      { key: "refinery", label: "Refinery Sector" },
                      { key: "logisticsCenter", label: "Logistics Sector" },
                      { key: "researchLab", label: "Research Sector" },
                      { key: "repairBay", label: "Repair Sector" },
                      { key: "expeditionBay", label: "Expedition Sector" },
                      { key: "minerControl", label: "Miner Link Sector" },
                      { key: "arcadeHub", label: "Arcade Link Sector" },
                    ].map((sector) => {
                      const status = sectorStatusForBuilding(sector.key, state);
                      const level = Number(state.buildings?.[sector.key] || 0);

                      return (
                        <div
                          key={sector.key}
                          className={`rounded-2xl border px-4 py-3 ${sectorStatusClasses(status)}`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-semibold">{sector.label}</div>
                            <div className="rounded-full bg-black/20 px-2 py-1 text-[11px] font-bold">
                              Lv {level}
                            </div>
                          </div>

                          <div className="mt-2 text-xs uppercase tracking-[0.14em]">
                            {status}
                          </div>

                          <div className="mt-2 text-xs text-white/70">
                            {buildingSynergyTag(sector.key)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Desktop - Live Contracts */}
              <div className="hidden xl:block">
                <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-4">
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
                          Spend {CONFIG.expeditionCost} energy for Ore, Gold, Scrap, DATA and only a small chance of banked MLEO.
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
                      ? "rounded-3xl ring-2 ring-cyan-300/90 border-cyan-300 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(103,232,249,0.45),0_0_28px_rgba(34,211,238,0.18)]"
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
