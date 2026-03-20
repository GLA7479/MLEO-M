import { MinersConfig } from "../types";

function stageRatio(stage: number, cfg: MinersConfig): number {
  const row = cfg.stageBlocks.find((b) => stage >= b.start && stage <= b.end);
  return row ? row.r : cfg.stageBlocks[cfg.stageBlocks.length - 1].r;
}

function softcutFactor(used: number, cfg: MinersConfig): number {
  const ratio = cfg.dailyCap > 0 ? used / cfg.dailyCap : 0;
  for (const seg of cfg.softcut) {
    if (ratio <= seg.upto) return seg.factor;
  }
  return cfg.softcut[cfg.softcut.length - 1].factor;
}

export interface MinersDayInput {
  activeBreaks: number;
  offlineBreaks: number;
  moveToVaultRate: number;
  claimToVaultPerDay: number;
  stageResetEveryBreaks: number;
  stageStart: number;
  stageStartDriftPerDay: number;
  dayIndex: number;
}

export interface MinersState {
  stage: number;
  nextBreakValue: number;
  carryBalance: number;
}

export interface MinersDayResult {
  grossCreated: number;
  afterSoftcutCap: number;
  movedToVault: number;
  endingCarryBalance: number;
}

export function defaultMinersState(cfg: MinersConfig): MinersState {
  return { stage: 1, nextBreakValue: cfg.baseStageV1, carryBalance: 0 };
}

export function simulateMinersDay(
  cfg: MinersConfig,
  input: MinersDayInput,
  state: MinersState
): MinersDayResult {
  const activeCount = Math.max(0, Math.floor(input.activeBreaks));
  const offlineCount = Math.max(0, Math.floor(input.offlineBreaks));
  const totalBreaks = activeCount + offlineCount;
  let minedToday = 0;
  let rawGrossBeforeSoftcutCap = 0;
  let gross = 0;
  const stageStartToday = Math.max(
    1,
    Math.floor(input.stageStart + input.dayIndex * input.stageStartDriftPerDay)
  );
  const resetEvery = Math.max(1, Math.floor(input.stageResetEveryBreaks));

  for (let i = 0; i < totalBreaks; i += 1) {
    if (i % resetEvery === 0) {
      state.stage = stageStartToday;
      state.nextBreakValue = cfg.baseStageV1;
      for (let s = 1; s < stageStartToday; s += 1) {
        state.nextBreakValue *= stageRatio(s, cfg);
      }
    }
    const isOffline = i >= activeCount;
    const baseAward = state.nextBreakValue * (isOffline ? cfg.offlineFactor : 1);
    rawGrossBeforeSoftcutCap += baseAward;
    const factor = softcutFactor(minedToday, cfg);
    let award = baseAward * factor;
    const room = Math.max(0, cfg.dailyCap - minedToday);
    if (award > room) award = room;
    if (award < 0) award = 0;
    minedToday += award;
    gross += award;

    const r = stageRatio(state.stage, cfg);
    state.nextBreakValue = state.nextBreakValue * r;
    state.stage = Math.min(1000, state.stage + 1);
    if (minedToday >= cfg.dailyCap) break;
  }

  state.carryBalance += gross;
  const claimFactor = Math.min(1, Math.max(0, input.moveToVaultRate) * Math.max(0.25, input.claimToVaultPerDay / 2));
  const moved = Math.floor(state.carryBalance * claimFactor);
  state.carryBalance = Math.max(0, state.carryBalance - moved);
  return {
    grossCreated: rawGrossBeforeSoftcutCap,
    afterSoftcutCap: gross,
    movedToVault: moved,
    endingCarryBalance: state.carryBalance,
  };
}
