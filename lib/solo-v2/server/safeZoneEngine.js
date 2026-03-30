import { randomInt } from "crypto";
import {
  SAFE_ZONE_MAX_RUN_MS,
  SAFE_ZONE_MIN_SECURED_MS,
  SAFE_ZONE_TIER_MS,
  safeZoneMultiplierForSecuredMs,
  safeZonePayoutForMs,
} from "../safeZoneConfig";

export function generateSafeZoneRunConfig() {
  return {
    startPos: 0.5,
    startVel: 0,
    gravity: (randomInt(26, 41) / 1000), // down drift
    holdAccel: (randomInt(48, 66) / 1000), // counter force
    damping: 0.0006,
    failMin: 0.06,
    failMax: 0.94,
    safeMin: 0.34,
    safeMax: 0.66,
    graceMs: 220,
    maxRunMs: SAFE_ZONE_MAX_RUN_MS,
    minSecuredMs: SAFE_ZONE_MIN_SECURED_MS,
    tiersMs: SAFE_ZONE_TIER_MS,
  };
}

export function evolveStateStep(state, dtMs, holding, cfg) {
  const dt = Math.max(0, Number(dtMs) || 0);
  if (dt <= 0) return state;
  let pos = Number(state.pos) || 0.5;
  let vel = Number(state.vel) || 0;
  const g = Number(cfg.gravity) || 0;
  const h = Number(cfg.holdAccel) || 0;
  const damp = Number(cfg.damping) || 0;
  const accel = (holding ? -h : 0) + g - vel * damp * dt;
  vel += accel * dt;
  pos += vel * dt;
  return { ...state, pos, vel };
}

/**
 * Replays from start + control timeline to targetMs.
 */
export function simulateSafeZoneToMs({
  cfg,
  roundStartMs,
  controls,
  targetMs,
}) {
  let state = {
    pos: Number(cfg.startPos) || 0.5,
    vel: Number(cfg.startVel) || 0,
    securedMs: 0,
    outMs: 0,
    failed: false,
    failAtMs: null,
    runMs: 0,
    holding: false,
  };
  const start = Math.floor(Number(roundStartMs) || 0);
  const end = Math.max(start, Math.floor(Number(targetMs) || start));
  const events = (Array.isArray(controls) ? controls : [])
    .map(e => ({ serverMs: Math.floor(Number(e.serverMs) || 0), holding: Boolean(e.holding) }))
    .filter(e => Number.isFinite(e.serverMs) && e.serverMs >= start && e.serverMs <= end)
    .sort((a, b) => a.serverMs - b.serverMs);

  let cursor = start;
  const segments = [...events, { serverMs: end, holding: state.holding, terminal: true }];
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    const nextMs = seg.serverMs;
    if (nextMs > cursor) {
      const dt = nextMs - cursor;
      state = evolveStateStep(state, dt, state.holding, cfg);
      state.runMs += dt;
      const inSafe = state.pos >= cfg.safeMin && state.pos <= cfg.safeMax;
      state.securedMs += inSafe ? dt : 0;
      state.outMs = inSafe ? 0 : state.outMs + dt;
      const hardFail = state.pos <= cfg.failMin || state.pos >= cfg.failMax;
      const graceFail = state.outMs > Math.floor(Number(cfg.graceMs) || 0);
      if (hardFail || graceFail) {
        state.failed = true;
        state.failAtMs = cursor + dt;
        break;
      }
      cursor = nextMs;
    }
    if (!seg.terminal) {
      state.holding = Boolean(seg.holding);
    }
  }
  const cappedSecured = Math.max(0, Math.min(state.securedMs, Number(cfg.maxRunMs) || SAFE_ZONE_MAX_RUN_MS));
  const tierMult = safeZoneMultiplierForSecuredMs(cappedSecured);
  return {
    ...state,
    securedMs: cappedSecured,
    tierMultiplier: tierMult,
    canCashOut: cappedSecured >= (Number(cfg.minSecuredMs) || SAFE_ZONE_MIN_SECURED_MS),
    fullDuration: (state.runMs >= (Number(cfg.maxRunMs) || SAFE_ZONE_MAX_RUN_MS)) && !state.failed,
  };
}

export function payoutForSafeZone(entryCost, securedMs) {
  return safeZonePayoutForMs(entryCost, securedMs);
}
