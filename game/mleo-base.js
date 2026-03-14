import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useAccountModal, useConnectModal } from "@rainbow-me/rainbowkit";
import Layout from "../components/Layout";
import {
  initVaultAdapter,
  getBalance as getVaultBalance,
  queueDelta,
  flushDelta,
} from "../lib/vaultAdapter";

const STATE_KEY = "mleo_base_v1";
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
    energyUse: 1.4,
    outputs: { GOLD: 1.0 },
    requires: [{ key: "quarry", lvl: 2 }],
  },
  {
    key: "salvage",
    name: "Salvage Yard",
    desc: "Recovers Scrap for advanced systems.",
    baseCost: { GOLD: 150, ORE: 90 },
    growth: 1.22,
    energyUse: 1.8,
    outputs: { SCRAP: 0.8 },
    requires: [{ key: "quarry", lvl: 3 }],
  },
  {
    key: "refinery",
    name: "Refinery",
    desc: "Converts Ore + Scrap into bankable MLEO.",
    baseCost: { GOLD: 280, ORE: 180, SCRAP: 35 },
    growth: 1.25,
    energyUse: 3.2,
    convert: { ORE: 1.8, SCRAP: 0.7, MLEO: 0.12 },
    requires: [
      { key: "salvage", lvl: 2 },
      { key: "tradeHub", lvl: 2 },
    ],
  },
  {
    key: "powerCell",
    name: "Power Cell",
    desc: "Boosts Energy cap and regeneration.",
    baseCost: { GOLD: 240, SCRAP: 45 },
    growth: 1.24,
    energyUse: 0,
    power: { cap: 24, regen: 0.35 },
    requires: [{ key: "tradeHub", lvl: 2 }],
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
    reward: { XP: 30, DATA: 8 },
  },
  {
    key: "ship_mleo",
    name: "Ship 250 MLEO",
    target: 250,
    reward: { XP: 40, GOLD: 180 },
  },
  {
    key: "run_expedition",
    name: "Complete 1 expedition",
    target: 1,
    reward: { XP: 35, SCRAP: 20 },
  },
  {
    key: "spend_vault",
    name: "Spend 150 MLEO from vault",
    target: 150,
    reward: { XP: 50, DATA: 12 },
  },
  {
    key: "generate_data",
    name: "Generate 40 DATA",
    target: 40,
    reward: { XP: 35, GOLD: 120 },
  },
  {
    key: "perform_maintenance",
    name: "Perform 1 maintenance",
    target: 1,
    reward: { XP: 45, DATA: 10 },
  },
  {
    key: "double_expedition",
    name: "Launch 2 expeditions",
    target: 2,
    reward: { XP: 45, SCRAP: 30 },
  },
];

const CONFIG = {
  title: "MLEO BASE",
  subtitle: "Command your MLEO base, connect Miners + Arcade, and grow your shared vault.",
  startingGold: 140,
  baseEnergyCap: 120,
  baseEnergyRegen: 2.2,
  dailyShipCap: 12_000,
  expeditionCost: 36,
  expeditionCooldownMs: 120_000,
  overclockCost: 900,
  overclockDurationMs: 8 * 60 * 1000,
  refillCost: 300,
  blueprintBaseCost: 2_500,
  blueprintGrowth: 1.85,
};

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
    const value = await getVaultBalance();
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  } catch {
    return 0;
  }
}

async function addToVault(amount, gameId = "mleo-base") {
  const delta = Math.max(0, Math.floor(Number(amount || 0)));
  if (!delta) return { ok: true, skipped: true };
  queueDelta(delta, { syncLocal: true });
  return flushDelta(gameId);
}

async function spendFromVault(amount, gameId = "mleo-base") {
  const delta = Math.max(0, Math.floor(Number(amount || 0)));
  if (!delta) return { ok: true, skipped: true };
  const current = await readVaultSafe();
  if (current < delta) return { ok: false, error: "Not enough vault balance" };
  queueDelta(-delta, { syncLocal: true });
  return flushDelta(gameId);
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
    version: 4,
    lastDay: todayKey(),
    lastTickAt: Date.now(),
    lastHiddenAt: 0,
    resources: {
      ORE: 0,
      GOLD: CONFIG.startingGold,
      SCRAP: 0,
      ENERGY: CONFIG.baseEnergyCap,
      DATA: 0,
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
      className={`w-full rounded-2xl border bg-white/5 ${border} ${
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

function getNextStep(state) {
  const b = state.buildings || {};

  if ((b.quarry || 0) < 2) {
    return {
      title: "Upgrade Quarry",
      text: "Quarry is your first core producer. Push it to level 2 to unlock stronger early progression.",
    };
  }

  if ((b.tradeHub || 0) < 1) {
    return {
      title: "Unlock Trade Hub",
      text: "Trade Hub stabilizes your Gold income and helps your base grow faster.",
    };
  }

  if ((b.salvage || 0) < 1) {
    return {
      title: "Unlock Salvage Yard",
      text: "You need Scrap to move into stronger systems and prepare for Refinery.",
    };
  }

  if ((b.powerCell || 0) < 1) {
    return {
      title: "Build Power Cell",
      text: "Your energy economy is too important to ignore. Increase cap and regeneration early.",
    };
  }

  if ((b.refinery || 0) < 1) {
    return {
      title: "Work toward Refinery",
      text: "Refinery is what turns your base into a real MLEO support system.",
    };
  }

  if ((state.bankedMleo || 0) < 50) {
    return {
      title: "Build more Banked MLEO",
      text: "Keep your production running and prepare your next vault shipment.",
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

  useEffect(() => {
    let alive = true;
    const seed = freshState();
    const saved = loadJson(STATE_KEY, null);
    const initial = saved && saved.version >= 3
      ? {
          ...seed,
          ...saved,
          resources: { ...seed.resources, ...(saved.resources || {}) },
          buildings: { ...seed.buildings, ...(saved.buildings || {}) },
          modules: { ...(saved.modules || {}) },
          research: { ...(saved.research || {}) },
          stats: { ...seed.stats, ...(saved.stats || {}) },
          missionState: {
            ...seed.missionState,
            ...(saved.missionState || {}),
            completed: { ...(saved.missionState?.completed || {}) },
            claimed: { ...(saved.missionState?.claimed || {}) },
          },
          lastTickAt: Date.now(),
          lastHiddenAt: 0,
          log: Array.isArray(saved.log) && saved.log.length ? saved.log : seed.log,
        }
      : seed;

    setMounted(true);
    setState(initial);

    async function boot() {
      try {
        initVaultAdapter();
        const bal = await readVaultSafe();
        if (alive) setSharedVault(bal);
      } catch {}
    }

    boot();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!mounted) return;
    saveJson(STATE_KEY, state);
  }, [mounted, state]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (!mounted) return;

    const tickId = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setState((prev) => simulate(prev, 1000, 1));
    }, 1000);

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        setState((prev) => ({ ...prev, lastHiddenAt: Date.now(), lastTickAt: Date.now() }));
        return;
      }
      setState((prev) => {
        const hiddenAt = prev.lastHiddenAt || prev.lastTickAt || Date.now();
        const elapsed = Math.max(0, Date.now() - hiddenAt);
        const efficiency = offlineFactorFor(elapsed);
        return simulate({ ...prev, lastHiddenAt: 0, lastTickAt: hiddenAt }, elapsed, efficiency);
      });
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

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("storage", onStorage);

    return () => {
      window.clearInterval(tickId);
      window.clearInterval(pollId);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("storage", onStorage);
    };
  }, [mounted]);

  const derived = useMemo(() => derive(state), [state]);
  const workerNextCost = useMemo(() => crewCost(state.crew), [state.crew]);
  const blueprintCost = useMemo(
    () => Math.floor(CONFIG.blueprintBaseCost * Math.pow(CONFIG.blueprintGrowth, state.blueprintLevel)),
    [state.blueprintLevel]
  );
  const expeditionLeft = Math.max(0, (state.expeditionReadyAt || 0) - Date.now());
  const overclockLeft = Math.max(0, (state.overclockUntil || 0) - Date.now());
  const missionProgress = getMissionProgress(state);
  const nextStep = useMemo(() => getNextStep(state), [state]);

  const showToast = (message) => setToast(message);

  const updateState = (updater) => {
    setState((prev) => {
      const next = updater(prev);
      return next ?? prev;
    });
  };

  const buyBuilding = (key) => {
    const def = BUILDINGS.find((item) => item.key === key);
    if (!def) return;
    updateState((prev) => {
      if (!unlocked(def, prev)) {
        showToast("Unlock earlier systems first.");
        return prev;
      }
      const level = prev.buildings[key] || 0;
      const cost = buildingCost(def, level);
      if (!canAfford(prev.resources, cost)) {
        showToast("Not enough resources.");
        return prev;
      }
      return applyLevelUps({
        ...prev,
        resources: pay(prev.resources, cost),
        buildings: { ...prev.buildings, [key]: level + 1 },
        commanderXp: prev.commanderXp + 18,
        stats: { ...prev.stats, upgradesToday: (prev.stats?.upgradesToday || 0) + 1 },
        log: pushLog(prev.log, `${def.name} upgraded to level ${level + 1}.`),
      });
    });
  };

  const hireCrew = () => {
    updateState((prev) => {
      const cost = crewCost(prev.crew);
      if (!canAfford(prev.resources, cost)) {
        showToast("Crew hiring needs more supplies.");
        return prev;
      }
      return applyLevelUps({
        ...prev,
        crew: prev.crew + 1,
        resources: pay(prev.resources, cost),
        commanderXp: prev.commanderXp + 10,
        log: pushLog(prev.log, `Crew hired. Team size is now ${prev.crew + 1}.`),
      });
    });
  };

  const buyModule = (key) => {
    const moduleDef = MODULES.find((item) => item.key === key);
    if (!moduleDef) return;
    updateState((prev) => {
      if (prev.modules[key]) {
        showToast("Module already installed.");
        return prev;
      }
      if (!canAfford(prev.resources, moduleDef.cost)) {
        showToast("Module cost is not covered yet.");
        return prev;
      }
      return applyLevelUps({
        ...prev,
        resources: pay(prev.resources, moduleDef.cost),
        modules: { ...prev.modules, [key]: true },
        commanderXp: prev.commanderXp + 15,
        log: pushLog(prev.log, `${moduleDef.name} installed.`),
      });
    });
  };

  const buyResearch = (key) => {
    const def = RESEARCH.find((item) => item.key === key);
    if (!def) return;
    updateState((prev) => {
      if (prev.research[key]) {
        showToast("Research already completed.");
        return prev;
      }
      if (def.requires?.some((item) => !prev.research[item])) {
        showToast("Complete the prerequisite research first.");
        return prev;
      }
      if (!canAfford(prev.resources, def.cost)) {
        showToast("Research lab needs more materials.");
        return prev;
      }
      return applyLevelUps({
        ...prev,
        resources: pay(prev.resources, def.cost),
        research: { ...prev.research, [key]: true },
        commanderXp: prev.commanderXp + 28,
        log: pushLog(prev.log, `${def.name} research completed.`),
      });
    });
  };

  const launchExpedition = () => {
    updateState((prev) => {
      const now = Date.now();
      if ((prev.expeditionReadyAt || 0) > now) {
        showToast("Expedition team is still out in the field.");
        return prev;
      }
      if ((prev.resources.ENERGY || 0) < CONFIG.expeditionCost) {
        showToast("Not enough energy for an expedition.");
        return prev;
      }
      if ((prev.resources.DATA || 0) < 4) {
        showToast("Need 4 DATA to launch expedition.");
        return prev;
      }
      const loot = rollExpeditionLoot(prev);
      const xpGain = prev.research.arcadeOps ? 24 : 20;
      return applyLevelUps({
        ...prev,
        expeditionReadyAt: now + derive(prev).expeditionCooldownMs,
        totalExpeditions: (prev.totalExpeditions || 0) + 1,
        commanderXp: prev.commanderXp + xpGain,
        resources: {
          ...prev.resources,
          ENERGY: Math.max(0, (prev.resources.ENERGY || 0) - CONFIG.expeditionCost),
          DATA: Math.max(0, (prev.resources.DATA || 0) - 4) + loot.data,
          ORE: (prev.resources.ORE || 0) + loot.ore,
          GOLD: (prev.resources.GOLD || 0) + loot.gold,
          SCRAP: (prev.resources.SCRAP || 0) + loot.scrap,
        },
        bankedMleo: prev.bankedMleo + loot.bankedMleo,
        stats: {
          ...prev.stats,
          expeditionsToday: (prev.stats?.expeditionsToday || 0) + 1,
        },
        log: pushLog(
          prev.log,
          `Expedition returned with ${loot.ore} ORE, ${loot.gold} GOLD, ${loot.scrap} SCRAP, ${loot.data} DATA${loot.bankedMleo ? ` and ${loot.bankedMleo} MLEO` : ""}.`
        ),
      });
    });
  };

  const bankToSharedVault = async () => {
    const queued = Math.floor(state.bankedMleo || 0);
    if (queued <= 0) {
      showToast("Nothing ready to ship yet.");
      return;
    }
    const room = Math.max(0, derived.shipCap - state.sentToday);
    if (room <= 0) {
      showToast("Today's shipping cap is already full.");
      return;
    }
    const factor = softcutFactor(state.sentToday, derived.shipCap);
    const shipped = Math.min(Math.floor(queued * factor * derived.bankBonus), room);
    if (shipped <= 0) {
      showToast("Shipment too small after softcut.");
      return;
    }
    const consumed = Math.min(queued, Math.max(1, Math.ceil(shipped / Math.max(0.01, factor * derived.bankBonus))));
    const res = await addToVault(shipped, "mleo-base-ship");
    if (!res?.ok && !res?.skipped) {
      showToast("Vault sync failed. Try again.");
      return;
    }
    const latestVault = await readVaultSafe();
    setSharedVault(latestVault);
    setState((prev) =>
      applyLevelUps({
        ...prev,
        bankedMleo: Math.max(0, prev.bankedMleo - consumed),
        sentToday: prev.sentToday + shipped,
        totalBanked: prev.totalBanked + shipped,
        commanderXp: prev.commanderXp + Math.max(10, Math.floor(shipped / 50)),
        stats: {
          ...prev.stats,
          shippedToday: (prev.stats?.shippedToday || 0) + shipped,
        },
        log: pushLog(prev.log, `Shipped ${fmt(shipped)} MLEO to shared vault.`),
      })
    );
    showToast(`+${fmt(shipped)} MLEO shipped to your shared vault.`);
  };

  const handleVaultSpend = async (cost, label, applyUpdate, successMessage) => {
    const res = await spendFromVault(cost, "mleo-base-spend");
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
    await handleVaultSpend(
      blueprintCost,
      "Blueprint cache",
      (prev) => ({
        ...prev,
        blueprintLevel: prev.blueprintLevel + 1,
        resources: {
          ...prev.resources,
          DATA: Math.max(0, (prev.resources.DATA || 0) - (20 + prev.blueprintLevel * 6)),
        },
      }),
      "Blueprint cache purchased."
    );
  };

  const activateOverclock = async () => {
    if ((state.resources.DATA || 0) < 12) {
      showToast("Need 12 DATA.");
      return;
    }
    await handleVaultSpend(
      CONFIG.overclockCost,
      "Overclock",
      (prev) => ({
        ...prev,
        overclockUntil: Date.now() + CONFIG.overclockDurationMs,
        resources: {
          ...prev.resources,
          DATA: Math.max(0, (prev.resources.DATA || 0) - 12),
        },
      }),
      "Overclock activated."
    );
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
    await handleVaultSpend(
      CONFIG.refillCost,
      "Emergency refill",
      (prev) => ({
        ...prev,
        resources: {
          ...prev.resources,
          ENERGY: cap,
          DATA: Math.max(0, (prev.resources.DATA || 0) - 5),
        },
      }),
      "Energy refilled."
    );
  };

  const performMaintenance = () => {
    const cost = { GOLD: 60, SCRAP: 35, DATA: 10 };

    if (!hasResources(state.resources, cost)) {
      showToast("Need GOLD, SCRAP and DATA for maintenance.");
      return;
    }

    setState((prev) =>
      applyLevelUps({
        ...prev,
        resources: spendResources(prev.resources, cost),
        stability: Math.min(100, (prev.stability || 100) + 18),
        commanderXp: prev.commanderXp + 20,
        stats: {
          ...prev.stats,
          maintenanceToday: (prev.stats?.maintenanceToday || 0) + 1,
        },
        log: pushLog(prev.log, "Maintenance completed. Base stability improved."),
      })
    );

    showToast("Maintenance completed.");
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
          <div key={mission.key} className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold">{mission.name}</div>
                <div className="mt-1 text-xs text-white/60">
                  Progress: {fmt(progress)} / {fmt(mission.target)}
                </div>
                <div className="mt-2 text-xs text-white/55">Reward: {rewardText(mission.reward)}</div>
              </div>
              <button
                onClick={() => claimMission(mission.key)}
                disabled={!done || claimed}
                className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
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
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
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
        <div className="mt-2 text-xs text-white/55">
          Next cost: {Object.entries(workerNextCost).map(([k, v]) => `${k} ${fmt(v)}`).join(" · ")}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
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
    </div>
  );

  const baseStructuresContent = (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
            className="flex min-h-[320px] flex-col rounded-2xl border border-white/10 bg-black/20 p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex h-[40px] items-start text-sm font-semibold leading-5 text-white">
                  {building.name}
                </div>
              </div>

              <div className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-[11px] font-semibold text-white/65">
                Lv {level}
              </div>
            </div>

            <div className="mt-2 h-[60px] overflow-hidden text-xs leading-5 text-white/60">
              {building.desc}
            </div>

            <div className="mt-2 flex h-5 items-center text-xs font-medium text-cyan-200/85">
              Next level: Lv {nextLevel}
            </div>

            <div className="mt-3 h-[44px] overflow-hidden text-xs leading-5 text-white/55">
              Cost:{" "}
              {Object.entries(cost)
                .map(([k, v]) => `${k} ${fmt(v)}`)
                .join(" · ")}
            </div>

            <div className="mt-auto flex min-h-[76px] flex-col justify-end pt-4">
              <button
                onClick={() => buyBuilding(building.key)}
                disabled={!ready}
                className="w-full rounded-xl bg-white/10 px-3 py-2.5 text-sm font-semibold transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {buttonText}
              </button>

              <div className="mt-2 min-h-[34px] text-center text-[11px] leading-4 text-white/45">
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
    <div className="space-y-3 text-sm text-white/75">
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="font-semibold text-white">Totals</div>
        <div className="mt-2 space-y-1 text-white/70">
          <div>Total shipped: {fmt(state.totalBanked)} MLEO</div>
          <div>Total vault spent: {fmt(state.totalSharedSpent)} MLEO</div>
          <div>Total expeditions: {fmt(state.totalExpeditions)}</div>
          <div>Total missions claimed: {fmt(state.totalMissionsDone)}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="font-semibold text-white">Why MLEO BASE is stronger as a support layer</div>
        <ul className="mt-2 space-y-2 text-sm text-white/65">
          <li>It uses the same shared vault via adapter, instead of raw localStorage writes.</li>
          <li>It adds missions, commander level and ecosystem-specific buildings.</li>
          <li>It shifts rewards toward progression and sinks, not just direct MLEO output.</li>
        </ul>
      </div>
    </div>
  );

  const activityLogContent = (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/mleo-miners" className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/20">
          Open Miners
        </Link>
        <Link href="/arcade" className="rounded-xl border border-sky-500/25 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-200 hover:bg-sky-500/20">
          Open Arcade
        </Link>
      </div>
      <div className="space-y-2">
        {(state.log || []).slice(0, 6).map((entry) => (
          <div key={entry.id} className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/75">
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
      <main className="min-h-screen bg-[#07111f] text-white">
        <div className="mx-auto max-w-7xl px-4 py-6 pb-24 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-200">
                MLEO ecosystem command hub
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{CONFIG.title}</h1>
              <p className="mt-2 max-w-2xl text-sm text-white/70 sm:text-base">{CONFIG.subtitle}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:justify-start">
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

          {/* Mobile */}
          <div className="mt-6 space-y-3 sm:hidden">
            <div className="grid grid-cols-1 gap-3">
              <MetricCard
                label="Shared Vault"
                value={`${fmt(sharedVault)} MLEO`}
                note="Same balance used by Miners, Arcade and Online."
                accent="emerald"
              />
              <MetricCard
                label="Base Banked"
                value={`${fmt(state.bankedMleo)} MLEO`}
                note="Refined here, then shipped into the shared vault."
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
                label="Ore"
                value={fmt(state.resources.ORE)}
                note={`x${derived.oreMult.toFixed(2)} output`}
                accent="cyan"
                compact
              />

              <MetricCard
                label="Gold"
                value={fmt(state.resources.GOLD)}
                note={`x${derived.goldMult.toFixed(2)} output`}
                accent="amber"
                compact
              />

              <MetricCard
                label="Scrap"
                value={fmt(state.resources.SCRAP)}
                note={`x${derived.scrapMult.toFixed(2)} output`}
                accent="rose"
                compact
              />

              <MetricCard
                label="Data"
                value={fmt(state.resources.DATA)}
                note={`x${derived.dataMult.toFixed(2)} progression`}
                accent="sky"
                compact
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

          {/* Desktop */}
          <div className="mt-6 hidden gap-3 sm:grid xl:grid-cols-8">
            <MetricCard label="Shared Vault" value={`${fmt(sharedVault)} MLEO`} note="Same balance used by Miners, Arcade and Online." accent="emerald" />
            <MetricCard label="Base Banked" value={`${fmt(state.bankedMleo)} MLEO`} note="Refined here, then shipped into the shared vault." accent="violet" />
            <MetricCard label="Commander" value={`Lv ${state.commanderLevel}`} note={`${fmt(state.commanderXp)} / ${fmt(xpForLevel(state.commanderLevel))} XP`} accent="sky" />
            <MetricCard label="Ore" value={fmt(state.resources.ORE)} note={`x${derived.oreMult.toFixed(2)} output`} accent="cyan" />
            <MetricCard label="Gold" value={fmt(state.resources.GOLD)} note={`x${derived.goldMult.toFixed(2)} output`} accent="amber" />
            <MetricCard label="Scrap" value={fmt(state.resources.SCRAP)} note={`x${derived.scrapMult.toFixed(2)} output`} accent="rose" />
            <MetricCard label="Data" value={fmt(state.resources.DATA)} note={`x${derived.dataMult.toFixed(2)} progression`} accent="sky" />
            <MetricCard label="Energy" value={`${fmt(state.resources.ENERGY)} / ${fmt(derived.energyCap)}`} note={`Regen ${derived.energyRegen.toFixed(2)}/s`} accent="slate" />
          </div>

          <div className="mt-4 rounded-3xl border border-cyan-500/20 bg-cyan-500/10 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-cyan-200/80">
                  Next Recommended Step
                </div>
                <div className="mt-1 text-lg font-bold text-white">{nextStep.title}</div>
                <div className="mt-1 text-sm text-white/70">{nextStep.text}</div>
              </div>
              <div className="rounded-2xl bg-black/20 px-4 py-3 text-sm text-white/75">
                Commander Lv {state.commanderLevel}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-[1.2fr_1fr]">
            <Section
              title="Operations Console"
              subtitle={`Ship cap today: ${fmt(state.sentToday)} / ${fmt(derived.shipCap)} MLEO. Blueprints and utilities make MLEO useful inside the ecosystem, not just claimable.`}
            >
              <div className="grid gap-3 md:grid-cols-2">
                <div className="flex h-full flex-col gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
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

                <div className="flex h-full flex-col gap-3 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4">
                  <div className="flex min-h-[88px] flex-col">
                    <div className="text-sm font-semibold text-cyan-200">Field Expedition</div>
                    <p className="mt-1 text-sm text-white/70">
                      Spend {CONFIG.expeditionCost} energy for Ore, Gold, Scrap, DATA and only a small chance of banked MLEO.
                    </p>
                  </div>
                  <button
                    onClick={launchExpedition}
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
                  <button onClick={buyBlueprint} className="mt-auto w-full rounded-xl bg-fuchsia-600 px-4 py-3 text-sm font-bold hover:bg-fuchsia-500">
                    Buy Blueprint Lv {state.blueprintLevel + 1}
                  </button>
                </div>

                <div className="flex h-full flex-col gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                  <div className="flex min-h-[88px] flex-col">
                    <div className="text-sm font-semibold text-amber-200">Shared Vault Utilities</div>
                    <p className="mt-1 text-sm text-white/70">
                      Spend shared MLEO on productivity instead of pure emissions. This creates healthy token sinks.
                    </p>
                    <p className="mt-2 text-xs text-white/55">
                      Stability: {fmt(state.stability)}% · Maintenance keeps the base efficient over time.
                    </p>
                  </div>
                  <div className="mt-auto grid grid-cols-2 gap-2 pt-1 md:grid-cols-3">
                    <button onClick={activateOverclock} className="rounded-xl bg-amber-600 px-3 py-3 text-sm font-bold hover:bg-amber-500">
                      {overclockLeft > 0 ? `Overclock ${Math.ceil(overclockLeft / 1000)}s` : `Overclock ${fmt(CONFIG.overclockCost)}`}
                    </button>
                    <button onClick={refillEnergy} className="rounded-xl bg-white/10 px-3 py-3 text-sm font-bold hover:bg-white/20">
                      Refill {fmt(CONFIG.refillCost)}
                    </button>
                    <button onClick={performMaintenance} className="rounded-xl bg-white/10 px-3 py-3 text-sm font-bold hover:bg-white/20">
                      Maintain
                    </button>
                  </div>
                </div>
              </div>
            </Section>

            <div className="xl:hidden">
              <AccordionSection
                title="Daily Missions"
                subtitle="Daily goals give players direction without turning BASE into an aggressive faucet."
                defaultOpen={true}
              >
                {dailyMissionsContent}
              </AccordionSection>
            </div>
            <div className="hidden xl:block">
              <Section
                title="Daily Missions"
                subtitle="Daily goals give players direction without turning BASE into an aggressive faucet. Rewards are mostly XP and support resources."
              >
                {dailyMissionsContent}
              </Section>
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_1fr]">
            <div className="xl:hidden">
              <AccordionSection
                title="Crew, Modules & Research"
                subtitle="Upgrades, modules and research for long-term progression."
                defaultOpen={false}
              >
                {crewModulesResearchContent}
              </AccordionSection>
            </div>
            <div className="hidden xl:block">
              <Section
                title="Crew, Modules & Research"
                subtitle="Everything here strengthens the support loop around Miners and Arcade without opening a second uncontrolled faucet."
              >
                {crewModulesResearchContent}
              </Section>
            </div>

            <div className="xl:hidden">
              <AccordionSection
                title="Base Structures"
                subtitle="Upgrade your base and unlock stronger systems."
                defaultOpen={true}
              >
                {baseStructuresContent}
              </AccordionSection>
            </div>
            <div className="hidden xl:block">
              <Section
                title="Base Structures"
                subtitle="MLEO BASE is tuned as a support-management game: it produces slowly, rewards planning, and feeds the main shared vault in measured batches."
              >
                {baseStructuresContent}
              </Section>
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
            <div className="xl:hidden">
              <AccordionSection
                title="Progress Summary"
                subtitle="Overview of your long-term base performance."
                defaultOpen={false}
              >
                {progressSummaryContent}
              </AccordionSection>
            </div>
            <div className="hidden xl:block">
              <Section
                title="Progress Summary"
                subtitle="BASE should feel like the control room of the ecosystem, not just another reward tab."
              >
                {progressSummaryContent}
              </Section>
            </div>

            <div className="xl:hidden">
              <AccordionSection
                title="Activity Log"
                subtitle="Recent actions and quick links."
                defaultOpen={false}
              >
                {activityLogContent}
              </AccordionSection>
            </div>
            <div className="hidden xl:block">
              <Section title="Activity Log" subtitle="Quick read on what the base has been doing.">
                {activityLogContent}
              </Section>
            </div>
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
                    It is not built for fast payouts. It is built for planning, progression, efficiency, and controlled support
                    of the shared MLEO vault.
                  </p>
                  <p className="mt-3">
                    Your job is to build a stable base, manage resources, improve infrastructure, generate banked MLEO,
                    and decide when it is smart to export part of it into the shared vault.
                  </p>
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
