import { useEffect, useMemo, useState } from "react";
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
    baseCost: { GOLD: 75, ORE: 20 },
    growth: 1.18,
    energyUse: 1.4,
    outputs: { GOLD: 1.0 },
    requires: [{ key: "quarry", lvl: 1 }],
  },
  {
    key: "salvage",
    name: "Salvage Yard",
    desc: "Recovers Scrap for advanced systems.",
    baseCost: { GOLD: 110, ORE: 55 },
    growth: 1.20,
    energyUse: 1.8,
    outputs: { SCRAP: 0.8 },
    requires: [{ key: "quarry", lvl: 2 }],
  },
  {
    key: "refinery",
    name: "Refinery",
    desc: "Converts Ore + Scrap into bankable MLEO.",
    baseCost: { GOLD: 180, ORE: 110, SCRAP: 20 },
    growth: 1.25,
    energyUse: 3.2,
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
    baseCost: { GOLD: 140, SCRAP: 24 },
    growth: 1.22,
    energyUse: 0,
    power: { cap: 24, regen: 0.35 },
    requires: [{ key: "tradeHub", lvl: 1 }],
  },
  {
    key: "minerControl",
    name: "Miner Control",
    desc: "Improves synergy with Miners and increases ore conversion quality.",
    baseCost: { GOLD: 320, ORE: 120, SCRAP: 40 },
    growth: 1.22,
    energyUse: 0.6,
    outputs: { DATA: 0.15 },
    requires: [{ key: "hq", lvl: 2 }],
  },
  {
    key: "arcadeHub",
    name: "Arcade Hub",
    desc: "Turns activity into base progression and improves mission rewards.",
    baseCost: { GOLD: 360, ORE: 90, SCRAP: 50 },
    growth: 1.24,
    energyUse: 0.8,
    outputs: { DATA: 0.12 },
    requires: [{ key: "hq", lvl: 2 }],
  },
  {
    key: "expeditionBay",
    name: "Expedition Bay",
    desc: "Unlocks stronger expeditions and better loot tables.",
    baseCost: { GOLD: 500, ORE: 180, SCRAP: 85 },
    growth: 1.26,
    energyUse: 1.2,
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
    outputs: { DATA: 0.06 },
    requires: [{ key: "hq", lvl: 2 }, { key: "tradeHub", lvl: 2 }],
  },
  {
    key: "researchLab",
    name: "Research Lab",
    desc: "Boosts DATA generation and supports advanced research paths.",
    baseCost: { ORE: 180, GOLD: 240, SCRAP: 110 },
    growth: 1.75,
    maxLevel: 15,
    energyUse: 1.0,
    outputs: { DATA: 0.22 },
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
    desc: "+8% bank efficiency and +5K daily ship cap.",
    cost: { ORE: 400, GOLD: 260, SCRAP: 120 },
    requires: ["coolant"],
  },
  {
    key: "fieldOps",
    name: "Field Ops",
    desc: "Crew bonus increases and expeditions refresh faster.",
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
  baseEnergyRegen: 2.6,
  dailyShipCap: 12_000,
  expeditionCost: 18,
  expeditionCooldownMs: 90_000,
  overclockCost: 900,
  overclockDurationMs: 8 * 60 * 1000,
  refillCost: 180,
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
    desc: "Keep energy above 70% of cap.",
    rewardText: "Reward: GOLD 80 · XP 15",
    check: (state, derived) =>
      Number(state.resources?.ENERGY || 0) >= Math.floor((derived.energyCap || 0) * 0.7),
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

  if (energyCap > 0 && energy <= energyCap * 0.25) {
    alerts.push({
      key: "low-energy",
      tone: "warning",
      title: "Low energy reserve",
      text: "Production may stall soon. Consider refill or reducing pressure.",
    });
  }

  if (expeditionReady && Number(state.resources?.DATA || 0) >= 4) {
    alerts.push({
      key: "expedition-ready",
      tone: "info",
      title: "Expedition ready",
      text: "Field team is available for deployment.",
    });
  }

  if (banked >= 120) {
    alerts.push({
      key: "banked-ready",
      tone: "info",
      title: "Banked MLEO ready",
      text: "Refined reserves are building up. You may want to ship strategically.",
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
    version: 5,
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

function derive(state, now = Date.now()) {
  const powerLevel = state.buildings.powerCell || 0;
  const hqLevel = state.buildings.hq || 1;
  const minerLink = state.buildings.minerControl || 0;
  const arcadeLink = state.buildings.arcadeHub || 0;
  const logisticsLevel = state.buildings.logisticsCenter || 0;
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
    bankBonus *= 1.08;
  }
  if (state.modules.arcadeRelay) {
    dataMult *= 1.12;
  }
  if (state.modules.minerLink) {
    oreMult *= 1.08;
  }
  if (state.research.routing) bankBonus *= 1.08;
  if (state.research.minerSync) oreMult *= 1.12;
  if (state.research.arcadeOps) dataMult *= 1.10;
  if (state.research.logistics) bankBonus *= 1.10;
  if (state.research.deepScan) dataMult *= 1.18;
  if (state.research.tokenDiscipline) {
    dataMult *= 1.22;
    mleoMult *= 0.88;
    bankBonus *= 1.10;
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
    state.blueprintLevel * 1200 +
    logisticsLevel * 900 +
    (state.research.routing ? 5000 : 0);

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
    energyRegen: CONFIG.baseEnergyRegen + powerLevel * 0.35 + (state.research.coolant ? 0.8 : 0),
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
    expeditionCooldownMs: hasFieldOps ? 60000 : CONFIG.expeditionCooldownMs,
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
  const dataBefore = next.resources.DATA || 0;

  next.resources.ENERGY = clamp(next.resources.ENERGY + d.energyRegen * dt, 0, d.energyCap);

  const runBuilding = (key, producer) => {
    const level = next.buildings[key] || 0;
    if (!level) return;
    producer(level);
  };

  runBuilding("quarry", (level) => {
    const energyNeed = 1.1 * level * dt;
    if (next.resources.ENERGY < energyNeed) return;
    next.resources.ENERGY -= energyNeed;
    next.resources.ORE += 2.0 * level * d.oreMult * effective;
  });

  runBuilding("tradeHub", (level) => {
    const energyNeed = 1.4 * level * dt;
    if (next.resources.ENERGY < energyNeed) return;
    next.resources.ENERGY -= energyNeed;
    next.resources.GOLD += 1.0 * level * d.goldMult * effective;
  });

  runBuilding("salvage", (level) => {
    const energyNeed = 1.8 * level * dt;
    if (next.resources.ENERGY < energyNeed) return;
    next.resources.ENERGY -= energyNeed;
    next.resources.SCRAP += 0.8 * level * d.scrapMult * effective;
  });

  runBuilding("minerControl", (level) => {
    const energyNeed = 0.6 * level * dt;
    if (next.resources.ENERGY < energyNeed) return;
    next.resources.ENERGY -= energyNeed;
    next.resources.DATA += 0.15 * level * d.dataMult * effective;
  });

  runBuilding("arcadeHub", (level) => {
    const energyNeed = 0.8 * level * dt;
    if (next.resources.ENERGY < energyNeed) return;
    next.resources.ENERGY -= energyNeed;
    next.resources.DATA += 0.12 * level * d.dataMult * effective;
  });

  runBuilding("researchLab", (level) => {
    const energyNeed = 1.0 * level * dt;
    if (next.resources.ENERGY < energyNeed) return;
    next.resources.ENERGY -= energyNeed;
    next.resources.DATA += 0.22 * level * d.dataMult * effective;
  });

  runBuilding("logisticsCenter", (level) => {
    const energyNeed = 0.7 * level * dt;
    if (next.resources.ENERGY < energyNeed) return;
    next.resources.ENERGY -= energyNeed;
    next.resources.DATA += 0.06 * level * d.dataMult * effective;
  });

  runBuilding("repairBay", (level) => {
    const energyNeed = 0.8 * level * dt;
    if (next.resources.ENERGY < energyNeed) return;
    next.resources.ENERGY -= energyNeed;
    next.stability = Math.min(100, (next.stability || 100) + 0.02 * level * effective);
  });

  runBuilding("refinery", (level) => {
    const energyNeed = 3.2 * level * dt;
    const oreNeed = 1.8 * level * effective;
    const scrapNeed = 0.7 * level * effective;
    if (next.resources.ENERGY < energyNeed) return;
    if (next.resources.ORE < oreNeed || next.resources.SCRAP < scrapNeed) return;
    next.resources.ENERGY -= energyNeed;
    next.resources.ORE -= oreNeed;
    next.resources.SCRAP -= scrapNeed;
    next.bankedMleo += 0.12 * level * d.mleoMult * effective;
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

  if (energyCap > 0 && energy <= energyCap * 0.25) {
    return {
      title: "Recover energy reserves",
      text: "Low energy is becoming a bottleneck. Refill energy or improve your power support.",
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

  if (expeditionReady && Number(state.resources?.DATA || 0) >= 4) {
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

export default function MleoBase() {
  const { isConnected, address } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { openAccountModal } = useAccountModal();

  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState(() => freshState());
  const [sharedVault, setSharedVault] = useState(0);
  const [toast, setToast] = useState("");
  const [showHowToPlay, setShowHowToPlay] = useState(false);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState(null);
  const [showReadyPanel, setShowReadyPanel] = useState(false);
  
  // Mobile internal panels state (all closed by default)
  const [mobileLiveContractsOpen, setMobileLiveContractsOpen] = useState(false);
  const [mobileOperationsConsoleOpen, setMobileOperationsConsoleOpen] = useState(false);
  const [mobileDailyMissionsOpen, setMobileDailyMissionsOpen] = useState(false);
  const [mobileDevelopmentOpen, setMobileDevelopmentOpen] = useState(false);
  const [mobileBaseStructuresOpen, setMobileBaseStructuresOpen] = useState(false);
  const [mobileProgressSummaryOpen, setMobileProgressSummaryOpen] = useState(false);
  const [mobileActivityLogOpen, setMobileActivityLogOpen] = useState(false);

  const [activeEvent, setActiveEvent] = useState(null);
  const [eventCooldownUntil, setEventCooldownUntil] = useState(0);
  const [nextShipBonus, setNextShipBonus] = useState(0);

  const [expeditionMode, setExpeditionMode] = useState("balanced");
  const [crewRole, setCrewRole] = useState("engineer");
  const [commanderPath, setCommanderPath] = useState("industry");
  const [claimedContracts, setClaimedContracts] = useState({});
  const [devTab, setDevTab] = useState("crew");

  useEffect(() => {
    let alive = true;

    async function boot() {
      try {
        const seed = freshState();
        const serverRes = await getBaseState();
        const saved = serverRes?.state || null;

        // Reset state if version is less than 5 (new starter pack) or reset flag is set
        const resetFlag = typeof window !== "undefined" ? window.localStorage.getItem("base_reset_flag") === "true" : false;
        const resetVersion = typeof window !== "undefined" ? window.localStorage.getItem("base_reset_version") : null;
        
        // If reset flag is set, treat saved version as 0 to force reset
        const savedVersion = resetFlag && resetVersion ? Number(resetVersion) : (saved ? Number(saved.version || 0) : 0);
        const shouldReset = savedVersion < 5 || resetFlag;

        const initial = saved && !shouldReset
          ? {
              ...seed,
              version: Number(saved.version || seed.version),
              lastDay: saved.last_day || seed.lastDay,
              bankedMleo: Number(saved.banked_mleo || 0),
              sentToday: Number(saved.sent_today || 0),
              totalBanked: Number(saved.total_banked || 0),
              totalSharedSpent: Number(saved.total_shared_spent || 0),
              commanderLevel: Number(saved.commander_level || 1),
              commanderXp: Number(saved.commander_xp || 0),
              commanderPath: saved.commander_path || seed.commanderPath,
              blueprintLevel: Number(saved.blueprint_level || 0),
              crew: Number(saved.crew || 0),
              crewRole: saved.crew_role || seed.crewRole,
              overclockUntil: saved.overclock_until ? new Date(saved.overclock_until).getTime() : 0,
              expeditionReadyAt: saved.expedition_ready_at ? new Date(saved.expedition_ready_at).getTime() : Date.now(),
              maintenanceDue: Number(saved.maintenance_due || 0),
              stability: Number(saved.stability || 100),
              resources: { ...seed.resources, ...(saved.resources || {}) },
              buildings: { ...seed.buildings, ...(saved.buildings || {}) },
              modules: { ...(saved.modules || {}) },
              research: { ...(saved.research || {}) },
              stats: { ...seed.stats, ...(saved.stats || {}) },
              missionState: {
                ...seed.missionState,
                ...(saved.mission_state || {}),
                completed: { ...(saved.mission_state?.completed || {}) },
                claimed: { ...(saved.mission_state?.claimed || {}) },
              },
              log: Array.isArray(saved.log) && saved.log.length ? saved.log : seed.log,
              lastTickAt: Date.now(),
              lastHiddenAt: 0,
            }
          : seed;

        if (!alive) return;

        // Clear reset flags after state is set (if they were used)
        if (resetFlag && typeof window !== "undefined") {
          window.localStorage.removeItem("base_reset_flag");
          window.localStorage.removeItem("base_reset_version");
        }

        setMounted(true);
        setState(initial);

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

        setState((prev) => ({
          ...prev,
          version: Number(serverState.version || prev.version),
          lastDay: serverState.last_day || prev.lastDay,
          bankedMleo: Number(serverState.banked_mleo || prev.bankedMleo),
          sentToday: Number(serverState.sent_today || prev.sentToday),
          totalBanked: Number(serverState.total_banked || prev.totalBanked),
          totalSharedSpent: Number(serverState.total_shared_spent || prev.totalSharedSpent),
          commanderLevel: Number(serverState.commander_level || prev.commanderLevel),
          commanderXp: Number(serverState.commander_xp || prev.commanderXp),
          commanderPath: serverState.commander_path || prev.commanderPath,
          blueprintLevel: Number(serverState.blueprint_level || prev.blueprintLevel),
          crew: Number(serverState.crew || prev.crew),
          crewRole: serverState.crew_role || prev.crewRole,
          overclockUntil: serverState.overclock_until ? new Date(serverState.overclock_until).getTime() : 0,
          expeditionReadyAt: serverState.expedition_ready_at ? new Date(serverState.expedition_ready_at).getTime() : prev.expeditionReadyAt,
          maintenanceDue: Number(serverState.maintenance_due || prev.maintenanceDue),
          stability: Number(serverState.stability || prev.stability),
          resources: serverState.resources || prev.resources,
          buildings: serverState.buildings || prev.buildings,
          modules: serverState.modules || prev.modules,
          research: serverState.research || prev.research,
          stats: { ...prev.stats, ...(serverState.stats || {}) },
          missionState: {
            ...prev.missionState,
            ...(serverState.mission_state || {}),
            completed: { ...(serverState.mission_state?.completed || {}) },
            claimed: { ...(serverState.mission_state?.claimed || {}) },
          },
          log: Array.isArray(serverState.log) && serverState.log.length ? serverState.log : prev.log,
          lastTickAt: Date.now(),
          lastHiddenAt: 0,
        }));
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

  const readyItems = useMemo(() => {
    const items = [];

    const expeditionReadyNow =
      Number(state.expeditionReadyAt || 0) <= Date.now() &&
      Number(state.resources?.DATA || 0) >= 4;

    const claimableContractsCount = liveContracts.filter(
      (c) => c.done && !c.claimed
    ).length;

    const bankedReady = Number(state.bankedMleo || 0) >= 120;

    if (expeditionReadyNow) {
      items.push({
        key: "expedition",
        title: "Expedition ready",
        text: "Field team is available for deployment.",
      });
    }

    if (claimableContractsCount > 0) {
      items.push({
        key: "contracts",
        title: "Contract reward ready",
        text: `${claimableContractsCount} command contract${claimableContractsCount > 1 ? "s are" : " is"} ready to claim.`,
      });
    }

    if (bankedReady) {
      items.push({
        key: "shipment",
        title: "Shipment opportunity",
        text: "Banked MLEO is ready for a measured shipment.",
      });
    }

    return items;
  }, [state, liveContracts]);
  const blueprintCost = useMemo(
    () => Math.floor(CONFIG.blueprintBaseCost * Math.pow(CONFIG.blueprintGrowth, state.blueprintLevel)),
    [state.blueprintLevel]
  );
  const expeditionLeft = Math.max(0, (state.expeditionReadyAt || 0) - Date.now());
  const overclockLeft = Math.max(0, (state.overclockUntil || 0) - Date.now());
  const missionProgress = getMissionProgress(state);
  const alerts = useMemo(
    () => getAlerts(state, derived, systemState, liveContracts),
    [state, derived, systemState, liveContracts]
  );

  const nextStep = useMemo(
    () => getNextStep(state, derived, systemState, liveContracts),
    [state, derived, systemState, liveContracts]
  );

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
    showToast(`Crew role: ${crewRoleMeta(roleKey).name}`);
  };

  const handleCommanderPathChange = (pathKey) => {
    setCommanderPath(pathKey);
    setState((prev) => ({
      ...prev,
      commanderPath: pathKey,
      log: pushLog(prev.log, `Commander path set to ${commanderPathMeta(pathKey).name}.`),
    }));
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
        const serverState = res.state;
        setState((prev) => {
          const next = {
            ...prev,
            resources: serverState.resources || prev.resources,
            buildings: serverState.buildings || prev.buildings,
            commanderXp: Number(serverState.commander_xp || prev.commanderXp),
            commanderLevel: Number(serverState.commander_level || prev.commanderLevel),
            stats: { ...prev.stats, ...(serverState.stats || {}) },
            log: pushLog(prev.log, `${def.name} upgraded to level ${res.new_level || level + 1}.`),
          };
          return applyLevelUps(next);
        });
        showToast(`${def.name} upgraded to level ${res.new_level || level + 1}.`);
      } else {
        showToast(res?.message || "Build failed.");
      }
    } catch (error) {
      console.error("Build failed", error);
      showToast("Build action failed. Try again.");
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
        const serverState = res.state;
        setState((prev) => {
          const next = {
            ...prev,
            crew: Number(serverState.crew || prev.crew),
            resources: serverState.resources || prev.resources,
            commanderXp: Number(serverState.commander_xp || prev.commanderXp),
            commanderLevel: Number(serverState.commander_level || prev.commanderLevel),
            log: pushLog(prev.log, `Crew hired. Team size is now ${res.new_crew || prev.crew + 1}.`),
          };
          return applyLevelUps(next);
        });
        showToast(`Crew hired. Team size is now ${res.new_crew || state.crew + 1}.`);
      } else {
        showToast(res?.message || "Hire failed.");
      }
    } catch (error) {
      console.error("Hire crew failed", error);
      showToast("Hire action failed. Try again.");
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
        const serverState = res.state;
        setState((prev) => {
          const next = {
            ...prev,
            resources: serverState.resources || prev.resources,
            modules: serverState.modules || prev.modules,
            commanderXp: Number(serverState.commander_xp || prev.commanderXp),
            commanderLevel: Number(serverState.commander_level || prev.commanderLevel),
            log: pushLog(prev.log, `${moduleDef.name} installed.`),
          };
          return applyLevelUps(next);
        });
        showToast(`${moduleDef.name} installed.`);
      } else {
        showToast(res?.message || "Module install failed.");
      }
    } catch (error) {
      console.error("Module install failed", error);
      showToast("Module install failed. Try again.");
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
        const serverState = res.state;
        setState((prev) => {
          const next = {
            ...prev,
            resources: serverState.resources || prev.resources,
            research: serverState.research || prev.research,
            commanderXp: Number(serverState.commander_xp || prev.commanderXp),
            commanderLevel: Number(serverState.commander_level || prev.commanderLevel),
            log: pushLog(prev.log, `${def.name} research completed.`),
          };
          return applyLevelUps(next);
        });
        showToast(`${def.name} research completed.`);
      } else {
        showToast(res?.message || "Research failed.");
      }
    } catch (error) {
      console.error("Research failed", error);
      showToast("Research action failed. Try again.");
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
          const next = {
            ...prev,
            expeditionReadyAt: serverState.expedition_ready_at
              ? new Date(serverState.expedition_ready_at).getTime()
              : prev.expeditionReadyAt,
            totalExpeditions: (prev.totalExpeditions || 0) + 1,
            resources: serverState.resources || prev.resources,
            bankedMleo: Number(serverState.banked_mleo || prev.bankedMleo),
            commanderXp: Number(serverState.commander_xp || prev.commanderXp),
            commanderLevel: Number(serverState.commander_level || prev.commanderLevel),
            stats: { ...prev.stats, ...(serverState.stats || {}) },
            log: pushLog(
              prev.log,
              `Expedition (${expeditionMode}) returned with ${loot.ore || 0} ORE, ${loot.gold || 0} GOLD, ${loot.scrap || 0} SCRAP, ${loot.data || 0} DATA${loot.bankedMleo ? ` and ${loot.bankedMleo} MLEO` : ""}.`
            ),
          };
          return applyLevelUps(next);
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
      if (res?.success && res?.state) {
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
          const next = {
            ...prev,
            bankedMleo: Number(serverState.banked_mleo || prev.bankedMleo),
            sentToday: Number(serverState.sent_today || prev.sentToday),
            totalBanked: Number(serverState.total_banked || prev.totalBanked),
            commanderXp: Number(serverState.commander_xp || prev.commanderXp),
            commanderLevel: Number(serverState.commander_level || prev.commanderLevel),
            stats: { ...prev.stats, ...(serverState.stats || {}) },
            log: pushLog(
              prev.log,
              `Shipped ${fmt(shippedBase)} MLEO to shared vault${
                bonusAmount > 0 ? ` (+${fmt(bonusAmount)} logistics bonus)` : ""
              }.`
            ),
          };
          return applyLevelUps(next);
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
      showToast("Ship action failed. Try again.");
    }
  };

  const handleVaultSpend = async (cost, label, applyUpdate, successMessage) => {
    const delta = Math.max(0, Math.floor(Number(cost || 0)));
    if (!delta) return false;
    const current = await readVaultSafe();
    if (current < delta) {
      showToast("Shared vault balance is too low.");
      return false;
    }
    const res = await applyBaseVaultDelta(-delta, "mleo-base-spend");
    if (!res?.ok) {
      showToast("Shared vault balance is too low.");
      return false;
    }
    const latestVault = await readVaultSafe();
    setSharedVault(latestVault);
    setState((prev) => {
      const updated = applyUpdate(prev);

      return applyLevelUps({
        ...updated,
        totalSharedSpent: (prev.totalSharedSpent || 0) + cost,
        commanderXp: (updated.commanderXp || prev.commanderXp) + Math.max(5, Math.floor(cost / 40)),
        stats: {
          ...(updated.stats || prev.stats),
          vaultSpentToday: (prev.stats?.vaultSpentToday || 0) + cost,
        },
        log: pushLog(prev.log, `${label} purchased for ${fmt(cost)} MLEO.`),
      });
    });
    if (successMessage) showToast(successMessage);
    return true;
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
        showToast("Blueprint cache secured. Banking efficiency improved.");
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

  const claimMission = (key) => {
    const mission = DAILY_MISSIONS.find((item) => item.key === key);
    if (!mission) return;
    updateState((prev) => {
      if (prev.missionState?.claimed?.[key]) return prev;
      const progress = getMissionProgress(prev)[key] || 0;
      if (progress < mission.target) {
        showToast("Mission is not complete yet.");
        return prev;
      }
      const nextResources = { ...prev.resources };
      for (const [rk, rv] of Object.entries(mission.reward || {})) {
        if (rk === "XP") continue;
        nextResources[rk] = (nextResources[rk] || 0) + rv;
      }
      return applyLevelUps({
        ...prev,
        resources: nextResources,
        commanderXp: prev.commanderXp + (mission.reward?.XP || 0),
        totalMissionsDone: (prev.totalMissionsDone || 0) + 1,
        missionState: {
          ...prev.missionState,
          claimed: { ...(prev.missionState?.claimed || {}), [key]: true },
        },
        log: pushLog(prev.log, `Mission claimed: ${mission.name}.`),
      });
    });
  };

  const dailyMissionsContent = (
    <div className="space-y-3">
      {DAILY_MISSIONS.map((mission) => {
        const progress = missionProgress[mission.key] || 0;
        const done = progress >= mission.target;
        const claimed = !!state.missionState?.claimed?.[mission.key];
        return (
          <div key={mission.key} className="rounded-xl border border-white/10 bg-black/20 p-2.5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-xs font-semibold">{mission.name}</div>
                <div className="mt-1 text-[11px] text-white/60">
                  Progress: {fmt(progress)} / {fmt(mission.target)}
                </div>
                <div className="mt-1 text-[11px] text-white/55">Reward: {rewardText(mission.reward)}</div>
              </div>
              <button
                onClick={() => claimMission(mission.key)}
                disabled={!done || claimed}
                className="rounded-xl bg-white/10 px-3 py-1.5 text-[11px] font-semibold hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
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
          <button onClick={hireCrew} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20">
            Hire
          </button>
        </div>

              <div className="text-xs text-white/55">
          Next cost: {Object.entries(workerNextCost).map(([k, v]) => `${k} ${fmt(v)}`).join(" · ")}
              </div>

              <div>
                <div className="mb-2 text-xs uppercase tracking-[0.18em] text-white/45">Crew Specialization</div>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {CREW_ROLES.map((role) => {
                    const active = crewRole === role.key;
                    return (
                      <button
                        key={role.key}
                        onClick={() => handleCrewRoleChange(role.key)}
                        className={`rounded-xl border px-3 py-2.5 text-left transition ${
                          active
                            ? "border-cyan-400/40 bg-cyan-500/15"
                            : "border-white/10 bg-white/5 hover:bg-white/10"
                        }`}
                      >
                        <div className="text-sm font-semibold text-white">{role.name}</div>
                        <div className="mt-1 text-xs text-white/60">{role.desc}</div>
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
                    className={`rounded-xl border px-3 py-2.5 text-left transition ${
                      active
                        ? "border-fuchsia-400/40 bg-fuchsia-500/15"
                        : "border-white/10 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <div className="text-sm font-semibold text-white">{path.name}</div>
                    <div className="mt-1 text-xs text-white/60">{path.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      ) : null}

      {devTab === "modules" ? (
        <div className="grid gap-3 xl:grid-cols-2">
        {MODULES.map((module) => {
          const owned = !!state.modules[module.key];
          return (
            <div key={module.key} className="flex h-full flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex min-h-[96px] flex-col">
                <div className="text-sm font-semibold">{module.name}</div>
                <div className="mt-1 text-xs text-white/60">{module.desc}</div>
                <div className="mt-2 text-xs text-white/55">
                  Cost: {Object.entries(module.cost).map(([k, v]) => `${k} ${fmt(v)}`).join(" · ")}
                </div>
              </div>
              <button
                onClick={() => buyModule(module.key)}
                disabled={owned}
                className="mt-auto w-full rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {owned ? "Installed" : "Install"}
              </button>
            </div>
          );
        })}
      </div>
      ) : null}

      {devTab === "research" ? (
      <div className="grid gap-3">
        {RESEARCH.map((item) => {
          const done = !!state.research[item.key];
          const locked = item.requires?.some((key) => !state.research[key]);
          return (
            <div key={item.key} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold">{item.name}</div>
                  <div className="mt-1 text-xs text-white/60">{item.desc}</div>
                  <div className="mt-2 text-xs text-white/55">
                    Cost: {Object.entries(item.cost).map(([k, v]) => `${k} ${fmt(v)}`).join(" · ")}
                  </div>
                </div>
                <button
                  onClick={() => buyResearch(item.key)}
                  disabled={done || locked}
                  className="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
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

  const baseStructuresContent = (
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
      {BUILDINGS.map((building) => {
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
            className="flex min-h-[210px] flex-col rounded-xl border border-white/10 bg-black/20 p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex min-h-[28px] items-start text-sm font-semibold leading-5 text-white">
                  {building.name}
                </div>
              </div>

              <div className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-[11px] font-semibold text-white/65">
                Lv {level}
              </div>
            </div>

            <div className="mt-1 text-[11px] leading-4 text-white/60 line-clamp-2">
              {building.desc}
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              <div className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/70">
                {buildingRoleTag(building.key)}
              </div>
              <div className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[11px] font-semibold text-cyan-200">
                {buildingSynergyTag(building.key)}
              </div>
            </div>

            <div className="mt-3 inline-flex w-fit rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-white/65">
              {sectorStatusForBuilding(building.key, state).toUpperCase()}
            </div>

            <div className="mt-2 text-[11px] font-medium text-cyan-200/85">
              Next Lv {nextLevel}
            </div>

            <div className="mt-2 min-h-[28px] text-[11px] leading-4 text-white/55">
              Cost:{" "}
              {Object.entries(cost)
                .map(([k, v]) => `${k} ${fmt(v)}`)
                .join(" · ")}
            </div>

            <div className="mt-auto flex min-h-[52px] flex-col justify-end pt-3">
              <button
                onClick={() => buyBuilding(building.key)}
                disabled={!ready}
                className="w-full rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {buttonText}
              </button>

              <div className="mt-1 min-h-[24px] text-center text-[10px] leading-4 text-white/45">
                {!isUnlocked && requirementsText ? (
                  <>Requires: {requirementsText}</>
                ) : ready ? (
                  <>Ready to upgrade</>
                ) : isUnlocked ? (
                  <>Need more resources</>
                ) : (
                  <>&nbsp;</>
                )}
              </div>
            </div>
          </div>
        );
      })}
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
    setMobilePanel(panel);
  };

  const closeMobilePanel = () => {
    setMobilePanel(null);
  };

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
      <main className="min-h-screen overflow-x-hidden bg-[#07111f] text-white">
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
                    className="flex h-[46px] w-[46px] items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"
                    aria-label="Open menu"
                  >
                    <span className="text-[22px] leading-none">☰</span>
                  </button>
                </div>
              </div>
              <p className="hidden sm:block mt-2 max-w-2xl text-sm text-white/70 sm:text-base">
                {CONFIG.subtitle} Build a live command identity through sectors, contracts, specialization and controlled support systems.
              </p>
            </div>

            <div className="hidden sm:flex flex-wrap items-center gap-2 sm:justify-start">
              <Link href="/mining" className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold hover:bg-white/10">
                Hub
              </Link>
              <button
                onClick={() => setShowHowToPlay(true)}
                className="rounded-xl border border-blue-500/25 bg-blue-500/10 px-4 py-2.5 text-sm font-semibold text-blue-200 hover:bg-blue-500/20"
              >
                HOW TO PLAY
              </button>
              {isConnected ? (
                <button onClick={() => openAccountModal?.()} className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold hover:bg-white/20">
                  {address?.slice(0, 6)}…{address?.slice(-4)}
                </button>
              ) : (
                <button onClick={() => openConnectModal?.()} className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold hover:bg-rose-500">
                  Connect
                </button>
              )}
            </div>
          </div>

          {alerts.length ? (
            <div className="mt-4 hidden space-y-2 sm:block">
              {alerts.map((alert) => (
                <div
                  key={alert.key}
                  className={`rounded-2xl border px-4 py-3 ${alertToneClasses(alert.tone)}`}
                >
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-sm font-bold">{alert.title}</div>
                      <div className="text-xs text-white/75">{alert.text}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {/* Desktop */}
          <div className="mt-6 hidden gap-3 xl:grid xl:grid-cols-6 xl:items-stretch">
              <MetricCard
              label="Shared Vault"
              value={`${fmt(sharedVault)} MLEO`}
              note="Shared across Miners, Arcade and Online."
              accent="emerald"
            />
            <MetricCard
              label="Base Banked"
              value={`${fmt(state.bankedMleo)} MLEO`}
              note="Refined here, then shipped."
              accent="violet"
            />
            <MetricCard
              label="Commander"
              value={`Lv ${state.commanderLevel}`}
              note={`${fmt(state.commanderXp)} / ${fmt(xpForLevel(state.commanderLevel))} XP`}
                accent="sky"
              />
            <div className={`h-full w-full ${highlightCard((state.resources.ENERGY || 0) <= derived.energyCap * 0.25, "warning")}`}>
              <MetricCard
                label="Energy"
                value={`${fmt(state.resources.ENERGY)} / ${fmt(derived.energyCap)}`}
                note={`Regen ${derived.energyRegen.toFixed(2)}/s`}
                accent="slate"
              />
            </div>
            <div className={`h-full w-full ${highlightCard(systemState === "critical", "critical") || highlightCard(systemState === "warning", "warning")}`}>
              <MetricCard
                label="Stability"
                value={`${fmt(state.stability)}%`}
                note={systemMeta.label}
                accent={systemMeta.accent}
              />
            </div>
            <MetricCard
              label="Data"
              value={fmt(state.resources.DATA)}
              note={`x${derived.dataMult.toFixed(2)} progression`}
              accent="sky"
            />
          </div>

          <div className="mt-3 hidden xl:grid xl:grid-cols-3 gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-xs uppercase tracking-[0.18em] text-white/45">Ore</div>
              <div className="mt-1 text-lg font-bold text-white">{fmt(state.resources.ORE)}</div>
              <div className="mt-1 text-xs text-white/55">x{derived.oreMult.toFixed(2)} output</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-xs uppercase tracking-[0.18em] text-white/45">Gold</div>
              <div className="mt-1 text-lg font-bold text-white">{fmt(state.resources.GOLD)}</div>
              <div className="mt-1 text-xs text-white/55">x{derived.goldMult.toFixed(2)} output</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-xs uppercase tracking-[0.18em] text-white/45">Scrap</div>
              <div className="mt-1 text-lg font-bold text-white">{fmt(state.resources.SCRAP)}</div>
              <div className="mt-1 text-xs text-white/55">x{derived.scrapMult.toFixed(2)} output</div>
            </div>
          </div>

          {/* Mobile */}
          <div className="mt-6 space-y-3 sm:hidden pb-2">

            <div
              onClick={() => {
                if (readyItems.length) setShowReadyPanel(true);
              }}
              className={`rounded-2xl border px-4 py-3 transition ${
                readyItems.length
                  ? "cursor-pointer border-cyan-400/25 bg-cyan-500/10 hover:bg-cyan-500/15"
                  : "border-white/10 bg-white/5"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white">
                    {readyItems.length ? "Ready actions available" : "Base is stable"}
                  </div>
                  <div className="text-xs text-white/75">
                    {readyItems.length
                      ? `${readyItems.length} item${readyItems.length > 1 ? "s" : ""} waiting`
                      : "Nothing needs attention right now."}
                  </div>
                </div>

                <div className="shrink-0 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white/80">
                  {readyItems.length ? "OPEN" : "OK"}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <MetricCard
                label="Shared Vault"
                value={`${fmt(sharedVault)} MLEO`}
                note="Shared across the MLEO ecosystem."
                accent="emerald"
              />
              <MetricCard
                label="Base Banked"
                value={`${fmt(state.bankedMleo)} MLEO`}
                note="Refined here, then shipped."
                accent="violet"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <MetricCard
                label="Commander"
                value={`Lv ${state.commanderLevel}`}
                note={`${fmt(state.commanderXp)} / ${fmt(xpForLevel(state.commanderLevel))} XP`}
                accent="sky"
                compact
              />

              <MetricCard
                label="Data"
                value={fmt(state.resources.DATA)}
                note={`x${derived.dataMult.toFixed(2)} progression`}
                accent="sky"
                compact
              />

              <div className={`w-full ${highlightCard((state.resources.ENERGY || 0) <= derived.energyCap * 0.25, "warning")}`}>
                <MetricCard
                  label="Energy"
                  value={`${fmt(state.resources.ENERGY)} / ${fmt(derived.energyCap)}`}
                  note={`Regen ${derived.energyRegen.toFixed(2)}/s`}
                  accent="slate"
                  compact
                />
              </div>

              <div className={`w-full ${highlightCard(systemState === "critical", "critical") || highlightCard(systemState === "warning", "warning")}`}>
                <MetricCard
                  label="Stability"
                  value={`${fmt(state.stability)}%`}
                  note={systemMeta.label}
                  accent={systemMeta.accent}
                  compact
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">Ore</div>
                <div className="mt-1 text-sm font-bold text-white">{fmt(state.resources.ORE)}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">Gold</div>
                <div className="mt-1 text-sm font-bold text-white">{fmt(state.resources.GOLD)}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">Scrap</div>
                <div className="mt-1 text-sm font-bold text-white">{fmt(state.resources.SCRAP)}</div>
              </div>
            </div>
          </div>

          {/* Mobile Bottom Nav */}
          <div className="fixed inset-x-0 bottom-0 z-[110] border-t border-white/10 bg-[#07111f]/95 px-3 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-3 backdrop-blur sm:hidden">
            <div className="grid grid-cols-4 gap-2">
              {[
                { key: "overview", label: "Overview" },
                { key: "ops", label: "Operations" },
                { key: "build", label: "Build" },
                { key: "intel", label: "Intel" },
              ].map((tab) => {
                const active = mobilePanel === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => openMobilePanel(tab.key)}
                    className={`rounded-2xl px-3 py-3 text-xs font-bold transition ${
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
          </div>

          {/* Mobile Panel Overlay */}
          {mobilePanel ? (
            <div className="fixed inset-0 z-[115] bg-black/55 backdrop-blur-sm sm:hidden">
              <div className="absolute inset-x-0 bottom-0 top-[84px] rounded-t-[28px] border border-white/10 bg-[#0b1526] shadow-2xl">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
                  <div className="text-lg font-bold text-white">{mobilePanelTitle}</div>
                  <button
                    onClick={closeMobilePanel}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
                  >
                    Close
                  </button>
                </div>

                <div className="h-[calc(100%-73px)] overflow-y-auto px-4 py-4">
                  {mobilePanel === "overview" ? (
                    <div className="space-y-4">
                      <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                        <div className="text-lg font-bold text-white">Next Recommended Step</div>
                        <div className="mt-3 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4">
                          <div className="text-base font-bold text-white">{nextStep.title}</div>
                          <div className="mt-1 text-sm text-white/70">{nextStep.text}</div>
                        </div>
                      </div>

                      <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                        <div className="text-lg font-bold text-white">Command Identity</div>
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
                      </div>

                      <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                        <div className="flex items-center justify-between">
                          <div className="text-lg font-bold text-white">Live Contracts</div>
                          <button
                            onClick={() => setMobileLiveContractsOpen(!mobileLiveContractsOpen)}
                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                          >
                            {mobileLiveContractsOpen ? "CLOSE" : "OPEN"}
                          </button>
                        </div>
                        {mobileLiveContractsOpen && (
                          <div className="mt-3 grid gap-2">
                            {liveContracts.map((contract) => (
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
                    <div className="space-y-4">
                      <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                        <div className="flex items-center justify-between">
                          <div className="text-lg font-bold text-white">Operations Console</div>
                          <button
                            onClick={() => setMobileOperationsConsoleOpen(!mobileOperationsConsoleOpen)}
                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                          >
                            {mobileOperationsConsoleOpen ? "CLOSE" : "OPEN"}
                          </button>
                        </div>
                        {mobileOperationsConsoleOpen && (
                          <div className="mt-4 grid gap-3">
                            <button
                              onClick={bankToSharedVault}
                              className="w-full rounded-2xl bg-emerald-600 px-4 py-4 text-sm font-extrabold hover:bg-emerald-500"
                            >
                              Ship {fmt(state.bankedMleo)} MLEO
                            </button>

                            <button
                              onClick={handleLaunchExpedition}
                              disabled={expeditionLeft > 0 || state.resources.ENERGY < CONFIG.expeditionCost}
                              className="w-full rounded-2xl bg-cyan-600 px-4 py-4 text-sm font-extrabold hover:bg-cyan-500 disabled:opacity-40"
                            >
                              {expeditionLeft > 0 ? `Ready in ${Math.ceil(expeditionLeft / 1000)}s` : "Launch Expedition"}
                            </button>

                            <button
                              onClick={buyBlueprint}
                              className="w-full rounded-2xl bg-fuchsia-600 px-4 py-4 text-sm font-bold hover:bg-fuchsia-500"
                            >
                              Buy Blueprint Lv {state.blueprintLevel + 1}
                            </button>

                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={activateOverclock}
                                className="rounded-xl bg-amber-600 px-3 py-3 text-sm font-bold hover:bg-amber-500"
                              >
                                Overclock
                              </button>
                              <button
                                onClick={refillEnergy}
                                className="rounded-xl bg-white/10 px-3 py-3 text-sm font-bold hover:bg-white/20"
                              >
                                Refill
                              </button>
                            </div>

                            <button
                              onClick={performMaintenance}
                              className={`w-full rounded-xl px-3 py-3 text-sm font-bold ${
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
                        )}
                      </div>

                      <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                        <div className="flex items-center justify-between">
                          <div className="text-lg font-bold text-white">Daily Missions</div>
                          <button
                            onClick={() => setMobileDailyMissionsOpen(!mobileDailyMissionsOpen)}
                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                          >
                            {mobileDailyMissionsOpen ? "CLOSE" : "OPEN"}
                          </button>
                        </div>
                        {mobileDailyMissionsOpen && (
                          <div className="mt-4">{dailyMissionsContent}</div>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {mobilePanel === "build" ? (
                    <div className="space-y-4">
                      <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                        <div className="flex items-center justify-between">
                          <div className="text-lg font-bold text-white">Development</div>
                          <button
                            onClick={() => setMobileDevelopmentOpen(!mobileDevelopmentOpen)}
                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                          >
                            {mobileDevelopmentOpen ? "CLOSE" : "OPEN"}
                          </button>
                        </div>
                        {mobileDevelopmentOpen && (
                          <div className="mt-4">{crewModulesResearchContent}</div>
                        )}
                      </div>

                      <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                        <div className="flex items-center justify-between">
                          <div className="text-lg font-bold text-white">Base Structures</div>
                          <button
                            onClick={() => setMobileBaseStructuresOpen(!mobileBaseStructuresOpen)}
                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                          >
                            {mobileBaseStructuresOpen ? "CLOSE" : "OPEN"}
                          </button>
                        </div>
                        {mobileBaseStructuresOpen && (
                          <div className="mt-4">{baseStructuresContent}</div>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {mobilePanel === "intel" ? (
                    <div className="space-y-4">
                      <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                        <div className="flex items-center justify-between">
                          <div className="text-lg font-bold text-white">Progress Summary</div>
                          <button
                            onClick={() => setMobileProgressSummaryOpen(!mobileProgressSummaryOpen)}
                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                          >
                            {mobileProgressSummaryOpen ? "CLOSE" : "OPEN"}
                          </button>
                        </div>
                        {mobileProgressSummaryOpen && (
                          <div className="mt-4">{progressSummaryContent}</div>
                        )}
                      </div>

                      <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                        <div className="flex items-center justify-between">
                          <div className="text-lg font-bold text-white">Activity Log</div>
                          <button
                            onClick={() => setMobileActivityLogOpen(!mobileActivityLogOpen)}
                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                          >
                            {mobileActivityLogOpen ? "CLOSE" : "OPEN"}
                          </button>
                        </div>
                        {mobileActivityLogOpen && (
                          <div className="mt-4">{activityLogContent}</div>
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
                    <div className="text-lg font-bold text-white">Ready Now</div>
                    <div className="mt-1 text-xs text-white/60">
                      Live actions and rewards currently available.
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
                  {readyItems.length ? (
                    readyItems.map((item) => (
                      <button
                        key={item.key}
                        onClick={() => {
                          setShowReadyPanel(false);

                          if (item.key === "expedition" || item.key === "shipment") {
                            setMobilePanel("ops");
                          } else if (item.key === "contracts") {
                            setMobilePanel("overview");
                          }
                        }}
                        className="block w-full rounded-2xl border border-white/10 bg-black/20 p-3 text-left hover:bg-white/10"
                      >
                        <div className="text-sm font-semibold text-white">{item.title}</div>
                        <div className="mt-1 text-xs text-white/65">{item.text}</div>
                      </button>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
                      Nothing is ready right now.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

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
            <div className="mt-4 hidden rounded-3xl border border-white/10 bg-white/5 p-4 sm:block">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
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
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-white/45">Crew Role</div>
              <div className="mt-1 text-lg font-bold text-white">{crewRoleInfo.name}</div>
              <div className="mt-1 text-xs text-white/60">{roleBonusText}</div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-white/45">Commander Path</div>
              <div className="mt-1 text-lg font-bold text-white">{commanderPathInfo.name}</div>
              <div className="mt-1 text-xs text-white/60">{commanderPathText}</div>
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
                    className={`flex min-h-[180px] flex-col rounded-2xl border border-white/10 bg-black/20 p-4 ${
                      contract.done && !contract.claimed ? highlightCard(true, "success") : ""
                    }`}
                  >
                    <div className="text-sm font-semibold text-white">{contract.title}</div>
                    <div className="mt-1 text-xs text-white/60">{contract.desc}</div>

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
                  className={`flex h-full flex-col gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 ${
                    highlightCard((state.bankedMleo || 0) >= 120, "success")
                  }`}
                >
                  <div className="flex min-h-[88px] flex-col">
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
                  className={`flex h-full flex-col gap-3 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4 ${
                    highlightCard(expeditionLeft <= 0 && (state.resources.DATA || 0) >= 4, "info")
                  }`}
                >
                  <div className="flex min-h-[88px] flex-col">
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
                    disabled={expeditionLeft > 0 || state.resources.ENERGY < CONFIG.expeditionCost}
                    className="mt-auto w-full rounded-2xl bg-cyan-600 px-4 py-3.5 text-sm font-extrabold shadow-lg shadow-cyan-900/30 transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {expeditionLeft > 0 ? `Ready in ${Math.ceil(expeditionLeft / 1000)}s` : "Launch Expedition"}
                  </button>
                </div>

                <div className="flex h-full flex-col gap-3 rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/10 p-4">
                  <div className="flex min-h-[88px] flex-col">
                    <div className="text-sm font-semibold text-fuchsia-200">Blueprint Cache</div>
                    <p className="mt-1 text-sm text-white/70">
                      Costs {fmt(blueprintCost)} shared MLEO. Raises banking efficiency and daily ship cap permanently.
                    </p>
                  </div>
                  <button
                    onClick={buyBlueprint}
                    className="mt-auto w-full rounded-xl bg-fuchsia-600 px-4 py-3 text-sm font-bold hover:bg-fuchsia-500"
                  >
                    Buy Blueprint Lv {state.blueprintLevel + 1}
                  </button>
                </div>

                <div
                  className={`flex h-full flex-col gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 ${
                    systemState === "critical"
                      ? highlightCard(true, "critical")
                      : systemState === "warning"
                      ? highlightCard(true, "warning")
                      : ""
                  }`}
                >
                  <div className="flex min-h-[88px] flex-col">
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

            <Section
              title="Daily Missions"
              subtitle="Daily goals give players direction without turning BASE into an aggressive faucet."
            >
              {dailyMissionsContent}
            </Section>
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
