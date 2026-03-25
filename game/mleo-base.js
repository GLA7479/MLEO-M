import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useAccountModal, useConnectModal } from "@rainbow-me/rainbowkit";
import Layout from "../components/Layout";
import { DailyMissionsPanel } from "./mleo-base/components/panels/DailyMissionsPanel";
import { OperationsConsolePanel } from "./mleo-base/components/panels/OperationsConsolePanel";
import { CrewModulesResearchPanel } from "./mleo-base/components/panels/CrewModulesResearchPanel";
import { BuildSupportSystemsPanel } from "./mleo-base/components/panels/BuildSupportSystemsPanel";
import { BaseStructuresPanel } from "./mleo-base/components/panels/BaseStructuresPanel";
import { BaseHomeFlowScenePanel } from "./mleo-base/components/panels/BaseHomeFlowScenePanel";
import {
  ActivityLogPanel,
  IntelPanelCards,
  ProgressSummaryPanel,
} from "./mleo-base/components/panels/IntelPanels";
import { BuildPanelCards } from "./mleo-base/components/panels/BuildPanelCards";
import { OpsPanelCards } from "./mleo-base/components/panels/OpsPanelCards";
import { OverviewPanelCards } from "./mleo-base/components/panels/OverviewPanelCards";
import {
  DesktopPanelSection,
  MobilePanelOverlayShell,
  MobilePanelSection,
  ReadyNowSummaryBlock,
} from "./mleo-base/components/panels/PanelShells";
import { BasePanelOverlayCloseHeaderRow } from "./mleo-base/components/panels/BasePanelOverlayCloseHeaderRow";
import {
  queryInnerPanelHeaderElement,
  resolvePanelScrollContainerForElement,
  runAfterDoubleRaf,
  scrollPanelHeaderIntoView,
} from "./mleo-base/utils/scrollPanelSectionTopIntoView";
import {
  getBaseVaultBalance,
  getBaseState,
  buildBuilding,
  advanceBuildingTier,
  unlockSupportProgram,
  setSupportProgram,
  installModule,
  researchTech,
  launchExpedition as launchExpeditionAction,
  shipToVault,
  spendFromVault,
  hireCrewAction,
  performMaintenanceAction,
  claimBaseMission,
  claimBaseContract,
  claimSpecializationMilestone,
  deployNextBaseSector,
  setBaseProfile,
  setCommandProtocol,
  setBuildingPowerMode,
  sendBasePresence,
  ensureCsrfToken,
  devSetBaseSectorWorld,
} from "../lib/baseVaultClient";
import { isBaseDevToolsEnabled } from "../lib/baseDevToolsShared";
import {
  BASE_HOME_SCENE_IDENTITY,
  BASE_HOME_SCENE_ORDER,
  BASE_HOME_SCENE_POSITIONS_DESKTOP,
  BASE_HOME_SCENE_POSITIONS_MOBILE,
  BUILDINGS,
  baseMleoSoftcutFactor,
  BUILDING_POWER_STEPS,
  COMMANDER_PATHS,
  CONFIG,
  CREW_ROLES,
  DAILY_MISSIONS,
  DAILY_SOFTCUT,
  DEFAULT_BUILDING_POWER_MODE,
  EVENT_COOLDOWN_MS,
  LIVE_CONTRACTS,
  ELITE_ROTATING_CONTRACTS,
  getEliteRuntimeContractKey,
  LIVE_EVENTS,
  MODULES,
  OFFLINE_TIERS,
  RESEARCH,
  RUNTIME_CONTROLLED_BUILDINGS,
  STRUCTURES_TAB_A,
  STRUCTURES_TAB_B,
} from "./mleo-base/data";
import {
  applyPhase1ACommandProtocolToDerivedRates,
  COMMAND_PROTOCOL_DOCTRINE_CONTEXT_OVERVIEW,
  COMMAND_PROTOCOL_FAMILY_LABEL,
  COMMAND_PROTOCOL_STORED_INACTIVE_OVERVIEW,
  isCommandProtocolUnlocked,
  normalizeCommandProtocolId,
  PHASE_1A_COMMAND_PROTOCOLS,
  resolveEffectiveCommandProtocol,
} from "./mleo-base/commandProtocols";
import {
  applyLevelUps,
  buildingRiskTag,
  buildingRoleTag,
  buildingSynergyTag,
  commanderPathMeta,
  crewRoleMeta,
  freshState,
  getBaseSceneGlow,
  getBaseSceneIdentity,
  getBaseSceneNodeState,
  getMissionProgress,
  getMissionGuidance,
  getMissionGuidancePriority,
  getMissionStructureSubtab,
  getShipSoftcutFactor,
  normalizeServerState,
  normalizeSpecializationMilestonesClaimed,
  offlineFactorFor,
  pushLog,
  sanitizeBaseState,
  countClaimableSpecializationMilestones,
  getSpecializationMilestonePreview,
  SPECIALIZATION_MILESTONE_META,
  SPECIALIZATION_MILESTONES_BY_BUILDING,
  sectorStatusClasses,
  sectorStatusForBuilding,
  todayKey,
  xpForLevel,
} from "./mleo-base/engine";
import {
  buildWorld2FreightAlert,
  buildWorld3TelemetryAlert,
  buildWorld4ReactorAlert,
  buildWorld5SalvageAlert,
  buildWorld6CommandAlert,
  getSectorWorldProgressSnapshot,
  getWorld2ThroughputSnapshot,
  getWorld3TelemetrySnapshot,
  getWorld4ReactorSnapshot,
  getWorld5SalvagePressureSnapshot,
  getWorld6CommandSnapshot,
  getWorldDailyMleoCapByOrder,
  resolveSectorWorldOrder,
  getWorldMapTheme,
  getWorldPlayfieldCanvasBackground,
  getBaseInternalPanelTone,
  WORLD_BY_ORDER,
  WORLDS,
} from "./mleo-base/worlds";

const MAX_LOG_ITEMS = 16;
const REFINERY_ORE_NEED_PER_LEVEL = 1.65;
const REFINERY_SCRAP_NEED_PER_LEVEL = 0.62;
const REFINERY_ENERGY_NEED_PER_LEVEL = 0.82;
const REFINERY_BANKED_PER_LEVEL = 0.0165;
const SHIP_READY_BANKED_THRESHOLD = 100;

function worldLaneToneClass(laneKey) {
  if (laneKey === "open") {
    return "border-emerald-400/30 bg-emerald-500/[0.10] text-emerald-100";
  }
  if (laneKey === "congested") {
    return "border-amber-400/30 bg-amber-500/[0.12] text-amber-100";
  }
  return "border-sky-400/25 bg-sky-500/[0.08] text-sky-100";
}

function worldSignalToneClass(signalKey) {
  if (signalKey === "clean") {
    return "border-violet-400/30 bg-violet-500/[0.12] text-violet-100";
  }
  if (signalKey === "noisy") {
    return "border-amber-400/30 bg-amber-500/[0.12] text-amber-100";
  }
  return "border-sky-400/25 bg-sky-500/[0.08] text-sky-100";
}

function worldReactorToneClass(loadKey) {
  if (loadKey === "primed") {
    return "border-orange-400/30 bg-orange-500/[0.12] text-orange-100";
  }
  if (loadKey === "strained") {
    return "border-rose-400/30 bg-rose-500/[0.12] text-rose-100";
  }
  return "border-sky-400/25 bg-sky-500/[0.08] text-sky-100";
}

function worldSalvageToneClass(salvageKey) {
  if (salvageKey === "rich") {
    return "border-emerald-400/30 bg-emerald-500/[0.12] text-emerald-100";
  }
  if (salvageKey === "strained") {
    return "border-amber-400/30 bg-amber-500/[0.12] text-amber-100";
  }
  return "border-sky-400/25 bg-sky-500/[0.08] text-sky-100";
}

function worldCommandToneClass(commandKey) {
  if (commandKey === "harmonized") {
    return "border-cyan-400/30 bg-cyan-500/[0.12] text-cyan-100";
  }
  if (commandKey === "fractured") {
    return "border-rose-400/30 bg-rose-500/[0.12] text-rose-100";
  }
  return "border-sky-400/25 bg-sky-500/[0.08] text-sky-100";
}

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

/** Matches Shared Vault power presets for built runtime buildings only. */
function getActivePowerPreset(state, safeMap, normalMap) {
  const keys = Object.keys(safeMap);
  const built = keys.filter((k) => (state?.buildings?.[k] || 0) > 0);
  if (built.length === 0) return "none";

  const matches = (map) => built.every((k) => getBuildingPowerMode(state, k) === map[k]);

  if (matches(safeMap)) return "safe";
  if (matches(normalMap)) return "normal";
  return "mixed";
}

function getBuildingPowerFactor(state, buildingKey) {
  return getBuildingPowerMode(state, buildingKey) / 100;
}

function getEffectiveBuildingLevel(state, buildingKey) {
  const baseLevel = Number(state?.buildings?.[buildingKey] || 0);
  return baseLevel * getBuildingPowerFactor(state, buildingKey);
}

/** Matches `simulate()` early output boost (per effective runtime level). */
function earlyOutputBoostForSim(key, effectiveLevel) {
  const level = Number(effectiveLevel || 0);
  if (level > 2) return 1;
  if (key === "quarry") return 1.12;
  if (key === "salvage") return 1.1;
  if (key === "researchLab") return 1.1;
  if (key === "refinery") return 1.08;
  return 1;
}

/** Matches `simulate()` early energy relief (per effective runtime level). */
function earlyEnergyReliefForSim(key, effectiveLevel) {
  const level = Number(effectiveLevel || 0);
  if (level > 2) return 1;
  if (key === "quarry" || key === "salvage" || key === "researchLab" || key === "refinery") {
    return 0.9;
  }
  return 1;
}

function fmtLiveNumber(value, maxFractionDigits = 1) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: maxFractionDigits }).format(
    Number(value || 0)
  );
}

function getReserveEnergyFloor(derived) {
  return Math.max(8, Math.floor(Number(derived?.energyCap || 0) * 0.05));
}

/**
 * Compact live "Now" / "Next" lines for Build cards (UI only; formulas mirror `simulate()` / snapshots).
 */
function getBuildingNowNextLines(state, derived, buildingKey, bankedSnapshot) {
  if (!state || !derived || !buildingKey) {
    return { nowLine: null, nextLine: null, hideLegacyUpgradeImpact: false };
  }

  const fmt = (n, d = 1) => fmtLiveNumber(n, d);
  const b = state.buildings || {};
  const baseLevel = Number(b[buildingKey] || 0);
  const energy = Number(state?.resources?.ENERGY || 0);
  const energyUseMult = Number(derived?.energyUseMult || 1);

  const quarryOrePerHourIdeal = (s, d, baseLv) => {
    const modeFactor = getBuildingPowerFactor(s, "quarry");
    const eff = baseLv * modeFactor;
    if (!eff) return 0;
    const boost = earlyOutputBoostForSim("quarry", eff);
    return 1.35 * eff * Number(d?.oreMult || 1) * 3600 * boost;
  };

  const quarryEnergyBlocked = (s, d, baseLv) => {
    const modeFactor = getBuildingPowerFactor(s, "quarry");
    const eff = baseLv * modeFactor;
    if (!eff) return true;
    const need =
      0.72 * eff * energyUseMult * earlyEnergyReliefForSim("quarry", eff);
    return energy < need;
  };

  const salvageScrapPerHourIdeal = (s, d, baseLv) => {
    const modeFactor = getBuildingPowerFactor(s, "salvage");
    const eff = baseLv * modeFactor;
    if (!eff) return 0;
    const boost = earlyOutputBoostForSim("salvage", eff);
    return 0.5 * eff * Number(d?.scrapMult || 1) * 3600 * boost;
  };

  const salvageEnergyBlocked = (s, d, baseLv) => {
    const modeFactor = getBuildingPowerFactor(s, "salvage");
    const eff = baseLv * modeFactor;
    if (!eff) return true;
    const need =
      0.78 * eff * energyUseMult * earlyEnergyReliefForSim("salvage", eff);
    return energy < need;
  };

  const tradeGoldPerHourIdeal = (s, d, baseLv) => {
    const modeFactor = getBuildingPowerFactor(s, "tradeHub");
    const eff = baseLv * modeFactor;
    if (!eff) return 0;
    return 0.6 * eff * Number(d?.goldMult || 1) * 3600;
  };

  const tradeEnergyBlocked = (s, d, baseLv) => {
    const modeFactor = getBuildingPowerFactor(s, "tradeHub");
    const eff = baseLv * modeFactor;
    if (!eff) return true;
    const need = 0.78 * eff * energyUseMult;
    return energy < need;
  };

  const dataBuildingPerHourIdeal = (s, d, key, baseLv, perSecond) => {
    const modeFactor = getBuildingPowerFactor(s, key);
    const eff = baseLv * modeFactor;
    if (!eff) return 0;
    return perSecond * eff * Number(d?.dataMult || 1) * 3600;
  };

  const dataBuildingEnergyBlocked = (s, d, key, baseLv, perSecondCoef) => {
    const modeFactor = getBuildingPowerFactor(s, key);
    const eff = baseLv * modeFactor;
    if (!eff) return true;
    const need = perSecondCoef * eff * energyUseMult;
    const reserve = getReserveEnergyFloor(d);
    return energy - need < reserve;
  };

  if (buildingKey === "quarry") {
    const nowHr = quarryEnergyBlocked(state, derived, baseLevel)
      ? 0
      : quarryOrePerHourIdeal(state, derived, baseLevel);
    const nextHr = quarryEnergyBlocked(state, derived, baseLevel + 1)
      ? 0
      : quarryOrePerHourIdeal(state, derived, baseLevel + 1);
    const delta = nextHr - nowHr;
    return {
      nowLine: `Now: +${fmt(nowHr, 1)} ORE/hr`,
      nextLine:
        baseLevel > 0
          ? `Next: +${fmt(nextHr, 1)} ORE/hr (+${fmt(delta, 1)})`
          : `Next: +${fmt(nextHr, 1)} ORE/hr`,
      hideLegacyUpgradeImpact: true,
    };
  }

  if (buildingKey === "tradeHub") {
    const nowHr = tradeEnergyBlocked(state, derived, baseLevel)
      ? 0
      : tradeGoldPerHourIdeal(state, derived, baseLevel);
    const nextHr = tradeEnergyBlocked(state, derived, baseLevel + 1)
      ? 0
      : tradeGoldPerHourIdeal(state, derived, baseLevel + 1);
    const delta = nextHr - nowHr;
    return {
      nowLine: `Now: +${fmt(nowHr, 1)} GOLD/hr`,
      nextLine:
        baseLevel > 0
          ? `Next: +${fmt(nextHr, 1)} GOLD/hr (+${fmt(delta, 1)})`
          : `Next: +${fmt(nextHr, 1)} GOLD/hr`,
      hideLegacyUpgradeImpact: true,
    };
  }

  if (buildingKey === "salvage") {
    const nowHr = salvageEnergyBlocked(state, derived, baseLevel)
      ? 0
      : salvageScrapPerHourIdeal(state, derived, baseLevel);
    const nextHr = salvageEnergyBlocked(state, derived, baseLevel + 1)
      ? 0
      : salvageScrapPerHourIdeal(state, derived, baseLevel + 1);
    const delta = nextHr - nowHr;
    return {
      nowLine: `Now: +${fmt(nowHr, 1)} SCRAP/hr`,
      nextLine:
        baseLevel > 0
          ? `Next: +${fmt(nextHr, 1)} SCRAP/hr (+${fmt(delta, 1)})`
          : `Next: +${fmt(nextHr, 1)} SCRAP/hr`,
      hideLegacyUpgradeImpact: true,
    };
  }

  if (buildingKey === "refinery") {
    const snap =
      bankedSnapshot && typeof bankedSnapshot === "object"
        ? bankedSnapshot
        : getBankedRateSnapshot(state, derived);
    const nowHr = Number(snap?.perHour || 0);
    const nextState = {
      ...state,
      buildings: { ...b, refinery: baseLevel + 1 },
    };
    const nextDerived = derive(nextState);
    const nextSnap = getBankedRateSnapshot(nextState, nextDerived);
    const nextHr = Number(nextSnap?.perHour || 0);
    const delta = nextHr - nowHr;
    return {
      nowLine: `Now: +${fmt(nowHr, 2)} banked/hr`,
      nextLine:
        baseLevel > 0
          ? `Next: +${fmt(nextHr, 2)} banked/hr (+${fmt(delta, 2)})`
          : `Next: +${fmt(nextHr, 2)} banked/hr`,
      hideLegacyUpgradeImpact: true,
    };
  }

  if (buildingKey === "powerCell") {
    const L = baseLevel;
    const capNow = L * 42;
    const regenNow = L * 2.5;
    const capNext = (L + 1) * 42;
    const regenNext = (L + 1) * 2.5;
    return {
      nowLine: `Now: +${fmt(capNow, 0)} ENERGY cap, +${fmt(regenNow, 1)}/s regen`,
      nextLine:
        L > 0
          ? `Next: +${fmt(capNext, 0)} cap, +${fmt(regenNext, 1)}/s (+${fmt(42, 0)} cap, +${fmt(2.5, 1)}/s)`
          : `Next: +${fmt(capNext, 0)} cap, +${fmt(regenNext, 1)}/s`,
      hideLegacyUpgradeImpact: true,
    };
  }

  if (buildingKey === "hq") {
    const hqLevel = Number(b.hq || 1);
    const pctNow = hqLevel * 3;
    const pctNext = (hqLevel + 1) * 3;
    return {
      nowLine: `Now: +${fmt(pctNow, 0)}% global output mult`,
      nextLine: `Next: +${fmt(pctNext, 0)}% mult (+3%)`,
      hideLegacyUpgradeImpact: true,
    };
  }

  if (buildingKey === "researchLab") {
    const researchDataPerHour = (s, d, baseLv) => {
      const modeFactor = getBuildingPowerFactor(s, "researchLab");
      const eff = baseLv * modeFactor;
      if (!eff) return 0;
      const boost = earlyOutputBoostForSim("researchLab", eff);
      return 0.22 * eff * Number(d?.dataMult || 1) * 3600 * boost;
    };
    const researchEnergyBlocked = (s, d, baseLv) => {
      const modeFactor = getBuildingPowerFactor(s, "researchLab");
      const eff = baseLv * modeFactor;
      if (!eff) return true;
      const need =
        0.24 * eff * energyUseMult * earlyEnergyReliefForSim("researchLab", eff);
      const reserve = getReserveEnergyFloor(d);
      return energy - need < reserve;
    };
    const nowHr = researchEnergyBlocked(state, derived, baseLevel)
      ? 0
      : researchDataPerHour(state, derived, baseLevel);
    const nextHr = researchEnergyBlocked(state, derived, baseLevel + 1)
      ? 0
      : researchDataPerHour(state, derived, baseLevel + 1);
    const delta = nextHr - nowHr;
    return {
      nowLine: `Now: +${fmt(nowHr, 1)} DATA/hr`,
      nextLine:
        baseLevel > 0
          ? `Next: +${fmt(nextHr, 1)} DATA/hr (+${fmt(delta, 1)})`
          : `Next: +${fmt(nextHr, 1)} DATA/hr`,
      hideLegacyUpgradeImpact: true,
    };
  }

  if (buildingKey === "repairBay") {
    const modeFactor = getBuildingPowerFactor(state, "repairBay");
    const eff = baseLevel * modeFactor;
    const perHourStab = 0.042 * eff * 3600;
    const relief = Number(derived?.maintenanceRelief || 1);
    const nextEff = (baseLevel + 1) * modeFactor;
    const nextHourStab = 0.042 * nextEff * 3600;
    const deltaStab = nextHourStab - perHourStab;
    const nextState = {
      ...state,
      buildings: { ...b, repairBay: baseLevel + 1 },
    };
    const nextDerived = derive(nextState);
    const reliefNext = Number(nextDerived?.maintenanceRelief || 1);
    return {
      nowLine: `Now: +${fmt(perHourStab, 1)} stability/hr · relief ×${fmt(relief, 2)}`,
      nextLine:
        baseLevel > 0
          ? `Next: +${fmt(nextHourStab, 1)} stability/hr (+${fmt(deltaStab, 1)}) · relief ×${fmt(
              reliefNext,
              2
            )}`
          : `Next: +${fmt(nextHourStab, 1)} stability/hr · relief ×${fmt(reliefNext, 2)}`,
      hideLegacyUpgradeImpact: true,
    };
  }

  if (buildingKey === "minerControl") {
    const nowHr = dataBuildingEnergyBlocked(state, derived, "minerControl", baseLevel, 0.2)
      ? 0
      : dataBuildingPerHourIdeal(state, derived, "minerControl", baseLevel, 0.14);
    const nextHr = dataBuildingEnergyBlocked(state, derived, "minerControl", baseLevel + 1, 0.2)
      ? 0
      : dataBuildingPerHourIdeal(state, derived, "minerControl", baseLevel + 1, 0.14);
    const delta = nextHr - nowHr;
    return {
      nowLine: `Now: +${fmt(nowHr, 1)} DATA/hr`,
      nextLine:
        baseLevel > 0
          ? `Next: +${fmt(nextHr, 1)} DATA/hr (+${fmt(delta, 1)})`
          : `Next: +${fmt(nextHr, 1)} DATA/hr`,
      hideLegacyUpgradeImpact: true,
    };
  }

  if (buildingKey === "arcadeHub") {
    const nowHr = dataBuildingEnergyBlocked(state, derived, "arcadeHub", baseLevel, 0.22)
      ? 0
      : dataBuildingPerHourIdeal(state, derived, "arcadeHub", baseLevel, 0.11);
    const nextHr = dataBuildingEnergyBlocked(state, derived, "arcadeHub", baseLevel + 1, 0.22)
      ? 0
      : dataBuildingPerHourIdeal(state, derived, "arcadeHub", baseLevel + 1, 0.11);
    const delta = nextHr - nowHr;
    return {
      nowLine: `Now: +${fmt(nowHr, 1)} DATA/hr`,
      nextLine:
        baseLevel > 0
          ? `Next: +${fmt(nextHr, 1)} DATA/hr (+${fmt(delta, 1)})`
          : `Next: +${fmt(nextHr, 1)} DATA/hr`,
      hideLegacyUpgradeImpact: true,
    };
  }

  if (buildingKey === "logisticsCenter") {
    const nowHr = dataBuildingEnergyBlocked(state, derived, "logisticsCenter", baseLevel, 0.2)
      ? 0
      : dataBuildingPerHourIdeal(state, derived, "logisticsCenter", baseLevel, 0.06);
    const nextHr = dataBuildingEnergyBlocked(state, derived, "logisticsCenter", baseLevel + 1, 0.2)
      ? 0
      : dataBuildingPerHourIdeal(state, derived, "logisticsCenter", baseLevel + 1, 0.06);
    const delta = nextHr - nowHr;
    return {
      nowLine: `Now: +${fmt(nowHr, 1)} DATA/hr`,
      nextLine:
        baseLevel > 0
          ? `Next: +${fmt(nextHr, 1)} DATA/hr (+${fmt(delta, 1)})`
          : `Next: +${fmt(nextHr, 1)} DATA/hr`,
      hideLegacyUpgradeImpact: true,
    };
  }

  if (buildingKey === "expeditionBay") {
    return {
      nowLine: "Now: expedition loot (not a steady /hr rate)",
      nextLine: null,
      hideLegacyUpgradeImpact: false,
    };
  }

  return { nowLine: null, nextLine: null, hideLegacyUpgradeImpact: false };
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


function getAlerts(
  state,
  derived,
  systemState,
  liveContracts = [],
  world2FreightAlertRow = null,
  world3TelemetryAlertRow = null,
  world4ReactorAlertRow = null,
  world5SalvageAlertRow = null,
  world6CommandAlertRow = null
) {
  const alerts = [];

  const energy = Number(state.resources?.ENERGY || 0);
  const energyCap = Number(derived.energyCap || 0);
  const banked = Number(state.bankedMleo || 0);
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
      title: "Start expedition",
      text: "You can launch an expedition now from Operations Console.",
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

  if (world6CommandAlertRow) {
    alerts.unshift({
      key: world6CommandAlertRow.key,
      tone: world6CommandAlertRow.tone,
      title: world6CommandAlertRow.title,
      text: world6CommandAlertRow.text,
      world6Target: world6CommandAlertRow.target,
    });
  }

  if (world5SalvageAlertRow) {
    alerts.unshift({
      key: world5SalvageAlertRow.key,
      tone: world5SalvageAlertRow.tone,
      title: world5SalvageAlertRow.title,
      text: world5SalvageAlertRow.text,
      world5Target: world5SalvageAlertRow.target,
    });
  }

  if (world4ReactorAlertRow) {
    alerts.unshift({
      key: world4ReactorAlertRow.key,
      tone: world4ReactorAlertRow.tone,
      title: world4ReactorAlertRow.title,
      text: world4ReactorAlertRow.text,
      world4Target: world4ReactorAlertRow.target,
    });
  }

  if (world3TelemetryAlertRow) {
    alerts.unshift({
      key: world3TelemetryAlertRow.key,
      tone: world3TelemetryAlertRow.tone,
      title: world3TelemetryAlertRow.title,
      text: world3TelemetryAlertRow.text,
      world3Target: world3TelemetryAlertRow.target,
    });
  }

  if (world2FreightAlertRow) {
    alerts.unshift({
      key: world2FreightAlertRow.key,
      tone: world2FreightAlertRow.tone,
      title: world2FreightAlertRow.title,
      text: world2FreightAlertRow.text,
      world2Target: world2FreightAlertRow.target,
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

function formatBankedDetailedValue(value) {
  const n = Number(value || 0);
  const abs = Math.abs(n);

  if (abs < 10) return n.toFixed(4);
  if (abs < 1000) return n.toFixed(2);
  if (abs < 100000) return n.toFixed(1);
  return n.toFixed(0);
}

function formatBankedBadgeCompact(value) {
  const n = Number(value || 0);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);

  if (abs < 1000) {
    if (abs < 10) return `${sign}${abs.toFixed(4)}`;
    if (abs < 100) return `${sign}${abs.toFixed(2)}`;
    return `${sign}${abs.toFixed(1)}`;
  }

  const suffixes = ["K", "M", "B", "T"];
  const divisors = [1e3, 1e6, 1e9, 1e12];

  let tier = 0;
  while (tier < divisors.length - 1 && abs >= divisors[tier + 1]) tier += 1;

  const computeScaled = (currentTier) => abs / divisors[currentTier];

  const formatScaled = (scaled) => {
    if (scaled < 10) return scaled.toFixed(2);
    if (scaled < 100) return scaled.toFixed(1);
    return scaled.toFixed(0);
  };

  let scaled = computeScaled(tier);
  let formatted = formatScaled(scaled);

  if (Number(formatted) >= 1000 && tier < divisors.length - 1) {
    tier += 1;
    scaled = computeScaled(tier);
    formatted = formatScaled(scaled);
  }

  return `${sign}${formatted}${suffixes[tier]}`;
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

function buildingCost(def, level) {
  const factor = Math.pow(def.growth || 1, level);
  const earlyDiscount =
    level === 0 ? 0.82
    : level === 1 ? 0.88
    : level === 2 ? 0.92
    : 1;
  const key = def?.key;
  const earlyKeyDiscount =
    level > 2
      ? 1
      : key === "quarry"
      ? level === 0
        ? 0.9
        : level === 1
        ? 0.95
        : 1
      : key === "salvage" || key === "powerCell"
      ? level === 0
        ? 0.92
        : level === 1
        ? 0.96
        : 1
      : key === "repairBay" || key === "refinery" || key === "researchLab"
      ? level === 0
        ? 0.94
        : level === 1
        ? 0.97
        : 1
      : 1;
  const out = {};
  for (const [key, value] of Object.entries(def.baseCost || {})) {
    out[key] = Math.ceil(value * factor * earlyDiscount * earlyKeyDiscount);
  }
  return out;
}

const TIER_BUILDINGS = new Set(["logisticsCenter", "researchLab", "repairBay"]);

function getBuildingTier(state, buildingKey) {
  return Math.max(1, Number(state?.buildingTiers?.[buildingKey] || 1));
}

function isTierBuilding(buildingKey) {
  return TIER_BUILDINGS.has(buildingKey);
}

function getTierAdvancePreviewCost(buildingKey, currentTier) {
  const baseCosts = {
    logisticsCenter: { ORE: 2200, GOLD: 1700, SCRAP: 950, DATA: 80 },
    researchLab: { ORE: 2100, GOLD: 1850, SCRAP: 980, DATA: 90 },
    repairBay: { ORE: 1800, GOLD: 1500, SCRAP: 1200, DATA: 65 },
  };

  const base = baseCosts[buildingKey];
  if (!base) return null;

  const growth = 1.85;
  const factor = Math.pow(growth, Math.max(0, Number(currentTier || 1) - 1));
  const out = {};
  for (const [key, value] of Object.entries(base)) {
    out[key] = Math.ceil(Number(value) * factor);
  }
  return out;
}

/** UI + server-aligned catalog (keys, tiers, costs, copy). */
const SUPPORT_PROGRAM_CATALOG = {
  logisticsCenter: [
    {
      key: "routeDiscipline",
      label: "Route Discipline",
      minTier: 2,
      cost: { ORE: 900, GOLD: 750, SCRAP: 320, DATA: 45 },
      effects: "Bank +6% · Data +2%",
    },
    {
      key: "reserveBuffer",
      label: "Reserve Buffer",
      minTier: 3,
      cost: { ORE: 1200, GOLD: 980, SCRAP: 420, DATA: 70 },
      effects: "Maintenance +8% · Bank -2%",
    },
    {
      key: "vaultCalibration",
      label: "Vault Calibration",
      minTier: 4,
      cost: { ORE: 1500, GOLD: 1200, SCRAP: 520, DATA: 95 },
      effects: "Bank +8% · Data -3%",
    },
  ],
  researchLab: [
    {
      key: "analysisMatrix",
      label: "Analysis Matrix",
      minTier: 2,
      cost: { ORE: 850, GOLD: 820, SCRAP: 340, DATA: 55 },
      effects: "Data +8% · Maintenance -3%",
    },
    {
      key: "predictiveTelemetry",
      label: "Predictive Telemetry",
      minTier: 3,
      cost: { ORE: 1100, GOLD: 1050, SCRAP: 420, DATA: 80 },
      effects: "Data +6% · Bank +3%",
    },
    {
      key: "cleanroomProtocol",
      label: "Cleanroom Protocol",
      minTier: 4,
      cost: { ORE: 1350, GOLD: 1300, SCRAP: 500, DATA: 110 },
      effects: "Data +10% · Bank -4%",
    },
  ],
  repairBay: [
    {
      key: "preventiveCycle",
      label: "Preventive Cycle",
      minTier: 2,
      cost: { ORE: 820, GOLD: 700, SCRAP: 460, DATA: 35 },
      effects: "Maintenance +10% · Data -3%",
    },
    {
      key: "stabilizationMesh",
      label: "Stabilization Mesh",
      minTier: 3,
      cost: { ORE: 1050, GOLD: 920, SCRAP: 580, DATA: 55 },
      effects: "Maintenance +8% · Bank +2%",
    },
    {
      key: "serviceDiscipline",
      label: "Service Discipline",
      minTier: 4,
      cost: { ORE: 1300, GOLD: 1100, SCRAP: 720, DATA: 80 },
      effects: "Maintenance +12% · Bank -4%",
    },
  ],
};

function supportsPrograms(buildingKey) {
  return TIER_BUILDINGS.has(buildingKey);
}

function getSupportPrograms(buildingKey) {
  return SUPPORT_PROGRAM_CATALOG[buildingKey] || [];
}

function getActiveSupportProgram(state, buildingKey) {
  const active = state?.supportProgramActive || state?.support_program_active || {};
  const v = active[buildingKey];
  return typeof v === "string" && v.length ? v : null;
}

const SUPPORT_BUILDING_CONTRACT_SHORT = {
  logisticsCenter: "Logistics",
  researchLab: "Research",
  repairBay: "Repair",
};

function supportProgramLabelForContract(buildingKey, programKey) {
  if (!programKey) return "";
  const hit = SUPPORT_PROGRAM_CATALOG[buildingKey]?.find((p) => p.key === programKey);
  return hit?.label || programKey;
}

function isSupportProgramUnlocked(state, buildingKey, programKey) {
  const u =
    state?.supportProgramUnlocks?.[buildingKey] ||
    state?.support_program_unlocks?.[buildingKey] ||
    {};
  return u[programKey] === true;
}

function canUnlockSupportProgram(state, buildingKey, program) {
  const tier = getBuildingTier(state, buildingKey);
  if (tier < program.minTier) return false;
  if (isSupportProgramUnlocked(state, buildingKey, program.key)) return false;
  return canCoverCost(state.resources, program.cost);
}

/** Matches `base_support_program_definition` in sql/base_server_authority.sql (bank/data/maint only). */
const SUPPORT_PROGRAM_DERIVE_FACTORS = {
  logisticsCenter: {
    routeDiscipline: { bank: 1.06, data: 1.02, maint: 1 },
    reserveBuffer: { bank: 0.98, data: 1, maint: 1.08 },
    vaultCalibration: { bank: 1.08, data: 0.97, maint: 1 },
  },
  researchLab: {
    analysisMatrix: { bank: 1, data: 1.08, maint: 0.97 },
    predictiveTelemetry: { bank: 1.03, data: 1.06, maint: 1 },
    cleanroomProtocol: { bank: 0.96, data: 1.1, maint: 1 },
  },
  repairBay: {
    preventiveCycle: { bank: 1, data: 0.97, maint: 1.1 },
    stabilizationMesh: { bank: 1.02, data: 1, maint: 1.08 },
    serviceDiscipline: { bank: 0.96, data: 1, maint: 1.12 },
  },
};

function applySupportProgramFactorsToDerived(state, bankBonus, dataMult, maintenanceRelief) {
  const active = state?.supportProgramActive || state?.support_program_active || {};
  const unlocks = state?.supportProgramUnlocks || state?.support_program_unlocks || {};
  for (const buildingKey of TIER_BUILDINGS) {
    const prog = active[buildingKey];
    if (!prog || typeof prog !== "string") continue;
    const u = unlocks[buildingKey];
    if (!u || typeof u !== "object" || u[prog] !== true) continue;
    const f = SUPPORT_PROGRAM_DERIVE_FACTORS[buildingKey]?.[prog];
    if (!f) continue;
    bankBonus *= f.bank;
    dataMult *= f.data;
    maintenanceRelief *= f.maint;
  }
  return { bankBonus, dataMult, maintenanceRelief };
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
  return getShipSoftcutFactor(used, cap);
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
  const overclockActive = now < (state.overclockUntil || 0);
  const overclock = overclockActive ? 1.45 : 1;
  const energyUseMult = overclockActive ? 0.78 : 1;
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
  let maintenanceRelief = 1 + repairBayLevel * 0.09;

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
  if (state.research.minerSync) oreMult *= 1.12;
  if (state.research.routing) bankBonus *= 1.08;
  if (state.research.logistics) bankBonus *= 1.1;
  if (state.research.arcadeOps) dataMult *= 1.10;
  if (state.research.deepScan) dataMult *= 1.18;
  if (state.research.tokenDiscipline) {
    dataMult *= 1.22;
    mleoMult *= 0.88;
    bankBonus *= 1.1;
  }
  if (state.research.predictiveMaintenance) {
    maintenanceRelief *= 1.25;
  }

  // Server reconcile: support-building tiers then active specialization (bank / data / maintenance only).
  bankBonus *= 1 + 0.03 * Math.max(0, getBuildingTier(state, "logisticsCenter") - 1);
  dataMult *= 1 + 0.04 * Math.max(0, getBuildingTier(state, "researchLab") - 1);
  maintenanceRelief *= 1 + 0.05 * Math.max(0, getBuildingTier(state, "repairBay") - 1);
  ({
    bankBonus,
    dataMult,
    maintenanceRelief,
  } = applySupportProgramFactorsToDerived(state, bankBonus, dataMult, maintenanceRelief));

  oreMult *= hqBonus * minerBonus * stabilityFactor;
  goldMult *= hqBonus * stabilityFactor;
  scrapMult *= hqBonus * stabilityFactor;
  mleoMult *= hqBonus * stabilityFactor;
  dataMult *= hqBonus * stabilityFactor;

  const effProto = resolveEffectiveCommandProtocol(state);
  ({
    maintenanceRelief,
    goldMult,
    dataMult,
  } = applyPhase1ACommandProtocolToDerivedRates(effProto, {
    maintenanceRelief,
    goldMult,
    dataMult,
  }));

  const sectorWorldOrder = resolveSectorWorldOrder(state);
  const dailyMleoCap = getWorldDailyMleoCapByOrder(sectorWorldOrder);

  const minersBonus = {
    offlineRetention: minerLink * 0.015,
    oreQuality: minerLink * 0.02,
  };

  const arcadeSupport = {
    missionBoost: arcadeLink * 0.015,
    retrySupport: arcadeLink * 0.005,
  };

  return {
    energyCap: 148 + powerLevel * 42 + (state.research.coolant ? 22 : 0),
    energyRegen: 6.4 + powerLevel * 2.5 + (state.research.coolant ? 1.35 : 0),
    oreMult,
    goldMult,
    scrapMult,
    mleoMult,
    dataMult,
    shipCap: dailyMleoCap,
    dailyMleoCap,
    bankBonus,
    /** Matches `base_economy_config.mleo_gain_mult` (server reconcile). */
    baseMleoGainMult: CONFIG.baseMleoGainMult,
    maintenanceRelief,
    energyUseMult,
    stability,
    minersBonus,
    arcadeSupport,
    expeditionCooldownMs: CONFIG.expeditionCooldownMs,
  };
}

/**
 * Raw refinery MLEO rate (per second) before daily softcut — aligned with `simulate()` / server core.
 * Softcut is applied on top (see base_softcut_factor + mleo_produced_today).
 */
function computeRefineryRawMleoPerSecond(refineryLevel, derived, active) {
  if (!active || refineryLevel <= 0) return 0;
  const early = refineryLevel > 2 ? 1 : 1.08;
  return (
    REFINERY_BANKED_PER_LEVEL *
    refineryLevel *
    Number(derived?.mleoMult || 1) *
    Number(derived?.bankBonus || 1) *
    early *
    Number(derived?.baseMleoGainMult ?? CONFIG.baseMleoGainMult)
  );
}

/**
 * Time (hours) to reach daily cap from `produced` at constant raw rate, with piecewise softcut.
 * Uses 1s discrete steps — matches how `baseMleoSoftcutFactor` is applied in `simulate()`.
 */
function computeMleoEtaHoursToCap(produced, cap, rawPerSecond) {
  const c = Number(cap || 0);
  const p0 = Number(produced || 0);
  const r = Number(rawPerSecond || 0);
  if (!c || c <= 0) return null;
  if (!r || r <= 0) return null;
  if (p0 >= c) return 0;
  let p = p0;
  let s = 0;
  const maxSec = 86400 * 60;
  while (p < c - 1e-9 && s < maxSec) {
    const f = baseMleoSoftcutFactor(p, c);
    const add = Math.min(r * f, c - p);
    if (add <= 1e-15) break;
    p += add;
    s += 1;
  }
  if (p < c - 1e-6) return null;
  return s / 3600;
}

/** Total MLEO produced over `durationSeconds` from current `produced` toward cap (softcut-aware). */
function integrateMleoProducedOverDuration(produced, cap, rawPerSecond, durationSeconds) {
  const c = Number(cap || 0);
  let p = Number(produced || 0);
  const r = Number(rawPerSecond || 0);
  const dur = Math.max(0, Math.floor(durationSeconds || 0));
  let total = 0;
  for (let s = 0; s < dur; s++) {
    if (p >= c) break;
    const f = baseMleoSoftcutFactor(p, c);
    const add = Math.min(r * f, c - p);
    p += add;
    total += add;
  }
  return { endProduced: p, totalProduced: total };
}

function getBankedRateSnapshot(state, derived) {
  const refineryLevel = getEffectiveBuildingLevel(state, "refinery");
  const ore = Number(state?.resources?.ORE || 0);
  const scrap = Number(state?.resources?.SCRAP || 0);
  const energy = Number(state?.resources?.ENERGY || 0);

  const oreNeedPerSecond = refineryLevel * REFINERY_ORE_NEED_PER_LEVEL;
  const scrapNeedPerSecond = refineryLevel * REFINERY_SCRAP_NEED_PER_LEVEL;
  // Keep early-game preview aligned with `simulate()`:
  // - `simulate()` uses earlyEnergyReliefFor(refinery, level) and energyUseMult for the energy check.
  // - snapshot should apply the same factors so "Energy limited" doesn't disagree with reality.
  const energyUseMult = Number(derived?.energyUseMult || 1);
  const earlyEnergyRelief = refineryLevel > 2 ? 1 : 0.9;
  const energyNeedPerSecond =
    refineryLevel * REFINERY_ENERGY_NEED_PER_LEVEL * energyUseMult * earlyEnergyRelief;

  const reserveEnergy = Math.max(
    8,
    Math.floor((derived?.energyCap || CONFIG.baseEnergyCap) * 0.05)
  );

  const hasRefinery = refineryLevel > 0;
  const hasOre = oreNeedPerSecond > 0 && ore >= oreNeedPerSecond;
  const hasScrap = scrapNeedPerSecond > 0 && scrap >= scrapNeedPerSecond;
  // `simulate()` allows equality (it blocks only when energy would fall below reserve).
  const hasEnergy =
    energyNeedPerSecond > 0 && energy >= reserveEnergy + energyNeedPerSecond;

  const active = hasRefinery && hasOre && hasScrap && hasEnergy;

  const rawPerSecond = computeRefineryRawMleoPerSecond(refineryLevel, derived, active);
  const dailyCap = Number(derived?.dailyMleoCap ?? derived?.shipCap ?? CONFIG.dailyBaseMleoCap);
  const producedToday = Number(state?.mleoProducedToday || 0);
  const softNow = baseMleoSoftcutFactor(producedToday, dailyCap);
  const perSecond = rawPerSecond * softNow;
  const perHour = perSecond * 3600;
  const projected24h = integrateMleoProducedOverDuration(
    producedToday,
    dailyCap,
    rawPerSecond,
    86400
  ).totalProduced;
  const perDay = projected24h;

  const remainingToCap = Math.max(0, dailyCap - producedToday);

  const etaHours = active ? computeMleoEtaHoursToCap(producedToday, dailyCap, rawPerSecond) : null;
  const oreFeedHours =
    oreNeedPerSecond > 0 ? ore / (oreNeedPerSecond * 3600) : null;
  const scrapFeedHours =
    scrapNeedPerSecond > 0 ? scrap / (scrapNeedPerSecond * 3600) : null;

  const limitingSystem = !hasRefinery
    ? "Refinery offline"
    : !hasOre
      ? "Ore limited"
      : !hasScrap
        ? "Scrap limited"
        : !hasEnergy
          ? "Energy limited"
          : "Running";

  return {
    hasRefinery,
    active,
    refineryLevel,
    /** Raw refinery MLEO/s before softcut (matches server core × gain mult). */
    rawPerSecond,
    /** Instantaneous effective rate (raw × softcut at current produced). */
    perSecond,
    perHour,
    /** Expected MLEO toward cap over next 24h with softcut (not simply perHour×24). */
    perDay,
    shipCap: dailyCap,
    dailyMleoCap: dailyCap,
    mleoProducedToday: producedToday,
    softcutFactorNow: softNow,
    remainingToCap,
    etaHours,
    oreFeedHours,
    scrapFeedHours,
    limitingSystem,
    hasOre,
    hasScrap,
    hasEnergy,
  };
}

function getBankedIndicatorToneLabel(tone) {
  if (tone === "critical") return "Stopped";
  if (tone === "warning") return "Boost";
  return "Balanced";
}

function getBankedIndicatorCardClasses(tone) {
  if (tone === "critical") {
    return "border-rose-400/40 bg-rose-500/12 text-rose-100 hover:bg-rose-500/16 shadow-[0_0_0_1px_rgba(244,63,94,0.08)]";
  }
  if (tone === "warning") {
    return "border-amber-400/35 bg-amber-500/10 text-amber-100 hover:bg-amber-500/14 shadow-[0_0_0_1px_rgba(250,204,21,0.07)]";
  }
  return "border-emerald-400/28 bg-white/[0.03] text-emerald-100 hover:bg-white/[0.05] shadow-[0_0_0_1px_rgba(52,211,153,0.07)]";
}

function getBankedIndicatorPillClasses(tone) {
  if (tone === "critical") return "bg-rose-500/15 text-rose-200";
  if (tone === "warning") return "bg-amber-500/15 text-amber-200";
  return "bg-emerald-500/15 text-emerald-200";
}

function getBuildingDef(buildingKey) {
  return BUILDINGS.find((item) => item.key === buildingKey) || null;
}

function buildingDisplayName(buildingKey) {
  const def = getBuildingDef(buildingKey);
  return def?.name || def?.title || buildingKey;
}

function buildingMeetsRequires(state, buildingKey) {
  const def = getBuildingDef(buildingKey);
  if (!def?.requires?.length) return true;
  return def.requires.every(
    (req) => Number(state?.buildings?.[req.key] || 0) >= Number(req.lvl || 1)
  );
}

function resolveBankedActionTarget(state, targetKey) {
  if (!targetKey) return "bankedMleo";
  if (targetKey === "maintenance" || targetKey === "shipping" || targetKey === "bankedMleo") {
    return targetKey;
  }

  const def = getBuildingDef(targetKey);
  if (!def) return targetKey;

  const unmet = (def.requires || []).find(
    (req) => Number(state?.buildings?.[req.key] || 0) < Number(req?.lvl || 1)
  );

  if (!unmet) return targetKey;
  return resolveBankedActionTarget(state, unmet.key);
}

const BANKED_GUIDANCE_MAX_LEVEL_DELTA = 12;

function cloneStateForBankedGuidance(state) {
  try {
    if (typeof structuredClone === "function") return structuredClone(state);
  } catch {}
  try {
    return JSON.parse(JSON.stringify(state));
  } catch {
    return { ...state, buildings: { ...state?.buildings }, resources: { ...state?.resources } };
  }
}

function formatBankedBuildUnlockPath(state, buildingKey) {
  const parts = [];
  const seen = new Set();

  const walk = (key) => {
    const def = getBuildingDef(key);
    if (!def?.requires) return;
    for (const req of def.requires) {
      const need = Number(req.lvl || 1);
      const have = Number(state?.buildings?.[req.key] || 0);
      if (have < need) {
        walk(req.key);
        const id = `${req.key}:${need}`;
        if (!seen.has(id)) {
          seen.add(id);
          const rd = getBuildingDef(req.key);
          parts.push(`${rd?.name || rd?.title || req.key} Lv ${need}`);
        }
      }
    }
  };

  walk(buildingKey);
  const bdef = getBuildingDef(buildingKey);
  if (parts.length === 0) return `Build ${bdef?.name || bdef?.title || buildingKey}`;
  return `Unlock: ${parts.join(" → ")}`;
}

/**
 * Bump only `buildingKey` level on a cloned state, re-derive + snapshot, and find the first level
 * where the guidance row `itemKey` becomes success. Used only when snapshot reacts to that bump.
 */
function findBankedGuidanceGreenBuildingLevel(state, systemState, itemKey, buildingKey) {
  const now = Date.now();
  const current = Number(state?.buildings?.[buildingKey] || 0);

  for (let delta = 1; delta <= BANKED_GUIDANCE_MAX_LEVEL_DELTA; delta += 1) {
    const nextLevel = current + delta;
    const test = cloneStateForBankedGuidance(state);
    test.buildings = { ...test.buildings, [buildingKey]: nextLevel };
    if (buildingKey === "refinery" && Number(test.buildings.refinery || 0) > 0) {
      test.buildingPowerModes = { ...(test.buildingPowerModes || {}), refinery: 100 };
    }
    const d = derive(test, now);
    const snap = getBankedRateSnapshot(test, d);
    const items = getBankedGuidanceItems({
      state: test,
      derived: d,
      snapshot: snap,
      systemState,
      resolveTargets: false,
    });
    const hit = items.find((i) => i.key === itemKey);
    if (hit?.tone === "success") return nextLevel;
  }
  return null;
}

function analyticalLevelTargetFloor(current, floor) {
  const c = Number(current || 0);
  const f = Number(floor || 0);
  if (f <= 0) return null;
  if (c >= f) return null;
  return f;
}

/** Main title line for Banked guidance cards (building level lives in level badge, not here). */
function getBankedGuidanceStateTitle(itemKey, ctx, item) {
  const {
    state,
    derived,
    refineryBaseLevel,
    quarryBaseLevel,
    salvageBaseLevel,
    powerCellBaseLevel,
    repairBayBaseLevel,
    logisticsBaseLevel,
    refineryMode,
    refineryOff,
    energy,
    energyCap,
    stability,
    producedToday,
    dailyCap,
  } = ctx;

  const tone = item?.tone || "success";
  const rName = buildingDisplayName("refinery");
  const qName = buildingDisplayName("quarry");
  const salName = buildingDisplayName("salvage");
  const pcName = buildingDisplayName("powerCell");
  const rbName = buildingDisplayName("repairBay");
  const lcName = buildingDisplayName("logisticsCenter");
  const stabPct = `${fmtRate(stability, 0)}%`;

  if (itemKey === "refinery") {
    if (refineryBaseLevel <= 0) return `${rName} not built`;
    if (refineryOff) return `${rName} off · 0% mode`;
    return `${rName} running · ${refineryMode}% mode`;
  }

  if (itemKey === "ore") {
    if (!buildingMeetsRequires(state, "quarry") && quarryBaseLevel <= 0) {
      return `${qName} locked`;
    }
    if (quarryBaseLevel <= 0) return `${qName} not built`;
    if (!canThrottleBuilding("quarry")) return `${qName} active`;
    const mode = getBuildingPowerMode(state, "quarry");
    if (mode === 0) return `${qName} off · 0% mode`;
    return `${qName} running · ${mode}% mode`;
  }

  if (itemKey === "scrap") {
    if (!buildingMeetsRequires(state, "salvage") && salvageBaseLevel <= 0) {
      return `${salName} locked`;
    }
    if (salvageBaseLevel <= 0) return `${salName} not built`;
    if (!canThrottleBuilding("salvage")) return `${salName} active`;
    const mode = getBuildingPowerMode(state, "salvage");
    if (mode === 0) return `${salName} off · 0% mode`;
    return `${salName} running · ${mode}% mode`;
  }

  if (itemKey === "energy") {
    if (!buildingMeetsRequires(state, "powerCell") && powerCellBaseLevel <= 0) {
      return `${pcName} locked`;
    }
    const strained = tone === "critical" || tone === "warning";
    const adj = strained ? "strained" : "stable";
    return `${pcName} ${adj} · energy ${fmtRate(energy, 0)}/${fmtRate(energyCap, 0)}`;
  }

  if (itemKey === "stability") {
    if (!buildingMeetsRequires(state, "repairBay") && repairBayBaseLevel <= 0) {
      return `${rbName} locked · stability ${stabPct}`;
    }
    if (repairBayBaseLevel <= 0) {
      return `${rbName} missing · stability ${stabPct}`;
    }
    let adj = "stable";
    if (tone === "critical") adj = "strained";
    else if (tone === "warning") adj = "watch";
    return `${rbName} ${adj} · stability ${stabPct}`;
  }

  if (itemKey === "logistics") {
    if (!buildingMeetsRequires(state, "logisticsCenter") && logisticsBaseLevel <= 0) {
      return `${lcName} locked`;
    }
    if (logisticsBaseLevel <= 0) return `${lcName} not built`;
    if (!canThrottleBuilding("logisticsCenter")) return `${lcName} active`;
    const mode = getBuildingPowerMode(state, "logisticsCenter");
    if (mode === 0) return `${lcName} off · 0% mode`;
    return `${lcName} active · ${mode}% mode`;
  }

  if (itemKey === "daily-cap") {
    if (tone === "critical") return "Daily cap reached";
    if (tone === "warning") return "Daily cap close";
    return "Daily cap healthy";
  }

  return "—";
}

/** Level pill text for top-right badges; null for daily cap and not-built buildings. */
function getBankedGuidanceLevelBadgeText(itemKey, ctx) {
  const { state, refineryBaseLevel, quarryBaseLevel, salvageBaseLevel, powerCellBaseLevel, repairBayBaseLevel, logisticsBaseLevel } =
    ctx;

  if (itemKey === "daily-cap") return null;

  if (itemKey === "refinery") {
    return refineryBaseLevel > 0 ? `Lv ${refineryBaseLevel}` : null;
  }

  if (itemKey === "ore") {
    if (!buildingMeetsRequires(state, "quarry") && quarryBaseLevel <= 0) return null;
    if (quarryBaseLevel <= 0) return null;
    return `Lv ${quarryBaseLevel}`;
  }

  if (itemKey === "scrap") {
    if (!buildingMeetsRequires(state, "salvage") && salvageBaseLevel <= 0) return null;
    if (salvageBaseLevel <= 0) return null;
    return `Lv ${salvageBaseLevel}`;
  }

  if (itemKey === "energy") {
    if (!buildingMeetsRequires(state, "powerCell") && powerCellBaseLevel <= 0) return null;
    return `Lv ${powerCellBaseLevel}`;
  }

  if (itemKey === "stability") {
    if (!buildingMeetsRequires(state, "repairBay") && repairBayBaseLevel <= 0) return null;
    if (repairBayBaseLevel < 1) return null;
    return `Lv ${repairBayBaseLevel}`;
  }

  if (itemKey === "logistics") {
    if (!buildingMeetsRequires(state, "logisticsCenter") && logisticsBaseLevel <= 0) return null;
    if (logisticsBaseLevel <= 0) return null;
    return `Lv ${logisticsBaseLevel}`;
  }

  return null;
}

function augmentBankedGuidanceBodyText(items, ctx) {
  const { refineryBaseLevel, oreFeedHours, scrapFeedHours, derived, producedToday, dailyCap } = ctx;
  const bankBonusStr = Number(derived?.bankBonus || 1).toFixed(2);

  for (const it of items) {
    if (refineryBaseLevel > 0) {
      if (it.key === "ore" && oreFeedHours != null) {
        const h = fmtRate(oreFeedHours, 1);
        it.text = `Refinery feed ~${h}h · ${it.text}`;
      }
      if (it.key === "scrap" && scrapFeedHours != null) {
        const h = fmtRate(scrapFeedHours, 1);
        it.text = `Refinery feed ~${h}h · ${it.text}`;
      }
    }
    if (it.key === "logistics") {
      it.text = `Bank bonus x${bankBonusStr} · ${it.text}`;
    }
    if (it.key === "daily-cap" && dailyCap > 0) {
      it.text = `${fmtRate(producedToday, 1)} / ${fmtRate(dailyCap, 0)} produced today · ${it.text}`;
    }
  }
}

function enrichBankedGuidanceItem(item, ctx) {
  const {
    state,
    derived,
    snapshot: s,
    systemState,
    refineryBaseLevel,
    quarryBaseLevel,
    salvageBaseLevel,
    powerCellBaseLevel,
    repairBayBaseLevel,
    logisticsBaseLevel,
    refineryMode,
    refineryOff,
    energy,
    energyCap,
    energyRatio,
    stability,
    producedToday,
    dailyCap,
    capRatio,
    oreFeedHours,
    scrapFeedHours,
  } = ctx;

  const next = { ...item };
  const rTitle = buildingDisplayName("refinery");
  const rbTitle = buildingDisplayName("repairBay");
  const qTitle = buildingDisplayName("quarry");
  const salTitle = buildingDisplayName("salvage");
  const pcTitle = buildingDisplayName("powerCell");
  const lcTitle = buildingDisplayName("logisticsCenter");

  if (item.key === "refinery") {
    if (item.tone === "critical" && refineryBaseLevel <= 0) {
      next.targetLabel = "Build Refinery after prerequisites";
      next.actionHint = formatBankedBuildUnlockPath(state, "refinery");
    } else if (item.tone === "critical" && refineryOff) {
      next.targetLabel = "Set Refinery power above 0%";
      next.actionHint = "Open Refinery and raise power mode above 0%";
    } else if (item.tone === "warning") {
      next.currentLevel = refineryBaseLevel;
      const sim = findBankedGuidanceGreenBuildingLevel(state, systemState, "refinery", "refinery");
      if (sim != null) {
        next.targetLevel = sim;
        next.targetLabel = `${rTitle} Lv ${sim} for green`;
      } else {
        next.targetLabel = "Higher Refinery level for green";
        next.actionHint = "More upgrades needed";
      }
    } else if (item.tone === "success") {
      next.currentLevel = refineryBaseLevel;
      next.targetLabel = "Keep Refinery powered and supplied";
    }
    return next;
  }

  if (item.key === "ore") {
    next.currentLevel = quarryBaseLevel;
    const quarryOff = quarryBaseLevel > 0 && getBuildingPowerMode(state, "quarry") === 0;
    if (item.tone === "critical" && quarryOff) {
      next.targetLabel = `Set ${qTitle} power above 0%`;
      next.actionHint = `Open ${qTitle} and raise power mode above 0%`;
      return next;
    }
    if (item.tone === "success") {
      next.targetLabel = "Keep ORE support ≥ 4.0h while Refinery runs";
      return next;
    }
    if (refineryBaseLevel <= 0) {
      next.targetLabel = `Build ${rTitle} first`;
      next.actionHint = `${rTitle} comes first; Quarry is secondary until Refinery exists`;
      return next;
    }

    const floor = Math.max(1, Math.ceil(refineryBaseLevel * 0.9));
    const simOre = findBankedGuidanceGreenBuildingLevel(state, systemState, "ore", "quarry");
    const analytical = analyticalLevelTargetFloor(quarryBaseLevel, floor);

    if (simOre != null) {
      next.targetLevel = simOre;
      next.targetLabel = `${qTitle} Lv ${simOre} for green`;
    } else if (analytical != null) {
      next.targetLevel = analytical;
      next.targetLabel = `${qTitle} Lv ${analytical} for green (vs ${rTitle} Lv ${refineryBaseLevel})`;
    } else {
      next.targetLabel = "ORE support ≥ 4.0h for green";
    }

    if (oreFeedHours != null && oreFeedHours < 4 && quarryBaseLevel >= floor) {
      next.actionHint = "Stockpile more ORE while Quarry keeps running";
    } else if (!s?.hasOre) {
      next.actionHint = "Produce and stockpile ORE (Quarry + time online) until the refinery feed holds";
    } else if (analytical == null && simOre == null) {
      next.actionHint = "Raise ORE on-hand until support hours reach the target";
    }
    return next;
  }

  if (item.key === "scrap") {
    next.currentLevel = salvageBaseLevel;
    const salvageOff = salvageBaseLevel > 0 && getBuildingPowerMode(state, "salvage") === 0;
    if (item.tone === "critical" && salvageOff) {
      next.targetLabel = `Set ${salTitle} power above 0%`;
      next.actionHint = `Open ${salTitle} and raise power mode above 0%`;
      return next;
    }
    if (item.tone === "success") {
      next.targetLabel = "Keep SCRAP support ≥ 4.0h while Refinery runs";
      return next;
    }
    if (refineryBaseLevel <= 0) {
      next.targetLabel = `Build ${rTitle} first`;
      next.actionHint = `${rTitle} comes first; Salvage is secondary until Refinery exists`;
      return next;
    }

    const floor = Math.max(1, Math.ceil(refineryBaseLevel * 0.9));
    const simSc = findBankedGuidanceGreenBuildingLevel(state, systemState, "scrap", "salvage");
    const analytical = analyticalLevelTargetFloor(salvageBaseLevel, floor);

    if (simSc != null) {
      next.targetLevel = simSc;
      next.targetLabel = `${salTitle} Lv ${simSc} for green`;
    } else if (analytical != null) {
      next.targetLevel = analytical;
      next.targetLabel = `${salTitle} Lv ${analytical} for green (vs ${rTitle} Lv ${refineryBaseLevel})`;
    } else {
      next.targetLabel = "SCRAP support ≥ 4.0h for green";
    }

    if (scrapFeedHours != null && scrapFeedHours < 4 && salvageBaseLevel >= floor) {
      next.actionHint = "Stockpile more SCRAP while Salvage keeps running";
    } else if (!s?.hasScrap) {
      next.actionHint = "Produce and stockpile SCRAP until refinery feed holds";
    } else if (analytical == null && simSc == null) {
      next.actionHint = "Raise SCRAP on-hand until support hours reach the target";
    }
    return next;
  }

  if (item.key === "energy") {
    next.currentLevel = powerCellBaseLevel;
    if (item.tone === "success") {
      next.targetLabel =
        refineryBaseLevel > 0
          ? "Keep ENERGY above refinery reserve while producing"
          : "Keep ENERGY healthy for future Refinery";
      return next;
    }
    if (refineryBaseLevel <= 0) {
      next.targetLabel = "No Refinery drain yet — keep ENERGY topped up";
      return next;
    }

    const floor = Math.max(1, Math.ceil(refineryBaseLevel / 2));
    const simPc = findBankedGuidanceGreenBuildingLevel(state, systemState, "energy", "powerCell");
    const analytical = analyticalLevelTargetFloor(powerCellBaseLevel, floor);

    if (simPc != null) {
      next.targetLevel = simPc;
      next.targetLabel = `${pcTitle} Lv ${simPc} for green`;
    } else if (analytical != null) {
      next.targetLevel = analytical;
      next.targetLabel = `${pcTitle} Lv ${analytical} for green (vs ${rTitle} Lv ${refineryBaseLevel})`;
    } else if (!s?.hasEnergy) {
      next.targetLabel = "ENERGY above refinery reserve + drain for green";
    } else if (energyRatio < 0.28) {
      next.targetLabel = "Energy reserve ratio ≥ 28% for green";
    } else {
      next.targetLabel = "Align Power Cell tier with Refinery for green";
    }

    if (!s?.hasEnergy) {
      next.actionHint = "Recharge ENERGY or reduce drain so Refinery can run safely above reserve";
    } else if (energyRatio < 0.28 && powerCellBaseLevel >= floor) {
      next.actionHint =
        "Let ENERGY recover or trim high-drain buildings; Power Cell raises your cap ceiling";
    } else if (simPc == null && analytical == null) {
      next.actionHint = "More upgrades needed";
    }
    return next;
  }

  if (item.key === "stability") {
    const repairBayOff =
      repairBayBaseLevel > 0 && getBuildingPowerMode(state, "repairBay") === 0;
    if (
      repairBayOff &&
      item.tone === "critical" &&
      stability >= 70 &&
      systemState !== "critical"
    ) {
      next.targetLabel = `Set ${rbTitle} power above 0%`;
      next.actionHint = `Open ${rbTitle} and raise power mode above 0%`;
      return next;
    }

    if (item.tone === "success") {
      next.targetLabel = "Maintain stability ≥ 85%";
      if (repairBayBaseLevel < 1) {
        next.actionHint = `Optional: build ${rbTitle} for smoother recovery when stability dips`;
      }
      return next;
    }

    next.targetLabel = "Stability ≥ 85% for green";

    if (item.tone === "critical" || systemState === "critical") {
      next.actionHint = repairBayOff
        ? `Open Operations maintenance / repair flow; ${rbTitle} is at 0% power — raise mode for support`
        : "Open Operations maintenance / repair flow";
      return next;
    }

    if (repairBayBaseLevel < 1 && item.tone === "warning") {
      const sim = findBankedGuidanceGreenBuildingLevel(state, systemState, "stability", "repairBay");
      if (sim != null) {
        next.targetLevel = sim;
        next.targetLabel = `${rbTitle} Lv ${sim} for green`;
      } else {
        next.targetLabel = `Build ${rbTitle} + recover stability via maintenance`;
      }
      next.actionHint = "Run maintenance; add Repair Bay when unlocked";
    } else if (item.tone === "warning") {
      const sim = findBankedGuidanceGreenBuildingLevel(state, systemState, "stability", "repairBay");
      if (sim != null) {
        next.targetLevel = sim;
        next.targetLabel = `${rbTitle} Lv ${sim} helps reach green`;
      }
      next.actionHint =
        "Use maintenance to lift stability; Repair Bay levels help long-term relief once pressure drops";
    }
    return next;
  }

  if (item.key === "logistics") {
    next.currentLevel = logisticsBaseLevel;
    const logisticsOff =
      logisticsBaseLevel > 0 && getBuildingPowerMode(state, "logisticsCenter") === 0;
    if (item.tone === "critical" && logisticsOff) {
      next.targetLabel = `Set ${lcTitle} power above 0%`;
      next.actionHint = `Open ${lcTitle} and raise power mode above 0%`;
      return next;
    }

    if (item.tone === "success") {
      next.targetLabel =
        refineryBaseLevel > 0
          ? `Keep ${lcTitle} tier matched to Refinery`
          : `Open ${rTitle} before prioritizing ${lcTitle}`;
      if (refineryBaseLevel <= 0) {
        next.actionHint = `${rTitle} first; Logistics matters once production is online`;
      }
      return next;
    }

    if (item.tone === "warning" && refineryBaseLevel > 0) {
      const sim = findBankedGuidanceGreenBuildingLevel(state, systemState, "logistics", "logisticsCenter");
      if (sim != null) {
        next.targetLevel = sim;
        next.targetLabel = `${lcTitle} Lv ${sim} for green`;
      } else {
        next.targetLabel = `${lcTitle} levels vs ${rTitle} tier for green`;
        next.actionHint = "More upgrades needed";
      }
    } else {
      next.targetLabel = `Unlock and build ${lcTitle} when prerequisites are met`;
    }
    return next;
  }

  if (item.key === "daily-cap") {
    if (item.tone === "critical") {
      next.targetLabel = "Wait for next server day";
      next.actionHint = "Wait for next server day reset";
    } else if (item.tone === "warning") {
      next.targetLabel = "Hold below daily production cap until reset";
      next.actionHint = "Near cap — output softens; plan tomorrow’s upgrades and shipping";
    } else {
      next.targetLabel = "Use remaining daily production headroom";
    }
    return next;
  }

  return next;
}

/** Banked guidance: runtime power — 0% = critical, partial = warning (matches Refinery behavior). */
function bankedGuidanceThrottleSeverity(state, buildingKey, baseLevel) {
  const lv = Number(baseLevel || 0);
  if (lv <= 0 || !canThrottleBuilding(buildingKey)) return null;
  const mode = getBuildingPowerMode(state, buildingKey);
  if (mode <= 0) return "critical";
  if (mode < 100) return "warning";
  return null;
}

function bankedGuidanceToneMax(a, b) {
  const rank = { critical: 3, warning: 2, success: 1 };
  return (rank[b] || 0) > (rank[a] || 0) ? b : a;
}

function applyQuarryThrottleToOreItem(state, quarryBaseLevel, item) {
  const sev = bankedGuidanceThrottleSeverity(state, "quarry", quarryBaseLevel);
  if (!sev) return item;
  const mode = getBuildingPowerMode(state, "quarry");
  if (sev === "critical") {
    return {
      ...item,
      tone: "critical",
      headline: "Quarry is off",
      text: "Quarry is at 0% power mode. Passive ORE production is stopped — raise power mode to restore feed growth.",
    };
  }
  if (item.tone === "critical") {
    return {
      ...item,
      text: `${item.text} Quarry power is ${mode}% — ORE output is reduced further.`,
    };
  }
  if (item.tone === "success") {
    return {
      ...item,
      tone: "warning",
      headline: `Quarry throttled · ${mode}% mode`,
      text: `Quarry is at ${mode}% power mode, so ORE output is reduced. Raise power when you need faster refinery feed recovery.`,
    };
  }
  return {
    ...item,
    tone: "warning",
    text: `${item.text} Quarry power is ${mode}% — ORE output is scaled down.`,
  };
}

function applySalvageThrottleToScrapItem(state, salvageBaseLevel, item) {
  const sev = bankedGuidanceThrottleSeverity(state, "salvage", salvageBaseLevel);
  if (!sev) return item;
  const mode = getBuildingPowerMode(state, "salvage");
  if (sev === "critical") {
    return {
      ...item,
      tone: "critical",
      headline: "Salvage Yard is off",
      text: "Salvage Yard is at 0% power mode. Passive SCRAP production is stopped — raise power mode to restore feed growth.",
    };
  }
  if (item.tone === "critical") {
    return {
      ...item,
      text: `${item.text} Salvage power is ${mode}% — SCRAP output is reduced further.`,
    };
  }
  if (item.tone === "success") {
    return {
      ...item,
      tone: "warning",
      headline: `Salvage throttled · ${mode}% mode`,
      text: `Salvage Yard is at ${mode}% power mode, so SCRAP output is reduced. Raise power when you need faster refinery feed recovery.`,
    };
  }
  return {
    ...item,
    tone: "warning",
    text: `${item.text} Salvage power is ${mode}% — SCRAP output is scaled down.`,
  };
}

function applyLogisticsThrottleToItem(state, logisticsBaseLevel, item) {
  if (logisticsBaseLevel <= 0) return item;
  const sev = bankedGuidanceThrottleSeverity(state, "logisticsCenter", logisticsBaseLevel);
  if (!sev) return item;
  const mode = getBuildingPowerMode(state, "logisticsCenter");
  if (sev === "critical") {
    return {
      ...item,
      tone: "critical",
      headline: "Logistics Center is off",
      text: "Logistics Center is at 0% power mode. Logistics output and bank bonus scaling from this building are stopped — raise power mode.",
    };
  }
  if (item.tone === "critical") {
    return {
      ...item,
      text: `${item.text} Logistics power is ${mode}% — bonus contribution is scaled down.`,
    };
  }
  if (item.tone === "success") {
    return {
      ...item,
      tone: "warning",
      headline: `Logistics throttled · ${mode}% mode`,
      text: `Logistics Center is at ${mode}% power mode, so logistics-driven bonuses are reduced. Raise power for full bank support.`,
    };
  }
  return {
    ...item,
    tone: bankedGuidanceToneMax(item.tone, "warning"),
    text: `${item.text} Logistics power is ${mode}% — bonus scaling is reduced.`,
  };
}

function applyRepairBayThrottleToStabilityItem(state, repairBayBaseLevel, item) {
  if (repairBayBaseLevel <= 0) return item;
  const sev = bankedGuidanceThrottleSeverity(state, "repairBay", repairBayBaseLevel);
  if (!sev) return item;
  const mode = getBuildingPowerMode(state, "repairBay");
  if (sev === "critical") {
    return {
      ...item,
      tone: bankedGuidanceToneMax(item.tone, "critical"),
      headline:
        item.tone === "critical" && (Number(state?.stability ?? 100) < 70)
          ? item.headline
          : "Repair Bay is off",
      text:
        item.tone === "critical" && (Number(state?.stability ?? 100) < 70)
          ? `${item.text} Repair Bay is at 0% power — stability recovery from this building is paused.`
          : "Repair Bay is at 0% power mode. Stability support from this structure is stopped — raise power mode when you need recovery help.",
    };
  }
  if (item.tone === "critical") {
    return {
      ...item,
      text: `${item.text} Repair Bay power is ${mode}% — recovery support is reduced.`,
    };
  }
  if (item.tone === "success") {
    return {
      ...item,
      tone: "warning",
      headline: `Repair Bay throttled · ${mode}% mode`,
      text: `Repair Bay is at ${mode}% power mode, so stability-related support is reduced. Raise power for full effectiveness.`,
    };
  }
  return {
    ...item,
    tone: "warning",
    text: `${item.text} Repair Bay power is ${mode}% — support is scaled down.`,
  };
}

function getBankedGuidanceItems({
  state,
  derived,
  snapshot,
  systemState,
  resolveTargets = true,
}) {
  const s = snapshot || {};
  const buildings = state?.buildings || {};
  const resources = state?.resources || {};

  const refineryBaseLevel = Number(buildings.refinery || 0);
  const quarryBaseLevel = Number(buildings.quarry || 0);
  const salvageBaseLevel = Number(buildings.salvage || 0);
  const powerCellBaseLevel = Number(buildings.powerCell || 0);
  const repairBayBaseLevel = Number(buildings.repairBay || 0);
  const logisticsBaseLevel = Number(buildings.logisticsCenter || 0);

  const refineryMode = getBuildingPowerMode(state, "refinery");
  const refineryOff = refineryBaseLevel > 0 && refineryMode === 0;

  const energy = Number(resources.ENERGY || 0);
  const energyCap = Number(derived?.energyCap || CONFIG.baseEnergyCap || 0);
  const energyRatio = energyCap > 0 ? energy / energyCap : 0;

  const stability = Number(state?.stability || 100);

  const producedToday = Number(s?.mleoProducedToday || state?.mleoProducedToday || 0);
  const dailyCap = Number(s?.dailyMleoCap || derived?.dailyMleoCap || CONFIG.dailyBaseMleoCap || 0);
  const capRatio = dailyCap > 0 ? producedToday / dailyCap : 0;

  const oreFeedHours =
    s?.oreFeedHours == null ? null : Number(s.oreFeedHours);
  const scrapFeedHours =
    s?.scrapFeedHours == null ? null : Number(s.scrapFeedHours);

  const items = [];

  // 1) Refinery
  if (refineryBaseLevel <= 0) {
    items.push({
      key: "refinery",
      label: "Refinery",
      tone: "critical",
      headline: "Build your first Refinery",
      text: "Without Refinery there is no Banked MLEO production.",
      target: resolveBankedActionTarget(state, "refinery"),
    });
  } else if (refineryOff) {
    items.push({
      key: "refinery",
      label: "Refinery",
      tone: "critical",
      headline: "Refinery is off",
      text: "Refinery exists but is currently at 0% power mode. Turn it back on to restart production.",
      target: "refinery",
    });
  } else if (refineryBaseLevel < 2 && Number(s?.perHour || 0) > 0) {
    items.push({
      key: "refinery",
      label: "Refinery",
      tone: "warning",
      headline: `Refinery online · Lv ${refineryBaseLevel}`,
      text: "One more Refinery level should noticeably improve your current Banked MLEO lane.",
      target: "refinery",
    });
  } else {
    items.push({
      key: "refinery",
      label: "Refinery",
      tone: "success",
      headline: `Refinery running · ${refineryMode}% mode`,
      text: "Refinery itself is online and is not the main reason your production is stopping.",
      target: "refinery",
    });
  }

  // 2) ORE (feed health + runtime Quarry power mode)
  if (refineryBaseLevel > 0 && !s.hasOre) {
    items.push(
      applyQuarryThrottleToOreItem(state, quarryBaseLevel, {
        key: "ore",
        label: "ORE feed",
        tone: "critical",
        headline: "ORE is stopping output",
        text: "Refinery cannot keep producing because ORE feed is too weak right now.",
        target: resolveBankedActionTarget(state, "quarry"),
      })
    );
  } else if (
    refineryBaseLevel > 0 &&
    (
      (oreFeedHours != null && oreFeedHours < 4) ||
      quarryBaseLevel < Math.max(1, Math.ceil(refineryBaseLevel * 0.9))
    )
  ) {
    items.push(
      applyQuarryThrottleToOreItem(state, quarryBaseLevel, {
        key: "ore",
        label: "ORE feed",
        tone: "warning",
        headline: oreFeedHours == null
          ? "ORE support is thin"
          : `ORE support ~${fmtRate(oreFeedHours, 1)}h`,
        text: "Quarry support is getting thin. Strengthening Quarry should improve refinery uptime.",
        target: resolveBankedActionTarget(state, "quarry"),
      })
    );
  } else {
    items.push(
      applyQuarryThrottleToOreItem(state, quarryBaseLevel, {
        key: "ore",
        label: "ORE feed",
        tone: "success",
        headline: oreFeedHours == null
          ? "ORE ready"
          : `ORE support ~${fmtRate(oreFeedHours, 1)}h`,
        text: refineryBaseLevel > 0
          ? "ORE supply looks healthy for the current refinery load."
          : "ORE is not the current blocker. Refinery comes first.",
        target: resolveBankedActionTarget(state, "quarry"),
      })
    );
  }

  // 3) SCRAP (feed health + runtime Salvage power mode)
  if (refineryBaseLevel > 0 && !s.hasScrap) {
    items.push(
      applySalvageThrottleToScrapItem(state, salvageBaseLevel, {
        key: "scrap",
        label: "SCRAP feed",
        tone: "critical",
        headline: "SCRAP is stopping output",
        text: "Refinery is starved by SCRAP right now.",
        target: resolveBankedActionTarget(state, "salvage"),
      })
    );
  } else if (
    refineryBaseLevel > 0 &&
    (
      (scrapFeedHours != null && scrapFeedHours < 4) ||
      salvageBaseLevel < Math.max(1, Math.ceil(refineryBaseLevel * 0.9))
    )
  ) {
    items.push(
      applySalvageThrottleToScrapItem(state, salvageBaseLevel, {
        key: "scrap",
        label: "SCRAP feed",
        tone: "warning",
        headline: scrapFeedHours == null
          ? "SCRAP support is thin"
          : `SCRAP support ~${fmtRate(scrapFeedHours, 1)}h`,
        text: "Salvage support is getting thin. Strengthening Salvage should stabilize refinery feed.",
        target: resolveBankedActionTarget(state, "salvage"),
      })
    );
  } else {
    items.push(
      applySalvageThrottleToScrapItem(state, salvageBaseLevel, {
        key: "scrap",
        label: "SCRAP feed",
        tone: "success",
        headline: scrapFeedHours == null
          ? "SCRAP ready"
          : `SCRAP support ~${fmtRate(scrapFeedHours, 1)}h`,
        text: refineryBaseLevel > 0
          ? "SCRAP supply looks healthy for the current refinery load."
          : "SCRAP is not the current blocker. Refinery comes first.",
        target: resolveBankedActionTarget(state, "salvage"),
      })
    );
  }

  // 4) ENERGY
  if (refineryBaseLevel > 0 && !s.hasEnergy) {
    items.push({
      key: "energy",
      label: "Energy support",
      tone: "critical",
      headline: "Energy is stopping output",
      text: "Your energy reserve is too low to keep Refinery running safely.",
      target: resolveBankedActionTarget(state, "powerCell"),
    });
  } else if (
    refineryBaseLevel > 0 &&
    (
      energyRatio < 0.28 ||
      powerCellBaseLevel < Math.max(1, Math.ceil(refineryBaseLevel / 2))
    )
  ) {
    items.push({
      key: "energy",
      label: "Energy support",
      tone: "warning",
      headline: `Energy reserve ${fmtRate(energy, 0)}/${fmtRate(energyCap, 0)}`,
      text: "Power support is working, but stronger Power Cell support should improve production stability.",
      target: resolveBankedActionTarget(state, "powerCell"),
    });
  } else {
    items.push({
      key: "energy",
      label: "Energy support",
      tone: "success",
      headline: `Energy reserve ${fmtRate(energy, 0)}/${fmtRate(energyCap, 0)}`,
      text: "Energy support looks balanced for the current Banked MLEO lane.",
      target: resolveBankedActionTarget(state, "powerCell"),
    });
  }

  // 5) Stability (+ runtime Repair Bay power when built)
  if (stability < 70 || systemState === "critical") {
    items.push(
      applyRepairBayThrottleToStabilityItem(state, repairBayBaseLevel, {
        key: "stability",
        label: "Stability",
        tone: "critical",
        headline: `Stability drag · ${fmtRate(stability, 0)}%`,
        text: "Instability is now part of the slowdown. Fix stability first before scaling harder.",
        target: "maintenance",
      })
    );
  } else if (
    stability < 85 ||
    (refineryBaseLevel > 0 && repairBayBaseLevel < 1)
  ) {
    items.push(
      applyRepairBayThrottleToStabilityItem(state, repairBayBaseLevel, {
        key: "stability",
        label: "Stability",
        tone: "warning",
        headline: `Stability watch · ${fmtRate(stability, 0)}%`,
        text:
          repairBayBaseLevel < 1
            ? "Repair Bay support is still missing. Building it should make the refinery lane safer and smoother."
            : "Stability is okay, but not comfortably strong yet for aggressive scaling.",
        target:
          repairBayBaseLevel < 1
            ? resolveBankedActionTarget(state, "repairBay")
            : "maintenance",
      })
    );
  } else {
    items.push(
      applyRepairBayThrottleToStabilityItem(state, repairBayBaseLevel, {
        key: "stability",
        label: "Stability",
        tone: "success",
        headline: `Stability healthy · ${fmtRate(stability, 0)}%`,
        text: "Stability is not meaningfully dragging the current refinery lane.",
        target:
          repairBayBaseLevel < 1
            ? resolveBankedActionTarget(state, "repairBay")
            : "maintenance",
      })
    );
  }

  // 6) Logistics / bank bonus (+ runtime Logistics Center power when built)
  if (refineryBaseLevel > 0 && logisticsBaseLevel < 1) {
    items.push(
      applyLogisticsThrottleToItem(state, logisticsBaseLevel, {
        key: "logistics",
        label: "Logistics",
        tone: "warning",
        headline: "No logistics support yet",
        text: "Logistics Center is not required to start production, but it is one of the best support upgrades once Refinery is online.",
        target: resolveBankedActionTarget(state, "logisticsCenter"),
      })
    );
  } else if (
    refineryBaseLevel >= 3 &&
    logisticsBaseLevel < Math.max(1, Math.ceil(refineryBaseLevel / 3))
  ) {
    items.push(
      applyLogisticsThrottleToItem(state, logisticsBaseLevel, {
        key: "logistics",
        label: "Logistics",
        tone: "warning",
        headline: `Bank bonus x${Number(derived?.bankBonus || 1).toFixed(2)}`,
        text: "Your refinery loop is already running well enough that Logistics support should noticeably help now.",
        target: resolveBankedActionTarget(state, "logisticsCenter"),
      })
    );
  } else {
    items.push(
      applyLogisticsThrottleToItem(state, logisticsBaseLevel, {
        key: "logistics",
        label: "Logistics",
        tone: "success",
        headline: `Bank bonus x${Number(derived?.bankBonus || 1).toFixed(2)}`,
        text:
          refineryBaseLevel > 0
            ? "Logistics support is currently balanced for your refinery lane."
            : "Logistics is not the current blocker before Refinery is online.",
        target: resolveBankedActionTarget(state, "logisticsCenter"),
      })
    );
  }

  // 7) Daily cap (always last in popup order)
  if (dailyCap > 0 && producedToday >= dailyCap - 1e-9) {
    items.push({
      key: "daily-cap",
      label: "Daily cap",
      tone: "critical",
      headline: "Daily production cap reached",
      text: "This is the reason Banked MLEO stopped. No building can remove today's cap; open the Banked MLEO info to review it.",
      target: "bankedMleo",
    });
  } else if (dailyCap > 0 && capRatio >= 0.9) {
    items.push({
      key: "daily-cap",
      label: "Daily cap",
      tone: "warning",
      headline: `Near cap · ${fmtRate(producedToday, 1)} / ${fmtRate(dailyCap, 0)}`,
      text: "You are close to today's production limit. Output is still running, but gains will soften more from here.",
      target: "bankedMleo",
    });
  } else {
    items.push({
      key: "daily-cap",
      label: "Daily cap",
      tone: "success",
      headline: `Room left · ${fmtRate(Math.max(0, dailyCap - producedToday), 1)}`,
      text: "You still have healthy production room left today.",
      target: "bankedMleo",
    });
  }

  const stateTextCtx = {
    state,
    derived,
    s,
    refineryBaseLevel,
    quarryBaseLevel,
    salvageBaseLevel,
    powerCellBaseLevel,
    repairBayBaseLevel,
    logisticsBaseLevel,
    refineryMode,
    refineryOff,
    energy,
    energyCap,
    stability,
    producedToday,
    dailyCap,
    oreFeedHours,
    scrapFeedHours,
  };

  augmentBankedGuidanceBodyText(items, stateTextCtx);
  for (const it of items) {
    it.stateTitle = getBankedGuidanceStateTitle(it.key, stateTextCtx, it);
    it.levelBadgeText = getBankedGuidanceLevelBadgeText(it.key, stateTextCtx);
  }

  if (!resolveTargets) return items;

  const ctx = {
    state,
    derived,
    snapshot: s,
    systemState,
    refineryBaseLevel,
    quarryBaseLevel,
    salvageBaseLevel,
    powerCellBaseLevel,
    repairBayBaseLevel,
    logisticsBaseLevel,
    refineryMode,
    refineryOff,
    energy,
    energyCap,
    energyRatio,
    stability,
    producedToday,
    dailyCap,
    capRatio,
    oreFeedHours,
    scrapFeedHours,
  };

  return items.map((it) => enrichBankedGuidanceItem(it, ctx));
}

function getBankedSummaryFromItems(items) {
  const list = Array.isArray(items) ? items : [];
  const criticalCount = list.filter((item) => item?.tone === "critical").length;
  const warningCount = list.filter((item) => item?.tone === "warning").length;

  if (criticalCount > 0) {
    return {
      tone: "critical",
      count: criticalCount,
      label: "Issue",
      title: criticalCount > 1 ? `${criticalCount} issues` : "1 issue",
    };
  }

  if (warningCount > 0) {
    return {
      tone: "warning",
      count: warningCount,
      label: "Boost",
      title: warningCount > 1 ? `${warningCount} boosts` : "1 boost",
    };
  }

  return {
    tone: "success",
    count: 0,
    label: "OK",
    title: "Balanced",
  };
}

/**
 * Which guidance card to emphasize when opening Banked MLEO: first critical (red), else first
 * warning in pipeline order (Refinery → … → Daily cap). Matches “fix reds first, then first orange”.
 */
function getBankedGuidanceFocusKey(items) {
  const list = Array.isArray(items) ? items : [];
  const critical = list.find((i) => i?.tone === "critical");
  if (critical?.key) return critical.key;
  const warning = list.find((i) => i?.tone === "warning");
  if (warning?.key) return warning.key;
  return null;
}

function getBankedGuidanceFocusRingClass(tone) {
  if (tone === "critical") {
    return "ring-2 ring-rose-400/70 ring-offset-2 ring-offset-slate-950 shadow-[0_0_0_1px_rgba(244,63,94,0.25)]";
  }
  if (tone === "warning") {
    return "ring-2 ring-amber-400/65 ring-offset-2 ring-offset-slate-950 shadow-[0_0_0_1px_rgba(250,204,21,0.2)]";
  }
  return "";
}

function getBankedSummaryButtonClasses(tone, isOpen = false) {
  if (tone === "critical") {
    return isOpen
      ? "border-rose-400/55 bg-rose-500/16 text-rose-100 shadow-[0_0_20px_rgba(244,63,94,0.14)]"
      : "border-rose-400/40 bg-rose-500/10 text-rose-100 hover:bg-rose-500/14 shadow-[0_0_16px_rgba(244,63,94,0.10)]";
  }

  if (tone === "warning") {
    return isOpen
      ? "border-amber-400/55 bg-amber-500/16 text-amber-100 shadow-[0_0_20px_rgba(250,204,21,0.12)]"
      : "border-amber-400/38 bg-amber-500/10 text-amber-100 hover:bg-amber-500/14 shadow-[0_0_16px_rgba(250,204,21,0.08)]";
  }

  return isOpen
    ? "border-emerald-400/45 bg-emerald-500/12 text-emerald-100 shadow-[0_0_18px_rgba(52,211,153,0.10)]"
    : "border-emerald-400/40 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/14 shadow-[0_0_16px_rgba(52,211,153,0.08)]";
}

/** Eyebrow + value text inside BANKED chip (avoid hardcoded white overriding tone). */
function getBankedSummaryButtonEyebrowClass(tone) {
  if (tone === "critical") return "text-rose-200/60";
  if (tone === "warning") return "text-amber-200/60";
  return "text-emerald-200/70";
}

function getBankedSummaryButtonValueClass(tone) {
  if (tone === "critical") return "text-rose-50";
  if (tone === "warning") return "text-amber-50";
  return "text-emerald-50";
}

function getBankedSummaryBadgeClasses(tone) {
  if (tone === "critical") {
    return "bg-rose-400 text-slate-950";
  }
  if (tone === "warning") {
    return "bg-amber-300 text-slate-950";
  }
  return "bg-emerald-400 text-slate-950";
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
    next.mleoProducedToday = 0;
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
    next.log = pushLog(next.log, "New day: daily MLEO production budget and missions refreshed.");
  }

  const dt = clamp(elapsedMs / 1000, 0, 60 * 60 * 12);
  const effective = dt * efficiency;
  const d = derive(next, now);
  const reserveEnergy = Math.max(8, Math.floor(d.energyCap * 0.05));
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
  const earlyOutputBoostFor = (key, level) => {
    if (level > 2) return 1;
    if (key === "quarry") return 1.12;
    if (key === "salvage") return 1.10;
    if (key === "researchLab") return 1.10;
    if (key === "refinery") return 1.08;
    return 1;
  };
  const earlyEnergyReliefFor = (key, level) => {
    if (level > 2) return 1;
    if (key === "quarry" || key === "salvage" || key === "researchLab" || key === "refinery") {
      return 0.9;
    }
    return 1;
  };

  runBuilding("quarry", (level) => {
    const energyNeed =
      0.72 * level * dt * (d.energyUseMult || 1) * earlyEnergyReliefFor("quarry", level);
    if (next.resources.ENERGY < energyNeed) return;
    next.resources.ENERGY -= energyNeed;
    next.resources.ORE +=
      1.35 * level * d.oreMult * effective * earlyOutputBoostFor("quarry", level);
  });

  runBuilding("tradeHub", (level) => {
    const energyNeed = 0.78 * level * dt * (d.energyUseMult || 1);
    if (next.resources.ENERGY < energyNeed) return;
    next.resources.ENERGY -= energyNeed;
    next.resources.GOLD += 0.60 * level * d.goldMult * effective;
  });

  runBuilding("salvage", (level) => {
    const energyNeed =
      0.78 * level * dt * (d.energyUseMult || 1) * earlyEnergyReliefFor("salvage", level);
    if (next.resources.ENERGY < energyNeed) return;
    next.resources.ENERGY -= energyNeed;
    next.resources.SCRAP +=
      0.50 * level * d.scrapMult * effective * earlyOutputBoostFor("salvage", level);
  });

  runBuilding("minerControl", (level) => {
    const energyNeed = 0.20 * level * dt * (d.energyUseMult || 1);
    if (next.resources.ENERGY - energyNeed < reserveEnergy) return;
    next.resources.ENERGY -= energyNeed;
    next.resources.DATA += 0.14 * level * d.dataMult * effective;
  });

  runBuilding("arcadeHub", (level) => {
    const energyNeed = 0.22 * level * dt * (d.energyUseMult || 1);
    if (next.resources.ENERGY - energyNeed < reserveEnergy) return;
    next.resources.ENERGY -= energyNeed;
    next.resources.DATA += 0.11 * level * d.dataMult * effective;
  });

  runBuilding("researchLab", (level) => {
    const energyNeed =
      0.24 * level * dt * (d.energyUseMult || 1) * earlyEnergyReliefFor("researchLab", level);
    if (next.resources.ENERGY - energyNeed < reserveEnergy) return;
    next.resources.ENERGY -= energyNeed;
    next.resources.DATA +=
      0.22 * level * d.dataMult * effective * earlyOutputBoostFor("researchLab", level);
  });

  runBuilding("logisticsCenter", (level) => {
    const energyNeed = 0.20 * level * dt * (d.energyUseMult || 1);
    if (next.resources.ENERGY - energyNeed < reserveEnergy) return;
    next.resources.ENERGY -= energyNeed;
    next.resources.DATA += 0.06 * level * d.dataMult * effective;
  });

  runBuilding("repairBay", (level) => {
    const energyNeed = 0.22 * level * dt * (d.energyUseMult || 1);
    if (next.resources.ENERGY < energyNeed) return;
    next.resources.ENERGY -= energyNeed;
    next.stability = Math.min(100, (next.stability || 100) + 0.042 * level * effective);
  });

  runBuilding("refinery", (level) => {
    const energyNeed =
      REFINERY_ENERGY_NEED_PER_LEVEL *
      level *
      dt *
      (d.energyUseMult || 1) *
      earlyEnergyReliefFor("refinery", level);
    const oreNeed = REFINERY_ORE_NEED_PER_LEVEL * level * effective;
    const scrapNeed = REFINERY_SCRAP_NEED_PER_LEVEL * level * effective;
    if (next.resources.ENERGY - energyNeed < reserveEnergy) return;
    if (next.resources.ORE < oreNeed || next.resources.SCRAP < scrapNeed) return;
    next.resources.ENERGY -= energyNeed;
    next.resources.ORE -= oreNeed;
    next.resources.SCRAP -= scrapNeed;
    const cap = Number(d.dailyMleoCap ?? d.shipCap ?? CONFIG.dailyBaseMleoCap);
    const produced = Number(next.mleoProducedToday || 0);
    const rawGain =
      REFINERY_BANKED_PER_LEVEL *
      level *
      d.mleoMult *
      d.bankBonus *
      effective *
      earlyOutputBoostFor("refinery", level) *
      CONFIG.baseMleoGainMult;
    const soft = baseMleoSoftcutFactor(produced, cap);
    const room = Math.max(0, cap - produced);
    const add = Math.min(rawGain * soft, room);
    next.bankedMleo += add;
    next.mleoProducedToday = produced + add;
  });

  const elapsedMinutes = dt / 60;
  const decayMultiplier = 1 / (d.maintenanceRelief || 1);
  next.maintenanceDue = (next.maintenanceDue || 0) + elapsedMinutes * 0.12 * decayMultiplier;

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
    if (data.expedition) parts.push("Expedition ready");
    if (data.ship) parts.push("Ship ready");
    if (data.refill) parts.push("Refill up");
    if (data.maintain) parts.push("Maintain up");
    return parts.length
      ? `${parts.join(" · ")} · open`
      : "Field, vault, transfers · open when ready";
  }

  if (type === "daily-missions") {
    return data.count > 0
      ? `${data.count} to claim · open`
      : "No claims · preview inside";
  }

  if (type === "intel-summary") {
    return data.count > 0 ? `${data.count} signals · open` : "Idle · open";
  }

  if (type === "intel-log") {
    return data.count > 0 ? `${data.count} lines · open` : "Empty · open";
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
    return parts.length ? `${parts.join(" · ")} · open` : "No buys · preview";
  }

  if (type === "structures") {
    return counts.structures > 0
      ? `${counts.structures} upgrade${counts.structures > 1 ? "s" : ""} · open`
      : "None ready · plan";
  }

  if (type === "support") {
    return "Blueprint & tools · open if needed";
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
        {formatBankedBadgeCompact(value || 0)} MLEO
      </div>
    </div>
  );
}

function DesktopFloatingPanelShell({
  eyebrow,
  title,
  subtitle,
  subtitleFullWidth = false,
  headerRight,
  onClose,
  /** Optional: scroll container ref (e.g. scroll focused guidance card into view). */
  bodyScrollRef,
  children,
}) {
  const actionBtnBase =
    "h-10 min-h-10 rounded-full border px-4 text-sm font-semibold leading-none inline-flex items-center justify-center";

  return (
    <div
      className="
        z-[70] flex flex-col rounded-[24px] border border-cyan-400/18 bg-slate-950/96
        shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl
        max-h-[calc(100dvh-120px)] md:max-h-[min(74vh,620px)]
        overflow-hidden p-0
      "
    >
      <div className="shrink-0 px-5 pt-5 pb-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            {eyebrow ? (
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200/65">
                {eyebrow}
              </div>
            ) : null}

            <div className={eyebrow ? "mt-1" : "mt-0"}>
              <div className="text-[1.9rem] font-black leading-none text-white">
                {title}
              </div>
            </div>

            {subtitle && !subtitleFullWidth ? (
              <div className="mt-0.5">{subtitle}</div>
            ) : null}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {headerRight ? headerRight : null}
            <button
              type="button"
              onClick={onClose}
              className={`${actionBtnBase} border-white/10 bg-white/[0.05] text-white/80 hover:bg-white/[0.09]`}
            >
              Close
            </button>
          </div>
        </div>

        {subtitle && subtitleFullWidth ? (
          <div className="mt-3 w-full">{subtitle}</div>
        ) : null}
      </div>

      <div
        ref={bodyScrollRef}
        className="
          min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pr-1 pb-10 md:pb-12
          banked-scroll [webkit-overflow-scrolling:touch]
        "
      >
        {children}
        <div aria-hidden className="h-8 md:h-10 shrink-0" />
      </div>
    </div>
  );
}

function BankedQuickPanel({
  snapshot,
  bankedValue,
  /** Precomputed in parent via useMemo — avoids re-running guidance simulation on every Banked HUD tick. */
  guidanceItems: guidanceItemsProp,
  state,
  derived,
  systemState,
  onClose,
  onNavigate,
}) {
  const s = snapshot || {};
  const guidanceItems =
    guidanceItemsProp ??
    getBankedGuidanceItems({
      state,
      derived,
      snapshot,
      systemState,
    });

  const bodyScrollRef = useRef(null);
  const guidanceCardRefs = useRef({});

  const focusGuidanceKey = useMemo(
    () => getBankedGuidanceFocusKey(guidanceItems),
    [guidanceItems]
  );

  useLayoutEffect(() => {
    if (!focusGuidanceKey) return;
    const el = guidanceCardRefs.current[focusGuidanceKey];
    if (!el) return;
    const run = () => {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    };
    requestAnimationFrame(() => requestAnimationFrame(run));
  }, [focusGuidanceKey]);

  const handleNavigate = (target) => {
    onClose?.();
    onNavigate?.(target);
  };

  return (
    <DesktopFloatingPanelShell
      eyebrow="Banked MLEO"
      title={formatBankedDetailedValue(bankedValue)}
      subtitle={
        <span className="text-[11px] text-white/55">
          Live refinery output snapshot
        </span>
      }
      onClose={onClose}
      bodyScrollRef={bodyScrollRef}
    >
      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-[18px] border border-cyan-400/15 bg-cyan-500/[0.07] px-2.5 py-2">
            <div className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-200/65">
              Rate / hr
            </div>
            <div className="mt-1 text-[1.08rem] font-extrabold leading-none text-white">
              {fmtRate(s.perHour)}
            </div>
          </div>

          <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-2.5 py-2">
            <div className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
              Per day
            </div>
            <div className="mt-1 text-[1.08rem] font-extrabold leading-none text-white">
              {fmtRate(s.perDay)}
            </div>
          </div>

          <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-2.5 py-2">
            <div className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
              Today
            </div>
            <div className="mt-1 text-[1.08rem] font-extrabold leading-none text-white">
              {fmtRate(s.mleoProducedToday)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
              Daily prod. cap
            </div>
            <div className="mt-1 text-[1.08rem] font-extrabold leading-none text-white">
              {fmt(s.dailyMleoCap ?? s.shipCap)}
            </div>
          </div>

          <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
              Cap ETA
            </div>
            <div className="mt-1 text-[1.08rem] font-extrabold leading-none text-white">
              {s.etaHours == null ? "—" : `${fmtRate(s.etaHours, 1)}h`}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-2.5 rounded-[18px] border border-white/8 bg-white/[0.03] px-3 py-2.5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
          Production guidance
        </div>

        <div className="mt-2 grid grid-cols-1 gap-2">
          {guidanceItems.map((item) => (
            <button
              key={item.key}
              ref={(node) => {
                if (node) guidanceCardRefs.current[item.key] = node;
                else delete guidanceCardRefs.current[item.key];
              }}
              type="button"
              onClick={() => handleNavigate(item.target)}
              aria-current={focusGuidanceKey === item.key ? "true" : undefined}
              className={`scroll-mt-28 w-full rounded-[18px] border px-3 py-2.5 text-left transition ${getBankedIndicatorCardClasses(
                item.tone
              )} ${
                focusGuidanceKey === item.key ? getBankedGuidanceFocusRingClass(item.tone) : ""
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                  {item.label}
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                  {item.levelBadgeText ? (
                    <span className="rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white/70">
                      {item.levelBadgeText}
                    </span>
                  ) : null}
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${getBankedIndicatorPillClasses(item.tone)}`}
                  >
                    {getBankedIndicatorToneLabel(item.tone)}
                  </span>
                </div>
              </div>

              <div className="mt-1 text-sm font-semibold text-white">
                {item.stateTitle || item.headline}
              </div>

              <div className="mt-1 text-[12px] leading-5 text-white/72">
                {item.text}
              </div>

              <div className="mt-2 space-y-0.5 border-t border-white/10 pt-2 text-[11px] leading-4 text-white/58">
                <div>
                  <span className="text-white/40">Target: </span>
                  {item.targetLabel || "—"}
                </div>
                {item.actionHint ? (
                  <div>
                    <span className="text-white/40">Action: </span>
                    {item.actionHint}
                  </div>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 space-y-2.5 text-[13px] leading-6 text-white/76">
        <div>
          Base Banked grows only while Refinery is supplied with Ore, Scrap and enough
          Energy.
        </div>
        <div>
          Shipping does not increase the rate. Shipping only moves banked MLEO into
          the real shared vault.
        </div>
        <div>
          Red means this is the reason output stopped. Orange means this is the best
          improvement lane right now. Green means this lane is currently balanced.
        </div>
        <div className="border-t border-white/10 pt-2 text-[12px] leading-5 text-white/72">
          Banked MLEO = stored accumulated output inside BASE, not today&apos;s production.
        </div>
        <div className="text-[12px] leading-5 text-white/72">
          Rate / hr = current live BASE production rate under current conditions.
        </div>
        <div className="text-[12px] leading-5 text-white/72">
          Per day = projected remaining output for today under current conditions and daily cap
          limits (not simply Rate / hr × 24).
        </div>
        <div className="text-[12px] leading-5 text-white/72">
          Today = how much BASE production has already been produced today.
        </div>
        <div className="text-[12px] leading-5 text-white/72">
          Daily prod. cap = today&apos;s maximum BASE production limit, not the total banked stock
          limit.
        </div>
        <div className="text-[12px] leading-5 text-white/72">
          Cap ETA = estimated time until today&apos;s production cap is reached at the current rate.
        </div>
        <div className="text-[12px] leading-5 text-white/72">
          Shipping moves banked MLEO to the shared vault; it does not increase production rate.
        </div>
      </div>
    </DesktopFloatingPanelShell>
  );
}

function BaseResourceBar({
  resources,
  energy,
  energyCap,
  bankedMleo = 0,
  compact = false,
  showBanked = true,
  /** Mobile layout: SCRAP before ORE (desktop keeps ORE, GOLD, SCRAP, …). */
  swapOreScrap = false,
}) {
  const ore = {
    key: "ORE",
    label: "ORE",
    value: formatResourceValue(resources?.ORE || 0),
  };
  const gold = {
    key: "GOLD",
    label: "GOLD",
    value: formatResourceValue(resources?.GOLD || 0),
  };
  const scrap = {
    key: "SCRAP",
    label: "SCRAP",
    value: formatResourceValue(resources?.SCRAP || 0),
  };
  const data = {
    key: "DATA",
    label: "DATA",
    value: formatResourceValue(resources?.DATA || 0),
  };
  const energyItem = {
    key: "ENERGY",
    label: "ENERGY",
    value: `${formatResourceValue(energy || 0)}/${formatResourceValue(energyCap || 0)}`,
    focus: true,
  };

  const items = swapOreScrap
    ? [scrap, gold, ore, data, energyItem]
    : [ore, gold, scrap, data, energyItem];

  return (
    <div
      data-base-panel-sticky-chrome
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
              {formatBankedBadgeCompact(bankedMleo || 0)} MLEO
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AccordionSection({ title, subtitle, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5">
      <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-5 sm:py-5">
        <div className="min-w-0 cursor-default">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-white/60">{subtitle}</p> : null}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          className="shrink-0 rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/85 hover:bg-white/15"
        >
          {open ? "CLOSE" : "OPEN"}
        </button>
      </div>
      {open ? <div className="px-4 pb-4 sm:px-5 sm:pb-5">{children}</div> : null}
    </div>
  );
}

function rewardText(reward) {
  return Object.entries(reward || {})
    .map(([k, v]) => `${k} ${fmt(v)}`)
    .join(" · ");
}

const HQ_PREVIEW_SCALABLE_RESOURCES = new Set(["GOLD", "ORE", "SCRAP", "DATA"]);

function getHqPreviewRewardMultiplier(hqLevel) {
  const hq = Math.max(1, Number(hqLevel || 1));
  if (hq >= 9) return 1.6;
  if (hq >= 7) return 1.42;
  if (hq >= 5) return 1.26;
  if (hq >= 3) return 1.12;
  return 1.0;
}

function scalePreviewRewardAmount(baseAmount, multiplier) {
  const value = Number(baseAmount || 0);
  if (value <= 0) return 0;
  return Math.max(1, Math.floor(value * Math.max(0, Number(multiplier || 1))));
}

function getLane2ScaledPreviewReward(reward, hqLevel) {
  if (!reward || typeof reward !== "object") return reward;
  const multiplier = getHqPreviewRewardMultiplier(hqLevel);
  const next = { ...reward };
  for (const key of Object.keys(next)) {
    if (!HQ_PREVIEW_SCALABLE_RESOURCES.has(key)) continue;
    next[key] = scalePreviewRewardAmount(next[key], multiplier);
  }
  return next;
}

function getSpecializationGuidanceAction(state, derived, specializationSummary, liveContracts = []) {
  if (!specializationSummary || typeof specializationSummary !== "object") return null;

  const totals = specializationSummary.totals || {};
  const buildings = specializationSummary.buildings || [];
  const top = specializationSummary.topRecommendation;

  const totalReadyAdvanced = Number(totals.totalReadyAdvancedContracts || 0);
  if (totalReadyAdvanced > 0) {
    const c = liveContracts.find((x) => x.contractClass === "advanced" && x.done && !x.claimed);
    if (c?.title) {
      return {
        title: "Claim advanced contract",
        text: `${c.title} is complete — claim the reward in Contracts to keep specialization progress.`,
      };
    }
  }

  const eliteReady = liveContracts.filter((x) => x.contractClass === "elite" && x.done && !x.claimed);
  if (eliteReady.length > 0) {
    const c = eliteReady[0];
    return {
      title: "Claim elite contract",
      text: `${c.title} is ready — rotating high-value assignment. Claim in Live Contracts (resets daily UTC).`,
    };
  }

  const totalClaimableM = Number(totals.totalClaimableMilestones || 0);
  if (totalClaimableM > 0) {
    for (const row of buildings) {
      if (row.claimableMilestones > 0) {
        const mk = (SPECIALIZATION_MILESTONES_BY_BUILDING[row.buildingKey] || []).find((k) => {
          const p = getSpecializationMilestonePreview(state, derived, row.buildingKey, k);
          return p.done && !p.claimed;
        });
        const label = mk ? SPECIALIZATION_MILESTONE_META[mk]?.label || mk : "milestone";
        return {
          title: "Claim specialization milestone",
          text: `${label} is ready — open ${row.buildingName} and claim your specialization reward.`,
        };
      }
    }
    return {
      title: "Claim specialization milestones",
      text: `${totalClaimableM} specialization milestone${totalClaimableM > 1 ? "s are" : " is"} ready to claim.`,
    };
  }

  for (const row of buildings) {
    if (row.level < 1) {
      return {
        title: `Build ${row.buildingName}`,
        text: `${row.buildingName} unlocks specialization tracks, programs, and milestones for your command path.`,
      };
    }
  }

  for (const row of buildings) {
    if (row.level >= 1 && row.tier < 2) {
      return {
        title: `Advance ${row.buildingName} to T2`,
        text: `Tier 2 unlocks advanced contracts and stronger support programs at ${row.buildingName}.`,
      };
    }
  }

  for (const row of buildings) {
    if (row.level < 1) continue;
    const programs = getSupportPrograms(row.buildingKey);
    const nextUnlock = programs.find(
      (p) => row.tier >= p.minTier && !isSupportProgramUnlocked(state, row.buildingKey, p.key)
    );
    if (nextUnlock) {
      const can = canUnlockSupportProgram(state, row.buildingKey, nextUnlock);
      return {
        title: can ? `Unlock ${nextUnlock.label}` : `Work toward ${nextUnlock.label}`,
        text: can
          ? `You can unlock ${nextUnlock.label} at ${row.buildingName} now.`
          : `Meet the requirements to unlock ${nextUnlock.label} at ${row.buildingName}.`,
      };
    }
  }

  for (const row of buildings) {
    if (row.level < 1) continue;
    const programs = getSupportPrograms(row.buildingKey);
    const anyUnlocked = programs.some((p) => isSupportProgramUnlocked(state, row.buildingKey, p.key));
    if (anyUnlocked && !row.activeProgramKey) {
      return {
        title: "Activate support program",
        text: `Select and activate a support program at ${row.buildingName} to apply specialization bonuses.`,
      };
    }
  }

  if (top?.text && (top.navigateTarget != null || top.focusBuildingKey)) {
    return {
      title: "Specialization focus",
      text: top.text,
    };
  }

  return null;
}

function getNextStep(state, derived, systemState, liveContracts = [], specializationSummary = null) {
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

  const specStep = getSpecializationGuidanceAction(state, derived, specializationSummary, liveContracts);
  if (specStep) return specStep;

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

function estimateOrePerHour(state, derived) {
  const level = getEffectiveBuildingLevel(state, "quarry");
  if (!level) return 0;
  return 1.35 * level * Number(derived?.oreMult || 1) * 3600;
}

function estimateDataPerHour(state, derived) {
  const lab = getEffectiveBuildingLevel(state, "researchLab");
  const miner = getEffectiveBuildingLevel(state, "minerControl");
  const arcade = getEffectiveBuildingLevel(state, "arcadeHub");
  const logistics = getEffectiveBuildingLevel(state, "logisticsCenter");

  const perSecond =
    0.22 * lab * Number(derived?.dataMult || 1) +
    0.14 * miner * Number(derived?.dataMult || 1) +
    0.11 * arcade * Number(derived?.dataMult || 1) +
    0.06 * logistics * Number(derived?.dataMult || 1);

  return perSecond * 3600;
}

function getUpgradeImpactPreview(state, derived, buildingKey) {
  if (!state || typeof state !== "object") return null;
  if (!derived || typeof derived !== "object") return null;
  if (typeof buildingKey !== "string" || !buildingKey) return null;

  const supported = new Set([
    "quarry",
    "salvage",
    "refinery",
    "powerCell",
    "repairBay",
    "researchLab",
  ]);
  if (!supported.has(buildingKey)) return null;

  try {
  const fmt = (value, maxFraction = 2) =>
    new Intl.NumberFormat("en-US", { maximumFractionDigits: maxFraction }).format(
      Number(value || 0)
    );

    // Align early-game "feel" between preview and `simulate()` (see `earlyOutputBoostForSim`).

  const nextState = {
    ...state,
    buildings: {
      ...(state?.buildings || {}),
      [buildingKey]: Number(state?.buildings?.[buildingKey] || 0) + 1,
    },
  };
  const nextDerived = derive(nextState);

  if (buildingKey === "quarry") {
    const modeFactor = getBuildingPowerFactor(state, "quarry");
      const curBaseLevel = Number(state?.buildings?.quarry || 0);
      const nextBaseLevel = curBaseLevel + 1;
      const curEffectiveLevel = curBaseLevel * modeFactor;
      const nextEffectiveLevel = nextBaseLevel * modeFactor;
      const boostCur = earlyOutputBoostForSim("quarry", curEffectiveLevel);
      const boostNext = earlyOutputBoostForSim("quarry", nextEffectiveLevel);
      const deltaPerHour =
        1.35 *
        modeFactor *
        Number(derived?.oreMult || 1) *
        3600 *
        (nextBaseLevel * boostNext - curBaseLevel * boostCur);
    return { label: "Upgrade impact", value: `+${fmt(deltaPerHour, 1)} ORE/hr` };
  }

  if (buildingKey === "salvage") {
    const modeFactor = getBuildingPowerFactor(state, "salvage");
      const curBaseLevel = Number(state?.buildings?.salvage || 0);
      const nextBaseLevel = curBaseLevel + 1;
      const curEffectiveLevel = curBaseLevel * modeFactor;
      const nextEffectiveLevel = nextBaseLevel * modeFactor;
      const boostCur = earlyOutputBoostForSim("salvage", curEffectiveLevel);
      const boostNext = earlyOutputBoostForSim("salvage", nextEffectiveLevel);
      const deltaPerHour =
        0.5 *
        modeFactor *
        Number(derived?.scrapMult || 1) *
        3600 *
        (nextBaseLevel * boostNext - curBaseLevel * boostCur);
    return { label: "Upgrade impact", value: `+${fmt(deltaPerHour, 1)} SCRAP/hr` };
  }

  if (buildingKey === "refinery") {
    const modeFactor = getBuildingPowerFactor(state, "refinery");
      const curBaseLevel = Number(state?.buildings?.refinery || 0);
      const nextBaseLevel = curBaseLevel + 1;
      const curEffectiveLevel = curBaseLevel * modeFactor;
      const nextEffectiveLevel = nextBaseLevel * modeFactor;
      const boostCur = earlyOutputBoostForSim("refinery", curEffectiveLevel);
      const boostNext = earlyOutputBoostForSim("refinery", nextEffectiveLevel);
      const deltaPerHour =
        REFINERY_BANKED_PER_LEVEL *
        modeFactor *
        Number(derived?.mleoMult || 1) *
        Number(derived?.bankBonus || 1) *
        3600 *
        (nextBaseLevel * boostNext - curBaseLevel * boostCur);
    return {
      label: "Upgrade impact",
      value: `+${fmt(deltaPerHour, 2)} banked/hr`,
      note: "Assuming Ore/Scrap/Energy flow holds",
    };
  }

  if (buildingKey === "powerCell") {
    const capDelta = Number(nextDerived?.energyCap || 0) - Number(derived?.energyCap || 0);
    const regenDelta = Number(nextDerived?.energyRegen || 0) - Number(derived?.energyRegen || 0);
    return {
      label: "Upgrade impact",
      value: `+${fmt(capDelta, 0)} cap / +${fmt(regenDelta, 2)}/s`,
      note: "Energy reserve and recovery",
    };
  }

  if (buildingKey === "repairBay") {
    const modeFactor = getBuildingPowerFactor(state, "repairBay");
      const perHourStability = 0.042 * modeFactor * 3600;
    const reliefDelta =
      Number(nextDerived?.maintenanceRelief || 1) - Number(derived?.maintenanceRelief || 1);
    return {
      label: "Upgrade impact",
      value: `+${fmt(perHourStability, 1)} stability/hr`,
      note: `Maintenance relief +${fmt(reliefDelta, 2)}x`,
    };
  }

  if (buildingKey === "researchLab") {
    const modeFactor = getBuildingPowerFactor(state, "researchLab");
      const curBaseLevel = Number(state?.buildings?.researchLab || 0);
      const nextBaseLevel = curBaseLevel + 1;
      const curEffectiveLevel = curBaseLevel * modeFactor;
      const nextEffectiveLevel = nextBaseLevel * modeFactor;
      const boostCur = earlyOutputBoostForSim("researchLab", curEffectiveLevel);
      const boostNext = earlyOutputBoostForSim("researchLab", nextEffectiveLevel);
      const deltaPerHour =
        0.22 *
        modeFactor *
        Number(derived?.dataMult || 1) *
        3600 *
        (nextBaseLevel * boostNext - curBaseLevel * boostCur);
    return { label: "Upgrade impact", value: `+${fmt(deltaPerHour, 1)} DATA/hr` };
  }

  return null;
  } catch {
    return null;
  }
}

function getOverviewBaseStatus({ systemState, stability, energy, energyCap, bankedSnapshot, shipRatio }) {
  if (shipRatio >= 0.92) {
    return {
      label: "Bottlenecked",
      tone: "warning",
      text: "Daily MLEO production budget is almost full; further refinery output is heavily reduced until reset.",
    };
  }

  if (systemState === "critical" || (energyCap > 0 && energy <= energyCap * 0.08)) {
    return {
      label: "Recovery Mode",
      tone: "critical",
      text: "The base is under pressure. Recovery actions should come before scaling.",
    };
  }

  if (
    systemState === "warning" ||
    !bankedSnapshot?.active ||
    stability < 82 ||
    (energyCap > 0 && energy <= energyCap * 0.22)
  ) {
    return {
      label: "Under Pressure",
      tone: "warning",
      text: "The base is working, but at least one support system is limiting clean progression.",
    };
  }

  return {
    label: "Stable",
    tone: "success",
    text: "Core systems are healthy and the base is ready for efficient growth.",
  };
}

function getOverviewBottleneck({
  systemState,
  stability,
  energy,
  energyCap,
  bankedSnapshot,
  shipRatio,
  canShipNow,
}) {
  if (shipRatio >= 0.92 || Number(bankedSnapshot?.remainingToCap || 0) <= 40) {
    return {
      key: "ship-cap",
      label: "Near daily MLEO cap",
      text: "You are close to today's MLEO production limit in BASE. Shipping to vault is unaffected.",
      target: { tab: "ops", target: "shipping" },
      tone: "warning",
    };
  }

  if (energyCap > 0 && energy <= energyCap * 0.08) {
    return {
      key: "energy-collapse",
      label: "Energy pressure",
      text: "Your reserve is too low to support healthy production flow.",
      target: { tab: "ops", target: "maintenance" },
      tone: "critical",
    };
  }

  if (bankedSnapshot?.hasRefinery && !bankedSnapshot?.hasOre) {
    return {
      key: "ore-limited",
      label: "ORE limited",
      text: "Refinery cannot sustain output because ore feed is too weak.",
      target: { tab: "build", target: "quarry" },
      tone: "warning",
    };
  }

  if (bankedSnapshot?.hasRefinery && !bankedSnapshot?.hasScrap) {
    return {
      key: "scrap-limited",
      label: "Scrap limited",
      text: "Refinery is starved by scrap input.",
      target: { tab: "build", target: "salvage" },
      tone: "warning",
    };
  }

  if (stability < 82 || systemState !== "normal") {
    return {
      key: "stability-drag",
      label: "Stability drag",
      text: "Instability is reducing comfort and making the base harder to scale safely.",
      target: { tab: "ops", target: "maintenance" },
      tone: "warning",
    };
  }

  if (!bankedSnapshot?.active || Number(bankedSnapshot?.perHour || 0) <= 0.01) {
    return {
      key: "weak-output",
      label: "Weak passive output",
      text: "The base is stable, but your banking loop is still too soft.",
      target: { tab: "build", target: "refinery" },
      tone: "info",
    };
  }

  return {
    key: "none",
    label: "No critical issue",
    text: "No major bottleneck detected right now.",
    target: { tab: "overview", target: "recommendation" },
    tone: "success",
  };
}

function getOverviewBestAction({
  bottleneck,
  canExpeditionNow,
  liveContracts,
}) {
  const claimableContracts = (liveContracts || []).filter((c) => c.done && !c.claimed).length;

  if (claimableContracts > 0) {
    return {
      key: "claim-contracts",
      title: "Claim contract rewards",
      text: "You already have completed rewards waiting.",
      cta: "Open contracts",
      target: { tab: "overview", target: "contracts" },
    };
  }

  switch (bottleneck.key) {
    case "ship-cap":
      return {
        key: "ship-banked",
        title: "Ship Banked MLEO",
        text: "Free room before your banked flow starts wasting momentum.",
        cta: "Open shipping",
        target: { tab: "ops", target: "shipping" },
      };
    case "energy-collapse":
      return {
        key: "recover-energy",
        title: "Recover energy reserves",
        text: "Use refill / safe mode first, then strengthen power support.",
        cta: "Open operations",
        target: { tab: "ops", target: "maintenance" },
      };
    case "ore-limited":
      return {
        key: "upgrade-quarry",
        title: "Upgrade Quarry",
        text: "Ore feed is your limiting input right now.",
        cta: "Open Quarry",
        target: { tab: "build", target: "quarry" },
      };
    case "scrap-limited":
      return {
        key: "upgrade-salvage",
        title: "Upgrade Salvage",
        text: "Scrap supply is holding the refinery back.",
        cta: "Open Salvage",
        target: { tab: "build", target: "salvage" },
      };
    case "stability-drag":
      return {
        key: "do-maintenance",
        title: "Do Maintenance",
        text: "Restore comfort and prevent efficiency drag before scaling.",
        cta: "Open maintenance",
        target: { tab: "ops", target: "maintenance" },
      };
    case "weak-output":
      return {
        key: "strengthen-refinery",
        title: "Strengthen Refinery loop",
        text: "You need more sustained banked output now.",
        cta: "Open Refinery",
        target: { tab: "build", target: "refinery" },
      };
    default:
      if (canExpeditionNow) {
        return {
          key: "run-expedition",
          title: "Run Expedition",
          text: "The base is stable enough to push active progression.",
          cta: "Open expedition",
          target: { tab: "ops", target: "expedition-action" },
        };
      }
      return {
        key: "scale-efficiently",
        title: "Scale efficiently",
        text: "No urgent issue detected. Push your strongest economy upgrade.",
        cta: "Open Build",
        target: { tab: "build", target: "refinery" },
      };
  }
}

function getOverviewStabilityBlock({ state, derived, systemState, bankedSnapshot }) {
  const stability = Number(state?.stability || 100);
  const repairLevel = getEffectiveBuildingLevel(state, "repairBay");
  const maintenanceRelief = Number(derived?.maintenanceRelief || 1);

  const impactLabel =
    stability >= 92
      ? "High efficiency"
      : stability >= 82
      ? "Good efficiency"
      : stability >= 70
      ? "Soft drag"
      : "Heavy drag";

  const impactText =
    stability >= 92
      ? "Stability is supporting strong overall efficiency."
      : stability >= 82
      ? "Minor pressure only."
      : stability >= 70
      ? "The base is still working, but scaling is getting less clean."
      : "Efficiency pressure is now meaningful. Maintenance should move up.";

  const pressureLabel =
    systemState === "critical"
      ? "Critical"
      : bankedSnapshot?.hasRefinery && !bankedSnapshot?.active
      ? "Refinery strain"
      : systemState === "warning"
      ? "Rising"
      : "Controlled";

  const pressureText =
    systemState === "critical"
      ? "Core systems are under active pressure."
      : bankedSnapshot?.hasRefinery && !bankedSnapshot?.active
      ? "Refinery demand is contributing to instability pressure."
      : systemState === "warning"
      ? "Maintenance timing matters now."
      : "No major stability issue detected.";

  const repairSupportLabel = repairLevel > 0 ? `Lv ${Number(repairLevel).toFixed(0)}` : "Offline";
  const repairSupportText =
    repairLevel > 0
      ? `Repair support active · relief x${maintenanceRelief.toFixed(2)}`
      : "No Repair Bay support yet.";

  return {
    value: stability,
    impactLabel,
    impactText,
    pressureLabel,
    pressureText,
    repairSupportLabel,
    repairSupportText,
  };
}

function buildOverviewV2({
  state,
  derived,
  systemState,
  liveContracts,
  readyCounts,
  missionProgress,
  canShipNow,
  canExpeditionNow,
  bankedSnapshot,
}) {
  const energy = Number(state.resources?.ENERGY || 0);
  const energyCap = Number(derived.energyCap || 0);
  const stability = Number(state.stability || 100);
  const dailyCap = Number(derived.dailyMleoCap ?? derived.shipCap ?? CONFIG.dailyBaseMleoCap);
  const producedToday = Number(state.mleoProducedToday || 0);
  const shipRatio = dailyCap > 0 ? producedToday / dailyCap : 0;

  const bottleneck = getOverviewBottleneck({
    systemState,
    stability,
    energy,
    energyCap,
    bankedSnapshot,
    shipRatio,
    canShipNow,
  });

  const nextAction = getOverviewBestAction({
    bottleneck,
    canExpeditionNow,
    liveContracts,
  });
  const recoveryHint = (() => {
    const energyRatio = energyCap > 0 ? energy / energyCap : 1;
    const inRecovery = bottleneck?.key === "energy-collapse" || systemState === "critical";
    if (!inRecovery && energyRatio > 0.18) return null;
    return {
      title: "Recovery hint",
      text: "Use Safe 50% to cut drain, then refill or maintain if needed.",
      target: { tab: "ops", target: "maintenance" },
    };
  })();

  const todaysLoop = (() => {
    const steps = [];
    const push = (title, status = "Soon", target = null) => {
      if (!title) return;
      if (steps.some((s) => s.title === title)) return;
      steps.push({ title, status, target });
    };

    const energyRatio = energyCap > 0 ? energy / energyCap : 1;
    const dc = Number(derived?.dailyMleoCap ?? derived?.shipCap ?? CONFIG.dailyBaseMleoCap);
    const shipRatio = dc > 0 ? Number(state?.mleoProducedToday || 0) / dc : 0;
    const claimableContracts = (liveContracts || []).filter((c) => c.done && !c.claimed).length;
    const claimableMissions = Number(readyCounts?.missions || 0);

    if (energyCap > 0) {
      if (energyRatio <= 0.2) {
        push("Restore energy buffer", "Ready", { tab: "ops", target: "maintenance" });
      } else {
        push("Keep energy buffer healthy", "Done");
      }
    }

    if (bankedSnapshot?.hasRefinery) {
      if (!bankedSnapshot?.hasOre || !bankedSnapshot?.hasScrap) {
        push(
          !bankedSnapshot?.hasOre ? "Feed refinery with ORE" : "Feed refinery with Scrap",
          "Ready",
          !bankedSnapshot?.hasOre
            ? { tab: "build", target: "quarry" }
            : { tab: "build", target: "salvage" }
        );
      } else {
        push("Keep refinery feed stable", "Done");
      }
    }

    if (canExpeditionNow) {
      push("Run expedition now", "Ready", { tab: "ops", target: "expedition-action" });
    } else {
      push("Run expedition when ready", "Soon", { tab: "ops", target: "expedition-action" });
    }

    if (stability < 82 || systemState !== "normal") {
      push("Do maintenance before pressure rises", "Ready", { tab: "ops", target: "maintenance" });
    } else {
      push("Maintain stability rhythm", "Done");
    }

    if (canShipNow) {
      push("Ship banked MLEO to Shared Vault", "Ready", {
        tab: "ops",
        target: "shipping",
      });
    }

    if (claimableContracts > 0 || claimableMissions > 0) {
      push(
        "Claim available rewards",
        "Ready",
        claimableContracts > 0
          ? { tab: "overview", target: "contracts" }
          : { tab: "ops", target: "missions" }
      );
    }

    return steps.slice(0, 4);
  })();

  const bottleneckChips = (() => {
    const chips = [];
    const push = (key, label, tone = "info") => {
      if (!key || !label) return;
      if (chips.some((item) => item.key === key)) return;
      chips.push({ key, label, tone });
    };

    // First chip: current main bottleneck.
    switch (bottleneck?.key) {
      case "ship-cap":
        push("ship-cap", "Near daily MLEO cap", "warning");
        break;
      case "energy-collapse":
        push("energy-pressure", "Energy pressure", "critical");
        break;
      case "ore-limited":
        push("ore-limited", "ORE limited", "warning");
        break;
      case "scrap-limited":
        push("scrap-low", "Scrap low", "warning");
        break;
      case "stability-drag":
        push("stability-drag", "Stability drag", "warning");
        break;
      case "weak-output":
        push("output-weak", "Output weak", "info");
        break;
      default:
        break;
    }

    // Optional second chip: closely related secondary pressure.
    const energy = Number(state?.resources?.ENERGY || 0);
    const energyCap = Number(derived?.energyCap || 0);
    const stability = Number(state?.stability || 100);
    const dc = Number(derived?.dailyMleoCap ?? derived?.shipCap ?? CONFIG.dailyBaseMleoCap);
    const shipRatio = dc > 0 ? Number(state?.mleoProducedToday || 0) / dc : 0;

    if (chips.length < 2) {
      if (
        bottleneck?.key !== "energy-collapse" &&
        energyCap > 0 &&
        energy <= energyCap * 0.16
      ) {
        push("energy-pressure", "Energy pressure", "critical");
      } else if (
        chips.length < 2 &&
        bottleneck?.key !== "ship-cap" &&
        shipRatio >= 0.88
      ) {
        push("ship-cap", "Near daily MLEO cap", "warning");
      } else if (
        chips.length < 2 &&
        bottleneck?.key !== "stability-drag" &&
        (stability < 84 || systemState !== "normal")
      ) {
        push("stability-drag", "Stability drag", "warning");
      } else if (
        chips.length < 2 &&
        bottleneck?.key !== "ore-limited" &&
        bankedSnapshot?.hasRefinery &&
        !bankedSnapshot?.hasOre
      ) {
        push("ore-limited", "ORE limited", "warning");
      } else if (
        chips.length < 2 &&
        bottleneck?.key !== "scrap-limited" &&
        bankedSnapshot?.hasRefinery &&
        !bankedSnapshot?.hasScrap
      ) {
        push("scrap-low", "Scrap low", "warning");
      } else if (
        chips.length < 2 &&
        bottleneck?.key !== "weak-output" &&
        (!bankedSnapshot?.active || Number(bankedSnapshot?.perHour || 0) <= 0.01)
      ) {
        push("output-weak", "Output weak", "info");
      }
    }

    return chips.slice(0, 2);
  })();

  return {
    baseStatus: getOverviewBaseStatus({
      systemState,
      stability,
      energy,
      energyCap,
      bankedSnapshot,
      shipRatio,
    }),
    bottleneck,
    nextAction,
    recoveryHint,
    bottleneckChips,
    todaysLoop,
    rates: {
      bankedPerHour: Number(bankedSnapshot?.perHour || 0),
      projectedPerDay: Number(bankedSnapshot?.perDay || 0),
      orePerHour: estimateOrePerHour(state, derived),
      dataPerHour: estimateDataPerHour(state, derived),
      refineryState: bankedSnapshot?.limitingSystem || "Unknown",
      /** Time to hit daily MLEO production cap (not shipping). */
      etaToMleoCapHours: bankedSnapshot?.etaHours ?? null,
      etaToShipCapHours: bankedSnapshot?.etaHours ?? null,
    },
    stability: getOverviewStabilityBlock({
      state,
      derived,
      systemState,
      bankedSnapshot,
    }),
    dailyProgress: {
      mleoDailyProgress: {
        current: Number(state?.mleoProducedToday || 0),
        max: Number(derived?.dailyMleoCap ?? derived?.shipCap ?? CONFIG.dailyBaseMleoCap),
      },
      shipProgress: {
        current: Number(state?.mleoProducedToday || 0),
        max: Number(derived?.dailyMleoCap ?? derived?.shipCap ?? CONFIG.dailyBaseMleoCap),
      },
      expeditionsDone: Number(state?.stats?.expeditionsToday || 0),
      maintenanceDone: Number(state?.stats?.maintenanceToday || 0),
      missionsReady: Number(readyCounts?.missions || 0),
      missionsCompleted: Object.keys(state?.missionState?.completed || {}).filter(
        (key) => state?.missionState?.completed?.[key]
      ).length,
      missionProgress,
    },
  };
}

const OVERVIEW_LOCK_MS = 7000;
const OVERVIEW_BOTTLENECK_PRIORITY = {
  "ship-cap": 1,
  "energy-collapse": 2,
  "ore-limited": 3,
  "scrap-limited": 4,
  "stability-drag": 5,
  "weak-output": 6,
  none: 7,
};

function isCriticalOverviewBottleneck(key) {
  return key === "ship-cap" || key === "energy-collapse";
}

function isHigherPriorityBottleneck(nextKey, currentKey) {
  const nextPriority = OVERVIEW_BOTTLENECK_PRIORITY[nextKey] || 99;
  const currentPriority = OVERVIEW_BOTTLENECK_PRIORITY[currentKey] || 99;
  return nextPriority < currentPriority;
}

function isOverviewBottleneckClearlyResolved(prevKey, context) {
  const { state, derived, systemState, bankedSnapshot } = context;
  const energy = Number(state?.resources?.ENERGY || 0);
  const energyCap = Number(derived?.energyCap || 0);
  const stability = Number(state?.stability || 100);
  const dc = Number(derived?.dailyMleoCap ?? derived?.shipCap ?? CONFIG.dailyBaseMleoCap);
  const shipRatio = dc > 0 ? Number(state?.mleoProducedToday || 0) / dc : 0;

  switch (prevKey) {
    case "ship-cap":
      return shipRatio < 0.82 && Number(bankedSnapshot?.remainingToCap || 0) > 120;
    case "energy-collapse":
      return energyCap > 0 ? energy >= energyCap * 0.18 : true;
    case "ore-limited":
      return !!bankedSnapshot?.hasOre;
    case "scrap-limited":
      return !!bankedSnapshot?.hasScrap;
    case "stability-drag":
      return stability >= 86 && systemState === "normal";
    case "weak-output":
      return !!bankedSnapshot?.active && Number(bankedSnapshot?.perHour || 0) > 0.04;
    case "none":
      return true;
    default:
      return false;
  }
}

const INFO_COPY = {
  sharedVault: {
    title: "Shared Vault",
    focus: "Refinery + shipping + logistics scaling",
    text:
      "Shared Vault is your exported MLEO total.\n" +
      "Refinery creates banked MLEO, and shipping moves it into vault progress.",
    tips: {
      building: "Refinery",
      supportBuildings: ["Logistics Center", "Quarry", "Salvage Yard"],
      operation: "Ship to Shared Vault",
      watch: "Shipping is weak if banked flow is underfed.",
      actions: [
        "Feed Refinery first, then watch your daily MLEO production budget (production is capped, not shipping).",
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
      "Banked MLEO is generated by Refinery and stored until you ship.\n" +
      "It depends on Ore, Scrap and stable Energy at the same time.",
    tips: {
      building: "Refinery",
      supportBuildings: ["Quarry", "Salvage Yard", "Power Cell"],
      operation: "Ship to Shared Vault",
      watch: "Any missing input stalls banked output.",
      actions: [
        "If refinery output feels slow, check Ore/Scrap/Energy — daily production cap is separate from shipping.",
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
      "• Miner Control, Arcade Hub and Logistics Center add support DATA.\n" +
      "• Expeditions give burst DATA.\n" +
      "• Missions help smooth early progression.\n\n" +
      "Important:\n" +
      "DATA controls research pace, blueprint rhythm and advanced actions. Weak DATA slows the whole advanced game even if your raw economy still looks decent.",
    tips: {
      building: "Research Lab",
      supportBuildings: ["Miner Control", "Arcade Hub", "Logistics Center", "Expedition Bay"],
      research: "Deep Scan",
      supportResearch: ["Token Discipline", "Arcade Ops"],
      module: "Arcade Relay",
      operation: "Field Expedition",
      watch:
        "Research Lab is the main DATA lane, but it also adds Energy pressure, so scaling it without support can feel worse than expected.",
      actions: [
        "Use Research Lab as your main long-term DATA lane.",
        "Use Miner Control, Arcade Hub and Logistics Center as support layers, not full replacements.",
        "Run expeditions when you need burst DATA for a specific milestone.",
      ],
    },
    nextStep: {
      label: "Upgrade Research Lab",
      tab: "build",
      target: "researchLab",
      why: "Research Lab is your strongest direct long-term DATA generator.",
    },
  },

  energy: {
    title: "Energy",
    focus: "Power Cell + Coolant Loops + runtime control",
    text:
      "Energy powers production uptime.\n" +
      "If drain beats regen, progression stalls quickly.\n\n" +
      "Safe Mode (50%) lowers runtime drain for recovery.\n" +
      "Tradeoff: lower short-term output while pressure is eased.",
    tips: {
      building: "Power Cell",
      supportBuildings: ["Repair Bay", "Refinery"],
      research: "Coolant Loops",
      supportResearch: ["Predictive Maintenance"],
      operation: "Emergency Refill / Reduce building power mode",
      watch: "Refill recovers now, but does not fix long-term regen.",
      actions: ["Use safe power mode while rebuilding reserves."],
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
      "Stability protects overall efficiency.\n" +
      "Low stability makes growth feel worse even with good resources.\n\n" +
      "Safe Mode helps by reducing drain while maintenance restores control.",
    tips: {
      building: "Repair Bay",
      supportBuildings: ["Power Cell", "Refinery"],
      research: "Predictive Maintenance",
      module: "Miner Link",
      operation: "Maintenance Cycle",
      watch: "Delayed maintenance and weak energy quickly compound pressure.",
      actions: ["Maintain early, then scale heavy systems."],
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
    focus: "Quarry + Energy support + Ore multipliers",
    text:
      "ORE is the main raw industrial resource in BASE.\n\n" +
      "How to grow it:\n" +
      "• Quarry is the main direct ORE source.\n" +
      "• Power Cell helps keep the Ore lane active when Energy pressure rises.\n" +
      "• Miner Control supports industrial synergy.\n" +
      "• Miner Sync and Servo Drill multiply the lane.\n\n" +
      "Important:\n" +
      "Weak ORE does not only slow building upgrades. It also starves Refinery, which means weaker banked MLEO later.",
    tips: {
      building: "Quarry",
      supportBuildings: ["Power Cell", "Miner Control", "Refinery"],
      research: "Miner Sync",
      supportResearch: ["Field Ops"],
      module: "Servo Drill",
      operation: "",
      watch:
        "Quarry is one of the first places where Energy pressure becomes visible, so weak Energy can make ORE feel worse than it should.",
      actions: [
        "Upgrade Quarry steadily instead of leaving ORE behind.",
        "Fix Energy pressure before assuming the Ore lane itself is the only problem.",
        "Take Servo Drill and Miner Sync when ORE becomes your real bottleneck.",
      ],
    },
    nextStep: {
      label: "Upgrade Quarry",
      tab: "build",
      target: "quarry",
      why: "Quarry is the main direct source of ORE in BASE.",
    },
  },

  gold: {
    title: "GOLD",
    focus: "Trade Hub + Quarry unlock path + Energy support",
    text:
      "GOLD is the main spendable economy resource in BASE.\n\n" +
      "How to grow it:\n" +
      "• Trade Hub is the main direct GOLD source.\n" +
      "• Quarry is part of the unlock path because Trade Hub requires it.\n" +
      "• Power Cell helps keep the Gold lane running when Energy pressure rises.\n" +
      "• Missions and expeditions are support sources, not the main stable lane.\n\n" +
      "Important:\n" +
      "If GOLD feels weak, do not look only at the Trade Hub level. Check whether Energy is starving the lane or whether the base is relying too much on temporary support rewards.",
    tips: {
      building: "Trade Hub",
      supportBuildings: ["Quarry", "Power Cell", "Expedition Bay"],
      research: "Field Ops",
      supportResearch: ["Coolant Loops", "Arcade Ops"],
      module: "",
      operation: "Field Expedition / Daily Missions",
      watch:
        "Trade Hub gives direct GOLD, but weak Energy can still make the whole Gold lane feel worse than expected.",
      actions: [
        "Use Trade Hub as your main long-term Gold lane.",
        "If Gold feels weak, check Energy before assuming you only need more Trade Hub levels.",
        "Use expeditions and missions to smooth temporary Gold shortages, not to replace Trade Hub.",
      ],
    },
    nextStep: {
      label: "Upgrade Trade Hub",
      tab: "build",
      target: "tradeHub",
      why: "Trade Hub is the strongest direct GOLD source in the base.",
    },
  },

  scrap: {
    title: "SCRAP",
    focus: "Salvage Yard + expeditions + Refinery support",
    text:
      "SCRAP is a support resource that becomes more important as the base matures.\n\n" +
      "How to grow it:\n" +
      "• Salvage Yard is the main stable SCRAP source.\n" +
      "• Expeditions help with burst Scrap when you need recovery.\n" +
      "• Strong Scrap is important for advanced systems and for feeding Refinery.\n\n" +
      "Important:\n" +
      "Many players feel blocked in mid-game because Scrap falls behind quietly. When that happens, advanced structures and Refinery progression both start feeling worse.",
    tips: {
      building: "Salvage Yard",
      supportBuildings: ["Expedition Bay", "Refinery", "Power Cell"],
      research: "Deep Scan",
      supportResearch: ["Field Ops"],
      module: "Miner Link",
      operation: "Field Expedition",
      watch:
        "Refinery scaling feels bad very quickly when SCRAP cannot keep up, especially if Energy is also under pressure.",
      actions: [
        "Do not leave Salvage too low while pushing advanced structures.",
        "Use expeditions for burst Scrap, but keep Salvage Yard as the real long-term lane.",
        "Keep SCRAP healthy before pushing harder into Refinery.",
      ],
    },
    nextStep: {
      label: "Upgrade Salvage Yard",
      tab: "build",
      target: "salvage",
      why: "Salvage Yard is your main stable long-term source of SCRAP.",
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

function BaseHomeFlowScene({
  base,
  derived,
  selected,
  onSelect,
  layout = "mobile",
  mapTheme,
  playfieldEmbed = false,
}) {
  const scenePositions =
    layout === "desktop" ? BASE_HOME_SCENE_POSITIONS_DESKTOP : BASE_HOME_SCENE_POSITIONS_MOBILE;

  const nodes = useMemo(() => {
    const buildings = base?.buildings || {};

    return BASE_HOME_SCENE_ORDER.filter((key) => {
      if (key === "hq") return true;
      return Number(buildings[key] || 0) > 0;
    }).map((key) => {
      const def = BUILDINGS.find((b) => b.key === key);
      const level =
        key === "hq" ? Math.max(1, Number(buildings[key] || 1)) : Number(buildings[key] || 0);

      const identity = getBaseSceneIdentity(key);
      const nodeState = getBaseSceneNodeState(key, base, derived);

      return {
        key,
        level,
        name: def?.name || key,
        pos: scenePositions[key],
        identity,
        state: nodeState,
        glowClass: getBaseSceneGlow(identity.glow, nodeState),
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
    glowClass: getBaseSceneGlow(getBaseSceneIdentity("hq").glow, "normal"),
  };

  const links = nodes.filter((n) => n.key !== "hq" && n.pos);

  const panel = (
    <BaseHomeFlowScenePanel
      layout={layout}
      hq={hq}
      links={links}
      nodes={nodes}
      selected={selected}
      onSelect={onSelect}
      theme={mapTheme}
      playfieldEmbed={playfieldEmbed}
    />
  );

  if (layout === "desktop") {
    return <div className="flex min-h-0 min-w-0 flex-1 flex-col">{panel}</div>;
  }
  return panel;
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
  /** Session-only: hide positive "Harmonized command window" after first open; resets when push window ends. */
  const [harmonizedCommandWindowAlertAcked, setHarmonizedCommandWindowAlertAcked] = useState(false);
  const prevHarmonizedPushWindowRef = useRef(false);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState(null);
  const [showReadyPanel, setShowReadyPanel] = useState(false);
  const [showBankedPanel, setShowBankedPanel] = useState(false);
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
  const [crewRole, setCrewRole] = useState("engineer");
  const [commanderPath, setCommanderPath] = useState("industry");
  const [devTab, setDevTab] = useState("crew");
  const [activeBuildKey, setActiveBuildKey] = useState(null);
  const [tierPromptKey, setTierPromptKey] = useState(null);
  const [activeTierKey, setActiveTierKey] = useState(null);
  const [activeProgramUnlockKey, setActiveProgramUnlockKey] = useState(null);
  const [activeMilestoneClaimKey, setActiveMilestoneClaimKey] = useState(null);
  const [activeProgramSetKey, setActiveProgramSetKey] = useState(null);
  const [overviewGuidanceState, setOverviewGuidanceState] = useState(null);
  const [bankedDisplayValue, setBankedDisplayValue] = useState(0);
  const [bankedDisplayNow, setBankedDisplayNow] = useState(() => Date.now());
  const bankedDisplayValueRef = useRef(0);
  const bankedServerValueRef = useRef(0);
  const bankedDisplayStorageKey = useMemo(
    () => `mleo_base_banked_display_floor_v1:${address || "guest"}`,
    [address]
  );
  const highlightTimeoutRef = useRef(null);
  const expeditionToastNonceRef = useRef(0);

  const lastInteractionRef = useRef(Date.now());
  const lastPresenceSendRef = useRef(0);
  const lastUiInteractionSendRef = useRef(0);
  const presenceInFlightRef = useRef(false);
  const presenceHeartbeatRef = useRef(null);

  const lastGameActionAtRef = useRef(0);
  const gameActionInFlightRef = useRef(false);
  const [hubGameplayOnline, setHubGameplayOnline] = useState(false);
  const [eliteRotation, setEliteRotation] = useState(null);
  const [devSectorModalOpen, setDevSectorModalOpen] = useState(false);
  const [devSectorBusy, setDevSectorBusy] = useState(false);

  useEffect(() => {
    if (!tierPromptKey) return;

    const level = Number(state?.buildings?.[tierPromptKey] || 0);
    const tier = getBuildingTier(state, tierPromptKey);

    if (!isTierBuilding(tierPromptKey) || level < 15 || tier >= 4) {
      setTierPromptKey(null);
    }
  }, [tierPromptKey, state?.buildings, state?.buildingTiers]);

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

  function mergeAuthoritativeServerState(prev, serverState) {
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
      contractState:
        serverState?.contractState ??
        serverState?.contract_state ??
        normalized?.contractState ??
        prev?.contractState ??
        { claimed: {} },
      sectorWorld: Math.min(
        6,
        Math.max(
          1,
          Number(
            serverState?.sectorWorld ??
              serverState?.sector_world ??
              normalized?.sectorWorld ??
              prev?.sectorWorld ??
              1
          )
        )
      ),
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
      specializationMilestonesClaimed: normalizeSpecializationMilestonesClaimed(
        serverState?.specialization_milestones_claimed ??
          serverState?.specializationMilestonesClaimed ??
          normalized?.specializationMilestonesClaimed ??
          prev?.specializationMilestonesClaimed
      ),
      commandProtocolActive:
        serverState?.commandProtocolActive ??
        serverState?.command_protocol_active ??
        normalized?.commandProtocolActive ??
        prev?.commandProtocolActive ??
        "none",
      commandProtocolLastSwapDay:
        serverState?.commandProtocolLastSwapDay ??
        serverState?.command_protocol_last_swap_day ??
        normalized?.commandProtocolLastSwapDay ??
        prev?.commandProtocolLastSwapDay ??
        "",
    });
  }

  async function handleDeployNextSector() {
    await runLockedAction("sectorDeploy", async () => {
      const res = await deployNextBaseSector();
      if (!res?.success) {
        setToast(res?.message || "Sector deploy failed");
        return;
      }
      if (res.state) {
        setState((prev) => mergeAuthoritativeServerState(prev, res.state));
      }
      setToast("Sector deployed. New daily cap is active.");
    });
  }

  function handleDevSectorServerState(serverState) {
    if (!serverState) return;
    setState((prev) => mergeAuthoritativeServerState(prev, serverState));
  }

  async function applyDevSectorWorldOrder(targetOrder) {
    const n = Math.floor(Number(targetOrder));
    if (!Number.isFinite(n) || n < 1 || n > 6) {
      setToast("Invalid sector (1–6)");
      return;
    }
    setDevSectorBusy(true);
    try {
      const res = await devSetBaseSectorWorld(n);
      if (!res?.success) {
        const parts = [res?.code, res?.message, res?.details, res?.rpcMessage].filter(Boolean);
        setToast(parts.length ? parts.join(" — ") : "Dev sector update failed");
        return;
      }
      if (res.state) handleDevSectorServerState(res.state);
      setToast(`DEV: sector_world → ${n} (server)`);
      setDevSectorModalOpen(false);
    } catch (e) {
      console.error("devSetBaseSectorWorld", e);
      setToast("Dev sector request failed");
    } finally {
      setDevSectorBusy(false);
    }
  }

  async function pushPresence({
    interacted = false,
    gameAction = false,
    force = false,
    keepalive = false,
    reason = "passive",
  } = {}) {
    if (typeof document === "undefined") return false;
    if (presenceInFlightRef.current) return false;

    const now = Date.now();

    // UI-precision: only "real UI input" (pointerdown/click/keydown/touchstart) should
    // update `last_interaction_at` via `interacted=true`. Passive/heartbeat/focus stays false.
    const isGameplay = !!gameAction;
    const isUiInteraction = !!interacted && !isGameplay;

    // Passive presence is allowed more frequently than gameplay, but should never update last_interaction_at.
    const minGapPassiveMs = 25_000;
    const minGapUiMs = 20_000; // within your 15-30s requirement
    const minGapGameplayMs = 0;

    const minGapMs = isGameplay ? minGapGameplayMs : isUiInteraction ? minGapUiMs : minGapPassiveMs;
    const gateRef = isUiInteraction ? lastUiInteractionSendRef : lastPresenceSendRef;

    if (!force && now - gateRef.current < minGapMs) return false;

    presenceInFlightRef.current = true;
    try {
      const payload = await sendBasePresence({
        visibilityState: document.visibilityState || (isGameplay ? "visible" : "hidden"),
        pageName: "base",
        interacted: !!interacted,
        gameAction: !!gameAction,
        keepalive: !!keepalive,
      });

      if (payload?.skipped) return false;

      if (!payload?.success) {
        const code = payload?.code || "";
        if (code === "CSRF_UNAVAILABLE" || code === "CSRF_INVALID") return false;
        console.error(`BASE presence push rejected (${reason})`, payload);
        return false;
      }

      // Hydrate local HUB source-of-truth after refresh:
      // server keeps `last_game_action_at` unless this was a real gameplay action.
      const serverPresence = payload?.presence;
      const rawGameActionAt =
        serverPresence?.last_game_action_at ??
        serverPresence?.lastGameActionAt ??
        null;
      const parsedMs =
        typeof rawGameActionAt === "number"
          ? rawGameActionAt
          : rawGameActionAt
            ? new Date(rawGameActionAt).getTime()
            : null;

      if (parsedMs && Number.isFinite(parsedMs) && parsedMs !== lastGameActionAtRef.current) {
        lastGameActionAtRef.current = parsedMs;
        setHubGameplayOnline(computeHubGameplayOnline());
      }

      lastPresenceSendRef.current = now;
      if (isUiInteraction || isGameplay) {
        lastUiInteractionSendRef.current = now;
      }

      return true;
    } catch {
      return false;
    } finally {
      presenceInFlightRef.current = false;
    }
  }

  function computeHubGameplayOnline(now = Date.now()) {
    if (typeof document === "undefined") return false;
    const visible = document.visibilityState === "visible";
    const hasGameAction = lastGameActionAtRef.current > 0;
    const gameRecent = now - lastGameActionAtRef.current <= 5 * 60_000;
    return visible && hasGameAction && gameRecent;
  }

  async function markRealGameAction() {
    if (typeof document === "undefined") return false;
    if (gameActionInFlightRef.current) return false;

    const now = Date.now();
    gameActionInFlightRef.current = true;
    try {
      const payload = await sendBasePresence({
        visibilityState: document.visibilityState || "visible",
        pageName: "base",
        interacted: true,
        gameAction: true,
      });

      if (payload?.skipped) return false;

      if (!payload?.success) {
        const code = payload?.code || "";
        if (code === "CSRF_UNAVAILABLE" || code === "CSRF_INVALID") return false;
        console.error("BASE real game action push rejected", payload);
        return false;
      }

      lastPresenceSendRef.current = now;
      lastGameActionAtRef.current = now;
      setHubGameplayOnline(computeHubGameplayOnline(now));
      return true;
    } catch {
      return false;
    } finally {
      gameActionInFlightRef.current = false;
    }
  }

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;

    const stopHeartbeat = () => {
      if (presenceHeartbeatRef.current) {
        window.clearInterval(presenceHeartbeatRef.current);
        presenceHeartbeatRef.current = null;
      }
    };

    const startHeartbeat = () => {
      stopHeartbeat();
      if (document.visibilityState !== "visible") return;

      presenceHeartbeatRef.current = window.setInterval(() => {
        if (document.visibilityState !== "visible") return;
        void pushPresence({ interacted: false, gameAction: false, reason: "heartbeat" });
      }, 45000);
    };

    const markInteraction = (event) => {
      lastInteractionRef.current = Date.now();
      if (document.visibilityState === "visible") {
        const type = event?.type;
        const reason =
          type === "pointerdown"
            ? "ui_pointerdown"
            : type === "click"
              ? "ui_click"
              : type === "keydown"
                ? "ui_keydown"
                : type === "touchstart"
                  ? "ui_touchstart"
                  : "ui_interaction";

        pushPresence({ interacted: true, gameAction: false, reason });
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void (async () => {
          await pushPresence({ interacted: false, gameAction: false, force: true, reason: "visible" });
          startHeartbeat();
        })();
      } else {
        pushPresence({ interacted: false, gameAction: false, force: true, reason: "hidden" });
        stopHeartbeat();
        setHubGameplayOnline(false);
      }
    };

    const onFocus = () => {
      if (document.visibilityState === "visible") {
        void (async () => {
          await pushPresence({ interacted: false, gameAction: false, force: true, reason: "focus" });
          startHeartbeat();
        })();
      }
    };

    const sendHiddenPresenceIfReady = () => {
      void (async () => {
        const csrfReady = await ensureCsrfToken();
        if (!csrfReady) return;
        await sendBasePresence({
          visibilityState: "hidden",
          pageName: "base",
          interacted: false,
          gameAction: false,
          keepalive: true,
        }).catch(() => {});
      })();
    };

    const onPageHide = () => {
      setHubGameplayOnline(false);
      stopHeartbeat();
      sendHiddenPresenceIfReady();
    };

    const onBeforeUnload = () => {
      setHubGameplayOnline(false);
      stopHeartbeat();
      sendHiddenPresenceIfReady();
    };

    const uiInteractionEvents = ["pointerdown", "click", "keydown", "touchstart"];
 
    uiInteractionEvents.forEach((eventName) => {
      window.addEventListener(eventName, markInteraction, { passive: true });
    });

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);

    if (document.visibilityState === "visible") {
      void (async () => {
        await pushPresence({
          interacted: false,
          gameAction: false,
          force: true,
          reason: "init_visible",
        });
        startHeartbeat();
      })();
    }

    return () => {
      stopHeartbeat();
      uiInteractionEvents.forEach((eventName) => {
        window.removeEventListener(eventName, markInteraction);
      });
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [mounted]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const tick = () => {
      setHubGameplayOnline(computeHubGameplayOnline());
    };

    tick();
    const id = window.setInterval(tick, 5000);
    return () => window.clearInterval(id);
  }, []);

  const mobilePanelScrollRef = useRef(null);
  const desktopPanelScrollRef = useRef(null);
  const prevOpenInnerPanelForScrollRef = useRef(null);

  useLayoutEffect(() => {
    const prev = prevOpenInnerPanelForScrollRef.current;
    prevOpenInnerPanelForScrollRef.current = openInnerPanel;

    if (openInnerPanel == null || openInnerPanel === prev) return;

    runAfterDoubleRaf(() => {
      const headerEl = queryInnerPanelHeaderElement(openInnerPanel);
      if (!headerEl) return;
      const container = resolvePanelScrollContainerForElement(
        headerEl,
        mobilePanel ? mobilePanelScrollRef.current : null,
        desktopPanelOpen ? desktopPanelScrollRef.current : null
      );
      if (container) scrollPanelHeaderIntoView(container, headerEl, { padding: 8 });
    });
  }, [openInnerPanel, mobilePanel, desktopPanelOpen]);

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
    if (item?.world6Target) return item.world6Target;
    if (item?.world5Target) return item.world5Target;
    if (item?.world4Target) return item.world4Target;
    if (item?.world3Target) return item.world3Target;
    if (item?.world2Target) return item.world2Target;

    const key = item?.alertKey || item?.key;

    if (key === "world3-telemetry-noisy" || key === "world3-telemetry-clean") {
      return { tab: "crew", target: "research" };
    }

    if (key === "world6-command-fractured" || key === "world6-command-harmonized") {
      return { tab: "overview", target: "world6-command" };
    }

    if (key === "world5-salvage-strained") {
      return { tab: "operations", target: "maintenance" };
    }
    if (key === "world5-salvage-rich") {
      return { tab: "operations", target: "expedition" };
    }

    if (key === "world4-reactor-strained") {
      return { tab: "operations", target: "maintenance" };
    }
    if (key === "world4-reactor-primed") {
      return { tab: "operations", target: "overclock" };
    }

    switch (key) {
      case "critical-stability":
      case "warning-stability":
      case "low-energy":
      case "ship-pressure":
        return { tab: "operations", target: "maintenance" };

      case "expedition-ready":
      case "expedition":
        return { tab: "operations", target: "expedition-action" };

      case "banked-ready":
        return { tab: "operations", target: "shipping" };

      case "contracts-ready":
      case "contracts":
        return { tab: "overview", target: "contracts" };

      case "world2-freight-pressure":
      case "world2-freight-open":
        return { tab: "operations", target: "shipping" };

      case "missions":
        return { tab: "operations", target: "missions" };

      default:
        return { tab: "overview", target: "alerts" };
    }
  }

  /** Ready-row items in command hub (not `type: "alert"`). */
  function getReadyHubNavigationTarget(item) {
    if (!item || item.type !== "ready") return null;
    switch (item.key) {
      case "contracts":
        return { tab: "overview", target: "contracts" };
      case "missions":
        return { tab: "operations", target: "missions" };
      case "expedition":
        return { tab: "operations", target: "expedition-action" };
      case "shipment":
        return { tab: "operations", target: "shipping" };
      default:
        return null;
    }
  }

  function getCommandHubDeepLink(item) {
    if (!item) return null;
    if (item.type === "ready") {
      const ready = getReadyHubNavigationTarget(item);
      if (ready?.target) return ready;
    }
    return getAlertNavigationTarget(item);
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

  function centerTargetInDesktopPanel(targetEl) {
    const container = desktopPanelScrollRef.current;
    if (!container || !targetEl) return false;

    const containerRect = container.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();
    const currentScrollTop = container.scrollTop;
    const targetTopInsideContainer =
      targetRect.top - containerRect.top + currentScrollTop;
    const targetCenter = targetTopInsideContainer + targetRect.height / 2;
    const visibleAnchor = container.clientHeight * 0.42;
    const nextScrollTop = Math.max(0, targetCenter - visibleAnchor);

    container.scrollTo({
      top: nextScrollTop,
      behavior: "smooth",
    });

    return true;
  }

  function isElementVisible(el) {
    if (!el) return false;
    return el.getClientRects().length > 0;
  }

  function getBestTargetElement(targetForScroll, isMobile) {
    const selector = `[data-base-target="${targetForScroll}"]`;

    if (isMobile) {
      const mobileContainer = mobilePanelScrollRef.current;
      if (mobileContainer) {
        const mobileMatches = Array.from(mobileContainer.querySelectorAll(selector));
        const visibleMobileMatch = mobileMatches.find((el) => isElementVisible(el));
        if (visibleMobileMatch) return visibleMobileMatch;
      }
    } else {
      const desktopContainer = desktopPanelScrollRef.current;
      if (desktopContainer) {
        const desktopMatches = Array.from(desktopContainer.querySelectorAll(selector));
        const visibleDesktopMatch = desktopMatches.find((el) => isElementVisible(el));
        if (visibleDesktopMatch) return visibleDesktopMatch;
      }
    }

    const allMatches = Array.from(document.querySelectorAll(selector));
    const visibleMatch = allMatches.find((el) => isElementVisible(el));
    return visibleMatch || allMatches[0] || null;
  }

  function navigateToBaseTarget(step) {
    if (!step || typeof step !== "object") return;
    const normalizedStep = {
      tab: typeof step.tab === "string" ? step.tab : "overview",
      target: typeof step.target === "string" ? step.target : null,
    };
    if (!normalizedStep.target) return;

    const targetTab =
      normalizedStep.tab === "ops"
        ? "ops"
        : normalizedStep.tab === "operations"
        ? "ops"
        : normalizedStep.tab === "build"
        ? "build"
        : normalizedStep.tab === "development"
        ? "build"
        : normalizedStep.tab === "crew"
        ? "build"
        : normalizedStep.tab === "systems"
        ? "intel"
        : normalizedStep.tab === "intel"
        ? "intel"
        : "overview";

    const targetInnerPanel = (() => {
      if (
        normalizedStep.target === "shipping" ||
        normalizedStep.target === "maintenance" ||
        normalizedStep.target === "overclock" ||
        normalizedStep.target === "expedition" ||
        normalizedStep.target === "expedition-action"
      ) {
        return "ops-console";
      }

      if (normalizedStep.target === "missions") {
        return "ops-missions";
      }

      if (normalizedStep.target === "contracts") {
        return "overview-contracts";
      }

      if (normalizedStep.target === "alerts") {
        return "overview-alerts";
      }

      if (normalizedStep.target === "recommendation") {
        return "overview-recommendation";
      }

      if (
        normalizedStep.target === "quarry" ||
        normalizedStep.target === "tradeHub" ||
        normalizedStep.target === "salvage" ||
        normalizedStep.target === "refinery" ||
        normalizedStep.target === "powerCell" ||
        normalizedStep.target === "hq" ||
        normalizedStep.target === "minerControl" ||
        normalizedStep.target === "arcadeHub" ||
        normalizedStep.target === "expeditionBay" ||
        normalizedStep.target === "logisticsCenter" ||
        normalizedStep.target === "researchLab" ||
        normalizedStep.target === "repairBay"
      ) {
        return "build-structures";
      }

      if (
        normalizedStep.target === "servoDrill" ||
        normalizedStep.target === "vaultCompressor" ||
        normalizedStep.target === "arcadeRelay" ||
        normalizedStep.target === "minerLink" ||
        normalizedStep.target === "coolant" ||
        normalizedStep.target === "routing" ||
        normalizedStep.target === "fieldOps" ||
        normalizedStep.target === "minerSync" ||
        normalizedStep.target === "arcadeOps" ||
        normalizedStep.target === "logistics" ||
        normalizedStep.target === "predictiveMaintenance" ||
        normalizedStep.target === "deepScan" ||
        normalizedStep.target === "tokenDiscipline"
      ) {
        return "build-development";
      }

      if (normalizedStep.target === "research") {
        return "build-development";
      }

      if (normalizedStep.target === "crew" || normalizedStep.target === "paths") {
        return "build-development";
      }

      if (normalizedStep.target === "command-protocol") {
        return "build-development";
      }

      return null;
    })();

    const targetStructuresTab = getStructuresTabForTarget(normalizedStep.target);

    if (normalizedStep.tab === "systems") {
      setOpenInfoKey(null);
      setBuildInfo(getSystemInfo(normalizedStep.target));
    }
    try {
      const isMobile =
        typeof window !== "undefined" &&
        window.matchMedia("(max-width: 767px)").matches;

      if (normalizedStep.target === "crew" || normalizedStep.target === "command-protocol") {
        setDevTab("crew");
      }

      if (normalizedStep.target === "paths") {
        setDevTab("paths");
      }

      if (normalizedStep.target === "research") {
        setDevTab("research");
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

    const attemptFocus = (attempt = 0) => {
      const missionFocusKey =
        normalizedStep.target === "missions"
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

      const targetForScroll = missionFocusKey || normalizedStep.target;
      setHighlightTarget(targetForScroll);

      const isMobile =
        typeof window !== "undefined" &&
        window.matchMedia("(max-width: 767px)").matches;

      const el = getBestTargetElement(targetForScroll, isMobile);
      if (!el) {
        if (attempt < 6) {
          setTimeout(() => attemptFocus(attempt + 1), 140);
        }
        return;
      }

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
        centerTargetInDesktopPanel(el);
      }
    };

    setTimeout(() => attemptFocus(0), 280);

    if (highlightTimeoutRef.current) {
      window.clearTimeout(highlightTimeoutRef.current);
    }
    const highlightDurationMs =
      normalizedStep.target === "expedition" ||
      normalizedStep.target === "expedition-action" ||
      normalizedStep.target === "world6-command"
        ? 6200
        : 4200;
    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightTarget(null);
    }, highlightDurationMs);
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

  function getInfoMainSource(tips) {
    if (!tips) return [];
    return normalizeInfoTipItems(tips.building || tips.research || tips.module || tips.operation);
  }

  function getInfoBestSupport(tips) {
    if (!tips) return [];
    return [
      ...normalizeInfoTipItems(tips.supportBuildings),
      ...normalizeInfoTipItems(tips.supportResearch),
      ...normalizeInfoTipItems(tips.research),
      ...normalizeInfoTipItems(tips.module),
      ...normalizeInfoTipItems(tips.operation),
    ].filter(Boolean);
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

  function renderInfoFloatingPanel() {
    if (!shownInfo) return null;

    const subtitle =
      shownInfo?.focus ? (
        <div className="text-[15px] leading-7 text-cyan-100/90">
          <span className="text-white/60 font-semibold">Focus:</span> {shownInfo.focus}
        </div>
      ) : null;

    const headerRight = infoUpgradeBuildingKey ? (
      <button
        type="button"
        onClick={() => openHomeFlowTarget(infoUpgradeBuildingKey)}
        className="h-10 min-h-10 rounded-full border border-cyan-400/45 bg-cyan-500/12 px-4 text-sm font-semibold leading-none inline-flex items-center justify-center text-cyan-100 hover:bg-cyan-500/15"
      >
        UPGRADE
      </button>
    ) : null;

    return (
      <DesktopFloatingPanelShell
        eyebrow="MLEO BASE INFO"
        title={shownInfo.title}
        subtitle={subtitle}
        subtitleFullWidth
        headerRight={headerRight}
        onClose={() => {
          setOpenInfoKey(null);
          setBuildInfo(null);
        }}
      >
        <div className="bg-transparent border-0 rounded-none shadow-none backdrop-blur-0 p-5">
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-cyan-200/70">
            What it does
          </div>
          <div className="whitespace-pre-line text-sm leading-7 text-white/80">
            {shownInfo.text}
          </div>

          {hasInfoTipContent(shownInfo?.tips) ? (
            <div className="mt-4 border-t border-white/10 pt-4">
              <div className="grid gap-2 text-sm text-white/78">
                {renderInfoTipRow("Main source", getInfoMainSource(shownInfo?.tips))}
                {renderInfoTipRow("Best support", getInfoBestSupport(shownInfo?.tips))}
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
                  Best next upgrade
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
      </DesktopFloatingPanelShell>
    );
  }

  function acknowledgeHarmonizedCommandWindowAlertFromItem(item) {
    if (item?.alertKey === "world6-command-harmonized") {
      setHarmonizedCommandWindowAlertAcked(true);
    }
  }

  function handleCommandHubItemClick(item) {
    acknowledgeHarmonizedCommandWindowAlertFromItem(item);
    const step = getCommandHubDeepLink(item);
    if (!step?.target) return;
    setShowReadyPanel(false);
    navigateToBaseTarget(step);
  }

  useEffect(() => {
    if (
      openInfoKey ||
      showHowToPlay ||
      mobileMenuOpen ||
      showReadyPanel ||
      desktopPanelOpen ||
      mobilePanel
    ) {
      setShowBankedPanel(false);
    }
  }, [
    openInfoKey,
    showHowToPlay,
    mobileMenuOpen,
    showReadyPanel,
    desktopPanelOpen,
    mobilePanel,
  ]);

  useEffect(() => {
    let alive = true;

    async function boot() {
      try {
        const seed = freshState();
        const serverRes = await getBaseState();
        const saved = serverRes?.state || null;
        if (serverRes?.eliteRotation) {
          setEliteRotation(serverRes.eliteRotation);
        }

        // Only explicit reset flag should force a fresh client seed now.
        // Starter resources are server-authoritative.
        const resetFlag =
          typeof window !== "undefined"
            ? window.localStorage.getItem("base_reset_flag") === "true"
            : false;
        const shouldReset = resetFlag;

        const initial =
          saved && !shouldReset
            ? sanitizeBaseState(normalizeServerState(saved, seed), seed)
            : sanitizeBaseState(seed, seed);

        const initialMerged = initial;

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
    if (typeof window === "undefined") return;
    window.localStorage.removeItem("mleo_base_profile_v1");
    window.localStorage.removeItem("mleo_base_claimed_contracts_v1");
    window.localStorage.removeItem("mleo_starter_claimed");
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

        if (res?.eliteRotation) {
          setEliteRotation(res.eliteRotation);
        }
        setState((prev) => mergeAuthoritativeServerState(prev, serverState));
      } catch (error) {
        console.error("BASE refresh failed", error);
      }
    }

    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        refreshFromServer();
      }
    }, 12000);

    const onFocus = () => {
      if (document.visibilityState === "visible") {
        refreshFromServer();
      }
    };

    const onStorage = async (event) => {
      if (event.key === "mleo_rush_core_v4" || event.key === "mleoMiningEconomy_v2.1") {
        const bal = await readVaultSafe();
        if (bal != null) setSharedVault(bal);
      }
    };

    const pollId = window.setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const bal = await readVaultSafe();
      if (!Number.isFinite(bal) || bal < 0) return;
      setSharedVault((prev) => (Math.abs(prev - bal) > 1e-6 ? bal : prev));
    }, 12000);

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
  const activeWorldOrder = useMemo(() => resolveSectorWorldOrder(state), [state]);

  const worldMapTheme = useMemo(() => getWorldMapTheme(activeWorldOrder), [activeWorldOrder]);

  const worldPlayfieldBackground = useMemo(
    () => getWorldPlayfieldCanvasBackground(activeWorldOrder, "desktop"),
    [activeWorldOrder]
  );
  const worldPlayfieldBackgroundMobile = useMemo(
    () => getWorldPlayfieldCanvasBackground(activeWorldOrder, "mobile"),
    [activeWorldOrder]
  );
  const internalPanelTone = useMemo(
    () => getBaseInternalPanelTone(activeWorldOrder),
    [activeWorldOrder]
  );

  const world2Throughput = useMemo(() => {
    if (activeWorldOrder !== 2) return null;
    return getWorld2ThroughputSnapshot(state, derived);
  }, [activeWorldOrder, state, derived]);

  const world2FreightAlert = useMemo(
    () => buildWorld2FreightAlert(world2Throughput),
    [world2Throughput]
  );

  const world3Telemetry = useMemo(() => {
    if (activeWorldOrder !== 3) return null;
    return getWorld3TelemetrySnapshot(state, derived);
  }, [activeWorldOrder, state, derived]);

  const world3TelemetryAlert = useMemo(
    () => buildWorld3TelemetryAlert(world3Telemetry),
    [world3Telemetry]
  );

  const world4Reactor = useMemo(() => {
    if (activeWorldOrder !== 4) return null;
    return getWorld4ReactorSnapshot(state, derived);
  }, [activeWorldOrder, state, derived]);

  const world4ReactorAlert = useMemo(
    () => buildWorld4ReactorAlert(world4Reactor),
    [world4Reactor]
  );

  const world5Salvage = useMemo(() => {
    if (activeWorldOrder !== 5) return null;
    return getWorld5SalvagePressureSnapshot(state, derived);
  }, [activeWorldOrder, state, derived]);

  const world5SalvageAlert = useMemo(
    () => buildWorld5SalvageAlert(world5Salvage),
    [world5Salvage]
  );

  const world6Command = useMemo(() => {
    if (activeWorldOrder !== 6) return null;
    return getWorld6CommandSnapshot(state, derived);
  }, [activeWorldOrder, state, derived]);

  useEffect(() => {
    const inHarmonizedPushWindow = Boolean(
      activeWorldOrder === 6 &&
        world6Command &&
        world6Command.commandKey === "harmonized" &&
        world6Command.recommendedPushNow
    );
    if (prevHarmonizedPushWindowRef.current && !inHarmonizedPushWindow) {
      setHarmonizedCommandWindowAlertAcked(false);
    }
    prevHarmonizedPushWindowRef.current = inHarmonizedPushWindow;
  }, [activeWorldOrder, world6Command]);

  const world6CommandAlert = useMemo(
    () => buildWorld6CommandAlert(world6Command),
    [world6Command]
  );

  const world6CommandAlertForHub = useMemo(() => {
    if (!world6CommandAlert) return null;
    if (
      world6CommandAlert.key === "world6-command-harmonized" &&
      harmonizedCommandWindowAlertAcked
    ) {
      return null;
    }
    return world6CommandAlert;
  }, [world6CommandAlert, harmonizedCommandWindowAlertAcked]);

  /** Compact header badge: catalog name + optional live state label from world snapshots (2–6). */
  const baseWorldHeaderIdentity = useMemo(() => {
    const order = activeWorldOrder;
    const meta = WORLD_BY_ORDER[order];
    const displayName = meta?.name || "Sector";
    const primaryLine = `WORLD ${order} · ${displayName.toUpperCase()}`;
    const compactLine = `W${order} · ${displayName}`;
    let stateChip = null;
    if (order === 2 && world2Throughput) stateChip = world2Throughput.laneLabel;
    else if (order === 3 && world3Telemetry) stateChip = world3Telemetry.signalLabel;
    else if (order === 4 && world4Reactor) stateChip = world4Reactor.loadLabel;
    else if (order === 5 && world5Salvage) stateChip = world5Salvage.salvageLabel;
    else if (order === 6 && world6Command) stateChip = world6Command.commandLabel;
    return { primaryLine, compactLine, stateChip };
  }, [
    activeWorldOrder,
    world2Throughput,
    world3Telemetry,
    world4Reactor,
    world5Salvage,
    world6Command,
  ]);

  const sectorWorldSnapshot = useMemo(
    () =>
      getSectorWorldProgressSnapshot(state, derived, {
        supportProgramCatalog: SUPPORT_PROGRAM_CATALOG,
      }),
    [state, derived]
  );
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

  const commandProtocolUi = useMemo(() => {
    const day = todayKey();
    const lastSwap = String(state.commandProtocolLastSwapDay || "").trim();
    const swappedToday = lastSwap === day && lastSwap.length > 0;
    const storedId = normalizeCommandProtocolId(state.commandProtocolActive);
    const effectiveId = resolveEffectiveCommandProtocol(state);
    const canSwapToday = !swappedToday;
    const rows = PHASE_1A_COMMAND_PROTOCOLS.map((p) => ({
      ...p,
      locked: !isCommandProtocolUnlocked(p.id, state.commanderLevel),
      selected: storedId === p.id,
    }));
    return {
      rows,
      effectiveId,
      storedId,
      canSwapToday,
      swappedToday,
      commanderLevel: state.commanderLevel,
    };
  }, [
    state.commandProtocolActive,
    state.commandProtocolLastSwapDay,
    state.commanderLevel,
  ]);

  /** Phase 1D: passive header strip (derive-only; no new server state). */
  const commandProtocolSurface = useMemo(() => {
    const effectiveId = commandProtocolUi.effectiveId;
    const storedId = commandProtocolUi.storedId;
    const def = PHASE_1A_COMMAND_PROTOCOLS.find((p) => p.id === effectiveId);
    const name = def?.name || "Standard Posture";
    const family = effectiveId === "none" ? null : def?.family || null;
    const mismatch = storedId !== effectiveId && storedId !== "none";
    return { effectiveId, name, family, mismatch };
  }, [commandProtocolUi.effectiveId, commandProtocolUi.storedId]);

  /** Header doctrine chip: below sm, one compact line to avoid triple-label truncation in a narrow pill. */
  const commandProtocolMobileChipLine = useMemo(() => {
    const { effectiveId, mismatch } = commandProtocolSurface;
    if (mismatch) return "DOC · Hold";
    if (effectiveId === "none") return "DOC · Baseline";
    const tail = {
      steady_ops: "Steady",
      liquidity_drill: "Gold+",
      signal_focus: "DATA+",
      gold_over_watch: "Gold OW",
      data_over_watch: "DATA OW",
    }[effectiveId];
    return tail ? `DOC · ${tail}` : `DOC · ${commandProtocolSurface.name}`;
  }, [commandProtocolSurface]);

  const contractClaimedMap = useMemo(
    () => state?.contractState?.claimed || state?.contract_state?.claimed || {},
    [state?.contractState, state?.contract_state]
  );

  const liveContracts = useMemo(() => {
    const dayKey = String(eliteRotation?.dayKey || "");
    const offerKeys = new Set(eliteRotation?.offerTemplateKeys || []);

    const base = LIVE_CONTRACTS.filter((contract) =>
      typeof contract.visible === "function" ? contract.visible(state, derived) : true
    ).map((contract) => {
      const contractClass = contract.contractClass || "basic";
      const isLane2PreviewScope = contractClass === "basic";
      const previewReward = isLane2PreviewScope
        ? getLane2ScaledPreviewReward(contract.reward, state?.buildings?.hq)
        : contract.reward;

      return {
        ...contract,
        contractClass,
        rewardText: isLane2PreviewScope ? `Reward: ${rewardText(previewReward)}` : contract.rewardText,
        done: contract.check(state, derived),
        claimed: !!contractClaimedMap[contract.key],
        advancedTierPill:
          contract.contractClass === "advanced" && contract.requiresTier && contract.supportBuilding
            ? `T${contract.requiresTier} ${SUPPORT_BUILDING_CONTRACT_SHORT[contract.supportBuilding] || ""}`.trim()
            : null,
        advancedProgramPill:
          contract.contractClass === "advanced" && contract.requiresProgram && contract.supportBuilding
            ? `Program: ${supportProgramLabelForContract(contract.supportBuilding, contract.requiresProgram)}`
            : null,
      };
    });

    const eliteRows =
      dayKey && offerKeys.size
        ? ELITE_ROTATING_CONTRACTS.filter((c) => offerKeys.has(c.key))
            .filter((c) => (typeof c.visible === "function" ? c.visible(state, derived) : true))
            .map((c) => {
              const runtimeKey = getEliteRuntimeContractKey(c.key, dayKey);
              return {
                ...c,
                templateKey: c.key,
                key: runtimeKey,
                contractClass: "elite",
                done: c.check(state, derived),
                claimed: !!contractClaimedMap[runtimeKey],
                eliteTierPill:
                  c.minTier && c.supportBuilding
                    ? `T${c.minTier} ${SUPPORT_BUILDING_CONTRACT_SHORT[c.supportBuilding] || ""}`.trim()
                    : null,
                eliteProgramPill:
                  c.requiredProgram && c.supportBuilding
                    ? `Program: ${supportProgramLabelForContract(c.supportBuilding, c.requiredProgram)}`
                    : null,
              };
            })
        : [];

    return [...base, ...eliteRows];
  }, [state, derived, contractClaimedMap, eliteRotation]);

  const specializationSummary = useMemo(() => {
    const SUPPORT_ORDER = ["logisticsCenter", "researchLab", "repairBay"];
    const buildings = SUPPORT_ORDER.map((buildingKey) => {
      const def = BUILDINGS.find((b) => b.key === buildingKey);
      const buildingName = def?.name || buildingKey;
      const level = Math.max(0, Math.floor(Number(state?.buildings?.[buildingKey] || 0)));
      const tier = getBuildingTier(state, buildingKey);
      const activeProgramKey = level >= 1 ? getActiveSupportProgram(state, buildingKey) : null;
      const activeProgramLabel = activeProgramKey
        ? SUPPORT_PROGRAM_CATALOG[buildingKey]?.find((p) => p.key === activeProgramKey)?.label ||
          activeProgramKey
        : null;

      const mKeys = SPECIALIZATION_MILESTONES_BY_BUILDING[buildingKey] || [];
      const bucket = state?.specializationMilestonesClaimed?.[buildingKey] || {};
      let claimedMilestones = 0;
      let claimableMilestones = 0;
      for (const mk of mKeys) {
        if (bucket[mk]) claimedMilestones += 1;
        const prev = getSpecializationMilestonePreview(state, derived, buildingKey, mk);
        if (prev.done && !prev.claimed) claimableMilestones += 1;
      }

      const firstClaimableKey = mKeys.find((mk) => {
        const p = getSpecializationMilestonePreview(state, derived, buildingKey, mk);
        return p.done && !p.claimed;
      });
      const firstUnclaimedKey = mKeys.find((mk) => !bucket[mk]);
      let nextMilestoneLabel = "—";
      let nextActionText = "No milestone actions";
      if (firstClaimableKey) {
        nextMilestoneLabel = SPECIALIZATION_MILESTONE_META[firstClaimableKey]?.label || firstClaimableKey;
        nextActionText = `Claim ${nextMilestoneLabel}`;
      } else if (firstUnclaimedKey) {
        nextMilestoneLabel =
          SPECIALIZATION_MILESTONE_META[firstUnclaimedKey]?.label || firstUnclaimedKey;
        nextActionText = `Progress ${nextMilestoneLabel}`;
      } else if (mKeys.length) {
        nextMilestoneLabel = "All claimed";
        nextActionText = "Milestones complete";
      }

      const advContracts = liveContracts.filter(
        (c) => c.contractClass === "advanced" && c.supportBuilding === buildingKey
      );
      const advancedContractsVisible = advContracts.length;
      const advancedContractsReady = advContracts.filter((c) => c.done && !c.claimed).length;
      const readyItemsCount = claimableMilestones + advancedContractsReady;

      return {
        buildingKey,
        buildingName,
        level,
        tier,
        activeProgramKey,
        activeProgramLabel,
        claimedMilestones,
        totalMilestones: mKeys.length,
        claimableMilestones,
        advancedContractsVisible,
        advancedContractsReady,
        nextMilestoneLabel,
        nextActionText,
        readyItemsCount,
      };
    });

    let supportBuildingsTier2Plus = 0;
    let totalUnlockedPrograms = 0;
    let totalActivePrograms = 0;
    let totalClaimedMilestones = 0;
    let totalMilestoneSlots = 0;

    for (const row of buildings) {
      if (row.level >= 1 && row.tier >= 2) supportBuildingsTier2Plus += 1;
      if (row.level >= 1 && row.activeProgramKey) totalActivePrograms += 1;
      totalClaimedMilestones += row.claimedMilestones;
      totalMilestoneSlots += row.totalMilestones;
      const programs = getSupportPrograms(row.buildingKey);
      for (const p of programs) {
        if (isSupportProgramUnlocked(state, row.buildingKey, p.key)) totalUnlockedPrograms += 1;
      }
    }

    const advancedOnly = liveContracts.filter((c) => c.contractClass === "advanced");
    const totalVisibleAdvancedContracts = advancedOnly.length;
    const totalReadyAdvancedContracts = advancedOnly.filter((c) => c.done && !c.claimed).length;
    const totalClaimableMilestones = countClaimableSpecializationMilestones(state, derived);

    const nav = (buildingKey) => ({ tab: "build", target: buildingKey });

    const firstReadyAdv = liveContracts.find(
      (c) => c.contractClass === "advanced" && c.done && !c.claimed
    );
    if (firstReadyAdv) {
      return {
        buildings,
        totals: {
          supportBuildingsTier2Plus,
          totalUnlockedPrograms,
          totalActivePrograms,
          totalClaimedMilestones,
          totalMilestoneSlots,
          totalClaimableMilestones,
          totalVisibleAdvancedContracts,
          totalReadyAdvancedContracts,
        },
        topRecommendation: {
          text: `Claim ${firstReadyAdv.title} contract`,
          navigateTarget: nav(firstReadyAdv.supportBuilding),
          focusBuildingKey: firstReadyAdv.supportBuilding,
        },
      };
    }

    for (const row of buildings) {
      if (row.claimableMilestones > 0) {
        const mk = (SPECIALIZATION_MILESTONES_BY_BUILDING[row.buildingKey] || []).find((k) => {
          const p = getSpecializationMilestonePreview(state, derived, row.buildingKey, k);
          return p.done && !p.claimed;
        });
        const label = mk ? SPECIALIZATION_MILESTONE_META[mk]?.label || mk : "milestone";
        return {
          buildings,
          totals: {
            supportBuildingsTier2Plus,
            totalUnlockedPrograms,
            totalActivePrograms,
            totalClaimedMilestones,
            totalMilestoneSlots,
            totalClaimableMilestones,
            totalVisibleAdvancedContracts,
            totalReadyAdvancedContracts,
          },
          topRecommendation: {
            text: `Claim ${label} milestone`,
            navigateTarget: nav(row.buildingKey),
            focusBuildingKey: row.buildingKey,
          },
        };
      }
    }

    for (const row of buildings) {
      if (row.level < 1) {
        return {
          buildings,
          totals: {
            supportBuildingsTier2Plus,
            totalUnlockedPrograms,
            totalActivePrograms,
            totalClaimedMilestones,
            totalMilestoneSlots,
            totalClaimableMilestones,
            totalVisibleAdvancedContracts,
            totalReadyAdvancedContracts,
          },
          topRecommendation: {
            text: `Build ${row.buildingName} to unlock specialization`,
            navigateTarget: nav(row.buildingKey),
            focusBuildingKey: row.buildingKey,
          },
        };
      }
    }

    for (const row of buildings) {
      if (row.level >= 1 && row.tier < 2) {
        return {
          buildings,
          totals: {
            supportBuildingsTier2Plus,
            totalUnlockedPrograms,
            totalActivePrograms,
            totalClaimedMilestones,
            totalMilestoneSlots,
            totalClaimableMilestones,
            totalVisibleAdvancedContracts,
            totalReadyAdvancedContracts,
          },
          topRecommendation: {
            text: `Advance ${row.buildingName} to T2`,
            navigateTarget: nav(row.buildingKey),
            focusBuildingKey: row.buildingKey,
          },
        };
      }
    }

    for (const row of buildings) {
      if (row.level < 1) continue;
      const programs = getSupportPrograms(row.buildingKey);
      const nextUnlock = programs.find(
        (p) =>
          row.tier >= p.minTier &&
          !isSupportProgramUnlocked(state, row.buildingKey, p.key)
      );
      if (nextUnlock) {
        return {
          buildings,
          totals: {
            supportBuildingsTier2Plus,
            totalUnlockedPrograms,
            totalActivePrograms,
            totalClaimedMilestones,
            totalMilestoneSlots,
            totalClaimableMilestones,
            totalVisibleAdvancedContracts,
            totalReadyAdvancedContracts,
          },
          topRecommendation: {
            text: canUnlockSupportProgram(state, row.buildingKey, nextUnlock)
              ? `Unlock ${nextUnlock.label}`
              : `Work toward unlocking ${nextUnlock.label}`,
            navigateTarget: nav(row.buildingKey),
            focusBuildingKey: row.buildingKey,
          },
        };
      }
    }

    for (const row of buildings) {
      if (row.level < 1) continue;
      const programs = getSupportPrograms(row.buildingKey);
      const anyUnlocked = programs.some((p) => isSupportProgramUnlocked(state, row.buildingKey, p.key));
      if (anyUnlocked && !row.activeProgramKey) {
        return {
          buildings,
          totals: {
            supportBuildingsTier2Plus,
            totalUnlockedPrograms,
            totalActivePrograms,
            totalClaimedMilestones,
            totalMilestoneSlots,
            totalClaimableMilestones,
            totalVisibleAdvancedContracts,
            totalReadyAdvancedContracts,
          },
          topRecommendation: {
            text: `Activate a support program at ${row.buildingName}`,
            navigateTarget: nav(row.buildingKey),
            focusBuildingKey: row.buildingKey,
          },
        };
      }
    }

    return {
      buildings,
      totals: {
        supportBuildingsTier2Plus,
        totalUnlockedPrograms,
        totalActivePrograms,
        totalClaimedMilestones,
        totalMilestoneSlots,
        totalClaimableMilestones,
        totalVisibleAdvancedContracts,
        totalReadyAdvancedContracts,
      },
      topRecommendation: {
        text: "Specialization on track — finish contracts and milestones when ready",
        navigateTarget: null,
        focusBuildingKey: null,
      },
    };
  }, [state, derived, liveContracts]);

  const missionProgress = useMemo(() => getMissionProgress(state), [state]);

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

    const claimableSpecMilestones = countClaimableSpecializationMilestones(state, derived);

    return {
      expedition: expeditionReadyNow ? 1 : 0,
      contracts: claimableContractsCount,
      missions: claimableMissionsCount,
      specializationMilestones: claimableSpecMilestones,
      shipment: 0,
      total:
        (expeditionReadyNow ? 1 : 0) +
        claimableContractsCount +
        claimableMissionsCount +
        claimableSpecMilestones,
    };
  }, [state, derived, liveContracts, missionProgress]);

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

  const canShipNow = Number(state.bankedMleo || 0) >= SHIP_READY_BANKED_THRESHOLD;
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
  const maintenanceCost = { GOLD: 42, SCRAP: 22, DATA: 4 };

  const operationsReadyCount =
    Number(canExpeditionNow) +
    Number(canShipNow);

  const expeditionLeft = Math.max(0, (state.expeditionReadyAt || 0) - Date.now());
  const overclockLeft = Math.max(0, (state.overclockUntil || 0) - Date.now());
  const refillAtCap = Number(state.resources?.ENERGY || 0) >= Number(derived.energyCap || 0) - 1;
  const hasOverclockResources = Number(state.resources?.DATA || 0) >= 12;
  const hasRefillResources = Number(state.resources?.DATA || 0) >= 5;
  const hasMaintenanceResources = hasResources(state.resources, maintenanceCost);
  const overclockStatusLabel = overclockLeft > 0
    ? "Cooldown"
    : isActionLocked("overclock")
    ? "Unavailable"
    : !hasOverclockResources
    ? "Insufficient resources"
    : "";
  const refillStatusLabel = isActionLocked("refill")
    ? "Unavailable"
    : refillAtCap
    ? "Unavailable"
    : !hasRefillResources
    ? "Insufficient resources"
    : "";
  const maintainStatusLabel = isActionLocked("maintenance")
    ? "Unavailable"
    : !hasMaintenanceResources
    ? "Insufficient resources"
    : "";
  const alerts = useMemo(
    () =>
      getAlerts(
        state,
        derived,
        systemState,
        liveContracts,
        world2FreightAlert,
        world3TelemetryAlert,
        world4ReactorAlert,
        world5SalvageAlert,
        world6CommandAlertForHub
      ),
    [
      state,
      derived,
      systemState,
      liveContracts,
      world2FreightAlert,
      world3TelemetryAlert,
      world4ReactorAlert,
      world5SalvageAlert,
      world6CommandAlertForHub,
    ]
  );
  const desktopPriorityAlert = alerts[0] || null;

  const showExpeditions = (state.buildings?.hq || 0) >= 2;
  const showCrew = (state.buildings?.hq || 0) >= 3;
  const showAdvancedResearch = (state.blueprintLevel || 0) >= 1 || (state.buildings?.hq || 0) >= 3;

  const commandHubItems = useMemo(() => {
    const items = [];

    alerts.forEach((alert) => {
      // getAlerts also emits expedition-ready; command hub adds a counted "Start expedition" row — keep only that one.
      if (
        alert.key === "expedition-ready" &&
        showExpeditions &&
        readyCounts.expedition > 0
      ) {
        return;
      }
      items.push({
        key: `alert-${alert.key}`,
        type: "alert",
        tone: alert.tone || "info",
        alertKey: alert.key,
        title: alert.title,
        text: alert.text,
        count: 0,
        ...(alert.world2Target ? { world2Target: alert.world2Target } : {}),
        ...(alert.world3Target ? { world3Target: alert.world3Target } : {}),
        ...(alert.world4Target ? { world4Target: alert.world4Target } : {}),
        ...(alert.world5Target ? { world5Target: alert.world5Target } : {}),
        ...(alert.world6Target ? { world6Target: alert.world6Target } : {}),
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

    if (readyCounts.specializationMilestones > 0) {
      items.push({
        key: "specialization-milestones",
        type: "ready",
        tone: "success",
        title: "Specialization milestone ready",
        text: `${readyCounts.specializationMilestones} specialization milestone${
          readyCounts.specializationMilestones > 1 ? "s are" : " is"
        } ready to claim.`,
        count: readyCounts.specializationMilestones,
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
        title: "Start expedition",
        text: "You can launch an expedition now from Operations Console.",
        count: readyCounts.expedition,
      });
    }

    return items;
  }, [alerts, readyCounts, showExpeditions]);

  const primaryCommandItem = commandHubItems[0] || null;
  const commandHubCount = commandHubItems.length;

  /** Primary strip: open the alerts/actions list; navigation happens when the player picks an item inside the panel. */
  function handleCommandHubBarClick() {
    if (commandHubCount <= 0) return;
    setShowReadyPanel(true);
  }

  const desktopPrimaryTitle = primaryCommandItem?.title || "Base is stable";
  const desktopPrimaryTitleClass =
    desktopPrimaryTitle.length > 26
      ? "text-[13px] md:text-sm"
      : desktopPrimaryTitle.length >= 18
      ? "text-sm"
      : "text-sm md:text-[15px]";

  const nextStep = useMemo(
    () => getNextStep(state, derived, systemState, liveContracts, specializationSummary),
    [state, derived, systemState, liveContracts, specializationSummary]
  );

  const bankedSnapshot = useMemo(
    () => getBankedRateSnapshot(state, derived),
    [state, derived]
  );

  const bankedGuidanceItems = useMemo(
    () =>
      getBankedGuidanceItems({
        state,
        derived,
        snapshot: bankedSnapshot,
        systemState,
      }),
    [state, derived, bankedSnapshot, systemState]
  );

  const bankedSummary = useMemo(
    () => getBankedSummaryFromItems(bankedGuidanceItems),
    [bankedGuidanceItems]
  );

  const bankedLiveRatePerSecond = Number(bankedSnapshot?.perSecond || 0);
  const bankedLiveActive =
    Boolean(bankedSnapshot?.active) &&
    bankedLiveRatePerSecond > 0;

  useEffect(() => {
    bankedDisplayValueRef.current = Number(bankedDisplayValue || 0);
  }, [bankedDisplayValue]);

  useEffect(() => {
    if (!mounted) return;
    const serverValue = Number(state.bankedMleo || 0);
    let storedValue = 0;
    try {
      const raw = window.localStorage.getItem(bankedDisplayStorageKey);
      const parsed = Number(raw || 0);
      if (Number.isFinite(parsed) && parsed > 0) storedValue = parsed;
    } catch {}

    const initial = Math.max(serverValue, storedValue);
    bankedDisplayValueRef.current = initial;
    setBankedDisplayValue(initial);
  }, [mounted, bankedDisplayStorageKey]);

  useEffect(() => {
    if (!mounted) return undefined;

    let rafId = null;
    let lastCommit = 0;

    const tick = () => {
      const now = Date.now();
      if (now - lastCommit >= 120) {
        lastCommit = now;
        setBankedDisplayNow(now);
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      if (rafId != null) window.cancelAnimationFrame(rafId);
    };
  }, [mounted]);

  useEffect(() => {
    const currentDisplay = Number(bankedDisplayValueRef.current || 0);
    const serverValue = Number(state.bankedMleo || 0);
    const prevServerValue = Number(bankedServerValueRef.current || 0);
    const VISUAL_LAG_COINS = 6;
    const PREVIEW_AHEAD_CAP = 6;
    const STEP_SECONDS = 0.12;
    const RATE_DAMPING = 0.65;

    // Legitimate reduction event (shipping/reset/etc): allow controlled downward convergence.
    const hasServerReduction = serverValue + 0.0005 < prevServerValue;
    const reductionMagnitude = prevServerValue - serverValue;
    const allowDownward =
      hasServerReduction && (reductionMagnitude >= 1 || serverValue <= 0.01);

    let nextDisplay = currentDisplay;
    const floorTarget = Math.max(0, serverValue - VISUAL_LAG_COINS);

    // Keep display close to truth from below; never stick far behind.
    if (nextDisplay < floorTarget) {
      const catchUp = floorTarget - nextDisplay;
      nextDisplay += catchUp * 0.3;
      if (Math.abs(nextDisplay - floorTarget) < 0.005) nextDisplay = floorTarget;
    }

    // Live visual movement only while real mining is active.
    if (bankedLiveActive) {
      const effectiveRate = Math.max(0, bankedLiveRatePerSecond * RATE_DAMPING);
      nextDisplay += effectiveRate * STEP_SECONDS;
      nextDisplay = Math.min(nextDisplay, serverValue + PREVIEW_AHEAD_CAP);
    }

    if (allowDownward && nextDisplay > serverValue) {
      nextDisplay = nextDisplay + (serverValue - nextDisplay) * 0.35;
      if (Math.abs(nextDisplay - serverValue) < 0.005) nextDisplay = serverValue;
    } else if (!allowDownward) {
      nextDisplay = Math.max(nextDisplay, currentDisplay);
    }

    bankedServerValueRef.current = serverValue;
    bankedDisplayValueRef.current = nextDisplay;
    setBankedDisplayValue(nextDisplay);

    try {
      window.localStorage.setItem(bankedDisplayStorageKey, String(nextDisplay));
    } catch {}
  }, [
    bankedDisplayNow,
    bankedLiveActive,
    bankedLiveRatePerSecond,
    state.bankedMleo,
    bankedDisplayStorageKey,
  ]);

  const rawOverview = useMemo(
    () =>
      buildOverviewV2({
        state,
        derived,
        systemState,
        liveContracts,
        readyCounts,
        missionProgress,
        canShipNow,
        canExpeditionNow,
        bankedSnapshot,
      }),
    [
      state,
      derived,
      systemState,
      liveContracts,
      readyCounts,
      missionProgress,
      canShipNow,
      canExpeditionNow,
      bankedSnapshot,
    ]
  );

  useEffect(() => {
    if (!rawOverview?.bottleneck?.key || !rawOverview?.nextAction?.key) return;
    const now = Date.now();

    setOverviewGuidanceState((prev) => {
      if (!prev?.bottleneckKey) {
        return {
          bottleneckKey: rawOverview.bottleneck.key,
          actionKey: rawOverview.nextAction.key,
          lockedUntil: now + OVERVIEW_LOCK_MS,
          lastUpdatedAt: now,
          lockedBottleneck: rawOverview.bottleneck,
          lockedAction: rawOverview.nextAction,
        };
      }

      const currentKey = prev.bottleneckKey;
      const nextKey = rawOverview.bottleneck.key;

      if (nextKey === currentKey) {
        const actionChanged = rawOverview.nextAction.key !== prev.actionKey;
        const canUpdateAction = now >= Number(prev.lockedUntil || 0);
        const didUpdateAction = actionChanged && canUpdateAction;

        if (!didUpdateAction) {
          return prev;
        }

        return {
          ...prev,
          actionKey: rawOverview.nextAction.key,
          lockedAction: rawOverview.nextAction,
          lockedUntil: now + OVERVIEW_LOCK_MS,
          lastUpdatedAt: now,
        };
      }

      const shouldSwitchNow =
        isCriticalOverviewBottleneck(nextKey) ||
        isHigherPriorityBottleneck(nextKey, currentKey) ||
        isOverviewBottleneckClearlyResolved(currentKey, {
          state,
          derived,
          systemState,
          bankedSnapshot,
        }) ||
        now >= Number(prev.lockedUntil || 0);

      if (!shouldSwitchNow) return prev;

      return {
        bottleneckKey: rawOverview.bottleneck.key,
        actionKey: rawOverview.nextAction.key,
        lockedUntil: now + OVERVIEW_LOCK_MS,
        lastUpdatedAt: now,
        lockedBottleneck: rawOverview.bottleneck,
        lockedAction: rawOverview.nextAction,
      };
    });
  }, [rawOverview, state, derived, systemState, bankedSnapshot]);

  const overview = useMemo(() => {
    if (!overviewGuidanceState?.lockedBottleneck || !overviewGuidanceState?.lockedAction) {
      return rawOverview;
    }
    return {
      ...rawOverview,
      bottleneck: overviewGuidanceState.lockedBottleneck,
      nextAction: overviewGuidanceState.lockedAction,
    };
  }, [rawOverview, overviewGuidanceState]);

  /** Phase 1E: single quiet Overview strip; gated to avoid stacking over world / stress signals. */
  const commandProtocolOverviewDoctrineHint = useMemo(() => {
    const effectiveId = commandProtocolUi.effectiveId;
    const storedId = commandProtocolUi.storedId;
    const mismatch = storedId !== effectiveId && storedId !== "none";

    const worldFlavorHint = Boolean(sectorWorldSnapshot?.panelFlavor?.overviewHint);
    const world6SystemsHint = Boolean(world6Command?.overviewSystemsHint);
    if (worldFlavorHint || world6SystemsHint) return null;

    if (mismatch) {
      return COMMAND_PROTOCOL_STORED_INACTIVE_OVERVIEW;
    }

    if (effectiveId === "none") return null;

    if (rawOverview?.recoveryHint) return null;

    const baseTone = overview?.baseStatus?.tone;
    const bnTone = overview?.bottleneck?.tone;
    if (baseTone !== "success") return null;
    if (bnTone === "warning" || bnTone === "critical") return null;

    return COMMAND_PROTOCOL_DOCTRINE_CONTEXT_OVERVIEW[effectiveId] || null;
  }, [
    commandProtocolUi.effectiveId,
    commandProtocolUi.storedId,
    overview?.baseStatus?.tone,
    overview?.bottleneck?.tone,
    rawOverview?.recoveryHint,
    sectorWorldSnapshot?.panelFlavor?.overviewHint,
    world6Command?.overviewSystemsHint,
  ]);

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

  const buildOpportunitiesCount =
    availableStructuresCount +
    availableModulesCount +
    availableResearchCount;

  const developmentAvailableCount =
    availableModulesCount + availableResearchCount;

  const structuresAvailableCount = availableStructuresCount;

  const availableExpansionStructuresCount = useMemo(() => {
    return BUILDINGS.filter((def) => {
      if (!STRUCTURES_TAB_B.includes(def.key)) return false;
      const level = Number(state.buildings?.[def.key] || 0);
      const cost = buildingCost(def, level);
      return unlocked(def, state) && canCoverCost(state.resources, cost);
    }).length;
  }, [state.buildings, state.resources]);

  const availableCoreStructuresCount = useMemo(() => {
    return BUILDINGS.filter((def) => {
      if (!STRUCTURES_TAB_A.includes(def.key)) return false;
      const level = Number(state.buildings?.[def.key] || 0);
      const cost = buildingCost(def, level);
      return unlocked(def, state) && canCoverCost(state.resources, cost);
    }).length;
  }, [state.buildings, state.resources]);

  const developmentModulesMissionReadyCount = useMemo(() => {
    return DAILY_MISSIONS.filter((mission) => {
      const progress = missionProgress[mission.key] || 0;
      const done = progress >= mission.target;
      const claimed = !!state.missionState?.claimed?.[mission.key];
      if (!done || claimed) return false;
      return getMissionGuidance(mission.key)?.devSubtab === "modules";
    }).length;
  }, [missionProgress, state.missionState]);

  const developmentResearchMissionReadyCount = useMemo(() => {
    return DAILY_MISSIONS.filter((mission) => {
      const progress = missionProgress[mission.key] || 0;
      const done = progress >= mission.target;
      const claimed = !!state.missionState?.claimed?.[mission.key];
      if (!done || claimed) return false;
      return getMissionGuidance(mission.key)?.devSubtab === "research";
    }).length;
  }, [missionProgress, state.missionState]);

  const structuresCoreMissionReadyCount = useMemo(() => {
    return DAILY_MISSIONS.filter((mission) => {
      const progress = missionProgress[mission.key] || 0;
      const done = progress >= mission.target;
      const claimed = !!state.missionState?.claimed?.[mission.key];
      if (!done || claimed) return false;
      const zone = getMissionStructureSubtab(mission.key);
      return zone === "core" || zone === "both";
    }).length;
  }, [missionProgress, state.missionState]);

  const structuresExpansionMissionReadyCount = useMemo(() => {
    return DAILY_MISSIONS.filter((mission) => {
      const progress = missionProgress[mission.key] || 0;
      const done = progress >= mission.target;
      const claimed = !!state.missionState?.claimed?.[mission.key];
      if (!done || claimed) return false;
      const zone = getMissionStructureSubtab(mission.key);
      return zone === "expansion" || zone === "both";
    }).length;
  }, [missionProgress, state.missionState]);

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

  const liveContractsAvailableCount = readyCounts.contracts;
  const availableBlueprintCount = Number(canBuyBlueprintNow);

  const showToast = (message) => setToast(message);
  const withBottleneckNote = (message, notesByKey = {}) => {
    const key = overview?.bottleneck?.key;
    const note = key ? notesByKey[key] : null;
    return note ? `${message} · ${note}` : message;
  };

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

  const handleCrewRoleChange = async (roleKey) => {
    if (roleKey === crewRole) return;

    return runLockedAction(`profile:crew:${roleKey}`, async () => {
      try {
        const res = await setBaseProfile({ crew_role: roleKey });

        if (!res?.success || !res?.state) {
          showToast(res?.message || "Failed to save crew role");
          return;
        }

        setState((prev) => mergeAuthoritativeServerState(prev, res.state));
        markRealGameAction();
        showToast(`Crew role: ${crewRoleMeta(roleKey).name}`);
      } catch (error) {
        console.error("Crew role update failed", error);
        showToast(error?.message || "Crew role update failed");
      }
    });
  };

  const handleCommanderPathChange = async (pathKey) => {
    if (pathKey === commanderPath) return;

    return runLockedAction(`profile:path:${pathKey}`, async () => {
      try {
        const res = await setBaseProfile({ commander_path: pathKey });

        if (!res?.success || !res?.state) {
          showToast(res?.message || "Failed to save commander path");
          return;
        }

        setState((prev) => mergeAuthoritativeServerState(prev, res.state));
        markRealGameAction();
        showToast(`Commander path: ${commanderPathMeta(pathKey).name}`);
      } catch (error) {
        console.error("Commander path update failed", error);
        showToast(error?.message || "Commander path update failed");
      }
    });
  };

  const handleSetCommandProtocol = async (protocolId) => {
    const next = normalizeCommandProtocolId(protocolId);
    const cur = normalizeCommandProtocolId(state.commandProtocolActive);
    if (next === cur) return;

    return runLockedAction(`commandProtocol:${next}`, async () => {
      try {
        const res = await setCommandProtocol({ protocol_id: next });

        if (!res?.success || !res?.state) {
          showToast(res?.message || "Protocol update failed");
          return;
        }

        setState((prev) => mergeAuthoritativeServerState(prev, res.state));
        markRealGameAction();
        const label =
          PHASE_1A_COMMAND_PROTOCOLS.find((p) => p.id === next)?.name || next;
        showToast(`Stored protocol: ${label}`);
      } catch (error) {
        console.error("Command protocol update failed", error);
        showToast(error?.message || "Protocol update failed");
      }
    });
  };

  const claimContract = async (key) => {
    return runLockedAction(`contract:${key}`, async () => {
      try {
        const res = await claimBaseContract(key);

        if (!res?.success || !res?.state) {
          showToast(res?.message || "Contract claim failed");
          return;
        }

        setState((prev) => mergeAuthoritativeServerState(prev, res.state));
        markRealGameAction();
        showToast("Contract claimed · rewards added");
      } catch (error) {
        console.error("Contract claim failed", error);
        showToast(error?.message || "Contract claim failed");
      }
    });
  };

  const buyBuilding = async (key) => {
    if (activeBuildKey === key || isActionLocked(`build:${key}`)) return;
    setActiveBuildKey(key);
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
          const next = mergeAuthoritativeServerState(prev, res.state);

          next.log = pushLog(
            next.log,
            `${def.name} upgraded to level ${res.new_level || level + 1}.`
          );
          return next;
        });

        // Mark gameplay online only after server accepted the real action.
        markRealGameAction();

        showToast(
          withBottleneckNote(`${def.name} upgraded · output improved`, {
            "energy-collapse": "Energy pressure eased",
            "stability-drag": "Main pressure reduced",
            "ore-limited": "Resource flow improved",
            "scrap-limited": "Resource flow improved",
            "weak-output": "Main pressure reduced",
          })
        );
      } else {
        if (res?.code === "RATE_LIMIT_DEVICE") {
          showToast("Too many taps detected. Please wait a moment and try again.");
        } else if (res?.code === "BASE_BUILDING_TIER_REQUIRED") {
          setTierPromptKey(key);
          showToast("Tier advancement available · upgrade to the next tier to continue.");
          return;
        } else {
          showToast(res?.message || "Build failed.");
        }
      }
    } catch (error) {
      console.error("Build failed", error);
      showToast(error?.message || "Build action failed.");
    } finally {
      setActiveBuildKey((prev) => (prev === key ? null : prev));
    }
  });
  };

  const handleAdvanceTier = async (key) => {
    if (!isTierBuilding(key)) return;
    if (activeTierKey === key || isActionLocked(`tier:${key}`)) return;

    setActiveTierKey(key);

    return runLockedAction(`tier:${key}`, async () => {
      try {
        const def = BUILDINGS.find((item) => item.key === key);
        if (!def) return;

        const currentTier = getBuildingTier(state, key);
        const previewCost = getTierAdvancePreviewCost(key, currentTier);

        if (!previewCost || !canCoverCost(state.resources, previewCost)) {
          showToast("Not enough resources for tier advancement.");
          return;
        }

        try {
          const res = await advanceBuildingTier(key);

          if (res?.success && res?.state) {
            setState((prev) => {
              const next = mergeAuthoritativeServerState(prev, res.state);
              next.log = pushLog(
                next.log,
                `${def.name} advanced to Tier ${res.new_tier}. Level reset to ${res.new_level}.`
              );
              return next;
            });

            setTierPromptKey((prev) => (prev === key ? null : prev));
            markRealGameAction();

            showToast(`${def.name} advanced to T${res.new_tier}.`);
          } else {
            if (res?.code === "BASE_INSUFFICIENT_RESOURCES") {
              showToast("Not enough resources for tier advancement.");
            } else if (res?.code === "BASE_TIER_MAX") {
              showToast("This building is already at maximum tier.");
              setTierPromptKey((prev) => (prev === key ? null : prev));
            } else if (res?.code === "RATE_LIMIT_DEVICE") {
              showToast("Too many taps detected. Please wait a moment and try again.");
            } else {
              showToast(res?.message || "Tier advancement failed.");
            }
          }
        } catch (error) {
          console.error("Tier advancement failed", error);
          showToast(error?.message || "Tier advancement failed.");
        }
      } finally {
        setActiveTierKey((prev) => (prev === key ? null : prev));
      }
    });
  };

  const handleUnlockSupportProgram = async (buildingKey, programKey) => {
    const lockId = `prog-unlock:${buildingKey}:${programKey}`;
    if (isActionLocked(lockId)) return;
    const busyKey = `${buildingKey}:${programKey}:unlock`;
    return runLockedAction(lockId, async () => {
      setActiveProgramUnlockKey(busyKey);
      try {
        const res = await unlockSupportProgram(buildingKey, programKey);
        const label =
          SUPPORT_PROGRAM_CATALOG[buildingKey]?.find((p) => p.key === programKey)?.label ||
          programKey;
        if (res?.success && res?.state) {
          setState((prev) => mergeAuthoritativeServerState(prev, res.state));
          markRealGameAction();
          showToast(`${label} unlocked.`);
        } else {
          const code = res?.code || "";
          if (code === "BASE_SUPPORT_PROGRAM_TIER_REQUIRED") {
            showToast("Tier too low for this program.");
          } else if (code === "BASE_SUPPORT_PROGRAM_ALREADY_UNLOCKED") {
            showToast("Program already unlocked.");
          } else if (code === "BASE_INSUFFICIENT_RESOURCES") {
            showToast("Not enough resources to unlock.");
          } else if (code === "RATE_LIMIT_DEVICE") {
            showToast("Too many taps detected. Please wait a moment and try again.");
          } else {
            showToast(res?.message || "Could not unlock program.");
          }
        }
      } catch (error) {
        console.error("unlockSupportProgram failed", error);
        showToast(error?.message || "Unlock failed.");
      } finally {
        setActiveProgramUnlockKey((prev) => (prev === busyKey ? null : prev));
      }
    });
  };

  const handleSetSupportProgram = async (buildingKey, programKey) => {
    const lockId = `prog-set:${buildingKey}:${programKey}`;
    if (isActionLocked(lockId)) return;
    const busyKey = `${buildingKey}:${programKey}:set`;
    return runLockedAction(lockId, async () => {
      setActiveProgramSetKey(busyKey);
      try {
        const res = await setSupportProgram(buildingKey, programKey);
        if (res?.success && res?.state) {
          setState((prev) => mergeAuthoritativeServerState(prev, res.state));
          markRealGameAction();
          showToast("Active program updated.");
        } else {
          const code = res?.code || "";
          if (code === "BASE_SUPPORT_PROGRAM_NOT_UNLOCKED") {
            showToast("Unlock this program first.");
          } else if (code === "RATE_LIMIT_DEVICE") {
            showToast("Too many taps detected. Please wait a moment and try again.");
          } else {
            showToast(res?.message || "Could not set active program.");
          }
        }
      } catch (error) {
        console.error("setSupportProgram failed", error);
        showToast(error?.message || "Set program failed.");
      } finally {
        setActiveProgramSetKey((prev) => (prev === busyKey ? null : prev));
      }
    });
  };

  const handleClaimSpecializationMilestone = async (buildingKey, milestoneKey) => {
    const lockId = `spec-milestone:${buildingKey}:${milestoneKey}`;
    if (isActionLocked(lockId)) return;
    const busyKey = `${buildingKey}:${milestoneKey}`;
    return runLockedAction(lockId, async () => {
      setActiveMilestoneClaimKey(busyKey);
      try {
        const res = await claimSpecializationMilestone(buildingKey, milestoneKey);
        const label = SPECIALIZATION_MILESTONE_META[milestoneKey]?.label || milestoneKey;
        if (res?.success && res?.state) {
          setState((prev) => {
            const merged = mergeAuthoritativeServerState(prev, res.state);
            return {
              ...merged,
              log: pushLog(merged.log, `Specialization milestone: ${label} claimed.`),
            };
          });
          markRealGameAction();
          showToast(`${label} claimed. +70 Commander XP`);
        } else {
          const code = res?.code || "";
          if (code === "BASE_SPECIALIZATION_MILESTONE_ALREADY_CLAIMED") {
            showToast("Milestone already claimed.");
          } else if (code === "BASE_SPECIALIZATION_MILESTONE_NOT_READY") {
            showToast("Milestone requirements not met yet.");
          } else if (code === "RATE_LIMIT_DEVICE") {
            showToast("Too many taps detected. Please wait a moment and try again.");
          } else {
            showToast(res?.message || "Could not claim milestone.");
          }
        }
      } catch (error) {
        console.error("claimSpecializationMilestone failed", error);
        showToast(error?.message || "Claim failed.");
      } finally {
        setActiveMilestoneClaimKey((prev) => (prev === busyKey ? null : prev));
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
            const next = mergeAuthoritativeServerState(prev, res.state);
            next.log = pushLog(next.log, `${def.name} power set to ${nextMode}%.`);
            return next;
          });

          showToast(`${def.name} power set to ${nextMode}%.`);
          markRealGameAction();
        } else {
          showToast(res?.message || "Power mode update failed.");
        }
      } catch (error) {
        console.error("Power mode update failed", error);
        showToast(error?.message || "Power mode update failed.");
    }
  });
  };

  const SAFE_MODE_PRESET = {
    quarry: 50,
    tradeHub: 50,
    salvage: 50,
    refinery: 50,
    minerControl: 50,
    arcadeHub: 50,
    logisticsCenter: 50,
    researchLab: 50,
    repairBay: 100,
  };

  const NORMAL_MODE_PRESET = {
    quarry: 100,
    tradeHub: 100,
    salvage: 100,
    refinery: 100,
    minerControl: 100,
    arcadeHub: 100,
    logisticsCenter: 100,
    researchLab: 100,
    repairBay: 100,
  };

  const powerPresetActive = useMemo(
    () => getActivePowerPreset(state, SAFE_MODE_PRESET, NORMAL_MODE_PRESET),
    [state.buildings, state.buildingPowerModes]
  );

  const applyPowerPreset = async (presetKey, presetMap) => {
    return runLockedAction(`powerPreset:${presetKey}`, async () => {
      try {
        let lastServerState = null;
        let changed = 0;
        // Merge server state after each step so the next building uses fresh power modes.
        let working = state;

        for (const [buildingKey, targetMode] of Object.entries(presetMap)) {
          if (!canThrottleBuilding(buildingKey)) continue;
          if ((working.buildings?.[buildingKey] || 0) <= 0) continue;

          const currentMode = getBuildingPowerMode(working, buildingKey);
          if (currentMode === targetMode) continue;

          const res = await setBuildingPowerMode(buildingKey, targetMode);
          if (!res?.success || !res?.state) {
            if (changed > 0) {
              setState((prev) => mergeAuthoritativeServerState(prev, working));
            }
            showToast(res?.message || `${buildingKey} power preset failed.`);
            return;
          }

          working = mergeAuthoritativeServerState(working, res.state);
          lastServerState = res.state;
          changed += 1;
        }

        if (!changed) {
          const hasRuntime = Object.keys(presetMap).some(
            (k) => canThrottleBuilding(k) && (state.buildings?.[k] || 0) > 0
          );
          showToast(
            !hasRuntime
              ? "Build at least one production building (Quarry, Trade Hub, etc.) to use power presets."
              : presetKey === "safe"
              ? "Safe preset already matches your current power modes."
              : "Normal 100% already matches your current power modes."
          );
          return;
        }

        if (lastServerState) {
          setState((prev) => {
            const next = mergeAuthoritativeServerState(prev, lastServerState);
            next.log = pushLog(
              next.log,
              presetKey === "safe"
                ? "Safe Mode engaged. Runtime buildings throttled while manual controls remain available."
                : "Runtime buildings restored to 100%."
            );
            return next;
          });
          markRealGameAction();
        }

        showToast(
          presetKey === "safe"
            ? "Safe Mode engaged."
            : "Runtime buildings restored to 100%."
        );
      } catch (error) {
        console.error("Power preset failed", error);
        showToast(error?.message || "Power preset failed.");
      }
    });
  };

  const applySafeModePreset = async () => applyPowerPreset("safe", SAFE_MODE_PRESET);
  const applyNormalModePreset = async () => applyPowerPreset("normal", NORMAL_MODE_PRESET);

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
          const next = mergeAuthoritativeServerState(prev, res.state);

          next.log = pushLog(
            next.log,
            `Crew hired. Team size is now ${res.new_crew || prev.crew + 1}.`
          );
          return next;
        });

        markRealGameAction();

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
          const next = mergeAuthoritativeServerState(prev, res.state);

          next.log = pushLog(next.log, `${moduleDef.name} installed.`);
          return next;
        });

        markRealGameAction();

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
        const telemetrySuffix = world3Telemetry
          ? ` [${world3Telemetry.signalLabel} · ${world3Telemetry.disciplineScore}/100]`
          : "";

        setState((prev) => {
          const next = mergeAuthoritativeServerState(prev, res.state);

          next.log = pushLog(
            next.log,
            `${def.name} research completed.${telemetrySuffix}`
          );
          return next;
        });

        markRealGameAction();

        const researchToastBase = world3Telemetry
          ? `Research updated · ${world3Telemetry.signalLabel} · ${world3Telemetry.disciplineScore}/100`
          : `${def.name} research completed.`;

        showToast(researchToastBase);
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
        const xpGain = Number(res?.xp_gain || 0);

        const salvageSuffix = world5Salvage
          ? ` [${world5Salvage.salvageLabel} · ${world5Salvage.disciplineScore}/100]`
          : "";

        setState((prev) => {
          const next = mergeAuthoritativeServerState(prev, serverState);
          next.log = pushLog(
            next.log,
            `Expedition (${expeditionMode}) returned with ${loot.ore || 0} ORE, ${
              loot.gold || 0
            } GOLD, ${loot.scrap || 0} SCRAP, ${loot.data || 0} DATA${
              loot.bankedMleo ? ` and ${loot.bankedMleo} MLEO` : ""
            }.${salvageSuffix}`
          );
          if (expeditionToastNonceRef.current !== now) {
            expeditionToastNonceRef.current = now;

            const oreGain = Number(loot?.ore || 0);
            const goldGain = Number(loot?.gold || 0);
            const scrapGain = Number(loot?.scrap || 0);
            const dataGain = Number(loot?.data || 0);
            const bankedGain = Number(loot?.bankedMleo || 0);

            const rewardParts = [];
            if (oreGain > 0) rewardParts.push(`+${fmt(oreGain)} ORE`);
            if (goldGain > 0) rewardParts.push(`+${fmt(goldGain)} GOLD`);
            if (scrapGain > 0) rewardParts.push(`+${fmt(scrapGain)} SCRAP`);
            if (dataGain > 0) rewardParts.push(`+${fmt(dataGain)} DATA`);
            if (bankedGain > 0) rewardParts.push(`+${fmt(bankedGain)} MLEO (banked)`);
            if (xpGain > 0) rewardParts.push(`+${fmt(xpGain)} XP`);

            const breakdown = rewardParts.length ? ` · ${rewardParts.join(" · ")}` : "";
            const salvageToastTail = world5Salvage
              ? ` · ${world5Salvage.salvageLabel} · ${world5Salvage.disciplineScore}/100`
              : "";

            showToast(
              rewardParts.length
                ? `Expedition complete · field gains secured${breakdown}${salvageToastTail}`
                : world5Salvage
                  ? `${res?.message || "Expedition completed."}${salvageToastTail}`
                  : res?.message || "Expedition completed."
            );
          }
          return next;
        });

        // Mark gameplay online only after server accepted the real action.
        markRealGameAction();
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
        const bonusAmount = 0;

        setState((prev) => {
          const next = mergeAuthoritativeServerState(prev, serverState);
          const laneSuffix = world2Throughput
            ? ` [${world2Throughput.laneLabel} · ${world2Throughput.disciplineScore}/100]`
            : "";

          next.log = pushLog(
            next.log,
            `Shipped ${fmt(shippedBase)} MLEO to shared vault.${laneSuffix}`
          );
          return next;
        });

        markRealGameAction();
        setNextShipBonus(0);

        const shipToastBase = world2Throughput
          ? `Shipment complete · ${world2Throughput.laneLabel} · ${world2Throughput.disciplineScore}/100`
          : "Shipment complete · banked MLEO sent to shared vault";

        showToast(
          withBottleneckNote(shipToastBase, {
            "ship-cap": "Daily production headroom improved",
          })
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
          const next = mergeAuthoritativeServerState(prev, serverState);
          next.log = pushLog(next.log, "Blueprint cache purchased.");
          return next;
        });
        markRealGameAction();
        showToast("Blueprint upgraded. Banking efficiency improved.");
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
        const overclockSuffix = world4Reactor
          ? ` [${world4Reactor.loadLabel} · ${world4Reactor.disciplineScore}/100]`
          : "";
        setState((prev) => {
          const next = mergeAuthoritativeServerState(prev, serverState);
          next.log = pushLog(next.log, `Overclock engaged.${overclockSuffix}`);
          return next;
        });
        markRealGameAction();
        const overclockToastBase = world4Reactor
          ? `Overclock engaged · ${world4Reactor.loadLabel} · ${world4Reactor.disciplineScore}/100`
          : "Overclock engaged. Base output is temporarily boosted.";
        showToast(overclockToastBase);
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
          const next = mergeAuthoritativeServerState(prev, serverState);
          next.log = pushLog(next.log, "Energy refilled.");
          return next;
        });
        markRealGameAction();
        showToast(
          withBottleneckNote("Recovery complete · energy reserves restored", {
            "energy-collapse": "Energy pressure eased",
          })
        );
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
    const cost = { GOLD: 42, SCRAP: 22, DATA: 4 };

    if (!hasResources(state.resources, cost)) {
      showToast("Need GOLD, SCRAP and DATA for maintenance.");
      return;
    }

    try {
      const res = await performMaintenanceAction();
      if (res?.success && res?.state) {
        const serverState = res.state;
        const maintenanceSuffix = world4Reactor
          ? ` [${world4Reactor.loadLabel} · ${world4Reactor.disciplineScore}/100]`
          : "";
        setState((prev) => {
          const next = mergeAuthoritativeServerState(prev, serverState);
          next.log = pushLog(
            next.log,
            `Maintenance completed. Base stability improved.${maintenanceSuffix}`
          );
          return next;
        });

        markRealGameAction();

        if (world4Reactor) {
          showToast(
            `Maintenance complete · ${world4Reactor.loadLabel} · ${world4Reactor.disciplineScore}/100`
          );
        } else {
          showToast(
            withBottleneckNote("Maintenance complete · stability pressure reduced", {
              "stability-drag": "Main pressure reduced",
              "energy-collapse": "Main pressure reduced",
            })
          );
        }
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
        return mergeAuthoritativeServerState(prev, serverState);
      });

      markRealGameAction();

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
        return "+3% bank bonus";
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
        return "+4% bank bonus";
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

  const openMissionInfoByKey = (key) => {
    const mission = DAILY_MISSIONS.find((m) => m.key === key);
    if (!mission) return;
    setBuildInfo(getMissionInfo(mission));
    setOpenInfoKey(null);
  };

  const dailyMissionsVM = [...DAILY_MISSIONS].sort((a, b) => {
    const aProgress = missionProgress[a.key] || 0;
    const aDone = aProgress >= a.target;
    const aClaimed = !!state.missionState?.claimed?.[a.key];
    const aReady = aDone && !aClaimed ? 1 : 0;

    const bProgress = missionProgress[b.key] || 0;
    const bDone = bProgress >= b.target;
    const bClaimed = !!state.missionState?.claimed?.[b.key];
    const bReady = bDone && !bClaimed ? 1 : 0;

    if (bReady !== aReady) return bReady - aReady;
    return getMissionGuidancePriority(a.key) - getMissionGuidancePriority(b.key);
  }).map((mission) => {
    const progress = missionProgress[mission.key] || 0;
    const done = progress >= mission.target;
    const claimed = !!state.missionState?.claimed?.[mission.key];
    const ready = done && !claimed;

    const guidance = getMissionGuidance(mission.key);
    const previewReward = getLane2ScaledPreviewReward(mission.reward, state?.buildings?.hq);

    return {
      key: mission.key,
      name: guidance?.shortTitle || mission.name,
      progress,
      target: mission.target,
      progressText: fmt(progress),
      targetText: fmt(mission.target),
      rewardText: rewardText(previewReward),
      quickTags: getMissionQuickTags(mission.key),
      helpText: guidance?.helperLine || null,
      guidance,
      done,
      claimed,
      ready,
      highlighted: highlightTarget === mission.key,
    };
  });

  const missionGuidanceFocus = useMemo(() => {
    const list = Array.isArray(dailyMissionsVM) ? dailyMissionsVM : [];
    if (!list.length) return null;
    const readyMission = list.find((m) => m.ready);
    const activeMission = list.find((m) => !m.claimed);
    const pick = readyMission || activeMission;
    if (!pick) return null;

    return {
      title: pick.name,
      hint: pick.guidance?.bestActionHint || pick.helpText || "Keep mission pacing aligned with base health.",
      target: pick.guidance?.target || null,
      cta: pick.ready ? "Open missions" : "Focus mission",
    };
  }, [dailyMissionsVM]);

  const dailyMissionsContent = (
    <DailyMissionsPanel
      panelTone={internalPanelTone}
      missions={dailyMissionsVM}
      onClaimMission={claimMission}
      onOpenMissionInfo={openMissionInfoByKey}
    />
  );

  const compactResourceBar = (
    <BaseResourceBar
      resources={state.resources}
      energy={state.resources?.ENERGY || 0}
      energyCap={derived.energyCap || 140}
      bankedMleo={state.bankedMleo || 0}
      compact
      showBanked={false}
    />
  );

  const mobileCompactResourceBar = (
    <BaseResourceBar
      resources={state.resources}
      energy={state.resources?.ENERGY || 0}
      energyCap={derived.energyCap || 140}
      bankedMleo={state.bankedMleo || 0}
      compact
      showBanked={false}
      swapOreScrap
    />
  );

  // Used by Desktop "ops-console" inner panel.
  // Keep it presentation-only: the action handlers already contain the real game/server logic.
  const operationsConsoleContent = (
    <OperationsConsolePanel
      panelTone={internalPanelTone}
      showExpeditions={showExpeditions}
      highlightRingClass="ring-2 ring-cyan-300/90 border-cyan-300 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(103,232,249,0.45),0_0_28px_rgba(34,211,238,0.18)]"
      shipping={{
        highlighted: isHighlightedTarget("shipping", highlightTarget),
        highlightClass: highlightCard((state.bankedMleo || 0) >= 120, "success") || "",
        canShipNow,
        bankedMleoText: fmt(state.bankedMleo || 0),
        onOpenInfo: () => {
          setBuildInfo(getOperationsInfo("shipping"));
          setOpenInfoKey(null);
        },
        onShip: bankToSharedVault,
        freightHint:
          world2Throughput != null ? (
            <span className="mt-1 block text-[11px] text-white/65">{world2Throughput.shippingCardHint}</span>
          ) : null,
      }}
      expedition={{
        highlighted:
          isHighlightedTarget("expedition", highlightTarget) ||
          isHighlightedTarget("expedition-action", highlightTarget),
        highlightClass:
          highlightCard(expeditionLeft <= 0 && (state.resources.DATA || 0) >= 4, "info") || "",
        buttonHighlighted: isHighlightedTarget("expedition-action", highlightTarget),
        canExpeditionNow,
        buttonText:
          expeditionLeft > 0
            ? `Expedition ${Math.ceil(expeditionLeft / 1000)}s`
            : "Start Expedition",
        onOpenInfo: () => {
          setBuildInfo(getOperationsInfo("expedition"));
          setOpenInfoKey(null);
        },
        onLaunch: handleLaunchExpedition,
        expeditionHint:
          world5Salvage != null ? (
            <span className="mt-1 block text-[11px] text-white/65">{world5Salvage.expeditionCardHint}</span>
          ) : null,
      }}
      blueprint={{
        highlighted: false, // Blueprint card didn't have ring highlight in the original code.
        highlightClass: highlightCard(canBuyBlueprintNow, "info") || "",
        canBuy: canBuyBlueprintNow,
        costText: fmt(blueprintCost),
        dataCostText: fmt(blueprintDataCost),
        buttonText: `Buy Blueprint Lv ${state.blueprintLevel + 1}`,
        onOpenInfo: () => {
          setBuildInfo(getSystemInfo("blueprint"));
          setOpenInfoKey(null);
        },
        onBuy: buyBlueprint,
      }}
      maintenance={{
        highlighted: isHighlightedTarget("maintenance", highlightTarget),
        highlightOverclock: isHighlightedTarget("overclock", highlightTarget),
        highlightClass:
          systemState === "critical"
            ? highlightCard(true, "critical")
            : systemState === "warning"
            ? highlightCard(true, "warning")
            : "",
        systemState,
        stabilityText: fmt(state.stability),
        onOpenRefillInfo: () => {
          setBuildInfo(getOperationsInfo("refill"));
          setOpenInfoKey(null);
        },
        onOpenMaintenanceInfo: () => {
          setBuildInfo(getOperationsInfo("maintenance"));
          setOpenInfoKey(null);
        },
        onOverclock: activateOverclock,
        onSafeMode: applySafeModePreset,
        onNormalMode: applyNormalModePreset,
        powerPresetActive,
        safeModeButtonText: "Safe 50%",
        normalModeButtonText: "Normal 100%",
        overclockButtonText:
          overclockLeft > 0
            ? `Overclock ${Math.ceil(overclockLeft / 1000)}s`
            : `Overclock ${fmt(CONFIG.overclockCost)}`,
        overclockVisualDisabled: !!overclockStatusLabel,
        overclockStatusLabel,
        onRefill: refillEnergy,
        refillButtonText: `Refill ${fmt(CONFIG.refillCost)}`,
        refillVisualDisabled: !!refillStatusLabel,
        refillStatusLabel,
        onMaintain: performMaintenance,
        maintainVisualDisabled: !!maintainStatusLabel,
        maintainStatusLabel,
        overclockHint:
          world4Reactor != null ? (
            <span className="mt-1 block text-[11px] text-white/65">{world4Reactor.overclockCardHint}</span>
          ) : null,
        maintenanceHint:
          world4Reactor != null || world5Salvage != null ? (
            <>
              {world4Reactor != null ? (
                <span className="mt-1 block text-[11px] text-white/65">
                  {world4Reactor.maintenanceThermalHint}
                </span>
              ) : null}
              {world5Salvage != null ? (
                <span className="mt-1 block text-[11px] text-white/65">
                  {world5Salvage.maintenanceSalvageHint}
                </span>
              ) : null}
            </>
          ) : null,
      }}
    />
  );

  const operationsConsoleContentMobile = (
    <>
      {world5Salvage ? (
        <div
          className={`mb-3 rounded-2xl border px-3 py-2.5 ${worldSalvageToneClass(
            world5Salvage.salvageKey
          )}`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-[0.16em] opacity-75">
                Salvage Graveyard
              </div>
              <div className="truncate text-sm font-semibold">
                {world5Salvage.salvageLabel} · {world5Salvage.disciplineScore}/100
              </div>
            </div>
            <div className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-bold">
              {world5Salvage.recommendedSalvageNow ? "PUSH" : "HOLD"}
            </div>
          </div>

          <div className="mt-2 text-[11px] opacity-80">{world5Salvage.priority}</div>
        </div>
      ) : null}
      {world4Reactor ? (
        <div
          className={`mb-3 rounded-2xl border px-3 py-2.5 ${worldReactorToneClass(
            world4Reactor.loadKey
          )}`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-[0.16em] opacity-75">
                Reactor Scar
              </div>
              <div className="truncate text-sm font-semibold">
                {world4Reactor.loadLabel} · {world4Reactor.disciplineScore}/100
              </div>
            </div>
            <div className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-bold">
              {world4Reactor.recommendedOverclockNow ? "PUSH" : "HOLD"}
            </div>
          </div>

          <div className="mt-2 text-[11px] opacity-80">{world4Reactor.priority}</div>
        </div>
      ) : null}
      {world2Throughput ? (
        <div
          className={`mb-3 rounded-2xl border px-3 py-2.5 ${worldLaneToneClass(
            world2Throughput.laneKey
          )}`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-[0.16em] opacity-75">
                Freight Orbit
              </div>
              <div className="truncate text-sm font-semibold">
                {world2Throughput.laneLabel} · {world2Throughput.disciplineScore}/100
              </div>
            </div>
            <div className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-bold">
              {world2Throughput.recommendedShipNow ? "SHIP" : "HOLD"}
            </div>
          </div>

          <div className="mt-2 text-[11px] opacity-80">{world2Throughput.priority}</div>
        </div>
      ) : null}
      {operationsConsoleContent}
    </>
  );

  const crewModulesResearchContent = (
    <CrewModulesResearchPanel
      telemetryHint={world3Telemetry ? world3Telemetry.researchPanelHint : null}
      devTab={devTab}
      onSetDevTab={setDevTab}
      modulesMissionReadyCount={developmentModulesMissionReadyCount}
      researchMissionReadyCount={developmentResearchMissionReadyCount}
      modulesAvailableCount={availableModulesCount}
      researchAvailableCount={availableResearchCount}
      resources={state.resources}
      highlightTarget={highlightTarget}
      crewTab={{
        workerCount: state.crew,
        globalBonusText: (state.research.fieldOps ? 3 : 2) * state.crew,
        hireDisabled: !canCoverCost(state.resources, workerNextCost),
        workerNextCost,
        roles: CREW_ROLES.map((role) => ({
          key: role.key,
          name: role.name,
          desc: role.desc,
          active: crewRole === role.key,
          quickTags: getCrewRoleQuickTags(role.key),
          statLine: getCrewRoleStatLine(role.key),
          hint: getCrewRoleHint(role.key),
        })),
        paths: COMMANDER_PATHS.map((path) => ({
          key: path.key,
          name: path.name,
          desc: path.desc,
          active: commanderPath === path.key,
          quickTags: getCommanderPathQuickTags(path.key),
          statLine: getCommanderPathStatLine(path.key),
          hint: getCommanderPathHint(path.key),
        })),
      }}
      modules={MODULES.map((module) => {
        const owned = !!state.modules[module.key];
        const canAfford = canCoverCost(state.resources, module.cost);
        const available = !owned && canAfford;

        const helpText =
          module.key === "servoDrill"
            ? "Use when Ore is slowing upgrades."
            : module.key === "vaultCompressor"
            ? "Best once shipping is already active."
            : module.key === "arcadeRelay"
            ? "Best for mission / expedition focused play."
            : module.key === "minerLink"
            ? "Great before pushing Refinery too hard."
            : "";

        return {
          key: module.key,
          name: module.name,
          desc: module.desc,
          quickTags: getModuleQuickTags(module.key),
          helpText,
          cost: module.cost,
          owned,
          canAfford,
          available,
        };
      })}
      research={RESEARCH.map((item) => {
        const done = !!state.research[item.key];
        const locked = item.requires?.some((key) => !state.research[key]);
        const canAfford = canCoverCost(state.resources, item.cost);
        const available = !done && !locked && canAfford;

        const helpText =
          item.key === "coolant"
            ? "Early support research for Energy pressure."
            : item.key === "routing"
            ? "Good once bank / shipping starts to matter."
            : item.key === "fieldOps"
            ? "Bridge research into stronger mid-game support."
            : item.key === "minerSync"
            ? "One of the cleanest Ore researches."
            : item.key === "arcadeOps"
            ? "Best for active expedition players."
            : item.key === "logistics"
            ? "Shipping research, not a raw economy fix."
            : item.key === "predictiveMaintenance"
            ? "Top defensive research for heavy builds."
            : item.key === "deepScan"
            ? "Best when expeditions are frequent."
            : item.key === "tokenDiscipline"
            ? "Advanced tradeoff research, not for every build."
            : "";

        return {
          key: item.key,
          name: item.name,
          desc: item.desc,
          quickTags: getResearchQuickTags(item.key),
          helpText,
          cost: item.cost,
          done,
          locked,
          canAfford,
          available,
        };
      })}
      onHire={hireCrew}
      onSelectCrewRole={handleCrewRoleChange}
      onOpenCrewRoleInfo={(key) => {
        setBuildInfo(getCrewInfo(key));
        setOpenInfoKey(null);
      }}
      onSelectCommanderPath={handleCommanderPathChange}
      onOpenCommanderPathInfo={(key) => {
        setBuildInfo(getCommanderPathInfo(key));
        setOpenInfoKey(null);
      }}
      onBuyModule={buyModule}
      onOpenModuleInfo={(key) => {
        const module = MODULES.find((m) => m.key === key);
        if (!module) return;
        setBuildInfo(getDevelopmentInfo(module));
        setOpenInfoKey(null);
      }}
      onBuyResearch={buyResearch}
      onOpenResearchInfo={(key) => {
        const item = RESEARCH.find((m) => m.key === key);
        if (!item) return;
        setBuildInfo(getDevelopmentInfo(item));
        setOpenInfoKey(null);
      }}
      commandProtocolRows={commandProtocolUi.rows}
      commandProtocolEffectiveId={commandProtocolUi.effectiveId}
      commandProtocolStoredId={commandProtocolUi.storedId}
      commandProtocolCommanderLevel={commandProtocolUi.commanderLevel}
      commandProtocolCanSwapToday={commandProtocolUi.canSwapToday}
      onSetCommandProtocol={handleSetCommandProtocol}
    />
  );

  const crewModulesResearchContentMobile = (
    <>
      {world3Telemetry ? (
        <div
          className={`mb-2 rounded-2xl border px-2.5 py-2 ${worldSignalToneClass(
            world3Telemetry.signalKey
          )}`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-[0.16em] opacity-75">
                Signal Wastes
              </div>
              <div className="truncate text-sm font-semibold">
                {world3Telemetry.signalLabel} · {world3Telemetry.disciplineScore}/100
              </div>
            </div>
            <div className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-bold">
              {world3Telemetry.recommendedResearchNow ? "PUSH" : "HOLD"}
            </div>
          </div>

          <div className="mt-2 text-[11px] opacity-80">{world3Telemetry.priority}</div>
        </div>
      ) : null}
      {crewModulesResearchContent}
    </>
  );
  /*
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

  */

  const BUILDING_INFO_COPY = {
    hq: {
      now(level) {
        return level <= 0
          ? "HQ is still at base state, so your command core is not yet pushing the rest of the base forward."
          : `HQ is currently level ${level}. It is already improving overall progression pacing and helping stronger systems feel more reachable.`;
      },
      next(level) {
        const next = level + 1;
        return `HQ level ${next} will strengthen your command core and make the whole base progression path feel smoother and less bottlenecked.`;
      },
      why:
        "HQ is your global progression anchor.\n" +
        "It does not specialize in one resource, but it helps the whole build mature in a cleaner order.",
      linked:
        "Global progression · unlock rhythm · stronger structure access · smoother mid-game transition",
      impact:
        "A stronger HQ improves the quality of your overall build path.\n" +
        "It is especially useful when the base is starting to move from early setup into real specialization.",
      tips: {
        building: "Quarry",
        supportBuildings: ["Trade Hub", "Power Cell", "Research Lab"],
        research: "Field Ops",
        supportResearch: ["Coolant Loops", "Arcade Ops"],
        module: "",
        operation: "Daily Missions / Field Expedition",
        watch:
          "HQ improves structure flow, but it does not fix a broken Energy, Ore or Stability bottleneck by itself.",
        actions: [
          "Upgrade HQ when your overall progression path starts feeling cramped.",
          "Use HQ as a pacing upgrade, not as an emergency economy fix.",
          "Strong when you are preparing to move from early economy into layered mid-game systems.",
        ],
      },
      nextStep: {
        label: "Open Quarry",
        tab: "build",
        target: "quarry",
        why: "Quarry is one of the first practical structures that benefits from a stronger overall progression path.",
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
        building: "Quarry",
        supportBuildings: ["Power Cell", "Refinery"],
        research: "Miner Sync",
        module: "Servo Drill",
        watch: "Weak energy can hide your real Ore potential.",
        actions: ["Keep Quarry scaling steady before expensive expansion."],
      },
      nextStep: {
        label: "Upgrade Quarry",
        tab: "build",
        target: "quarry",
        why: "Ore flow is your base production backbone.",
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
      why:
        "Trade Hub is the main stable GOLD structure in BASE.\n" +
        "It helps prevent the base from feeling stuck, but it still depends on healthy Energy support to run smoothly.",
      linked:
        "GOLD economy · Quarry unlock path · Energy support · Power Cell synergy · Refinery preparation",
      impact:
        "A stronger Trade Hub makes future upgrades easier to sustain instead of forcing long waiting periods.\n" +
        "If Energy is weak, even a good Trade Hub can feel worse than expected.",
      tips: {
        building: "Trade Hub",
        supportBuildings: ["Quarry", "Power Cell", "Expedition Bay"],
        research: "Field Ops",
        supportResearch: ["Coolant Loops", "Arcade Ops"],
        module: "",
        operation: "Field Expedition / Daily Missions",
        watch:
          "Trade Hub is a stable Gold lane, but weak Energy can still slow its real usefulness.",
        actions: [
          "Trade Hub is one of the best upgrades when your base feels starved for spending power.",
          "Remember that Quarry is part of the unlock chain and Power Cell helps keep the lane healthy.",
          "Use expeditions and missions as support, not as your main permanent Gold plan.",
        ],
      },
      nextStep: {
        label: "Open Power Cell",
        tab: "build",
        target: "powerCell",
        why: "Power Cell helps the Gold lane stay smoother under Energy pressure.",
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
        return `Salvage Yard level ${next} will improve Scrap recovery to about ${scrap}, making support upgrades and Refinery feeding easier to sustain.`;
      },
      why:
        "Salvage Yard is the backbone of your long-term Scrap lane.\n" +
        "Without healthy Scrap, advanced systems and Refinery progression both start feeling blocked.",
      linked:
        "SCRAP recovery · advanced systems · Refinery input · expedition support · mid-game stability",
      impact:
        "A stronger Salvage Yard makes the mid-game much smoother.\n" +
        "It reduces the chance that Scrap quietly becomes the hidden bottleneck in your base.",
      tips: {
        building: "Salvage Yard",
        supportBuildings: ["Power Cell", "Refinery"],
        operation: "Field Expedition",
        watch: "Scrap deficits quietly choke refinery growth.",
        actions: ["Use expeditions for burst scrap, not as a replacement lane."],
      },
      nextStep: {
        label: "Upgrade Salvage Yard",
        tab: "build",
        target: "salvage",
        why: "Stable scrap feed keeps advanced systems smooth.",
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
        return `Refinery is currently level ${level}.\nIt is consuming about ${ore} ORE and ${scrap} SCRAP to support roughly ${mleo} banked MLEO potential.`;
      },
      next(level, building) {
        const next = level + 1;
        const ore = fmt((building.convert?.ORE || 0) * next);
        const scrap = fmt((building.convert?.SCRAP || 0) * next);
        const mleo = fmt((building.convert?.MLEO || 0) * next);
        return `Refinery level ${next} will raise conversion pressure to about ${ore} ORE + ${scrap} SCRAP for roughly ${mleo} banked MLEO potential.`;
      },
      why:
        "Refinery is the main bridge from infrastructure into banked MLEO.\n" +
        "It is one of the most important structures in BASE, but it only feels good when the rest of the economy can actually feed it.",
      linked:
        "ORE + SCRAP conversion · banked MLEO · Energy pressure · shipping strategy · Shared Vault support",
      impact:
        "A stronger Refinery increases your banked MLEO potential, but it also increases pressure on Ore, Scrap, Energy and Stability.\n" +
        "If one of those layers is weak, Refinery scaling starts feeling inefficient instead of exciting.",
      tips: {
        building: "Refinery",
        supportBuildings: ["Quarry", "Salvage Yard", "Power Cell", "Logistics Center"],
        operation: "Ship to Shared Vault",
        watch: "Refinery scales badly when Ore/Scrap or energy is unstable.",
        actions: ["Feed inputs first, then push output and shipping."],
      },
      nextStep: {
        label: "Upgrade Refinery",
        tab: "build",
        target: "refinery",
        why: "Refinery is the direct banked MLEO source.",
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
      why:
        "Power Cell is one of the most important comfort and stability upgrades in BASE.\n" +
        "It does not create resources directly, but it keeps your important lanes alive.",
      linked:
        "ENERGY cap · ENERGY regen · Trade Hub support · Quarry support · Refinery support · expedition uptime",
      impact:
        "Better Energy support means less downtime, fewer collapses, and smoother progression.\n" +
        "It is one of the cleanest upgrades for making the whole base feel better.",
      tips: {
        building: "Power Cell",
        supportBuildings: ["Repair Bay", "Research Lab"],
        research: "Coolant Loops",
        supportResearch: ["Predictive Maintenance"],
        operation: "Emergency Refill / Reduce building power mode",
        watch: "Refill is temporary; cap and regen are long-term control.",
        actions: ["Use safe mode while rebuilding energy headroom."],
      },
      nextStep: {
        label: "Upgrade Power Cell",
        tab: "build",
        target: "powerCell",
        why: "Energy cap and regen stabilize every production lane.",
      },
    },

    minerControl: {
      now(level, building) {
        if (level <= 0) {
          return "Miner Control is not built yet, so synergy between BASE and Miners is still limited.";
        }
        const data = fmt((building.outputs?.DATA || 0) * level);
        return `Miner Control is currently level ${level}. It is already strengthening Miners synergy and adds about ${data} DATA support.`;
      },
      next(level, building) {
        const next = level + 1;
        const data = fmt((building.outputs?.DATA || 0) * next);
        return `Miner Control level ${next} will improve Miners integration further and raise DATA support to about ${data}.`;
      },
      why:
        "Miner Control helps BASE feel connected to the wider MLEO ecosystem instead of isolated.\n" +
        "It is more strategic than raw, but that strategic link matters a lot over time.",
      linked:
        "Miners synergy · DATA support · industrial cohesion · Ore strategy · ecosystem identity",
      impact:
        "A stronger Miner Control makes your progression feel more integrated across systems.\n" +
        "It is especially useful when you want BASE to support the wider MLEO loop instead of standing alone.",
      tips: {
        building: "Research Lab",
        supportBuildings: ["Quarry", "Refinery", "Power Cell"],
        research: "Miner Sync",
        supportResearch: ["Field Ops"],
        module: "Servo Drill",
        operation: "",
        watch:
          "Miner Control adds strategic value, but it does not replace fixing weak Ore, Energy or Scrap lanes.",
        actions: [
          "Upgrade Miner Control when ecosystem cohesion starts mattering to your plan.",
          "Best when Quarry and Research Lab are already relevant.",
          "Treat it as a strategic connector, not only as a raw stat card.",
        ],
      },
      nextStep: {
        label: "Open Research Lab",
        tab: "build",
        target: "researchLab",
        why: "Research Lab is one of the best structures to pair with Miner Control's strategic DATA support.",
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
        return `Arcade Hub level ${next} will strengthen the activity-to-progression link and raise DATA support to about ${data}.`;
      },
      why:
        "Arcade Hub gives BASE a meaningful relationship with the rest of the MLEO experience.\n" +
        "It helps activity, missions and progression feel connected rather than separate systems.",
      linked:
        "Arcade synergy · mission rhythm · DATA support · commander progression · ecosystem identity",
      impact:
        "A stronger Arcade Hub makes the game feel livelier and more unified.\n" +
        "It is especially good for active players who want BASE to reward engagement, not only passive waiting.",
      tips: {
        building: "Expedition Bay",
        supportBuildings: ["Research Lab", "Power Cell"],
        research: "Arcade Ops",
        supportResearch: ["Deep Scan"],
        module: "Arcade Relay",
        operation: "Daily Missions / Field Expedition",
        watch:
          "Arcade Hub feels best in active play. In passive-only styles it becomes more of a support layer than a core engine.",
        actions: [
          "Upgrade Arcade Hub when missions and active progression are becoming part of your normal loop.",
          "Pair it with Arcade Relay and Arcade Ops for a much smoother active-play identity.",
          "Good support when DATA and commander XP both matter.",
        ],
      },
      nextStep: {
        label: "Research Arcade Ops",
        tab: "research",
        target: "arcadeOps",
        why: "Arcade Ops is one of the best direct follow-ups to Arcade Hub.",
      },
    },

    expeditionBay: {
      now(level) {
        return level <= 0
          ? "Expedition Bay is not built yet, so expedition progression is still limited."
          : `Expedition Bay is currently level ${level}. It is already supporting stronger expeditions and better reward quality.`;
      },
      next(level) {
        const next = level + 1;
        return `Expedition Bay level ${next} will improve expedition strength and reward quality further, making mixed utility progression more reliable.`;
      },
      why:
        "Expedition Bay keeps the game from becoming only passive production.\n" +
        "It supports active field play, mixed rewards, and a more flexible progression rhythm.",
      linked:
        "Expeditions · mixed rewards · Scrap support · DATA support · active progression",
      impact:
        "A stronger Expedition Bay improves one of the best utility systems in BASE.\n" +
        "It helps fill temporary gaps when you need more flexible rewards instead of one narrow economy lane.",
      tips: {
        building: "Research Lab",
        supportBuildings: ["Arcade Hub", "Power Cell", "Repair Bay"],
        research: "Deep Scan",
        supportResearch: ["Arcade Ops"],
        module: "Arcade Relay",
        operation: "Field Expedition",
        watch:
          "Expeditions are useful utility, but they should not replace fixing a broken core economy lane.",
        actions: [
          "Upgrade Expedition Bay when field expeditions are becoming part of your regular play.",
          "Very good when you want mixed DATA + Scrap support.",
          "Pair with Deep Scan and Arcade Ops for a much stronger active progression loop.",
        ],
      },
      nextStep: {
        label: "Open Deep Scan",
        tab: "research",
        target: "deepScan",
        why: "Deep Scan is one of the best research follow-ups once Expedition Bay matters.",
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
      why:
        "Logistics Center is a control structure for the export side of BASE.\n" +
        "It does not replace Refinery, but it makes the path from banked MLEO to shipped value feel smarter and more stable.",
      linked:
        "Shipping quality · export handling · Shared Vault support · DATA support · Blueprint discipline",
      impact:
        "A stronger Logistics Center improves late-game control, helps the export lane feel cleaner, and supports DATA at the same time.\n" +
        "It is most valuable once shipping becomes a real part of your loop.",
      tips: {
        building: "Refinery",
        supportBuildings: ["Power Cell", "Repair Bay"],
        research: "Logistics",
        supportResearch: ["Routing AI"],
        module: "Vault Compressor",
        operation: "Ship to Shared Vault",
        watch:
          "If Refinery output is weak, Logistics has less to optimize. If Stability is weak, export lanes also become more fragile.",
        actions: [
          "Upgrade Logistics Center when shipping becomes a meaningful daily decision.",
          "This is a control upgrade, not just a production upgrade.",
          "Best used together with Refinery, Blueprint progression and Vault Compressor.",
          "If Stability is low, fix maintenance pressure before pushing export lanes harder.",
        ],
      },
      nextStep: {
        label: "Research Logistics",
        tab: "research",
        target: "logistics",
        why: "Logistics research is one of the best direct follow-ups to Logistics Center.",
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
      why:
        "Research Lab is the main strategic DATA structure in BASE.\n" +
        "It helps the game scale through smarter progression, not only through more raw emissions.",
      linked:
        "DATA generation · advanced research · blueprint rhythm · strategic depth · Energy pressure",
      impact:
        "A stronger Research Lab improves your access to advanced progression systems and makes DATA milestones arrive more naturally.\n" +
        "At the same time, it adds pressure, so it feels best when Energy and Stability are already under control.",
      tips: {
        building: "Research Lab",
        supportBuildings: ["Arcade Hub", "Miner Control", "Power Cell"],
        research: "Deep Scan",
        supportResearch: ["Arcade Ops"],
        operation: "Field Expedition",
        watch: "Lab scaling can strain energy if support is weak.",
        actions: ["Keep DATA steady; do not force lab while unstable."],
      },
      nextStep: {
        label: "Upgrade Research Lab",
        tab: "build",
        target: "researchLab",
        why: "Lab is the strongest long-term DATA source.",
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
      why:
        "Repair Bay is one of the best defensive upgrades in the game.\n" +
        "It helps protect long-term efficiency instead of only chasing more output.",
      linked:
        "Stability · maintenance pressure · Predictive Maintenance synergy · Refinery safety · long-term scaling",
      impact: "A stronger Repair Bay keeps the base performing well over time and reduces the chance that instability becomes your real bottleneck.",
      tips: {
        building: "Repair Bay",
        supportBuildings: ["Power Cell", "Refinery"],
        research: "Predictive Maintenance",
        operation: "Maintenance Cycle",
        watch: "Repair support helps, but delayed maintenance still hurts.",
        actions: ["Maintain before pressure escalates."],
      },
      nextStep: {
        label: "Upgrade Repair Bay",
        tab: "build",
        target: "repairBay",
        why: "Repair Bay improves long-term stability support.",
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
      focus: "Better banking + vault-loop support",
      text:
        "Vault Compressor improves the quality of your banking and vault loop.\n\n" +
        "What it helps:\n" +
        "• Better bank efficiency.\n" +
        "• Stronger vault-loop value when you move banked MLEO to the shared vault.\n" +
        "• Stronger value from a mature Refinery + export setup.\n\n" +
        "Important:\n" +
        "It is most valuable after banked MLEO and vault transfers are already active.",
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
        operation: "Emergency Refill / Reduce building power mode",
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
        "• Better long-term value from your refinery → banked → vault loop.\n\n" +
        "Important:\n" +
        "Routing AI is part of that production and vault loop, not a standalone economy fix.",
      tips: {
        building: "Logistics Center",
        supportBuildings: ["Refinery"],
        research: "Routing AI",
        supportResearch: ["Logistics"],
        module: "Vault Compressor",
        operation: "Ship to Shared Vault",
        watch: "Weak Refinery output means this research has little to optimize.",
        actions: [
          "Take Routing AI when your refinery → banked → vault loop starts to matter.",
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
      focus: "Export flow and vault-loop handling",
      text:
        "Logistics is one of the main export researches.\n\n" +
        "What it helps:\n" +
        "• Smoother export rhythm and better vault-loop handling.\n" +
        "• Stronger bank bonus scaling for refinery output.\n" +
        "• Better value from mature banked MLEO flow.\n\n" +
        "Important:\n" +
        "It is strongest after Refinery and shared-vault transfers are already part of your loop.",
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
          "Strong for DATA-heavy builds that also lean on the shared vault loop.",
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
          "Use the available action to jump to the right panel.",
        ],
      },
    };
  }

  const OPERATIONS_INFO_COPY = {
    shipping: {
      title: "Ship to Shared Vault",
      focus: "Move banked MLEO out of BASE",
      text:
        "Shipping sends your current banked MLEO from BASE into the Shared Vault (full transfer).\n\n" +
        "What improves the economy around it:\n" +
        "• More banked MLEO from Refinery (production is daily-capped + softcut inside BASE).\n" +
        "• Logistics Center and Blueprint improve bank bonus scaling and export rhythm.\n" +
        "• Logistics research supports smoother vault-loop handling.\n\n" +
        "Important:\n" +
        "There is no daily limit on shipping itself. The daily cap and softcut apply to MLEO production inside BASE, before it becomes banked.",
      tips: {
        building: "Logistics Center",
        supportBuildings: ["Refinery"],
        research: "Logistics",
        supportResearch: ["Routing AI"],
        module: "Vault Compressor",
        operation: "Ship to Shared Vault",
        watch: "Banked MLEO sitting inside BASE is not yet shared vault value until you ship.",
        actions: [
          "Make sure Refinery is feeding banked MLEO first.",
          "Improve Logistics when vault transfers become part of your daily loop.",
          "If refinery feels slow, check production pressure — that is separate from shipping limits.",
        ],
      },
      nextStep: {
        label: "Open Refinery",
        tab: "build",
        target: "refinery",
        why: "Shipping matters when Refinery is already producing banked MLEO.",
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
        "• Does not improve Energy regeneration.\n" +
        "• Pairs well with Safe 50% so recovery does not drain away.\n\n" +
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
          "Reduce heavy building power mode first when Energy keeps crashing.",
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
        "• Miner Link helps when refinery load is part of the problem.\n" +
        "• Safe 50% can buy time by cutting runtime pressure first.\n\n" +
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
        target: "expedition-action",
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
        target: "expedition-action",
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
      focus: "Shared Vault loop + export flow",
      text:
        "Logistician is the export-focused crew role.\n\n" +
        "What it helps:\n" +
        "• Better bank bonus and vault transfer value.\n" +
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
          "Choose this when vault transfers are part of your daily loop.",
          "Great once banked MLEO production is stable.",
          "Not ideal if your base is still struggling with basics.",
        ],
      },
      nextStep: {
        label: "Open Shipping",
        tab: "operations",
        target: "shipping",
        why: "Logistician is strongest when you regularly move banked MLEO to the shared vault.",
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
        target: "expedition-action",
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
        "Logistics is the commander path for vault-export and banking-focused progression.\n\n" +
        "What it helps:\n" +
        "• Better bank bonus for refinery output.\n" +
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
          "Great for teaching better vault-transfer timing.",
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
        target: "expedition-action",
        why: "This contract depends directly on expedition readiness.",
      },
    },

    route_discipline_window: {
      title: "Contract: Route Discipline Window",
      focus: "Logistics T2+ with Route Discipline program active",
      text:
        "Advanced logistics contract: align your support program with disciplined banking.\n\n" +
        "How to complete it:\n" +
        "• Reach Logistics Center tier 2+ and set Route Discipline as the active support program.\n" +
        "• Hold at least 180 banked MLEO (before shipping).\n" +
        "• Keep stability at 80% or higher.",
      tips: {
        building: "Logistics Center",
        research: "Logistics",
        module: "Vault Compressor",
        actions: [
          "Unlock Route Discipline under Support Programs on the Logistics card.",
          "Patience on shipping helps banked MLEO and this objective.",
          "Pair with stable play — avoid stability dips while stacking banked.",
        ],
      },
      nextStep: {
        label: "Open Logistics Center",
        tab: "build",
        target: "logisticsCenter",
        why: "Tier and support programs for Logistics are required for this contract.",
      },
    },

    reserve_buffer_hold: {
      title: "Contract: Reserve Buffer Hold",
      focus: "Logistics T3+ with Reserve Buffer program",
      text:
        "Prove reserve discipline: high stability and a healthy energy buffer while in Reserve Buffer mode.\n\n" +
        "How to complete it:\n" +
        "• Logistics Center tier 3+ with Reserve Buffer active.\n" +
        "• Stability 88%+.\n" +
        "• Energy at least 50% of your current cap.",
      tips: {
        building: "Logistics Center",
        research: "Logistics",
        module: "",
        actions: [
          "Power Cell and safe power modes help hold the energy buffer.",
          "Maintenance before pressure makes 88% stability realistic.",
        ],
      },
      nextStep: {
        label: "Open Logistics Center",
        tab: "build",
        target: "logisticsCenter",
        why: "Advance tier and activate Reserve Buffer from Support Programs.",
      },
    },

    analysis_matrix_window: {
      title: "Contract: Analysis Matrix Window",
      focus: "Research T2+ with Analysis Matrix program",
      text:
        "Turn lab-side control into expedition-ready intelligence.\n\n" +
        "How to complete it:\n" +
        "• Research Lab tier 2+ with Analysis Matrix as active support program.\n" +
        "• Hold at least 12 DATA.\n" +
        "• Expedition must be off cooldown (ready to launch).",
      tips: {
        building: "Research Lab",
        research: "Deep Scan",
        module: "Arcade Relay",
        actions: [
          "DATA flow from lab, miners, and arcade supports this contract.",
          "Arcade Ops and expedition timing both matter for readiness.",
        ],
      },
      nextStep: {
        label: "Open Research Lab",
        tab: "build",
        target: "researchLab",
        why: "Tier 2+ lab and Analysis Matrix unlock this objective.",
      },
    },

    predictive_telemetry_sync: {
      title: "Contract: Predictive Telemetry Sync",
      focus: "Research T3+ with Predictive Telemetry",
      text:
        "Balance DATA-heavy research play with meaningful banked reserves.\n\n" +
        "How to complete it:\n" +
        "• Research Lab tier 3+ with Predictive Telemetry active.\n" +
        "• At least 14 DATA.\n" +
        "• At least 120 banked MLEO.",
      tips: {
        building: "Research Lab",
        research: "Deep Scan",
        module: "",
        actions: [
          "Refinery output feeds banked MLEO while you push DATA goals.",
          "Avoid overspending DATA right before claiming.",
        ],
      },
      nextStep: {
        label: "Open Research Lab",
        tab: "build",
        target: "researchLab",
        why: "Higher lab tier and Predictive Telemetry are required.",
      },
    },

    preventive_cycle_standard: {
      title: "Contract: Preventive Cycle Standard",
      focus: "Repair T2+ with Preventive Cycle program",
      text:
        "Demonstrate long-horizon stability while running preventive repair discipline.\n\n" +
        "How to complete it:\n" +
        "• Repair Bay tier 2+ with Preventive Cycle active.\n" +
        "• Stability 90%+ and system state stable (not warning/critical).\n" +
        "• Stay ahead of maintenance — this is about prevention, not recovery.",
      tips: {
        building: "Repair Bay",
        research: "Predictive Maintenance",
        module: "",
        actions: [
          "Engineer crew and Predictive Maintenance research reinforce this path.",
          "Safer energy and event choices keep stability in the safe band.",
        ],
      },
      nextStep: {
        label: "Open Repair Bay",
        tab: "build",
        target: "repairBay",
        why: "Repair programs and tier unlock this advanced contract.",
      },
    },

    stabilization_mesh_balance: {
      title: "Contract: Stabilization Mesh Balance",
      focus: "Repair T3+ with Stabilization Mesh",
      text:
        "Hold a mixed healthy profile: stability, energy buffer, and modest banked reserves.\n\n" +
        "How to complete it:\n" +
        "• Repair Bay tier 3+ with Stabilization Mesh active.\n" +
        "• Stability 86%+.\n" +
        "• Energy at least 40% of cap.\n" +
        "• At least 90 banked MLEO.",
      tips: {
        building: "Repair Bay",
        research: "Predictive Maintenance",
        module: "Miner Link",
        actions: [
          "This contract rewards balanced command — not min-maxing one meter only.",
          "Logistics and refinery rhythm help banked MLEO without shipping early.",
        ],
      },
      nextStep: {
        label: "Open Repair Bay",
        tab: "build",
        target: "repairBay",
        why: "Tier 3 repair and Stabilization Mesh are required.",
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
      focus: "Temporary vault-transfer opportunity",
      text:
        "Logistics Window is a timing event around your next transfer to the shared vault.\n\n" +
        "What it means:\n" +
        "• It can improve the next transfer if used well.\n" +
        "• Sometimes skipping is smarter if you are not ready to capitalize.\n" +
        "• Best decision depends on your current banked MLEO and when you plan to ship.",
      tips: {
        building: "Logistics Center",
        research: "Logistics",
        module: "Vault Compressor",
        actions: [
          "Best used when a vault transfer is already close and meaningful.",
          "Skipping is fine if your pipeline is not ready.",
          "This event rewards export discipline.",
        ],
      },
      nextStep: {
        label: "Open Shipping",
        tab: "operations",
        target: "shipping",
        why: "This event matters most when your next vault transfer timing is relevant.",
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
    const lookupKey = contract.templateKey || contract.key;
    return CONTRACT_INFO_COPY[lookupKey] || {
      title: contract.title,
      focus: contract.contractClass === "elite" ? "Elite rotating contract" : "Live Contract",
      text:
        contract.contractClass === "elite"
          ? `${contract.desc}\n\nThese offers rotate daily (UTC) and use a separate claim slot per day.`
          : contract.desc,
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
      focus: "Permanent banking upgrade",
      text:
        "Blueprint is a long-term reinvestment system.\n\n" +
        "What it improves:\n" +
        "• Stronger banking efficiency (bank bonus scaling for refinery output).\n" +
        "• Better value from a strong refinery + vault transfer loop.\n\n" +
        "Important:\n" +
        "Blueprint is strongest after your Refinery and shared-vault loop already work well.",
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
      title: "Production Discipline",
      focus: "How close you are to today's MLEO production budget in BASE",
      text:
        "Production Discipline compares today's MLEO produced inside BASE to your daily production cap.\n\n" +
        "What it helps with:\n" +
        "• Reading refinery pressure before MLEO is banked.\n" +
        "• Understanding when production softcut starts to matter more.\n" +
        "• Separating production pacing from vault transfers.\n\n" +
        "Important:\n" +
        "Shipping to the shared vault is not daily-limited. The daily cap and softcut apply to MLEO production inside BASE.",
      tips: {
        building: "Refinery",
        supportBuildings: ["Logistics Center"],
        research: "Logistics",
        supportResearch: ["Routing AI"],
        module: "Vault Compressor",
        operation: "Ship to Shared Vault",
        watch: "Pushing production hard near the daily cap can feel slower due to softcut — that is separate from shipping.",
        actions: [
          "Use this card to pace refinery and production upgrades.",
          "Blueprint and Logistics improve bank bonus scaling and vault-loop rhythm.",
          "Good refinery timing matters as much as when you transfer to the vault.",
        ],
      },
      nextStep: {
        label: "Open Refinery",
        tab: "build",
        target: "refinery",
        why: "This card is about MLEO production inside BASE before it becomes banked.",
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
        "• Daily MLEO production pressure (near cap).\n" +
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
      nextStep: info.nextStep,
    };
  };

  const visibleStructures =
    structuresTab === "core"
      ? BUILDINGS.filter((item) => STRUCTURES_TAB_A.includes(item.key))
      : BUILDINGS.filter((item) => STRUCTURES_TAB_B.includes(item.key));

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

  const bankedSnapshotForBuildCards = getBankedRateSnapshot(state, derived);

  const visibleStructuresVM = (visibleStructures || []).map((building) => {
    const level = state.buildings[building.key] || 0;
    const nextLevel = level + 1;
    const cost = buildingCost(building, level);
    const isUnlocked = unlocked(building, state);
    const canAffordCost = canAfford(state.resources, cost);
    const canCoverCostForBtn = canCoverCost(state.resources, cost);
    const ready = isUnlocked && canAffordCost;
    const powerMode = getBuildingPowerMode(state, building.key);
    const canThrottle = canThrottleBuilding(building.key);

    const supportsTier = isTierBuilding(building.key);
    const tier = supportsTier ? getBuildingTier(state, building.key) : null;
    const nextTier = supportsTier ? Math.min(4, (tier || 1) + 1) : null;
    const atTierCap = supportsTier && level >= 15;
    const tierMaxed = supportsTier && (tier || 1) >= 4;
    const tierAdvanceAvailable = supportsTier && atTierCap && !tierMaxed;
    const tierAdvancePrompted = tierPromptKey === building.key;
    const tierCost = tierAdvanceAvailable ? getTierAdvancePreviewCost(building.key, tier) : null;
    const canAffordTierCost = tierCost ? canCoverCost(state.resources, tierCost) : false;
    const tierText = tier != null ? `T${tier}` : null;

    const tierAdvanceBlock =
      tierAdvanceAvailable ? (
        <div className="mt-2 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-200">
              Tier upgrade available
            </div>
            <div className="text-[11px] font-semibold text-white/75">
              T{tier} → T{nextTier} · resets to Lv 1
            </div>
          </div>
          <div className="mt-1">
            <ResourceCostRow cost={tierCost} resources={state.resources} />
          </div>
        </div>
      ) : null;

    const unmetRequirements = (building.requires || [])
      .filter((req) => Number(state?.buildings?.[req.key] || 0) < Number(req.lvl || 1))
      .map((req) => `${reqNameMap[req.key] || req.key} Lv ${req.lvl || 1}`);

    const requirementsText = unmetRequirements.join(" · ");

    let buttonText = ready
      ? "Upgrade"
      : isUnlocked
      ? "Need resources"
      : "Need requirements";
    if (tierAdvanceAvailable && tierAdvancePrompted) {
      buttonText = "Tier ready";
    }

    const supportsProgramsBuilding = supportsPrograms(building.key);
    const supportsProgramsInteractive = supportsProgramsBuilding && level >= 1;
    const activeProgramKey = supportsProgramsInteractive
      ? getActiveSupportProgram(state, building.key)
      : null;
    const activeProgramLabel = activeProgramKey
      ? SUPPORT_PROGRAM_CATALOG[building.key]?.find((p) => p.key === activeProgramKey)?.label ||
        activeProgramKey
      : null;

    const programCards = supportsProgramsBuilding
      ? getSupportPrograms(building.key).map((program) => {
          if (!supportsProgramsInteractive) {
            return {
              key: program.key,
              label: program.label,
              effects: program.effects,
              minTier: program.minTier,
              cost: program.cost,
              unlocked: false,
              active: false,
              tierReady: false,
              canUnlock: false,
              unlockDisabled: true,
              setDisabled: true,
              unlockBusy: false,
              setBusy: false,
              costRow: null,
            };
          }
          const tierReady = (tier || 1) >= program.minTier;
          const unlocked = isSupportProgramUnlocked(state, building.key, program.key);
          const active = activeProgramKey === program.key;
          const canUnlock = canUnlockSupportProgram(state, building.key, program);
          const unlockDisabled =
            !tierReady || unlocked || !canCoverCost(state.resources, program.cost);
          const setDisabled = !unlocked || active;
          const unlockBusy = activeProgramUnlockKey === `${building.key}:${program.key}:unlock`;
          const setBusy = activeProgramSetKey === `${building.key}:${program.key}:set`;
          return {
            key: program.key,
            label: program.label,
            effects: program.effects,
            minTier: program.minTier,
            cost: program.cost,
            unlocked,
            active,
            tierReady,
            canUnlock,
            unlockDisabled,
            setDisabled,
            unlockBusy,
            setBusy,
            costRow:
              !unlocked && tierReady ? (
                <ResourceCostRow cost={program.cost} resources={state.resources} />
              ) : null,
          };
        })
      : [];

    const milestoneCards =
      supportsProgramsBuilding && Array.isArray(SPECIALIZATION_MILESTONES_BY_BUILDING[building.key])
        ? SPECIALIZATION_MILESTONES_BY_BUILDING[building.key]
            .map((milestoneKey) => {
              const meta = SPECIALIZATION_MILESTONE_META[milestoneKey];
              if (!meta) return null;
              const preview = getSpecializationMilestonePreview(
                state,
                derived,
                building.key,
                milestoneKey
              );
              const reqProgLabel =
                SUPPORT_PROGRAM_CATALOG[building.key]?.find(
                  (p) => p.key === meta.requiredActiveProgram
                )?.label || meta.requiredActiveProgram;
              const rewardPreview = Object.entries(meta.reward || {})
                .map(([k, v]) => `${k} +${v}`)
                .join(" · ");
              const claimBusy =
                activeMilestoneClaimKey === `${building.key}:${milestoneKey}`;
              return {
                key: milestoneKey,
                label: meta.label,
                minTier: meta.minTier,
                reqProgLabel,
                conditionShort: meta.conditionShort,
                rewardPreview,
                eligible: preview.eligible,
                done: preview.done,
                claimed: preview.claimed,
                progressText: preview.progressText,
                claimBusy,
                canClaim: preview.done && !preview.claimed,
              };
            })
            .filter(Boolean)
        : [];

    const liveNowNext = getBuildingNowNextLines(
      state,
      derived,
      building.key,
      bankedSnapshotForBuildCards
    );

    return {
      key: building.key,
      name: building.name,
      desc: building.desc,
      level,
      nextLevel,
      roleTagText: buildingRoleTag(building.key),
      synergyTagText: buildingSynergyTag(building.key),
      sectorStatusText: sectorStatusForBuilding(building.key, state).toUpperCase(),
      supportsTier,
      tier,
      nextTier,
      atTierCap,
      tierMaxed,
      tierAdvanceAvailable,
      tierAdvancePrompted,
      tierCost,
      canAffordTierCost,
      tierText,
      tierAdvanceBlock,
      supportsPrograms: supportsProgramsBuilding,
      supportProgramsSectionsLocked: supportsProgramsBuilding && !supportsProgramsInteractive,
      activeProgramKey,
      activeProgramLabel,
      programCards,
      milestoneCards,
      requirementsText,
      unmetRequirements,
      ready,
      buildBusy: activeBuildKey === building.key,
      canAffordCost: canCoverCostForBtn,
      buttonText,
      costRow: <ResourceCostRow cost={cost} resources={state.resources} />,
      upgradeImpactPreview: liveNowNext.hideLegacyUpgradeImpact
        ? null
        : getUpgradeImpactPreview(state, derived, building.key),
      liveNowNext,
      energyLineText: getBuildingEnergyLine(building, level, powerMode),
      powerLineText: getBuildingPowerLine(building.key, powerMode),
      canThrottle,
      powerMode,
    };
  });

  const openBuildingInfoByKey = (key) => {
    if (!key) return;
    const building = BUILDINGS.find((b) => b.key === key);
    if (!building) return;
    setBuildInfo(getBuildingInfo(building));
    setOpenInfoKey(null);
  };

  const baseStructuresContent = (
    <BaseStructuresPanel
      structuresTab={structuresTab}
      onSetStructuresTab={setStructuresTab}
      coreMissionReadyCount={structuresCoreMissionReadyCount}
      coreAvailableBuildingsCount={availableCoreStructuresCount}
      expansionMissionReadyCount={structuresExpansionMissionReadyCount}
      expansionAvailableBuildingsCount={availableExpansionStructuresCount}
      cards={visibleStructuresVM}
      highlightTarget={highlightTarget}
      powerSteps={BUILDING_POWER_STEPS}
      onOpenBuildingInfo={openBuildingInfoByKey}
      onChangePowerMode={changeBuildingPowerMode}
      onBuyBuilding={buyBuilding}
      onAdvanceTier={handleAdvanceTier}
      activeTierKey={activeTierKey}
      onUnlockSupportProgram={handleUnlockSupportProgram}
      onSetSupportProgram={handleSetSupportProgram}
      onClaimSpecializationMilestone={handleClaimSpecializationMilestone}
    />
  );

  const buildSupportSystemsContent = (
    <BuildSupportSystemsPanel
      canBuyBlueprintNow={canBuyBlueprintNow}
      blueprintCostText={fmt(blueprintCost)}
      blueprintDataCostText={fmt(blueprintDataCost)}
      blueprintButtonText={`Buy Blueprint Lv ${Number(state.blueprintLevel || 0) + 1}`}
      blueprintStatusText={
        canBuyBlueprintNow ? "Ready to purchase" : "Need more shared MLEO or DATA"
      }
      onOpenBlueprintInfo={() => {
        setBuildInfo(getSystemInfo("blueprint"));
        setOpenInfoKey(null);
      }}
      onBuyBlueprint={buyBlueprint}
      onOverclock={activateOverclock}
      onRefill={refillEnergy}
      onMaintain={performMaintenance}
      overclockVisualDisabled={!!overclockStatusLabel}
      refillVisualDisabled={!!refillStatusLabel}
      maintainVisualDisabled={!!maintainStatusLabel}
      overclockStatusLabel={overclockStatusLabel}
      refillStatusLabel={refillStatusLabel}
      maintainStatusLabel={maintainStatusLabel}
    />
  );

  const progressSummaryContent = (
    <ProgressSummaryPanel
      panelTone={internalPanelTone}
      totalBanked={state.totalBanked}
      totalSharedSpent={state.totalSharedSpent}
      totalExpeditions={state.totalExpeditions}
      totalMissionsDone={state.totalMissionsDone}
      crewCount={state.crew}
      crewRoleName={crewRoleInfo.name}
      commanderPathName={commanderPathInfo.name}
      systemStateLabel={systemMeta.label}
    />
  );

  const handleResetGame = async () => {
    if (!confirm("Are you sure you want to reset the game? This will start fresh with the current server-backed BASE setup.")) {
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

      if (item.alertKey === "world2-freight-pressure" || item.alertKey === "world2-freight-open") {
        openMobilePanel("ops");
        setOpenInnerPanel("ops-console");
        setHighlightTarget("shipping");
        return;
      }

      if (item.alertKey === "world3-telemetry-noisy" || item.alertKey === "world3-telemetry-clean") {
        openMobilePanel("build");
        setOpenInnerPanel("build-development");
        setDevTab("research");
        setHighlightTarget("research");
        return;
      }

      if (item.alertKey === "world4-reactor-strained") {
        openMobilePanel("ops");
        setOpenInnerPanel("ops-console");
        setHighlightTarget("maintenance");
        return;
      }

      if (item.alertKey === "world4-reactor-primed") {
        openMobilePanel("ops");
        setOpenInnerPanel("ops-console");
        setHighlightTarget("overclock");
        return;
      }

      if (item.alertKey === "world5-salvage-strained") {
        openMobilePanel("ops");
        setOpenInnerPanel("ops-console");
        setHighlightTarget("maintenance");
        return;
      }

      if (item.alertKey === "world5-salvage-rich") {
        openMobilePanel("ops");
        setOpenInnerPanel("ops-console");
        setHighlightTarget("expedition");
        return;
      }

      if (item.alertKey === "world6-command-fractured" || item.alertKey === "world6-command-harmonized") {
        acknowledgeHarmonizedCommandWindowAlertFromItem(item);
        navigateToBaseTarget({ tab: "overview", target: "world6-command" });
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
    setDesktopPanel(panel);
    // Tab-only entry (single argument / inner omitted): every panel starts with all
    // expandable rows closed — including Overview (identity, contracts).
    // Deep links pass `inner` explicitly (e.g. overview-contracts, build-structures).
    setOpenInnerPanel(inner != null ? inner : null);
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
      typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;

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
      value: `${formatBankedBadgeCompact(bankedDisplayValue)}`,
    },
    {
      key: "sharedVault",
      infoKey: "sharedVault",
      label: "Vault",
      value: `${fmt(sharedVault)}`,
    },
  ];

  const activityLogContent = (
    <ActivityLogPanel panelTone={internalPanelTone} logEntries={state.log} onResetGame={handleResetGame} />
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
      <main className="h-[100dvh] overflow-hidden overflow-x-hidden bg-[#07111f] text-white sm:min-h-screen sm:h-auto sm:overflow-visible md:h-[100dvh] md:overflow-hidden">
        <div className="mx-auto max-w-7xl px-4 py-6 pb-24 sm:px-6 md:flex md:h-full md:flex-col md:px-8 md:pb-32">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-3 lg:gap-4">
            <div className="min-w-0 w-full md:max-w-[min(100%,46%)] md:flex-[0_1_auto] md:shrink md:min-w-0 lg:max-w-[min(100%,42%)] xl:max-w-[min(100%,38%)]">
              {/* Title pill removed for a cleaner V3 look */}
              <div className="mt-2 flex items-center justify-between sm:mt-3 sm:block">
                <h1 className="whitespace-nowrap text-2xl font-black tracking-tight sm:text-4xl">
                  {CONFIG.title}
                </h1>
                <div className="flex items-center gap-2 md:hidden">
                  <button
                    type="button"
                    onClick={() => {
                      setShowBankedPanel((v) => !v);
                      setShowReadyPanel(false);
                      setOpenInfoKey(null);
                    }}
                    className={`relative rounded-2xl border px-3 h-[35px] flex flex-col items-center justify-center gap-1 transition ${getBankedSummaryButtonClasses(
                      bankedSummary.tone,
                      showBankedPanel
                    )}`}
                    title="Banked MLEO quick view"
                  >
                    <div
                      className={`text-[9px] font-black uppercase tracking-[0.12em] leading-none ${getBankedSummaryButtonEyebrowClass(
                        bankedSummary.tone
                      )}`}
                    >
                      BANKED
                    </div>
                    <div
                      className={`text-[11px] font-extrabold leading-none ${getBankedSummaryButtonValueClass(
                        bankedSummary.tone
                      )}`}
                    >
                      {formatBankedBadgeCompact(bankedDisplayValue)}
                    </div>
                    {bankedSummary.count > 0 ? (
                      <span
                        className={`absolute -right-1 -top-1 inline-flex min-w-5 h-5 items-center justify-center rounded-full px-1 text-[10px] font-black ${getBankedSummaryBadgeClasses(
                          bankedSummary.tone
                        )}`}
                      >
                        {bankedSummary.count}
                      </span>
                    ) : null}
                  </button>
                  <Link
                    href="/mining"
                    className={`rounded-2xl border px-4 h-[35px] flex items-center text-sm font-semibold transition ${
                      hubGameplayOnline
                        ? "border-cyan-400/70 bg-cyan-500/15 text-cyan-200 shadow-[0_0_24px_rgba(34,211,238,0.22)] hover:bg-cyan-500/20"
                        : "border-cyan-400/35 bg-cyan-500/8 text-cyan-200/85 hover:bg-cyan-500/12"
                    }`}
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
              <div className="mt-1 flex min-w-0 w-full flex-nowrap items-center gap-1 overflow-x-auto pb-0.5 no-scrollbar sm:mt-1.5 sm:gap-1.5 md:mt-2 md:flex-wrap md:overflow-visible md:pb-0 lg:gap-2">
                {isBaseDevToolsEnabled() ? (
                  <button
                    type="button"
                    onClick={() => setDevSectorModalOpen(true)}
                    className="inline-flex min-w-0 max-w-[min(100%,11rem)] items-center rounded-full border border-cyan-400/30 bg-gradient-to-r from-cyan-500/[0.12] to-slate-950/50 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-cyan-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.1)] transition hover:from-cyan-500/[0.18] hover:to-slate-950/55 sm:max-w-[min(100%,18rem)] sm:px-2.5 sm:py-1 sm:text-[10px] sm:tracking-[0.17em]"
                    title={`Active sector · world ${activeWorldOrder} · DEV: open sector switch`}
                  >
                    <span className="truncate sm:hidden">{baseWorldHeaderIdentity.compactLine}</span>
                    <span className="hidden truncate sm:inline">{baseWorldHeaderIdentity.primaryLine}</span>
                  </button>
                ) : (
                  <span
                    className="inline-flex min-w-0 max-w-[min(100%,11rem)] items-center rounded-full border border-cyan-400/30 bg-gradient-to-r from-cyan-500/[0.12] to-slate-950/50 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-cyan-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.1)] sm:max-w-[min(100%,18rem)] sm:px-2.5 sm:py-1 sm:text-[10px] sm:tracking-[0.17em]"
                    title={`Active sector · world ${activeWorldOrder}`}
                  >
                    <span className="truncate sm:hidden">{baseWorldHeaderIdentity.compactLine}</span>
                    <span className="hidden truncate sm:inline">{baseWorldHeaderIdentity.primaryLine}</span>
                  </span>
                )}
                {baseWorldHeaderIdentity.stateChip ? (
                  <span
                    className="inline-flex max-w-[min(100%,8.5rem)] shrink-0 truncate rounded-full border border-white/12 bg-white/[0.06] px-1.5 py-0.5 text-[8px] font-semibold capitalize leading-tight text-white/75 sm:max-w-[12rem] sm:px-2 sm:text-[10px] lg:max-w-[min(11rem,28vw)]"
                    title={baseWorldHeaderIdentity.stateChip}
                  >
                    {baseWorldHeaderIdentity.stateChip}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => navigateToBaseTarget({ tab: "build", target: "command-protocol" })}
                  title={`${commandProtocolSurface.name}${commandProtocolSurface.mismatch ? " · stored not effective" : ""} · Build → Development → Crew`}
                  className={`inline-flex max-w-[min(100%,9.75rem)] shrink-0 items-center rounded-full border px-2 py-0.5 text-left transition hover:bg-white/[0.08] sm:max-w-[15rem] sm:px-2 sm:py-0.5 md:hidden lg:max-w-[min(16rem,24vw)] ${
                    commandProtocolSurface.mismatch
                      ? "border-amber-400/15 bg-amber-400/[0.05]"
                      : commandProtocolSurface.effectiveId !== "none"
                      ? "border-cyan-400/35 bg-cyan-500/[0.08]"
                      : "border-white/10 bg-white/[0.03]"
                  }`}
                >
                  <span
                    className={`min-w-0 truncate text-[9px] font-semibold leading-tight sm:hidden ${
                      commandProtocolSurface.mismatch
                        ? "text-amber-100/80"
                        : commandProtocolSurface.effectiveId === "none"
                        ? "text-white/60"
                        : "text-cyan-100/90"
                    }`}
                  >
                    {commandProtocolMobileChipLine}
                  </span>
                  <span className="hidden min-w-0 flex-1 items-center gap-1 truncate sm:inline-flex sm:gap-1.5">
                    <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/40">
                      Doctrine
                    </span>
                    <span
                      className={`min-w-0 truncate text-[10px] font-semibold leading-tight ${
                        commandProtocolSurface.effectiveId === "none" ? "text-white/50" : "text-cyan-50/95"
                      }`}
                    >
                      {commandProtocolSurface.name}
                    </span>
                    {commandProtocolSurface.mismatch ? (
                      <span className="shrink-0 text-[9px] font-medium text-amber-100/70">Not effective</span>
                    ) : commandProtocolSurface.effectiveId === "none" ? (
                      <span className="shrink-0 text-[9px] font-normal text-white/32">Baseline</span>
                    ) : (
                      <span className="shrink-0 text-[9px] font-semibold text-cyan-200/80">Live</span>
                    )}
                    {commandProtocolSurface.family &&
                    COMMAND_PROTOCOL_FAMILY_LABEL[commandProtocolSurface.family] ? (
                      <span className="hidden shrink-0 rounded border border-white/[0.08] px-1 py-px text-[8px] font-medium uppercase tracking-wide text-white/35 md:inline">
                        {COMMAND_PROTOCOL_FAMILY_LABEL[commandProtocolSurface.family]}
                      </span>
                    ) : null}
                  </span>
                </button>
              </div>
              <div className="hidden md:mt-1.5 md:block md:w-max lg:mt-2">
                <button
                  type="button"
                  onClick={() => navigateToBaseTarget({ tab: "build", target: "command-protocol" })}
                  title={`${commandProtocolSurface.name}${commandProtocolSurface.mismatch ? " · stored not effective" : ""} · Build → Development → Crew`}
                  className={`inline-flex w-auto max-w-[10rem] shrink-0 items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-left transition hover:bg-white/[0.05] ${
                    commandProtocolSurface.mismatch
                      ? "border-amber-400/12 bg-amber-400/[0.04]"
                      : commandProtocolSurface.effectiveId !== "none"
                      ? "border-cyan-400/25 bg-cyan-500/[0.05]"
                      : "border-white/[0.08] bg-white/[0.02]"
                  }`}
                >
                  <span className="shrink-0 text-[8px] font-semibold uppercase tracking-[0.1em] text-white/32">
                    Doctrine
                  </span>
                  <span
                    className={`min-w-0 max-w-[3.75rem] shrink truncate text-[9px] font-semibold leading-tight ${
                      commandProtocolSurface.effectiveId === "none" ? "text-white/42" : "text-cyan-50/85"
                    }`}
                  >
                    {commandProtocolSurface.name}
                  </span>
                  {commandProtocolSurface.mismatch ? (
                    <span className="shrink-0 text-[8px] font-medium text-amber-100/60">Stale</span>
                  ) : commandProtocolSurface.effectiveId === "none" ? (
                    <span className="shrink-0 text-[8px] font-normal text-white/28">Base</span>
                  ) : (
                    <span className="shrink-0 text-[8px] font-semibold text-cyan-200/65">Live</span>
                  )}
                </button>
              </div>
              {/* subtitle removed */}
            </div>

            <div className="hidden w-full min-w-0 flex-nowrap items-center justify-start gap-1.5 pb-0.5 max-md:overflow-x-auto max-md:no-scrollbar md:flex md:mt-0 md:min-w-0 md:flex-1 md:overflow-visible md:justify-start md:pb-0 lg:mt-0 lg:max-w-full lg:justify-start lg:gap-1.5 xl:gap-2">
              <button
                type="button"
                onClick={handleCommandHubBarClick}
                className={`group relative isolate flex h-[42px] min-h-[42px] max-h-[42px] items-center overflow-hidden rounded-2xl border px-2.5 py-0 transition sm:px-3 ${
                  commandHubCount > 0
                    ? "w-full min-w-0 max-w-none flex-1 max-md:min-w-[14rem]"
                    : "w-auto max-w-[18rem] shrink-0 min-w-[11rem]"
                } ${
                  commandHubCount > 0
                    ? `cursor-pointer shadow-[0_0_24px_rgba(34,211,238,0.18)] ring-2 ring-cyan-400/35 hover:border-cyan-400/80 hover:ring-cyan-300/60 hover:shadow-[0_0_32px_rgba(34,211,238,0.26)] active:brightness-[1.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70 ${
                        primaryCommandItem?.type === "alert"
                          ? alertToneClasses(primaryCommandItem.tone)
                          : "border-cyan-400/60 bg-cyan-500/10 hover:bg-cyan-500/15"
                      }`
                    : "border-white/10 bg-white/5"
                } ${commandHubCount > 0 ? "animate-pulse md:animate-none" : ""}`}
              >
                <div className="flex w-full min-w-0 items-center justify-between gap-2">
                  <div className="min-w-0 flex-1 overflow-hidden pr-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <div
                        className={`z-[1] min-w-0 max-w-[min(100%,36rem)] flex-1 whitespace-nowrap overflow-hidden text-ellipsis text-left font-bold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.85)] leading-[1.1] ${desktopPrimaryTitleClass}`}
                        title={desktopPrimaryTitle}
                      >
                        {desktopPrimaryTitle}
                      </div>

                      {commandHubCount > 0 ? (
                        <span className="inline-flex min-w-[24px] items-center justify-center rounded-full bg-cyan-400 px-1.5 py-0.5 text-[10px] font-bold text-slate-950">
                          {commandHubCount}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div
                    className={`shrink-0 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-bold leading-none shadow-inner transition group-hover:border-white/25 group-hover:bg-cyan-400 sm:rounded-xl sm:px-3 ${
                      commandHubCount > 0
                        ? "bg-cyan-500 text-white ring-1 ring-cyan-200/25"
                        : "bg-white/10 text-white/80"
                    }`}
                  >
                    {commandHubCount > 0 ? "OPEN" : "OK"}
                  </div>
                </div>
              </button>

              <Link
                href="/mining"
                className={`shrink-0 rounded-xl border px-2.5 py-2.5 text-sm font-semibold transition lg:px-3 ${
                  hubGameplayOnline
                    ? "border-cyan-400/70 bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/20 shadow-[0_0_24px_rgba(34,211,238,0.22)]"
                    : "border-cyan-400/35 bg-cyan-500/8 text-cyan-200/85 hover:bg-cyan-500/12"
                }`}
              >
                Hub
              </Link>

              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setShowBankedPanel((v) => !v);
                    setShowReadyPanel(false);
                  }}
                  className={`relative flex h-[42px] flex-col items-center justify-center gap-1 rounded-xl border px-2.5 transition lg:px-2.5 ${getBankedSummaryButtonClasses(
                    bankedSummary.tone,
                    showBankedPanel
                  )}`}
                  title="Banked MLEO quick view"
                >
                  <div
                    className={`text-[10px] font-black uppercase tracking-[0.12em] leading-none ${getBankedSummaryButtonEyebrowClass(
                      bankedSummary.tone
                    )}`}
                  >
                    BANKED
                  </div>
                  <div
                    className={`text-xs font-extrabold leading-none ${getBankedSummaryButtonValueClass(
                      bankedSummary.tone
                    )}`}
                  >
                    {formatBankedBadgeCompact(bankedDisplayValue)}
                  </div>
                  {bankedSummary.count > 0 ? (
                    <span
                      className={`absolute -right-1 -top-1 inline-flex min-w-5 h-5 items-center justify-center rounded-full px-1 text-[10px] font-black ${getBankedSummaryBadgeClasses(
                        bankedSummary.tone
                      )}`}
                    >
                      {bankedSummary.count}
                    </span>
                  ) : null}
                </button>

                {showBankedPanel && !shownInfo ? (
                  <div className="absolute right-0 top-[calc(100%+10px)] z-[130] w-[360px]">
                    <BankedQuickPanel
                      snapshot={bankedSnapshot}
                      bankedValue={bankedDisplayValue}
                      guidanceItems={bankedGuidanceItems}
                      state={state}
                      derived={derived}
                      systemState={systemState}
                      onNavigate={openHomeFlowTarget}
                      onClose={() => setShowBankedPanel(false)}
                    />
                  </div>
                ) : null}

                {shownInfo ? (
                  <div className="absolute right-0 top-[calc(100%+10px)] z-[130] w-[360px]">
                    {renderInfoFloatingPanel()}
                  </div>
                ) : null}
              </div>

              <button
                onClick={() => setShowHowToPlay(true)}
                className="shrink-0 rounded-xl border border-blue-500/25 bg-blue-500/10 px-2.5 py-2.5 text-xs font-semibold text-blue-200 hover:bg-blue-500/20 sm:text-sm lg:px-3"
              >
                HOW TO PLAY
              </button>

              <button
                type="button"
                onClick={() => setOpenInfoKey("sharedVault")}
                className="shrink-0 rounded-xl border border-violet-500/30 bg-violet-500/10 px-2.5 py-2.5 text-xs font-semibold text-violet-200 hover:bg-violet-500/18 sm:text-sm lg:px-3"
                title="Shared Vault"
              >
                VAULT {fmt(sharedVault)} MLEO
              </button>

              {isConnected ? (
                <button
                  onClick={() => openAccountModal?.()}
                  className="shrink-0 rounded-xl bg-white/10 px-2.5 py-2.5 text-sm font-semibold hover:bg-white/20 lg:px-3"
                >
                  {address?.slice(0, 6)}…{address?.slice(-4)}
                </button>
              ) : (
                <button
                  onClick={() => openConnectModal?.()}
                  className="shrink-0 rounded-xl bg-rose-600 px-2.5 py-2.5 text-sm font-semibold hover:bg-rose-500 lg:px-3"
                >
                  Connect
                </button>
              )}
            </div>
          </div>

          {null}

          {/* Desktop */}
          <div className="mt-6 hidden sm:grid grid-cols-2 md:hidden gap-3 xl:items-stretch">
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
                      mapTheme={worldMapTheme}
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
                    <div className="mt-1 text-sm font-bold text-white">
                      {overview?.nextAction?.title || nextStep?.title || "Scale efficiently"}
                    </div>
                    <div className="mt-1 text-xs text-white/60">
                      {overview?.nextAction?.text ||
                        nextStep?.text ||
                        "No urgent issue detected. Push your strongest economy upgrade."}
                    </div>
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
                  {
                    key: "overview",
                    label: "Overview",
                    badge:
                      readyCounts.contracts +
                      readyCounts.missions +
                      (readyCounts.specializationMilestones || 0),
                  },
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
                  <BasePanelOverlayCloseHeaderRow
                    variant="desktop"
                    onClose={closeDesktopPanel}
                    aria-label={
                      desktopPanelTitle ? `Close ${desktopPanelTitle} panel` : "Close panel"
                    }
                    bankedBadge={<WindowBankedBadge value={bankedDisplayValue} />}
                  >
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-300/70">
                        Desktop Window
                      </div>
                      <div className="mt-1 text-2xl font-black text-white">{desktopPanelTitle}</div>
                    </div>
                  </BasePanelOverlayCloseHeaderRow>

                  <div ref={desktopPanelScrollRef} className="h-[calc(100%-81px)] overflow-y-auto px-5 py-4">
                    {desktopPanel === "overview" ? (
                      <DesktopPanelSection resourceBar={compactResourceBar}>
                        {world6Command ? (
                          <div
                            data-base-target="world6-command"
                            className={`mb-3 rounded-2xl border px-3 py-3 ${worldCommandToneClass(
                              world6Command.commandKey
                            )} ${
                              isHighlightedTarget("world6-command", highlightTarget)
                                ? "ring-2 ring-cyan-300/90 border-cyan-300 shadow-[0_0_0_1px_rgba(103,232,249,0.45),0_0_28px_rgba(34,211,238,0.18)]"
                                : ""
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-[10px] font-black uppercase tracking-[0.18em] opacity-80">
                                  Nexus Prime
                                </div>
                                <div className="text-sm font-semibold">
                                  {world6Command.flowHeadline} · {world6Command.commandLabel}
                                </div>
                                <div className="mt-1 text-[12px] opacity-85">
                                  {world6Command.actionHint}
                                </div>
                              </div>

                              <div className="shrink-0 rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-bold">
                                {world6Command.chipText}
                              </div>
                            </div>

                            <div className="mt-3 grid grid-cols-1 gap-2 text-[11px] opacity-85 sm:grid-cols-2 xl:grid-cols-4">
                              <div className="rounded-xl border border-white/10 bg-black/10 px-2.5 py-2">
                                <div className="text-[10px] uppercase tracking-[0.14em] opacity-70">
                                  Discipline
                                </div>
                                <div className="mt-1 text-sm font-semibold">
                                  {world6Command.disciplineScore}/100
                                </div>
                              </div>

                              <div className="rounded-xl border border-white/10 bg-black/10 px-2.5 py-2">
                                <div className="text-[10px] uppercase tracking-[0.14em] opacity-70">
                                  Priority
                                </div>
                                <div className="mt-1 text-sm font-semibold">{world6Command.priority}</div>
                              </div>

                              <div className="rounded-xl border border-white/10 bg-black/10 px-2.5 py-2">
                                <div className="text-[10px] uppercase tracking-[0.14em] opacity-70">
                                  Systems
                                </div>
                                <div className="mt-1 text-sm font-semibold">{world6Command.systemsLine}</div>
                              </div>

                              <div className="rounded-xl border border-white/10 bg-black/10 px-2.5 py-2">
                                <div className="text-[10px] uppercase tracking-[0.14em] opacity-70">
                                  Reserves
                                </div>
                                <div className="mt-1 text-sm font-semibold">{world6Command.reservesLine}</div>
                              </div>
                            </div>

                          </div>
                        ) : null}
                        <OverviewPanelCards
                          panelTone={internalPanelTone}
                          openInnerPanel={openInnerPanel}
                          toggleInnerPanel={toggleInnerPanel}
                          overview={overview}
                          missionGuidance={missionGuidanceFocus}
                          nextStep={nextStep}
                          buildOpportunitiesCount={buildOpportunitiesCount}
                          availableStructuresCount={availableStructuresCount}
                          availableModulesCount={availableModulesCount}
                          availableResearchCount={availableResearchCount}
                          availableBlueprintCount={availableBlueprintCount}
                          onOpenBuildPanel={() => openDesktopPanel("build", "build-structures")}
                          onNavigate={navigateToBaseTarget}
                          showCrew={showCrew}
                          crewRoleInfo={crewRoleInfo}
                          roleBonusText={roleBonusText}
                          commanderPathInfo={commanderPathInfo}
                          commanderPathText={commanderPathText}
                          liveContractsAvailableCount={liveContractsAvailableCount}
                          liveContracts={liveContracts}
                          onClaimContract={claimContract}
                          specializationSummary={specializationSummary}
                          sectorWorldSnapshot={sectorWorldSnapshot}
                          onDeployNextSector={handleDeployNextSector}
                          sectorDeployBusy={isActionLocked("sectorDeploy")}
                          systemsHint={world6Command?.overviewSystemsHint ?? null}
                          doctrineContextHint={commandProtocolOverviewDoctrineHint}
                        />
                      </DesktopPanelSection>
                    ) : null}
                {desktopPanel === "ops" ? (
                      <DesktopPanelSection resourceBar={compactResourceBar}>
                        <OpsPanelCards
                          panelTone={internalPanelTone}
                          opsCardClass={buildSectionCardClass(operationsConsoleAvailableCount > 0)}
                          missionsCardClass={`${buildSectionCardClass(dailyMissionsAvailableCount > 0)} ${
                            isHighlightedTarget("missions", highlightTarget)
                              ? "ring-2 ring-cyan-300/90 border-cyan-300 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(103,232,249,0.45),0_0_28px_rgba(34,211,238,0.18)]"
                              : ""
                          }`}
                          opsAvailableCount={operationsConsoleAvailableCount}
                          missionsAvailableCount={dailyMissionsAvailableCount}
                          opsHintText={sectionStatusHint("operations-console", {
                            expedition: readyCounts.expedition > 0,
                            ship: readyCounts.shipment > 0,
                            refill: readyCounts.refill > 0,
                            maintain: readyCounts.maintenance > 0,
                          })}
                          missionsHintText={sectionStatusHint("daily-missions", {
                            count: dailyMissionsAvailableCount,
                          })}
                          openInnerPanel={openInnerPanel}
                          toggleInnerPanel={toggleInnerPanel}
                          operationsConsoleContent={operationsConsoleContent}
                          dailyMissionsContent={dailyMissionsContent}
                          missionsPanelEmpty={dailyMissionsVM.length === 0}
                          opsConsoleEmpty={false}
                        />
                      </DesktopPanelSection>
                    ) : null}

                    {desktopPanel === "build" ? (
                      <DesktopPanelSection resourceBar={compactResourceBar}>
                    <BuildPanelCards
                      panelTone={internalPanelTone}
                      developmentCardClass={buildSectionCardClass(developmentAvailableCount > 0)}
                      structuresCardClass={buildSectionCardClass(structuresAvailableCount > 0)}
                      supportCardClass={buildSectionCardClass(false)}
                      developmentCount={developmentAvailableCount}
                      structuresCount={structuresAvailableCount}
                      supportCount={0}
                      developmentHint={buildSectionHint("development", {
                        modules: availableModulesCount,
                        research: availableResearchCount,
                      })}
                      structuresHint={buildSectionHint("structures", {
                        structures: availableStructuresCount,
                      })}
                      supportHint={buildSectionHint("support", {})}
                      openInnerPanel={openInnerPanel}
                      toggleInnerPanel={toggleInnerPanel}
                      crewModulesResearchContent={crewModulesResearchContent}
                      baseStructuresContent={baseStructuresContent}
                      buildSupportSystemsContent={buildSupportSystemsContent}
                    />
                  </DesktopPanelSection>
                ) : null}

                {desktopPanel === "intel" ? (
                      <DesktopPanelSection resourceBar={compactResourceBar}>
                        <IntelPanelCards
                          panelTone={internalPanelTone}
                          progressCardClass={buildSectionCardClass(intelSummaryAvailableCount > 0)}
                          logCardClass={buildSectionCardClass(false)}
                          progressHint={sectionStatusHint("intel-summary", {
                            count: intelSummaryAvailableCount,
                          })}
                          logHint={sectionStatusHint("intel-log", { count: intelLogAvailableCount })}
                          openInnerPanel={openInnerPanel}
                          toggleInnerPanel={toggleInnerPanel}
                          progressAvailableCount={intelSummaryAvailableCount}
                          logAvailableCount={intelLogAvailableCount}
                          progressSummaryContent={progressSummaryContent}
                          activityLogContent={activityLogContent}
                        />
                      </DesktopPanelSection>
                ) : null}
              </div>
          </div>
              </div>
            </div>
          ) : null}

          {/* Desktop Command Center — single world canvas: HUD + map + tab bar */}
          <>
            <div className="mt-4 hidden min-h-0 flex-1 md:block">
              <div
                className="relative flex h-[calc(100dvh-190px)] flex-col overflow-hidden rounded-[30px] border border-white/[0.08] shadow-[0_18px_60px_rgba(0,0,0,0.28)] backdrop-blur-[1px]"
                style={{ background: worldPlayfieldBackground }}
              >
                <div
                  className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-b from-slate-950/45 via-slate-950/28 to-slate-950/48"
                  aria-hidden
                />
                <div className="relative z-[1] flex h-full min-h-0 flex-col p-3">
                  <div className="mx-auto flex h-full min-h-0 w-full max-w-[1320px] flex-col">
                    <div className="mb-2 shrink-0 grid grid-cols-4 gap-2 xl:grid-cols-8">
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
                            className={`min-h-[60px] rounded-2xl border px-3 py-2 text-left transition hover:bg-white/12 ${
                              focus
                                ? "border-cyan-400/25 bg-cyan-400/[0.12]"
                                : "border-white/10 bg-white/[0.07]"
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

                    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                      <BaseHomeFlowScene
                        base={state}
                        derived={derived}
                        selected={highlightTarget}
                        onSelect={openHomeFlowTarget}
                        layout="desktop"
                        mapTheme={worldMapTheme}
                        playfieldEmbed
                      />
                    </div>

                    <div className="mx-auto mt-2 w-full max-w-5xl shrink-0 border-t border-white/[0.07] pt-3">
                      <div className="grid grid-cols-4 gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.04] p-2 backdrop-blur-sm">
                        {[
                          {
                            key: "overview",
                            label: "Overview",
                            badge:
                              readyCounts.contracts +
                              readyCounts.missions +
                              (readyCounts.specializationMilestones || 0),
                          },
                          {
                            key: "ops",
                            label: "Operations",
                            badge: readyCounts.expedition + readyCounts.shipment,
                          },
                          { key: "build", label: "Build", badge: buildOpportunitiesCount },
                          { key: "intel", label: "Intel", badge: 0 },
                        ].map((tab) => {
                          const active = desktopPanelOpen && desktopPanel === tab.key;
                          const hasBadge = Number(tab.badge || 0) > 0;

                          return (
                            <button
                              key={tab.key}
                              type="button"
                              onClick={() => openDesktopPanel(tab.key)}
                              className={`relative rounded-2xl px-4 py-3 text-sm font-bold transition ${
                                active
                                  ? "bg-cyan-500 text-white"
                                  : hasBadge
                                  ? "border border-cyan-400/40 bg-cyan-500/10 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.12)]"
                                  : "border border-white/10 bg-white/[0.06] text-white/75 hover:bg-white/10"
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
                </div>
              </div>
            </div>
          </>

          {shownInfo ? (
            <>
              <div
                className="fixed inset-0 z-[300] bg-slate-950/78 backdrop-blur-sm md:hidden"
                onClick={() => {
                  setOpenInfoKey(null);
                  setBuildInfo(null);
                }}
              />

              <div className="fixed inset-x-3 top-[88px] bottom-3 z-[301] md:hidden">
                {renderInfoFloatingPanel()}
              </div>
            </>
          ) : null}

          {/* Mobile — world playfield canvas (tabs below use matching bg) */}
          <div className="relative mt-4 space-y-3 md:hidden overscroll-none pb-28">
            <div
              className="relative overflow-hidden rounded-[24px] border border-white/[0.07] shadow-[0_12px_40px_rgba(0,0,0,0.18)]"
              style={{ background: worldPlayfieldBackgroundMobile }}
            >
              <div
                className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-b from-slate-950/35 via-slate-950/18 to-slate-950/30"
                aria-hidden
              />
              <div className="relative z-[1] space-y-3 px-2 pb-1 pt-2">
            <div
              role="button"
              tabIndex={commandHubCount > 0 ? 0 : -1}
              onKeyDown={(e) => {
                if (commandHubCount > 0 && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  handleCommandHubBarClick();
                }
              }}
              onClick={handleCommandHubBarClick}
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
                {mobileTopStats.map((item) =>
                  item.key === "bankedMleo" ? (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        setShowBankedPanel((v) => !v);
                        setShowReadyPanel(false);
                      }}
                      className={`relative shrink-0 min-w-[78px] rounded-2xl border px-2 py-1.5 text-left transition ${getBankedSummaryButtonClasses(
                        bankedSummary.tone,
                        showBankedPanel
                      )}`}
                    >
                      <div
                        className={`text-[10px] uppercase tracking-[0.16em] ${getBankedSummaryButtonEyebrowClass(
                          bankedSummary.tone
                        )}`}
                      >
                        {item.label}
                      </div>
                      <div
                        className={`mt-1 text-sm font-bold ${getBankedSummaryButtonValueClass(
                          bankedSummary.tone
                        )}`}
                      >
                        {item.value}
                      </div>

                      {bankedSummary.count > 0 ? (
                        <span
                          className={`absolute -right-1 -top-1 inline-flex min-w-5 h-5 items-center justify-center rounded-full px-1 text-[10px] font-black ${getBankedSummaryBadgeClasses(
                            bankedSummary.tone
                          )}`}
                        >
                          {bankedSummary.count}
                        </span>
                      ) : null}
                    </button>
                  ) : (
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
                  )
                )}
              </div>
            </div>

            {showBankedPanel ? (
              <>
                <div
                  className="fixed inset-0 z-[125] bg-black/45 md:hidden"
                  onClick={() => setShowBankedPanel(false)}
                />
                <div className="fixed inset-x-3 top-[88px] bottom-3 z-[126] md:hidden">
                  <BankedQuickPanel
                    snapshot={bankedSnapshot}
                    bankedValue={bankedDisplayValue}
                    guidanceItems={bankedGuidanceItems}
                    state={state}
                    derived={derived}
                    systemState={systemState}
                    onNavigate={openHomeFlowTarget}
                    onClose={() => setShowBankedPanel(false)}
                  />
                </div>
              </>
            ) : null}

            <div className="relative mt-1 -translate-y-7">
              <BaseHomeFlowScene
                base={state}
                derived={derived}
                selected={highlightTarget}
                onSelect={openHomeFlowTarget}
                mapTheme={worldMapTheme}
                playfieldEmbed
              />
            </div>
              </div>
            </div>
          </div>

          {/* Mobile Bottom Nav - fixed above panels so switching doesn't require closing */}
          <div className="fixed inset-x-0 bottom-0 z-[120] px-3 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 md:hidden">
            <div
              className="relative mx-auto max-w-md overflow-hidden rounded-3xl border border-white/[0.06] p-2 shadow-[0_-6px_24px_rgba(0,0,0,0.22)] backdrop-blur-sm"
              style={{ background: worldPlayfieldBackgroundMobile }}
            >
              <div
                className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-t from-slate-950/25 via-slate-950/12 to-transparent"
                aria-hidden
              />
              <div className="relative z-[1]">
              <div className="grid grid-cols-4 gap-1.5 min-[400px]:gap-2">
                {[
                  {
                    key: "overview",
                    label: "Overview",
                    ariaLabel: "Overview",
                    badge:
                      readyCounts.contracts +
                      readyCounts.missions +
                      (readyCounts.specializationMilestones || 0),
                  },
                  {
                    key: "ops",
                    label: "Ops",
                    ariaLabel: "Operations",
                    badge: readyCounts.expedition + readyCounts.shipment,
                  },
                  { key: "build", label: "Build", ariaLabel: "Build", badge: buildOpportunitiesCount },
                  { key: "intel", label: "Intel", ariaLabel: "Intel", badge: 0 },
                ].map((tab) => {
                  const active = mobilePanel === tab.key;
                  const badgeN = Number(tab.badge || 0);
                  const hasBadge = badgeN > 0;
                  const badgeText = badgeN > 99 ? "99+" : String(badgeN);

                  return (
                    <button
                      key={tab.key}
                      type="button"
                      aria-label={
                        hasBadge ? `${tab.ariaLabel}. ${badgeN} ready` : tab.ariaLabel
                      }
                      onClick={() => openMobilePanel(tab.key)}
                      className={`relative min-h-[44px] min-w-0 rounded-2xl px-2 py-2.5 text-center text-[11px] font-bold leading-tight outline-none transition focus-visible:ring-2 focus-visible:ring-cyan-400/55 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 active:scale-[0.98] motion-reduce:active:scale-100 min-[400px]:px-3 min-[400px]:py-3 min-[400px]:text-xs ${
                        active
                          ? "bg-cyan-500 text-white"
                          : hasBadge
                          ? "border border-cyan-400/40 bg-cyan-500/10 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.12)]"
                          : "border border-white/10 bg-white/5 text-white/70"
                      }`}
                    >
                      <span className="line-clamp-2">{tab.label}</span>
                      {hasBadge ? (
                        <span
                          aria-hidden
                          title={badgeN > 99 ? `${badgeN} ready` : undefined}
                          className="absolute -right-0.5 -top-0.5 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-cyan-400 px-1 text-[9px] font-black tabular-nums text-slate-950 min-[400px]:-right-1 min-[400px]:-top-1 min-[400px]:text-[10px]"
                        >
                          {badgeText}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              </div>
            </div>
          </div>

          {/* Mobile Panel Overlay */}
          {mobilePanel ? (
            <MobilePanelOverlayShell
              title={mobilePanelTitle}
              bankedBadge={<WindowBankedBadge value={bankedDisplayValue} />}
              onClose={closeMobilePanel}
              scrollRef={mobilePanelScrollRef}
            >
                  <ReadyNowSummaryBlock
                    panelTone={internalPanelTone}
                    readyCounts={readyCounts}
                    showExpeditions={showExpeditions}
                    onOpenMissions={() => {
                      openMobilePanel("ops");
                      setOpenInnerPanel("ops-missions");
                    }}
                    onOpenContracts={() => {
                      openMobilePanel("overview");
                      setOpenInnerPanel("overview-contracts");
                    }}
                    onOpenOpsConsole={() => {
                      navigateToBaseTarget({ tab: "operations", target: "expedition-action" });
                    }}
                  />

                  {mobilePanel === "overview" ? (
                    <MobilePanelSection resourceBar={mobileCompactResourceBar}>
                      {world6Command ? (
                        <div
                          data-base-target="world6-command"
                          className={`mb-3 rounded-2xl border px-3 py-2.5 ${worldCommandToneClass(
                            world6Command.commandKey
                          )} ${
                            isHighlightedTarget("world6-command", highlightTarget)
                              ? "ring-2 ring-cyan-300/90 border-cyan-300 shadow-[0_0_0_1px_rgba(103,232,249,0.45),0_0_28px_rgba(34,211,238,0.18)]"
                              : ""
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-[10px] font-black uppercase tracking-[0.16em] opacity-75">
                                Nexus Prime
                              </div>
                              <div className="truncate text-sm font-semibold">
                                {world6Command.commandLabel} · {world6Command.disciplineScore}/100
                              </div>
                            </div>
                            <div className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-bold">
                              {world6Command.recommendedPushNow ? "PUSH" : "HOLD"}
                            </div>
                          </div>

                          <div className="mt-2 text-[11px] opacity-80">{world6Command.priority}</div>
                        </div>
                      ) : null}
                      <OverviewPanelCards
                        panelTone={internalPanelTone}
                        openInnerPanel={openInnerPanel}
                        toggleInnerPanel={toggleInnerPanel}
                        overview={overview}
                        missionGuidance={missionGuidanceFocus}
                        nextStep={nextStep}
                        buildOpportunitiesCount={buildOpportunitiesCount}
                        availableStructuresCount={availableStructuresCount}
                        availableModulesCount={availableModulesCount}
                        availableResearchCount={availableResearchCount}
                        availableBlueprintCount={availableBlueprintCount}
                        onOpenBuildPanel={() => openMobilePanel("build")}
                        onNavigate={navigateToBaseTarget}
                        showCrew={showCrew}
                        crewRoleInfo={crewRoleInfo}
                        roleBonusText={roleBonusText}
                        commanderPathInfo={commanderPathInfo}
                        commanderPathText={commanderPathText}
                        liveContractsAvailableCount={liveContractsAvailableCount}
                        liveContracts={liveContracts}
                        onClaimContract={claimContract}
                        specializationSummary={specializationSummary}
                        sectorWorldSnapshot={sectorWorldSnapshot}
                        onDeployNextSector={handleDeployNextSector}
                        sectorDeployBusy={isActionLocked("sectorDeploy")}
                        systemsHint={world6Command?.overviewSystemsHint ?? null}
                        doctrineContextHint={commandProtocolOverviewDoctrineHint}
                      />
                    </MobilePanelSection>
                  ) : null}

                  {mobilePanel === "ops" ? (
                    <MobilePanelSection resourceBar={mobileCompactResourceBar}>
                      <OpsPanelCards
                        panelTone={internalPanelTone}
                        opsCardClass={buildSectionCardClass(operationsConsoleAvailableCount > 0)}
                        missionsCardClass={buildSectionCardClass(dailyMissionsAvailableCount > 0)}
                        opsAvailableCount={operationsConsoleAvailableCount}
                        missionsAvailableCount={dailyMissionsAvailableCount}
                        opsHintText={sectionStatusHint("operations-console", {
                          expedition: canExpeditionNow,
                          ship: canShipNow,
                          refill: needsRefillNow,
                          maintain: needsMaintenanceNow,
                        })}
                        missionsHintText={sectionStatusHint("daily-missions", {
                          count: dailyMissionsAvailableCount,
                        })}
                        openInnerPanel={openInnerPanel}
                        toggleInnerPanel={toggleInnerPanel}
                        operationsConsoleContent={operationsConsoleContentMobile}
                        dailyMissionsContent={dailyMissionsContent}
                        missionsPanelEmpty={dailyMissionsVM.length === 0}
                        opsConsoleEmpty={false}
                      />
                    </MobilePanelSection>
                  ) : null}

                  {mobilePanel === "build" ? (
                    <MobilePanelSection resourceBar={mobileCompactResourceBar}>
                      <BuildPanelCards
                        panelTone={internalPanelTone}
                        developmentCardClass={buildSectionCardClass(developmentAvailableCount > 0)}
                        structuresCardClass={buildSectionCardClass(structuresAvailableCount > 0)}
                        supportCardClass={buildSectionCardClass(false)}
                        developmentCount={developmentAvailableCount}
                        structuresCount={structuresAvailableCount}
                        supportCount={0}
                        developmentHint={buildSectionHint("development", {
                          modules: availableModulesCount,
                          research: availableResearchCount,
                        })}
                        structuresHint={buildSectionHint("structures", {
                          structures: availableStructuresCount,
                        })}
                        supportHint={buildSectionHint("support", {})}
                        openInnerPanel={openInnerPanel}
                        toggleInnerPanel={toggleInnerPanel}
                        crewModulesResearchContent={crewModulesResearchContentMobile}
                        baseStructuresContent={baseStructuresContent}
                        buildSupportSystemsContent={buildSupportSystemsContent}
                      />
                    </MobilePanelSection>
                  ) : null}

                  {mobilePanel === "intel" ? (
                    <MobilePanelSection resourceBar={mobileCompactResourceBar}>
                      <IntelPanelCards
                        panelTone={internalPanelTone}
                        progressCardClass={buildSectionCardClass(intelSummaryAvailableCount > 0)}
                        logCardClass={buildSectionCardClass(false)}
                        progressHint={sectionStatusHint("intel-summary", {
                          count: intelSummaryAvailableCount,
                        })}
                        logHint={sectionStatusHint("intel-log", { count: intelLogAvailableCount })}
                        openInnerPanel={openInnerPanel}
                        toggleInnerPanel={toggleInnerPanel}
                        progressAvailableCount={intelSummaryAvailableCount}
                        logAvailableCount={intelLogAvailableCount}
                        progressSummaryContent={progressSummaryContent}
                        activityLogContent={activityLogContent}
                      />
                    </MobilePanelSection>
                  ) : null}
            </MobilePanelOverlayShell>
          ) : null}

          {/* Mobile Menu */}
          {mobileMenuOpen ? (
            <div
              className="fixed inset-0 z-[116] bg-black/60 backdrop-blur-sm md:hidden"
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

          {/* Command hub: full list of alerts & ready actions (tap row inside to navigate). */}
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
                    <div className="text-lg font-bold text-white">Available action</div>
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
                              getCommandHubDeepLink(item)?.target,
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
                    <div className="mt-1 text-lg font-bold text-white">
                      {overview?.nextAction?.title || nextStep?.title || "Scale efficiently"}
                    </div>
                    <div className="mt-1 text-sm text-white/70">
                      {overview?.nextAction?.text ||
                        nextStep?.text ||
                        "No urgent issue detected. Push your strongest economy upgrade."}
                    </div>
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
                          : "A previous command decision improved your next transfer to the shared vault."}
                      </div>
                    </div>

                    {nextShipBonus > 0 ? (
                      <div className="rounded-2xl bg-emerald-500/15 px-4 py-3 text-sm text-emerald-200">
                        Next vault transfer bonus: +{Math.round(nextShipBonus * 100)}%
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
                  <div className="text-xs uppercase tracking-[0.18em] text-white/45">Daily MLEO (base)</div>
                  <div className="mt-1 text-lg font-bold text-white">
                    {fmt(state.mleoProducedToday || 0)} / {fmt(derived.dailyMleoCap ?? derived.shipCap)}
                  </div>
                  <div className="mt-1 text-xs text-white/60">
                    Production cap + softcut (MINERS-aligned). Shipping to vault is not daily-limited.
                  </div>
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
                      mapTheme={worldMapTheme}
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
                          {contract.contractClass === "elite" ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              <span className="inline-flex rounded-full border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-amber-100">
                                Elite
                              </span>
                              <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-bold text-white/55">
                                Rotates daily
                              </span>
                              {contract.eliteTierPill ? (
                                <span className="inline-flex rounded-full border border-cyan-400/25 bg-cyan-500/10 px-2 py-0.5 text-[9px] font-bold text-cyan-100">
                                  {contract.eliteTierPill}
                                </span>
                              ) : null}
                              {contract.eliteProgramPill ? (
                                <span className="inline-flex max-w-full rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-semibold text-white/70">
                                  {contract.eliteProgramPill}
                                </span>
                              ) : null}
                            </div>
                          ) : contract.contractClass === "advanced" ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              <span className="inline-flex rounded-full border border-violet-400/30 bg-violet-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-violet-100">
                                Advanced
                              </span>
                              {contract.advancedTierPill ? (
                                <span className="inline-flex rounded-full border border-cyan-400/25 bg-cyan-500/10 px-2 py-0.5 text-[9px] font-bold text-cyan-100">
                                  {contract.advancedTierPill}
                                </span>
                              ) : null}
                              {contract.advancedProgramPill ? (
                                <span className="inline-flex max-w-full rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-semibold text-white/70">
                                  {contract.advancedProgramPill}
                                </span>
                              ) : null}
                            </div>
                          ) : null}
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
                  subtitle={`Daily MLEO produced in BASE: ${fmt(state.mleoProducedToday || 0)} / ${fmt(
                    derived.dailyMleoCap ?? derived.shipCap
                  )}. Ship banked MLEO to Shared Vault anytime (no daily ship limit).`}
                >
                  {world5Salvage ? (
                    <div
                      className={`mb-3 rounded-2xl border px-3 py-3 ${worldSalvageToneClass(
                        world5Salvage.salvageKey
                      )}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[10px] font-black uppercase tracking-[0.18em] opacity-80">
                            Salvage Graveyard
                          </div>
                          <div className="text-sm font-semibold">
                            {world5Salvage.flowHeadline} · {world5Salvage.salvageLabel}
                          </div>
                          <div className="mt-1 text-[12px] opacity-85">
                            {world5Salvage.actionHint}
                          </div>
                        </div>

                        <div className="shrink-0 rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-bold">
                          {world5Salvage.chipText}
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-1 gap-2 text-[11px] opacity-85 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-xl border border-white/10 bg-black/10 px-2.5 py-2">
                          <div className="text-[10px] uppercase tracking-[0.14em] opacity-70">Discipline</div>
                          <div className="mt-1 text-sm font-semibold">
                            {world5Salvage.disciplineScore}/100
                          </div>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-black/10 px-2.5 py-2">
                          <div className="text-[10px] uppercase tracking-[0.14em] opacity-70">Priority</div>
                          <div className="mt-1 text-sm font-semibold">{world5Salvage.priority}</div>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-black/10 px-2.5 py-2">
                          <div className="text-[10px] uppercase tracking-[0.14em] opacity-70">Systems</div>
                          <div className="mt-1 text-sm font-semibold">{world5Salvage.systemsLine}</div>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-black/10 px-2.5 py-2">
                          <div className="text-[10px] uppercase tracking-[0.14em] opacity-70">Recovery</div>
                          <div className="mt-1 text-sm font-semibold">{world5Salvage.recoveryLine}</div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {world4Reactor ? (
                    <div
                      className={`mb-3 rounded-2xl border px-3 py-3 ${worldReactorToneClass(
                        world4Reactor.loadKey
                      )}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[10px] font-black uppercase tracking-[0.18em] opacity-80">
                            Reactor Scar
                          </div>
                          <div className="text-sm font-semibold">
                            {world4Reactor.flowHeadline} · {world4Reactor.loadLabel}
                          </div>
                          <div className="mt-1 text-[12px] opacity-85">
                            {world4Reactor.actionHint}
                          </div>
                        </div>

                        <div className="shrink-0 rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-bold">
                          {world4Reactor.chipText}
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-1 gap-2 text-[11px] opacity-85 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-xl border border-white/10 bg-black/10 px-2.5 py-2">
                          <div className="text-[10px] uppercase tracking-[0.14em] opacity-70">Discipline</div>
                          <div className="mt-1 text-sm font-semibold">
                            {world4Reactor.disciplineScore}/100
                          </div>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-black/10 px-2.5 py-2">
                          <div className="text-[10px] uppercase tracking-[0.14em] opacity-70">Priority</div>
                          <div className="mt-1 text-sm font-semibold">{world4Reactor.priority}</div>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-black/10 px-2.5 py-2">
                          <div className="text-[10px] uppercase tracking-[0.14em] opacity-70">Support</div>
                          <div className="mt-1 text-sm font-semibold">{world4Reactor.supportLine}</div>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-black/10 px-2.5 py-2">
                          <div className="text-[10px] uppercase tracking-[0.14em] opacity-70">Thermal</div>
                          <div className="mt-1 text-sm font-semibold">{world4Reactor.thermalLine}</div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {world2Throughput ? (
                    <div
                      className={`mb-3 rounded-2xl border px-3 py-3 ${worldLaneToneClass(
                        world2Throughput.laneKey
                      )}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[10px] font-black uppercase tracking-[0.18em] opacity-80">
                            Freight Orbit
                          </div>
                          <div className="text-sm font-semibold">
                            {world2Throughput.flowHeadline} · {world2Throughput.laneLabel}
                          </div>
                          <div className="mt-1 text-[12px] opacity-85">
                            {world2Throughput.actionHint}
                          </div>
                        </div>

                        <div className="shrink-0 rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-bold">
                          {world2Throughput.chipText}
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-1 gap-2 text-[11px] opacity-85 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-xl border border-white/10 bg-black/10 px-2.5 py-2">
                          <div className="text-[10px] uppercase tracking-[0.14em] opacity-70">Discipline</div>
                          <div className="mt-1 text-sm font-semibold">
                            {world2Throughput.disciplineScore}/100
                          </div>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-black/10 px-2.5 py-2">
                          <div className="text-[10px] uppercase tracking-[0.14em] opacity-70">Priority</div>
                          <div className="mt-1 text-sm font-semibold">{world2Throughput.priority}</div>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-black/10 px-2.5 py-2">
                          <div className="text-[10px] uppercase tracking-[0.14em] opacity-70">Support</div>
                          <div className="mt-1 text-sm font-semibold">{world2Throughput.logisticsLine}</div>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-black/10 px-2.5 py-2">
                          <div className="text-[10px] uppercase tracking-[0.14em] opacity-70">Flow</div>
                          <div className="mt-1 text-sm font-semibold">{world2Throughput.shippingLine}</div>
                        </div>
                      </div>
                    </div>
                  ) : null}
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
                          Sends all current banked MLEO to the shared vault. Production uses a daily cap + softcut;
                          shipping does not.
                          {world2Throughput ? (
                            <span className="mt-1 block text-[11px] text-white/65">
                              {world2Throughput.shippingCardHint}
                            </span>
                          ) : null}
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
                        isHighlightedTarget("expedition", highlightTarget) ||
                        isHighlightedTarget("expedition-action", highlightTarget)
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
                        <div className="text-sm font-semibold text-cyan-200">Expedition</div>
                        <p className="mt-1 text-sm text-white/70">
                          Send your field team to gather resources.
                        </p>
                        {world5Salvage ? (
                          <span className="mt-1 block text-[11px] text-white/65">
                            {world5Salvage.expeditionCardHint}
                          </span>
                        ) : null}

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
                        data-base-target="expedition-action"
                        onClick={handleLaunchExpedition}
                        disabled={!canExpeditionNow}
                        className={`mt-auto w-full rounded-2xl bg-cyan-600 px-4 py-3.5 text-sm font-extrabold shadow-lg shadow-cyan-900/30 transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40 ${
                          isHighlightedTarget("expedition-action", highlightTarget)
                            ? "ring-2 ring-cyan-300/90 border-cyan-300 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(103,232,249,0.45),0_0_28px_rgba(34,211,238,0.18)]"
                            : ""
                        }`}
                      >
                        {expeditionLeft > 0 ? `Ready in ${Math.ceil(expeditionLeft / 1000)}s` : "Start Expedition"}
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
                      <div className="flex min-h-[156px] flex-col pr-8">
                        <div className="text-sm font-semibold text-fuchsia-200">Blueprint Cache</div>
                        <p className="mt-1 text-sm text-white/70">
                          Costs {fmt(blueprintCost)} shared MLEO + {fmt(blueprintDataCost)} DATA. Raises banking
                          efficiency permanently.
                        </p>
                      </div>
                      <div className="mt-auto grid grid-cols-1 gap-2 pt-1">
                        <button
                          onClick={buyBlueprint}
                          disabled={!canAffordBlueprint(state, sharedVault, blueprintCost, blueprintDataCost)}
                          className={`w-full rounded-xl px-3 py-3 text-sm font-bold transition ${
                            canAffordBlueprint(state, sharedVault, blueprintCost, blueprintDataCost)
                              ? "bg-fuchsia-600 hover:bg-fuchsia-500"
                              : "bg-white/10 text-white/45"
                          }`}
                        >
                          Buy Blueprint Lv {state.blueprintLevel + 1}
                        </button>
                      </div>
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
                          <button
                            type="button"
                            onClick={applySafeModePreset}
                            aria-pressed={powerPresetActive === "safe"}
                            title={
                              powerPresetActive === "safe"
                                ? "Safe 50% is ON (all runtime buildings match this preset)"
                                : "Safe 50% is OFF — click to apply"
                            }
                            className={`relative z-10 inline-flex cursor-pointer touch-manipulation select-none items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition-all duration-200 active:scale-[0.98] ${
                              powerPresetActive === "safe"
                                ? "border-2 border-cyan-200/90 bg-gradient-to-b from-cyan-500/40 to-cyan-700/30 text-white shadow-[0_0_20px_rgba(34,211,238,0.55)] ring-1 ring-cyan-300/50"
                                : "border border-cyan-400/35 bg-slate-950/90 text-cyan-100/85 shadow-sm hover:border-cyan-300/50 hover:bg-cyan-950/70 hover:text-cyan-50"
                            }`}
                          >
                            <span
                              className={`h-2 w-2 shrink-0 rounded-full ${
                                powerPresetActive === "safe"
                                  ? "bg-cyan-300 shadow-[0_0_10px_#67e8f9]"
                                  : "bg-cyan-950 ring-1 ring-cyan-700/60"
                              }`}
                              aria-hidden
                            />
                            Safe 50%
                            <span
                              className={`text-[9px] font-black uppercase tracking-wider ${
                                powerPresetActive === "safe" ? "text-cyan-50" : "text-cyan-300/50"
                              }`}
                            >
                              {powerPresetActive === "safe" ? "ON" : "OFF"}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={applyNormalModePreset}
                            aria-pressed={powerPresetActive === "normal"}
                            title={
                              powerPresetActive === "normal"
                                ? "Normal 100% is ON (all runtime buildings at 100%)"
                                : "Normal 100% is OFF — click to apply"
                            }
                            className={`relative z-10 inline-flex cursor-pointer touch-manipulation select-none items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition-all duration-200 active:scale-[0.98] ${
                              powerPresetActive === "normal"
                                ? "border-2 border-white/80 bg-gradient-to-b from-white/25 to-white/10 text-white shadow-[0_0_18px_rgba(255,255,255,0.22)] ring-1 ring-white/40"
                                : "border border-white/20 bg-slate-950/90 text-white/80 shadow-sm hover:border-white/40 hover:bg-white/10 hover:text-white"
                            }`}
                          >
                            <span
                              className={`h-2 w-2 shrink-0 rounded-full ${
                                powerPresetActive === "normal"
                                  ? "bg-white shadow-[0_0_10px_rgba(255,255,255,0.9)]"
                                  : "bg-white/15 ring-1 ring-white/25"
                              }`}
                              aria-hidden
                            />
                            Normal 100%
                            <span
                              className={`text-[9px] font-black uppercase tracking-wider ${
                                powerPresetActive === "normal" ? "text-white" : "text-white/50"
                              }`}
                            >
                              {powerPresetActive === "normal" ? "ON" : "OFF"}
                            </span>
                          </button>
                        </div>
                        {powerPresetActive === "mixed" ? (
                          <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200/85">
                            Custom power mix — tap Safe 50% or Normal 100% to align all buildings
                          </p>
                        ) : powerPresetActive === "none" ? (
                          <p className="mt-1.5 text-[10px] text-white/45">
                            Presets apply when you have runtime production buildings.
                          </p>
                        ) : null}
                        <p className="mt-2 text-xs text-white/55">
                          Stability: {fmt(state.stability)}%
                        </p>
                        {world4Reactor ? (
                          <span className="mt-1 block text-[11px] text-white/65">
                            {world4Reactor.overclockCardHint}
                          </span>
                        ) : null}
                        {world4Reactor != null ? (
                          <span className="mt-1 block text-[11px] text-white/65">
                            {world4Reactor.maintenanceThermalHint}
                          </span>
                        ) : null}
                        {world5Salvage != null ? (
                          <span className="mt-1 block text-[11px] text-white/65">
                            {world5Salvage.maintenanceSalvageHint}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-auto grid grid-cols-3 gap-2 pt-1">
                        <button
                          type="button"
                          data-base-target="overclock"
                          onClick={activateOverclock}
                          className={`rounded-xl bg-amber-600 px-3 py-3 text-sm font-bold hover:bg-amber-500 ${
                            isHighlightedTarget("overclock", highlightTarget)
                              ? "ring-2 ring-cyan-300/90 ring-offset-2 ring-offset-amber-500/10"
                              : ""
                          }`}
                        >
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
                    {world3Telemetry ? (
                      <div
                        className={`mb-3 rounded-2xl border px-3 py-3 ${worldSignalToneClass(
                          world3Telemetry.signalKey
                        )}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-[10px] font-black uppercase tracking-[0.18em] opacity-80">
                              Signal Wastes
                            </div>
                            <div className="text-sm font-semibold">
                              {world3Telemetry.flowHeadline} · {world3Telemetry.signalLabel}
                            </div>
                            <div className="mt-1 text-[12px] opacity-85">
                              {world3Telemetry.actionHint}
                            </div>
                          </div>

                          <div className="shrink-0 rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-bold">
                            {world3Telemetry.chipText}
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-1 gap-2 text-[11px] opacity-85 sm:grid-cols-2 xl:grid-cols-4">
                          <div className="rounded-xl border border-white/10 bg-black/10 px-2.5 py-2">
                            <div className="text-[10px] uppercase tracking-[0.14em] opacity-70">Discipline</div>
                            <div className="mt-1 text-sm font-semibold">
                              {world3Telemetry.disciplineScore}/100
                            </div>
                          </div>

                          <div className="rounded-xl border border-white/10 bg-black/10 px-2.5 py-2">
                            <div className="text-[10px] uppercase tracking-[0.14em] opacity-70">Priority</div>
                            <div className="mt-1 text-sm font-semibold">{world3Telemetry.priority}</div>
                          </div>

                          <div className="rounded-xl border border-white/10 bg-black/10 px-2.5 py-2">
                            <div className="text-[10px] uppercase tracking-[0.14em] opacity-70">Systems</div>
                            <div className="mt-1 text-sm font-semibold">{world3Telemetry.systemsLine}</div>
                          </div>

                          <div className="rounded-xl border border-white/10 bg-black/10 px-2.5 py-2">
                            <div className="text-[10px] uppercase tracking-[0.14em] opacity-70">Telemetry</div>
                            <div className="mt-1 text-sm font-semibold">{world3Telemetry.telemetryLine}</div>
                          </div>
                        </div>
                      </div>
                    ) : null}
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

        {devSectorModalOpen && isBaseDevToolsEnabled() ? (
          <div
            className="fixed inset-0 z-[132] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
            onClick={() => !devSectorBusy && setDevSectorModalOpen(false)}
            role="presentation"
          >
            <div
              className="w-full max-w-md rounded-2xl border border-rose-500/35 bg-[#0d1626] p-4 text-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="dev-sector-modal-title"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2
                    id="dev-sector-modal-title"
                    className="text-sm font-black uppercase tracking-[0.14em] text-rose-200/90"
                  >
                    DEV sector switch
                  </h2>
                  <p className="mt-1 text-[11px] text-white/50">
                    Temporary · sets server <span className="text-rose-200/80">sector_world</span> for this device
                  </p>
                </div>
                <button
                  type="button"
                  disabled={devSectorBusy}
                  onClick={() => setDevSectorModalOpen(false)}
                  className="shrink-0 rounded-lg bg-white/10 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/20 disabled:opacity-40"
                >
                  Close
                </button>
              </div>
              <div className="mt-4 grid gap-2">
                {WORLDS.map((w) => {
                  const active = w.order === activeWorldOrder;
                  return (
                    <button
                      key={w.id}
                      type="button"
                      disabled={devSectorBusy || active}
                      onClick={() => applyDevSectorWorldOrder(w.order)}
                      className={`rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                        active
                          ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-50"
                          : "border-white/10 bg-white/[0.04] text-white/90 hover:border-white/20 hover:bg-white/[0.07]"
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      <span className="font-bold">World {w.order}</span>
                      <span className="text-white/50"> · </span>
                      <span className="text-white/80">{w.name}</span>
                      {active ? (
                        <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-cyan-200/80">
                          current
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              {devSectorBusy ? (
                <p className="mt-3 text-center text-[11px] text-white/45">Updating…</p>
              ) : null}
            </div>
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
                    <li>decide whether to reinvest or ship banked MLEO to the shared vault</li>
                  </ul>
                  <p className="mt-2">
                    This makes BASE a controlled system, not an unlimited faucet.
                  </p>
                </section>

                <section>
                  <h3 className="text-lg font-bold text-white">8. Shipping to the Shared Vault</h3>
                  <p className="mt-2">
                    Shipping moves your current <strong className="text-white">banked MLEO</strong> into the{" "}
                    <strong className="text-white">shared vault</strong> (full transfer).
                  </p>
                  <p className="mt-2">Why it matters:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li>it connects BASE to the wider MLEO ecosystem</li>
                    <li>it supports your shared balance used across the platform</li>
                    <li>it keeps BASE tied to long-term ecosystem utility</li>
                  </ul>
                  <p className="mt-2">
                    Shipping itself is <strong className="text-white">not</strong> daily-capped. The daily cap and
                    softcut apply to <strong className="text-white">MLEO production inside BASE</strong> (before it
                    becomes banked).
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
