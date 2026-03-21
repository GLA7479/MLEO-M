import {
  BASE_HOME_SCENE_IDENTITY,
  BUILDING_POWER_STEPS,
  COMMANDER_PATHS,
  CONFIG,
  CREW_ROLES,
  DEFAULT_BUILDING_POWER_MODE,
  RUNTIME_CONTROLLED_BUILDINGS,
} from "./data";

const MAX_LOG_ITEMS = 16;

export const MISSION_GUIDANCE = {
  upgrade_building: {
    shortTitle: "Stabilize and upgrade",
    priority: 1,
    learningFocus: "Scale safely",
    whyItMatters: "Smart upgrades remove bottlenecks without destabilizing the base.",
    bestActionHint: "Use Safe 50% first, then upgrade your bottleneck.",
    helperLine: "Use safe mode before heavy upgrades.",
    target: { tab: "build", target: "powerCell" },
  },
  ship_mleo: {
    shortTitle: "Ship banked MLEO",
    priority: 2,
    learningFocus: "Shared Vault loop",
    whyItMatters: "Shipping clears banked MLEO into the shared vault and keeps your vault loop active.",
    bestActionHint: "Ship when banked MLEO is ready.",
    helperLine: "Clear banked MLEO into the shared vault.",
    target: { tab: "ops", target: "shipping" },
  },
  run_expedition: {
    shortTitle: "Run clean expedition",
    priority: 3,
    learningFocus: "Active timing",
    whyItMatters: "Expeditions are strongest when energy/data are comfortable.",
    bestActionHint: "Launch only when energy buffer and DATA are ready.",
    helperLine: "Run expeditions when energy and DATA are ready.",
    target: { tab: "ops", target: "expedition-action" },
  },
  spend_vault: {
    shortTitle: "Spend vault smart",
    priority: 6,
    learningFocus: "Reinvestment",
    whyItMatters: "Shared vault spending drives long-term command growth.",
    bestActionHint: "Use blueprint spend when the base is stable.",
    helperLine: "Spend vault on long-term upgrades, not panic buys.",
    target: { tab: "ops", target: "blueprint" },
  },
  generate_data: {
    shortTitle: "Stabilize DATA flow",
    priority: 5,
    learningFocus: "Data engine",
    whyItMatters: "DATA supports missions, expeditions and progression choices.",
    bestActionHint: "Upgrade lab flow to keep DATA generation steady.",
    helperLine: "Keep lab-fed DATA flow stable.",
    target: { tab: "build", target: "researchLab" },
  },
  perform_maintenance: {
    shortTitle: "Maintain at the right time",
    priority: 4,
    learningFocus: "Stability control",
    whyItMatters: "Maintenance protects efficiency before pressure compounds.",
    bestActionHint: "Maintain before stability drops below the safe band.",
    helperLine: "Maintenance protects efficiency.",
    target: { tab: "ops", target: "maintenance" },
  },
  double_expedition: {
    shortTitle: "Chain expeditions safely",
    priority: 7,
    learningFocus: "Tempo discipline",
    whyItMatters: "Double runs are powerful only with enough reserves.",
    bestActionHint: "Stabilize first, then chain expeditions.",
    helperLine: "Stabilize first, then chain expeditions.",
    target: { tab: "ops", target: "expedition-action" },
  },
};

export function getMissionGuidance(missionKey) {
  return MISSION_GUIDANCE[missionKey] || null;
}

export function getMissionGuidancePriority(missionKey) {
  return Number(MISSION_GUIDANCE?.[missionKey]?.priority || 999);
}

export function crewRoleMeta(roleKey) {
  return CREW_ROLES.find((item) => item.key === roleKey) || CREW_ROLES[0];
}

export function commanderPathMeta(pathKey) {
  return COMMANDER_PATHS.find((item) => item.key === pathKey) || COMMANDER_PATHS[0];
}

export function buildingRoleTag(key) {
  if (["quarry", "tradeHub", "salvage", "refinery"].includes(key)) return "Production";
  if (["powerCell", "repairBay"].includes(key)) return "Systems";
  if (["minerControl", "arcadeHub"].includes(key)) return "Ecosystem";
  if (["expeditionBay", "researchLab", "logisticsCenter"].includes(key)) return "Command";
  return "Core";
}

export function buildingSynergyTag(key) {
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

export function buildingRiskTag(key) {
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

export function sectorStatusForBuilding(key, state) {
  const level = Number(state.buildings?.[key] || 0);
  const stability = Number(state.stability || 100);

  if (level <= 0) return "offline";
  if (stability < 50 && ["refinery", "researchLab", "logisticsCenter"].includes(key)) return "critical";
  if (stability < 70 && ["repairBay", "powerCell", "refinery"].includes(key)) return "warning";
  return "active";
}

export function sectorStatusClasses(status) {
  if (status === "critical") return "border-rose-500/35 bg-rose-500/10 text-rose-200";
  if (status === "warning") return "border-amber-500/35 bg-amber-500/10 text-amber-200";
  if (status === "active") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  return "border-white/10 bg-white/5 text-white/45";
}

export function getBaseSceneIdentity(key) {
  return (
    BASE_HOME_SCENE_IDENTITY[key] || {
      short: key?.slice(0, 3)?.toUpperCase?.() || "BASE",
      glow: "slate",
      icon: "•",
    }
  );
}

export function getBaseSceneGlow(glow, state = "normal") {
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

export function getBaseSceneNodeState(key, base, derived) {
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

export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function pushLog(log, text) {
  const next = [{ id: `${Date.now()}-${Math.random()}`, ts: Date.now(), text }, ...(log || [])];
  return next.slice(0, MAX_LOG_ITEMS);
}

export function getShipSoftcutFactor(sentToday, shipCap) {
  const safeCap = Math.max(1, Number(shipCap || 0));
  const safeSent = Math.max(0, Number(sentToday || 0));
  const ratio = safeSent / safeCap;
  return Math.max(0.5, 1 - ratio * 0.5);
}

export function offlineFactorFor(ms, offlineTiers) {
  let remaining = Math.max(0, ms);
  let consumed = 0;
  let weighted = 0;
  let startMs = 0;
  for (const tier of offlineTiers) {
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

export function xpForLevel(level) {
  return 120 + (level - 1) * 80;
}

export function applyLevelUps(next) {
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

export function getMissionProgress(state) {
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

export function freshState() {
  return {
    version: 7,
    lastDay: todayKey(),
    lastHiddenAt: 0,
    resources: {
      ORE: 150,
      GOLD: 332,
      SCRAP: 34,
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
    mleoProducedToday: 0,
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
    if (rawPaused && typeof rawPaused[key] === "boolean") {
      out[key] = rawPaused[key] ? 0 : DEFAULT_BUILDING_POWER_MODE;
    }
  }
  return out;
}

export function sanitizeBaseState(raw, fallback = null) {
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
    mleoProducedToday: safeNumber(src.mleoProducedToday, seed.mleoProducedToday, 0),
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

export function normalizeServerState(raw, prevState = null) {
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

  return sanitizeBaseState(
    {
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
      crewRole: raw.crewRole ?? raw.crew_role ?? prev?.crewRole ?? "engineer",
      commanderPath: raw.commanderPath ?? raw.commander_path ?? prev?.commanderPath ?? "industry",
      bankedMleo: Number(raw.bankedMleo ?? raw.banked_mleo ?? prev?.bankedMleo ?? 0),
      mleoProducedToday: Number(
        raw.mleoProducedToday ?? raw.mleo_produced_today ?? prev?.mleoProducedToday ?? 0
      ),
      sentToday: Number(raw.sentToday ?? raw.sent_today ?? prev?.sentToday ?? 0),
      totalBanked: Number(raw.totalBanked ?? raw.total_banked ?? prev?.totalBanked ?? 0),
      blueprintLevel: Number(raw.blueprintLevel ?? raw.blueprint_level ?? prev?.blueprintLevel ?? 0),
      totalSharedSpent: Number(
        raw.totalSharedSpent ?? raw.total_shared_spent ?? prev?.totalSharedSpent ?? 0
      ),
      overclockUntil,
      expeditionReadyAt: expeditionReady,
      maintenanceDue: Number(raw.maintenanceDue ?? raw.maintenance_due ?? prev?.maintenanceDue ?? 0),
      stability: Number(raw.stability ?? prev?.stability ?? 100),
      commanderXp: Number(raw.commanderXp ?? raw.commander_xp ?? prev?.commanderXp ?? 0),
      commanderLevel: Number(raw.commanderLevel ?? raw.commander_level ?? prev?.commanderLevel ?? 1),
      totalExpeditions: Number(
        raw.totalExpeditions ?? raw.total_expeditions ?? prev?.totalExpeditions ?? 0
      ),
      totalMissionsDone: Number(
        raw.totalMissionsDone ?? raw.total_missions_done ?? prev?.totalMissionsDone ?? 0
      ),
      stats: raw.stats || prev?.stats || seed.stats,
      missionState: raw.missionState || raw.mission_state || prev?.missionState || seed.missionState,
      log: prev?.log || seed.log,
    },
    seed
  );
}
