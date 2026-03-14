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
  { upto: 0.8, factor: 1.0 },
  { upto: 1.0, factor: 0.7 },
  { upto: 1.2, factor: 0.45 },
  { upto: 9.99, factor: 0.22 },
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
    convert: { ORE: 1.5, SCRAP: 0.5, MLEO: 0.18 },
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
];

const CONFIG = {
  title: "MLEO BASE",
  subtitle: "Command your MLEO base, connect Miners + Arcade, and grow your shared vault.",
  startingGold: 140,
  baseEnergyCap: 120,
  baseEnergyRegen: 2.2,
  dailyShipCap: 25_000,
  expeditionCost: 28,
  expeditionCooldownMs: 90_000,
  overclockCost: 750,
  overclockDurationMs: 10 * 60 * 1000,
  refillCost: 250,
  blueprintBaseCost: 2_000,
  blueprintGrowth: 1.7,
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
  return 0.2;
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
  };
}

function freshState() {
  return {
    version: 3,
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
    commanderXp: 0,
    commanderLevel: 1,
    totalExpeditions: 0,
    totalMissionsDone: 0,
    stats: {
      upgradesToday: 0,
      shippedToday: 0,
      expeditionsToday: 0,
      vaultSpentToday: 0,
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
  const hasFieldOps = !!state.research.fieldOps;
  const workerBonus = 1 + state.crew * (hasFieldOps ? 0.03 : 0.02);
  const overclock = now < (state.overclockUntil || 0) ? 1.35 : 1;
  const hqBonus = 1 + hqLevel * 0.03;
  const minerBonus = 1 + minerLink * 0.04 + (state.modules.minerLink ? 0.12 : 0);
  const arcadeBonus = 1 + arcadeLink * 0.03 + (state.modules.arcadeRelay ? 0.1 : 0);

  let oreMult = workerBonus * overclock;
  let goldMult = workerBonus * overclock;
  let scrapMult = workerBonus * overclock;
  let mleoMult = workerBonus * overclock;

  if (state.modules.servoDrill) oreMult *= 1.15;
  if (state.modules.vaultCompressor) mleoMult *= 1.08;
  if (state.research.routing) mleoMult *= 1.08;
  if (state.research.minerSync) oreMult *= 1.12;

  return {
    energyCap: CONFIG.baseEnergyCap + powerLevel * 24 + (state.research.coolant ? 15 : 0),
    energyRegen: CONFIG.baseEnergyRegen + powerLevel * 0.35 + (state.research.coolant ? 0.8 : 0),
    oreMult: oreMult * hqBonus * minerBonus,
    goldMult: goldMult * hqBonus,
    scrapMult: scrapMult * hqBonus,
    mleoMult: mleoMult * hqBonus,
    dataMult: arcadeBonus,
    shipCap: CONFIG.dailyShipCap + state.blueprintLevel * 2500 + (state.research.routing ? 5000 : 0),
    bankBonus:
      1 +
      state.blueprintLevel * 0.02 +
      (state.research.routing ? 0.08 : 0) +
      (state.modules.vaultCompressor ? 0.05 : 0),
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

  runBuilding("refinery", (level) => {
    const energyNeed = 3.2 * level * dt;
    const oreNeed = 1.5 * level * effective;
    const scrapNeed = 0.5 * level * effective;
    if (next.resources.ENERGY < energyNeed) return;
    if (next.resources.ORE < oreNeed || next.resources.SCRAP < scrapNeed) return;
    next.resources.ENERGY -= energyNeed;
    next.resources.ORE -= oreNeed;
    next.resources.SCRAP -= scrapNeed;
    next.bankedMleo += 0.18 * level * d.mleoMult * effective;
  });

  next.resources.ENERGY = clamp(next.resources.ENERGY, 0, d.energyCap);
  next.lastTickAt = now;
  return next;
}

function rollExpeditionLoot(state) {
  const bay = state.buildings.expeditionBay || 0;
  const rareBonus = state.research.arcadeOps ? 1.12 : 1;
  const base = 1 + bay * 0.12;
  const ore = Math.floor((40 + Math.random() * 80) * base);
  const gold = Math.floor((25 + Math.random() * 60) * base);
  const scrap = Math.floor((10 + Math.random() * 30) * base);
  const data = Math.floor((4 + Math.random() * 10) * rareBonus);
  const mleoChance = 0.18 + bay * 0.02;
  const bankedMleo = Math.random() < mleoChance ? Math.floor(8 + Math.random() * 22) : 0;
  return { ore, gold, scrap, data, bankedMleo };
}

function MetricCard({ label, value, note, accent = "emerald" }) {
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
    <div className={`rounded-2xl border bg-white/5 px-4 py-3 ${border}`}>
      <div className="text-xs uppercase tracking-[0.18em] text-white/55">{label}</div>
      <div className="mt-1 text-xl font-bold text-white">{value}</div>
      {note ? <div className="mt-1 text-xs text-white/55">{note}</div> : null}
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

function rewardText(reward) {
  return Object.entries(reward || {})
    .map(([k, v]) => `${k} ${fmt(v)}`)
    .join(" · ");
}

export default function MleoBase() {
  const { isConnected, address } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { openAccountModal } = useAccountModal();

  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState(() => freshState());
  const [sharedVault, setSharedVault] = useState(0);
  const [toast, setToast] = useState("");

  useEffect(() => {
    let alive = true;
    const seed = freshState();
    const saved = loadJson(STATE_KEY, null);
    const initial = saved && saved.version === 3
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
          ORE: (prev.resources.ORE || 0) + loot.ore,
          GOLD: (prev.resources.GOLD || 0) + loot.gold,
          SCRAP: (prev.resources.SCRAP || 0) + loot.scrap,
          DATA: (prev.resources.DATA || 0) + loot.data,
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
    setState((prev) =>
      applyLevelUps({
        ...applyUpdate(prev),
        totalSharedSpent: (prev.totalSharedSpent || 0) + cost,
        commanderXp: (applyUpdate(prev).commanderXp || prev.commanderXp) + Math.max(5, Math.floor(cost / 40)),
        stats: {
          ...(applyUpdate(prev).stats || prev.stats),
          vaultSpentToday: (prev.stats?.vaultSpentToday || 0) + cost,
        },
        log: pushLog(prev.log, `${label} purchased for ${fmt(cost)} MLEO.`),
      })
    );
    if (successMessage) showToast(successMessage);
    return true;
  };

  const buyBlueprint = async () => {
    await handleVaultSpend(
      blueprintCost,
      "Blueprint cache",
      (prev) => ({ ...prev, blueprintLevel: prev.blueprintLevel + 1 }),
      "Blueprint cache purchased."
    );
  };

  const activateOverclock = async () => {
    await handleVaultSpend(
      CONFIG.overclockCost,
      "Overclock",
      (prev) => ({ ...prev, overclockUntil: Date.now() + CONFIG.overclockDurationMs }),
      "Overclock activated."
    );
  };

  const refillEnergy = async () => {
    const cap = derived.energyCap;
    if ((state.resources.ENERGY || 0) >= cap - 1) {
      showToast("Energy is already near full.");
      return;
    }
    await handleVaultSpend(
      CONFIG.refillCost,
      "Emergency refill",
      (prev) => ({ ...prev, resources: { ...prev.resources, ENERGY: cap } }),
      "Energy refilled."
    );
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
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-200">
                MLEO ecosystem command hub
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{CONFIG.title}</h1>
              <p className="mt-2 max-w-2xl text-sm text-white/70 sm:text-base">{CONFIG.subtitle}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link href="/mining" className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10">
                Hub
              </Link>
              <Link href="/mleo-miners" className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/20">
                Open Miners
              </Link>
              <Link href="/arcade" className="rounded-xl border border-sky-500/25 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-200 hover:bg-sky-500/20">
                Open Arcade
              </Link>
              {isConnected ? (
                <button onClick={() => openAccountModal?.()} className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20">
                  {address?.slice(0, 6)}…{address?.slice(-4)}
                </button>
              ) : (
                <button onClick={() => openConnectModal?.()} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold hover:bg-rose-500">
                  Connect
                </button>
              )}
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-8">
            <MetricCard label="Shared Vault" value={`${fmt(sharedVault)} MLEO`} note="Same balance used by Miners, Arcade and Online." accent="emerald" />
            <MetricCard label="Base Banked" value={`${fmt(state.bankedMleo)} MLEO`} note="Refined here, then shipped into the shared vault." accent="violet" />
            <MetricCard label="Commander" value={`Lv ${state.commanderLevel}`} note={`${fmt(state.commanderXp)} / ${fmt(xpForLevel(state.commanderLevel))} XP`} accent="sky" />
            <MetricCard label="Ore" value={fmt(state.resources.ORE)} note={`x${derived.oreMult.toFixed(2)} output`} accent="cyan" />
            <MetricCard label="Gold" value={fmt(state.resources.GOLD)} note={`x${derived.goldMult.toFixed(2)} output`} accent="amber" />
            <MetricCard label="Scrap" value={fmt(state.resources.SCRAP)} note={`x${derived.scrapMult.toFixed(2)} output`} accent="rose" />
            <MetricCard label="Data" value={fmt(state.resources.DATA)} note={`x${derived.dataMult.toFixed(2)} progression`} accent="sky" />
            <MetricCard label="Energy" value={`${fmt(state.resources.ENERGY)} / ${fmt(derived.energyCap)}`} note={`Regen ${derived.energyRegen.toFixed(2)}/s`} accent="slate" />
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-[1.2fr_1fr]">
            <Section
              title="Operations Console"
              subtitle={`Ship cap today: ${fmt(state.sentToday)} / ${fmt(derived.shipCap)} MLEO. Blueprints and utilities make MLEO useful inside the ecosystem, not just claimable.`}
            >
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="flex h-full flex-col gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                  <div className="flex min-h-[88px] flex-col">
                    <div className="text-sm font-semibold text-emerald-200">Ship to Shared Vault</div>
                    <p className="mt-1 text-sm text-white/70">
                      Move refined MLEO into the main vault with a daily softcut, so BASE supports Miners instead of replacing it.
                    </p>
                  </div>
                  <button onClick={bankToSharedVault} className="mt-auto w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold hover:bg-emerald-500">
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
                    className="mt-auto w-full rounded-xl bg-cyan-600 px-4 py-3 text-sm font-bold hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
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
                  </div>
                  <div className="mt-auto grid grid-cols-2 gap-2 pt-1">
                    <button onClick={activateOverclock} className="rounded-xl bg-amber-600 px-3 py-3 text-sm font-bold hover:bg-amber-500">
                      {overclockLeft > 0 ? `Overclock ${Math.ceil(overclockLeft / 1000)}s` : `Overclock ${fmt(CONFIG.overclockCost)}`}
                    </button>
                    <button onClick={refillEnergy} className="rounded-xl bg-white/10 px-3 py-3 text-sm font-bold hover:bg-white/20">
                      Refill {fmt(CONFIG.refillCost)}
                    </button>
                  </div>
                </div>
              </div>
            </Section>

            <Section
              title="Daily Missions"
              subtitle="Daily goals give players direction without turning BASE into an aggressive faucet. Rewards are mostly XP and support resources."
            >
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
            </Section>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_1fr]">
            <Section
              title="Crew, Modules & Research"
              subtitle="Everything here strengthens the support loop around Miners and Arcade without opening a second uncontrolled faucet."
            >
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
            </Section>

            <Section
              title="Progress Summary"
              subtitle="BASE should feel like the control room of the ecosystem, not just another reward tab."
            >
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
            </Section>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
            <Section
              title="Base Structures"
              subtitle="MLEO BASE is tuned as a support-management game: it produces slowly, rewards planning, and feeds the main shared vault in measured batches."
            >
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {BUILDINGS.map((building) => {
                  const level = state.buildings[building.key] || 0;
                  const cost = buildingCost(building, level);
                  const isUnlocked = unlocked(building, state);
                  const ready = isUnlocked && canAfford(state.resources, cost);
                  return (
                    <div key={building.key} className="flex h-full flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="flex flex-1 flex-col">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold">{building.name}</div>
                          <div className="rounded-full bg-white/10 px-2 py-1 text-xs text-white/60">Lv {level}</div>
                        </div>
                        <div className="mt-2 text-xs text-white/60">{building.desc}</div>
                        <div className="mt-auto pt-3 text-xs leading-5 text-white/55">
                          Cost: {Object.entries(cost).map(([k, v]) => `${k} ${fmt(v)}`).join(" · ")}
                        </div>
                      </div>
                      <button
                        onClick={() => buyBuilding(building.key)}
                        disabled={!ready}
                        className="mt-auto w-full rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {ready ? "Upgrade" : isUnlocked ? "Need resources" : "Locked"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </Section>

            <Section title="Activity Log" subtitle="Quick read on what the base has been doing.">
              <div className="space-y-2">
                {(state.log || []).map((entry) => (
                  <div key={entry.id} className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/75">
                    <div>{entry.text}</div>
                    <div className="mt-1 text-xs text-white/40">{new Date(entry.ts).toLocaleTimeString()}</div>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        </div>

        {toast ? (
          <div className="fixed left-1/2 top-20 z-[120] -translate-x-1/2 rounded-2xl border border-emerald-400/30 bg-emerald-500/20 px-5 py-3 text-sm font-semibold text-white shadow-2xl backdrop-blur">
            {toast}
          </div>
        ) : null}
      </main>
    </Layout>
  );
}
