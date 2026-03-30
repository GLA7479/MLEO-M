import { randomInt } from "crypto";
import { PULSE_LOCK_MULTIPLIERS } from "../pulseLockConfig";

const TICKS = 10000;

/**
 * Server-only RNG for one sweep round. Distances are absolute on the 0–1 bar (as integer ticks).
 */
export function generatePulseLockRoundConfig() {
  const sweepPeriodMs = randomInt(2400, 3601);
  const centerTicks = randomInt(Math.floor(TICKS * 0.18), Math.ceil(TICKS * 0.82));
  const rPerfectTicks = randomInt(280, 451);
  const rGoodTicks = randomInt(rPerfectTicks + 400, rPerfectTicks + 1100);
  const rEdgeTicks = randomInt(rGoodTicks + 350, rGoodTicks + 950);
  const safeEdge = Math.min(rEdgeTicks, Math.floor(TICKS * 0.48));
  const rG = Math.min(rGoodTicks, safeEdge - 250);
  const rE = Math.min(Math.max(rG + 100, rEdgeTicks), safeEdge);
  return {
    sweepPeriodMs,
    centerTicks,
    rPerfectTicks,
    rGoodTicks: Math.max(rPerfectTicks + 200, rG),
    rEdgeTicks: Math.max(rG + 50, rE),
  };
}

/**
 * @returns {{ hitQuality: "perfect"|"good"|"edge"|"miss"; positionTicks: number; distanceTicks: number }}
 */
export function evaluatePulseLockHit(positionTicks, cfg) {
  const c = Math.max(0, Math.min(TICKS - 1, Math.floor(Number(cfg.centerTicks) || 0)));
  const p = Math.max(0, Math.min(TICKS - 1, Math.floor(Number(positionTicks) || 0)));
  const d = Math.abs(p - c);
  const rP = Math.max(1, Math.floor(Number(cfg.rPerfectTicks) || 1));
  const rG = Math.max(rP + 1, Math.floor(Number(cfg.rGoodTicks) || rP + 1));
  const rE = Math.max(rG + 1, Math.floor(Number(cfg.rEdgeTicks) || rG + 1));

  if (d <= rP) return { hitQuality: "perfect", positionTicks: p, distanceTicks: d };
  if (d <= rG) return { hitQuality: "good", positionTicks: p, distanceTicks: d };
  if (d <= rE) return { hitQuality: "edge", positionTicks: p, distanceTicks: d };
  return { hitQuality: "miss", positionTicks: p, distanceTicks: d };
}

export function multiplierForHitQuality(hitQuality) {
  const q = String(hitQuality || "").toLowerCase();
  if (q === "perfect") return PULSE_LOCK_MULTIPLIERS.perfect;
  if (q === "good") return PULSE_LOCK_MULTIPLIERS.good;
  if (q === "edge") return PULSE_LOCK_MULTIPLIERS.edge;
  return PULSE_LOCK_MULTIPLIERS.miss;
}
