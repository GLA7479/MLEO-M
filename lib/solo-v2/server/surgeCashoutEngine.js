import { randomInt } from "crypto";
import {
  SURGE_CASHOUT_CRASH_MAX_HUNDREDTHS,
  SURGE_CASHOUT_CRASH_MIN_HUNDREDTHS,
  SURGE_CASHOUT_RISE_PER_SECOND,
} from "../surgeCashoutConfig";

export const SURGE_PHASE_PRE = "surge_cashout_pre";
export const SURGE_PHASE_LIVE = "surge_cashout_live";
/** Terminal rows use this phase marker in `server_outcome_summary`. */
export const SURGE_PHASE_RESOLVED = "surge_cashout_resolved";

export function buildSurgeCashoutPreSummary() {
  return {
    phase: SURGE_PHASE_PRE,
  };
}

export function sampleCrashMultiplierHundredths() {
  return randomInt(SURGE_CASHOUT_CRASH_MIN_HUNDREDTHS, SURGE_CASHOUT_CRASH_MAX_HUNDREDTHS + 1);
}

/**
 * @param {number} crashHundredths
 * @param {number} startedAtMs
 */
export function buildSurgeCashoutLiveSummary(crashHundredths, startedAtMs) {
  const crash = Math.max(101, Math.floor(Number(crashHundredths) || 0)) / 100;
  return {
    phase: SURGE_PHASE_LIVE,
    crashMultiplier: crash,
    startedAtMs: Math.floor(Number(startedAtMs) || 0),
    risePerSecond: SURGE_CASHOUT_RISE_PER_SECOND,
  };
}

export function parseSurgeCashoutLiveSummary(summary) {
  const s = summary || {};
  if (s.phase !== SURGE_PHASE_LIVE) return null;
  const crash = Number(s.crashMultiplier);
  const startedAtMs = Math.floor(Number(s.startedAtMs) || 0);
  const risePerSecond = Number(s.risePerSecond);
  if (!Number.isFinite(crash) || crash < 1.01 || !Number.isFinite(startedAtMs) || startedAtMs <= 0)
    return null;
  if (!Number.isFinite(risePerSecond) || risePerSecond <= 0) return null;
  return { crashMultiplier: crash, startedAtMs, risePerSecond };
}

export function parseSurgeCashoutPreSummary(summary) {
  const s = summary || {};
  if (s.phase !== SURGE_PHASE_PRE) return null;
  return {};
}

/** Raw rising multiplier before crash cap (may exceed crash). */
export function computeRawMultiplierAt(startedAtMs, nowMs, risePerSecond) {
  const t0 = Math.floor(Number(startedAtMs) || 0);
  const t1 = Math.floor(Number(nowMs) || 0);
  const rate = Number(risePerSecond);
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || !Number.isFinite(rate) || rate <= 0) return 1;
  const elapsedSec = Math.max(0, (t1 - t0) / 1000);
  return 1 + rate * elapsedSec;
}

export function surgeCashoutMultiplierNow(live, nowMs) {
  const m = computeRawMultiplierAt(live.startedAtMs, nowMs, live.risePerSecond);
  return Math.min(m, live.crashMultiplier);
}

export function isSurgePastCrash(live, nowMs) {
  const raw = computeRawMultiplierAt(live.startedAtMs, nowMs, live.risePerSecond);
  return raw + 1e-9 >= live.crashMultiplier;
}
