import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useAccountModal, useConnectModal } from "@rainbow-me/rainbowkit";
import Layout from "../components/Layout";

const STATE_KEY = "mleo_quest_arcade_v2";
const SHARED_VAULT_KEY = "mleo_rush_core_v4";
const MAX_LOG_ITEMS = 12;

const DAILY_SOFTCUT = [
  { upto: 0.8, factor: 1.0 },
  { upto: 1.0, factor: 0.65 },
  { upto: 1.2, factor: 0.4 },
  { upto: 9.99, factor: 0.2 },
];

const OFFLINE_TIERS = [
  { hours: 2, factor: 0.55 },
  { hours: 6, factor: 0.35 },
  { hours: 12, factor: 0.18 },
];

const BUILDINGS = [
  {
    key: "quarry",
    name: "Quarry",
    desc: "Turns energy into raw Ore.",
    baseCost: { GOLD: 60 },
    growth: 1.18,
    energyUse: 1.1,
    outputs: { ORE: 2.2 },
  },
  {
    key: "tradeHub",
    name: "Trade Hub",
    desc: "Keeps the operation liquid with steady Gold income.",
    baseCost: { GOLD: 100, ORE: 30 },
    growth: 1.2,
    energyUse: 1.4,
    outputs: { GOLD: 1.1 },
    requires: [{ key: "quarry", lvl: 2 }],
  },
  {
    key: "salvage",
    name: "Salvage Yard",
    desc: "Recovers Scrap for advanced systems.",
    baseCost: { GOLD: 150, ORE: 90 },
    growth: 1.22,
    energyUse: 1.8,
    outputs: { SCRAP: 0.9 },
    requires: [{ key: "quarry", lvl: 3 }],
  },
  {
    key: "refinery",
    name: "Refinery",
    desc: "Converts Ore + Scrap into bankable MLEO.",
    baseCost: { GOLD: 280, ORE: 180, SCRAP: 35 },
    growth: 1.25,
    energyUse: 3.2,
    convert: { ORE: 1.4, SCRAP: 0.45, MLEO: 0.24 },
    requires: [{ key: "salvage", lvl: 2 }, { key: "tradeHub", lvl: 2 }],
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
];

const MODULES = [
  {
    key: "servoDrill",
    name: "Servo Drill",
    desc: "+18% Ore output.",
    cost: { GOLD: 320, SCRAP: 50 },
  },
  {
    key: "scrapMagnet",
    name: "Scrap Magnet",
    desc: "+22% Scrap output.",
    cost: { GOLD: 420, ORE: 120, SCRAP: 70 },
  },
  {
    key: "smartRefinery",
    name: "Smart Refinery",
    desc: "+16% MLEO output.",
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
    desc: "+8% banking efficiency and +5K daily ship cap.",
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
];

const CONFIG = {
  title: "MLEO Quest Arcade",
  subtitle: "Operate a side-base that feeds your shared MLEO vault.",
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

function readSharedVault() {
  const payload = loadJson(SHARED_VAULT_KEY, {});
  const value = Number(payload?.vault || 0);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function writeSharedVault(nextValue) {
  const payload = loadJson(SHARED_VAULT_KEY, {});
  payload.vault = Math.max(0, Math.floor(nextValue || 0));
  saveJson(SHARED_VAULT_KEY, payload);
  return payload.vault;
}

function freshState() {
  return {
    version: 2,
    lastDay: todayKey(),
    lastTickAt: Date.now(),
    lastHiddenAt: 0,
    resources: {
      ORE: 0,
      GOLD: CONFIG.startingGold,
      SCRAP: 0,
      ENERGY: CONFIG.baseEnergyCap,
    },
    buildings: {
      quarry: 1,
      tradeHub: 0,
      salvage: 0,
      refinery: 0,
      powerCell: 0,
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
    log: pushLog([], "Base online. Quarry ready to expand."),
  };
}

function derive(state, now = Date.now()) {
  const powerLevel = state.buildings.powerCell || 0;
  const hasFieldOps = !!state.research.fieldOps;
  const workerBonus = 1 + state.crew * (hasFieldOps ? 0.03 : 0.02);
  const overclock = now < (state.overclockUntil || 0) ? 1.35 : 1;

  let oreMult = workerBonus * overclock;
  let goldMult = workerBonus * overclock;
  let scrapMult = workerBonus * overclock;
  let mleoMult = workerBonus * overclock;

  if (state.modules.servoDrill) oreMult *= 1.18;
  if (state.modules.scrapMagnet) scrapMult *= 1.22;
  if (state.modules.smartRefinery) mleoMult *= 1.16;
  if (state.research.routing) mleoMult *= 1.08;

  return {
    energyCap: CONFIG.baseEnergyCap + powerLevel * 24 + (state.research.coolant ? 15 : 0),
    energyRegen: CONFIG.baseEnergyRegen + powerLevel * 0.35 + (state.research.coolant ? 0.8 : 0),
    oreMult,
    goldMult,
    scrapMult,
    mleoMult,
    shipCap: CONFIG.dailyShipCap + state.blueprintLevel * 2_500 + (state.research.routing ? 5_000 : 0),
    bankBonus: 1 + state.blueprintLevel * 0.02 + (state.research.routing ? 0.08 : 0),
    expeditionCooldownMs: hasFieldOps ? 60_000 : CONFIG.expeditionCooldownMs,
  };
}

function simulate(state, elapsedMs, efficiency = 1) {
  const next = {
    ...state,
    resources: { ...state.resources },
    buildings: { ...state.buildings },
    modules: { ...state.modules },
    research: { ...state.research },
    log: [...(state.log || [])],
  };

  const now = Date.now();
  if (next.lastDay !== todayKey()) {
    next.lastDay = todayKey();
    next.sentToday = 0;
    next.log = pushLog(next.log, "New day: shipment cap refreshed.");
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
    const energyNeed = BUILDINGS[0].energyUse * level * dt;
    if (next.resources.ENERGY < energyNeed) return;
    next.resources.ENERGY -= energyNeed;
    next.resources.ORE += 2.2 * level * d.oreMult * effective;
  });

  runBuilding("tradeHub", (level) => {
    const energyNeed = BUILDINGS[1].energyUse * level * dt;
    if (next.resources.ENERGY < energyNeed) return;
    next.resources.ENERGY -= energyNeed;
    next.resources.GOLD += 1.1 * level * d.goldMult * effective;
  });

  runBuilding("salvage", (level) => {
    const energyNeed = BUILDINGS[2].energyUse * level * dt;
    if (next.resources.ENERGY < energyNeed) return;
    next.resources.ENERGY -= energyNeed;
    next.resources.SCRAP += 0.9 * level * d.scrapMult * effective;
  });

  runBuilding("refinery", (level) => {
    const energyNeed = BUILDINGS[3].energyUse * level * dt;
    const oreNeed = BUILDINGS[3].convert.ORE * level * effective;
    const scrapNeed = BUILDINGS[3].convert.SCRAP * level * effective;
    if (next.resources.ENERGY < energyNeed) return;
    if (next.resources.ORE < oreNeed || next.resources.SCRAP < scrapNeed) return;
    next.resources.ENERGY -= energyNeed;
    next.resources.ORE -= oreNeed;
    next.resources.SCRAP -= scrapNeed;
    next.bankedMleo += BUILDINGS[3].convert.MLEO * level * d.mleoMult * effective;
  });

  next.resources.ENERGY = clamp(next.resources.ENERGY, 0, d.energyCap);
  next.lastTickAt = now;
  return next;
}

function MetricCard({ label, value, note, accent = "emerald" }) {
  const border = {
    emerald: "border-emerald-500/30 text-emerald-300",
    cyan: "border-cyan-500/30 text-cyan-300",
    amber: "border-amber-500/30 text-amber-300",
    violet: "border-violet-500/30 text-violet-300",
    rose: "border-rose-500/30 text-rose-300",
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
        {subtitle ? <p className="text-sm text-white/60 mt-1">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

export default function MleoQuestArcade() {
  const { isConnected, address } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { openAccountModal } = useAccountModal();

  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState(() => freshState());
  const [sharedVault, setSharedVault] = useState(0);
  const [toast, setToast] = useState("");

  useEffect(() => {
    setMounted(true);
    const saved = loadJson(STATE_KEY, null);
    const initial = saved && saved.version === 2
      ? {
          ...freshState(),
          ...saved,
          resources: { ...freshState().resources, ...(saved.resources || {}) },
          buildings: { ...freshState().buildings, ...(saved.buildings || {}) },
          modules: { ...(saved.modules || {}) },
          research: { ...(saved.research || {}) },
          lastTickAt: Date.now(),
          lastHiddenAt: 0,
          log: Array.isArray(saved.log) && saved.log.length ? saved.log : freshState().log,
        }
      : freshState();
    setState(initial);
    setSharedVault(readSharedVault());
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
      setSharedVault(readSharedVault());
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
        const next = simulate({ ...prev, lastHiddenAt: 0, lastTickAt: hiddenAt }, elapsed, efficiency);
        return next;
      });
      setSharedVault(readSharedVault());
    };

    const onStorage = (event) => {
      if (event.key === SHARED_VAULT_KEY) {
        setSharedVault(readSharedVault());
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("storage", onStorage);

    return () => {
      window.clearInterval(tickId);
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
        showToast("Unlock earlier districts first.");
        return prev;
      }
      const level = prev.buildings[key] || 0;
      const cost = buildingCost(def, level);
      if (!canAfford(prev.resources, cost)) {
        showToast("Not enough resources.");
        return prev;
      }
      return {
        ...prev,
        resources: pay(prev.resources, cost),
        buildings: { ...prev.buildings, [key]: level + 1 },
        log: pushLog(prev.log, `${def.name} upgraded to level ${level + 1}.`),
      };
    });
  };

  const hireCrew = () => {
    updateState((prev) => {
      const cost = crewCost(prev.crew);
      if (!canAfford(prev.resources, cost)) {
        showToast("Crew hiring needs more supplies.");
        return prev;
      }
      return {
        ...prev,
        crew: prev.crew + 1,
        resources: pay(prev.resources, cost),
        log: pushLog(prev.log, `Crew hired. Team size is now ${prev.crew + 1}.`),
      };
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
      return {
        ...prev,
        resources: pay(prev.resources, moduleDef.cost),
        modules: { ...prev.modules, [key]: true },
        log: pushLog(prev.log, `${moduleDef.name} installed.`),
      };
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
      return {
        ...prev,
        resources: pay(prev.resources, def.cost),
        research: { ...prev.research, [key]: true },
        log: pushLog(prev.log, `${def.name} research completed.`),
      };
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

      const ore = 35 + Math.floor(Math.random() * 55);
      const gold = 20 + Math.floor(Math.random() * 45);
      const scrap = 8 + Math.floor(Math.random() * 20);
      const banked = Math.random() < 0.4 ? 10 + Math.floor(Math.random() * 18) : 0;

      return {
        ...prev,
        expeditionReadyAt: now + derived.expeditionCooldownMs,
        resources: {
          ...prev.resources,
          ENERGY: Math.max(0, (prev.resources.ENERGY || 0) - CONFIG.expeditionCost),
          ORE: (prev.resources.ORE || 0) + ore,
          GOLD: (prev.resources.GOLD || 0) + gold,
          SCRAP: (prev.resources.SCRAP || 0) + scrap,
        },
        bankedMleo: prev.bankedMleo + banked,
        log: pushLog(
          prev.log,
          `Expedition returned with ${ore} ORE, ${gold} GOLD, ${scrap} SCRAP${banked ? ` and ${banked} MLEO` : ""}.`
        ),
      };
    });
  };

  const bankToSharedVault = () => {
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
    const consumed = Math.min(
      queued,
      Math.max(1, Math.ceil(shipped / Math.max(0.01, factor * derived.bankBonus)))
    );

    const nextVault = writeSharedVault(sharedVault + shipped);
    setSharedVault(nextVault);
    setState((prev) => ({
      ...prev,
      bankedMleo: Math.max(0, prev.bankedMleo - consumed),
      sentToday: prev.sentToday + shipped,
      totalBanked: prev.totalBanked + shipped,
      log: pushLog(prev.log, `Shipment sent: +${shipped} MLEO to the shared vault.`),
    }));
    showToast(`+${fmt(shipped)} MLEO shipped to your shared vault.`);
  };

  const spendSharedVault = (amount, applyUpdate, successMessage) => {
    if (sharedVault < amount) {
      showToast("Shared vault balance is too low.");
      return;
    }
    const nextVault = writeSharedVault(sharedVault - amount);
    setSharedVault(nextVault);
    setState((prev) => applyUpdate(prev));
    if (successMessage) showToast(successMessage);
  };

  const buyBlueprint = () => {
    spendSharedVault(
      blueprintCost,
      (prev) => ({
        ...prev,
        blueprintLevel: prev.blueprintLevel + 1,
        totalSharedSpent: prev.totalSharedSpent + blueprintCost,
        log: pushLog(prev.log, `Blueprint cache purchased. Banking efficiency improved.`),
      }),
      "Blueprint cache purchased."
    );
  };

  const activateOverclock = () => {
    spendSharedVault(
      CONFIG.overclockCost,
      (prev) => ({
        ...prev,
        overclockUntil: Date.now() + CONFIG.overclockDurationMs,
        totalSharedSpent: prev.totalSharedSpent + CONFIG.overclockCost,
        log: pushLog(prev.log, "Overclock engaged for 10 minutes."),
      }),
      "Overclock activated."
    );
  };

  const refillEnergy = () => {
    const cap = derived.energyCap;
    if ((state.resources.ENERGY || 0) >= cap - 1) {
      showToast("Energy is already near full.");
      return;
    }
    spendSharedVault(
      CONFIG.refillCost,
      (prev) => ({
        ...prev,
        resources: { ...prev.resources, ENERGY: cap },
        totalSharedSpent: prev.totalSharedSpent + CONFIG.refillCost,
        log: pushLog(prev.log, "Emergency refill topped the grid back up."),
      }),
      "Energy refilled."
    );
  };

  if (!mounted) {
    return (
      <Layout title="MLEO Quest Arcade">
        <div className="min-h-screen grid place-items-center text-white">Loading Quest Arcade...</div>
      </Layout>
    );
  }

  return (
    <Layout title="MLEO Quest Arcade">
      <main className="min-h-screen bg-[#07111f] text-white">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-200">
                Shared Vault Support Game
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

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <MetricCard label="Shared Vault" value={`${fmt(sharedVault)} MLEO`} note="Same balance used by Miners, Arcade and Online." accent="emerald" />
            <MetricCard label="Quest Banked" value={`${fmt(state.bankedMleo)} MLEO`} note="Refined here, then shipped into the shared vault." accent="violet" />
            <MetricCard label="Ore" value={fmt(state.resources.ORE)} note={`x${derived.oreMult.toFixed(2)} output`} accent="cyan" />
            <MetricCard label="Gold" value={fmt(state.resources.GOLD)} note={`x${derived.goldMult.toFixed(2)} output`} accent="amber" />
            <MetricCard label="Scrap" value={fmt(state.resources.SCRAP)} note={`x${derived.scrapMult.toFixed(2)} output`} accent="rose" />
            <MetricCard label="Energy" value={`${fmt(state.resources.ENERGY)} / ${fmt(derived.energyCap)}`} note={`Regen ${derived.energyRegen.toFixed(2)}/s`} accent="slate" />
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-[1.2fr_1fr]">
            <Section
              title="Operations Console"
              subtitle={`Ship cap today: ${fmt(state.sentToday)} / ${fmt(derived.shipCap)} MLEO. Blueprints raise banking power without opening the economy to outside deposits.`}
            >
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                  <div className="text-sm font-semibold text-emerald-200">Ship to Shared Vault</div>
                  <p className="mt-1 text-sm text-white/70">
                    Move refined MLEO into the main vault with a daily softcut, so this game supports Miners instead of replacing it.
                  </p>
                  <button onClick={bankToSharedVault} className="mt-3 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold hover:bg-emerald-500">
                    Ship {fmt(state.bankedMleo)} MLEO
                  </button>
                </div>

                <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4">
                  <div className="text-sm font-semibold text-cyan-200">Field Expedition</div>
                  <p className="mt-1 text-sm text-white/70">
                    Spend {CONFIG.expeditionCost} energy to pull a random haul of Ore, Gold, Scrap and occasional banked MLEO.
                  </p>
                  <button
                    onClick={launchExpedition}
                    disabled={expeditionLeft > 0 || state.resources.ENERGY < CONFIG.expeditionCost}
                    className="mt-3 w-full rounded-xl bg-cyan-600 px-4 py-3 text-sm font-bold hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {expeditionLeft > 0 ? `Ready in ${Math.ceil(expeditionLeft / 1000)}s` : "Launch Expedition"}
                  </button>
                </div>

                <div className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/10 p-4">
                  <div className="text-sm font-semibold text-fuchsia-200">Blueprint Cache</div>
                  <p className="mt-1 text-sm text-white/70">
                    Costs {fmt(blueprintCost)} shared MLEO. Raises banking efficiency and daily ship cap permanently.
                  </p>
                  <button onClick={buyBlueprint} className="mt-3 w-full rounded-xl bg-fuchsia-600 px-4 py-3 text-sm font-bold hover:bg-fuchsia-500">
                    Buy Blueprint Lv {state.blueprintLevel + 1}
                  </button>
                </div>

                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                  <div className="text-sm font-semibold text-amber-200">Shared Vault Utilities</div>
                  <p className="mt-1 text-sm text-white/70">
                    Spend shared MLEO on time-limited productivity instead of direct emissions. This adds sinks to the ecosystem.
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
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
              title="Crew, Modules & Research"
              subtitle="Everything here strengthens the support loop around Miners without opening a second uncontrolled faucet."
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
                      <div key={module.key} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="text-sm font-semibold">{module.name}</div>
                        <div className="mt-1 text-xs text-white/60">{module.desc}</div>
                        <div className="mt-2 text-xs text-white/55">
                          Cost: {Object.entries(module.cost).map(([k, v]) => `${k} ${fmt(v)}`).join(" · ")}
                        </div>
                        <button
                          onClick={() => buyModule(module.key)}
                          disabled={owned}
                          className="mt-3 w-full rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
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
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
            <Section
              title="Districts"
              subtitle="Quest Arcade is tuned as a management side-game: it produces slowly, rewards planning, and feeds the main shared vault in measured batches."
            >
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {BUILDINGS.map((building) => {
                  const level = state.buildings[building.key] || 0;
                  const cost = buildingCost(building, level);
                  const ready = unlocked(building, state) && canAfford(state.resources, cost);
                  return (
                    <div key={building.key} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold">{building.name}</div>
                        <div className="rounded-full bg-white/10 px-2 py-1 text-xs text-white/60">Lv {level}</div>
                      </div>
                      <div className="mt-2 text-xs text-white/60">{building.desc}</div>
                      <div className="mt-3 text-xs text-white/55">
                        Cost: {Object.entries(cost).map(([k, v]) => `${k} ${fmt(v)}`).join(" · ")}
                      </div>
                      <button
                        onClick={() => buyBuilding(building.key)}
                        disabled={!ready}
                        className="mt-3 w-full rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {ready ? "Upgrade" : unlocked(building, state) ? "Need resources" : "Locked"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </Section>

            <Section
              title="Activity Log"
              subtitle="Quick read on what the support base has been doing."
            >
              <div className="space-y-2">
                {(state.log || []).map((entry) => (
                  <div key={entry.id} className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/75">
                    <div>{entry.text}</div>
                    <div className="mt-1 text-xs text-white/40">{new Date(entry.ts).toLocaleTimeString()}</div>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
                <div className="font-semibold text-white">Why this replaces Rush better</div>
                <ul className="mt-2 space-y-2 text-sm text-white/65">
                  <li>It adds a different loop from Miners: planning, conversion and shipping.</li>
                  <li>It uses the same shared vault, but does not accept outside deposits.</li>
                  <li>It introduces real sinks through blueprints, overclock and emergency support actions.</li>
                </ul>
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
