import { SimulationConfig } from "./types";

export const CONFIG: SimulationConfig = {
  miners: {
    // Source: sql/miners_server_authority.sql
    dailyCap: 2_500,
    offlineFactor: 0.35,
    baseStageV1: 0.20,
    softcut: [
      { upto: 0.55, factor: 1.0 },
      { upto: 0.75, factor: 0.55 },
      { upto: 0.90, factor: 0.30 },
      { upto: 1.0, factor: 0.15 },
      { upto: 9.99, factor: 0.06 },
    ],
    stageBlocks: [
      { start: 1, end: 10, r: 1.32 },
      { start: 11, end: 20, r: 1.18 },
      { start: 21, end: 30, r: 1.11 },
      { start: 31, end: 40, r: 1.06 },
      { start: 41, end: 50, r: 1.025 },
      { start: 51, end: 1000, r: 1.0004 },
    ],
  },
  base: {
    // Source: sql/base_server_authority.sql + sql/base_atomic_rpc.sql
    baseEnergyCap: 148,
    powerCapBonus: 42,
    coolantCapBonus: 22,
    baseEnergyRegen: 6.4,
    powerRegenBonus: 2.5,
    coolantRegenBonus: 1.35,
    dailyShipCap: 1800,
    shipLogisticsBonus: 320,
    shipBlueprintBonus: 90,
    refineryOreUsePerSec: 1.8,
    refineryScrapUsePerSec: 0.7,
    bankGainRate: 0.015,
    refillCost: 160,
    overclockCost: 900,
    blueprintBaseCost: 1800,
    blueprintGrowth: 1.65,
  },
  arcade: {
    // Grouped deterministic abstraction over finish_arcade_session branches.
    paidRtpByCategory: {
      low: 0.94,
      medium: 0.975,
      high: 0.99,
    },
  },
};

export const WINDOWS_DAYS = [1, 7, 30, 365, 1825] as const;
