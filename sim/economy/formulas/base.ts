import { BaseConfig } from "../types";

export interface BaseDayInput {
  logisticsLevel: number;
  powerCellLevel: number;
  hasCoolant: boolean;
  refineryLevel: number;
  blueprintLevel: number;
  activeSecondsPerDay: number;
  offlineEffectiveFactor: number;
  shipsPerDay: number;
  spendBlueprintPerDay: number;
  spendOverclockPerDay: number;
  spendRefillPerDay: number;
}

export interface BaseState {
  bankedMleo: number;
  sentToday: number;
  blueprintLevel: number;
}

export interface BaseDayResult {
  bankedCreated: number;
  movedToVault: number;
  vaultInternalSpends: number;
  endingBlueprintLevel: number;
}

function shipOnce(cfg: BaseConfig, state: BaseState, logisticsLevel: number): number {
  const shipCap =
    cfg.dailyShipCap +
    logisticsLevel * cfg.shipLogisticsBonus +
    state.blueprintLevel * cfg.shipBlueprintBonus;
  const room = Math.max(0, shipCap - state.sentToday);
  if (room <= 0 || state.bankedMleo <= 0) return 0;
  const factor = Math.max(0.5, 1 - (state.sentToday / shipCap) * 0.5);
  const bankBonus = 1 + state.blueprintLevel * 0.02 + logisticsLevel * 0.025;
  const shipped = Math.min(Math.floor(state.bankedMleo * factor * bankBonus), room);
  if (shipped <= 0) return 0;
  const consumed = Math.min(
    state.bankedMleo,
    Math.max(1, Math.ceil(shipped / Math.max(0.01, factor * bankBonus)))
  );
  state.bankedMleo -= consumed;
  state.sentToday += shipped;
  return shipped;
}

export function defaultBaseState(blueprintStartLevel: number): BaseState {
  return { bankedMleo: 0, sentToday: 0, blueprintLevel: blueprintStartLevel };
}

export function simulateBaseDay(cfg: BaseConfig, input: BaseDayInput, state: BaseState): BaseDayResult {
  state.sentToday = 0;
  const effectiveSeconds =
    input.activeSecondsPerDay + (86400 - input.activeSecondsPerDay) * input.offlineEffectiveFactor;
  const oreUse = input.refineryLevel * cfg.refineryOreUsePerSec * effectiveSeconds;
  const scrapUse = input.refineryLevel * cfg.refineryScrapUsePerSec * effectiveSeconds;
  const mleoMult = 1;
  const bankBonus = 1 + state.blueprintLevel * 0.02 + input.logisticsLevel * 0.025;
  const bankedGain =
    Math.min(oreUse / cfg.refineryOreUsePerSec, scrapUse / cfg.refineryScrapUsePerSec) *
    cfg.bankGainRate *
    mleoMult *
    bankBonus;
  state.bankedMleo += bankedGain;

  let moved = 0;
  const ships = Math.max(0, input.shipsPerDay);
  const wholeShips = Math.floor(ships);
  for (let i = 0; i < wholeShips; i += 1) moved += shipOnce(cfg, state, input.logisticsLevel);

  // Deterministic fractional ship handling without RNG.
  if (ships - wholeShips > 0.0001) {
    moved += (ships - wholeShips) * shipOnce(cfg, { ...state }, input.logisticsLevel);
  }

  const blueprintBuys = input.spendBlueprintPerDay;
  const overclockBuys = input.spendOverclockPerDay;
  const refillBuys = input.spendRefillPerDay;

  let spends = 0;
  const wholeBlueprint = Math.floor(blueprintBuys);
  for (let i = 0; i < wholeBlueprint; i += 1) {
    spends += Math.floor(cfg.blueprintBaseCost * Math.pow(cfg.blueprintGrowth, state.blueprintLevel));
    state.blueprintLevel += 1;
  }
  if (blueprintBuys - wholeBlueprint > 0) {
    spends +=
      (blueprintBuys - wholeBlueprint) *
      Math.floor(cfg.blueprintBaseCost * Math.pow(cfg.blueprintGrowth, state.blueprintLevel));
  }
  spends += overclockBuys * cfg.overclockCost + refillBuys * cfg.refillCost;

  return {
    bankedCreated: bankedGain,
    movedToVault: moved,
    vaultInternalSpends: spends,
    endingBlueprintLevel: state.blueprintLevel,
  };
}
