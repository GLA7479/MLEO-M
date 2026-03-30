export const CORE_BALANCE_PHASE_ACTIVE = "core_balance_active";
export const CORE_BALANCE_PHASE_RESOLVED = "core_balance_resolved";

export const CORE_BALANCE_ACTIONS = /** @type {const} */ (["vent", "bleed", "sink", "shunt"]);

/** @typedef {{ heat: number; pressure: number; charge: number }} Meters */

function hashUuidToSeed(uuid) {
  const s = String(uuid || "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clampMeter(v) {
  return Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
}

/**
 * @param {string} sessionId
 */
export function buildCoreBalanceInitialSummary(sessionId) {
  const rng = mulberry32(hashUuidToSeed(sessionId));
  return {
    phase: CORE_BALANCE_PHASE_ACTIVE,
    tick: 0,
    maxTicks: 12,
    heat: 38 + Math.floor(rng() * 25),
    pressure: 38 + Math.floor(rng() * 25),
    charge: 38 + Math.floor(rng() * 25),
    criticalLow: 12,
    criticalHigh: 88,
    safeLow: 24,
    safeHigh: 76,
  };
}

function driftAtSessionTick(sessionId, tick) {
  const rng = mulberry32((hashUuidToSeed(sessionId) + tick * 1009) >>> 0);
  return {
    heat: Math.floor(rng() * 11) - 5,
    pressure: Math.floor(rng() * 11) - 5,
    charge: Math.floor(rng() * 11) - 5,
  };
}

/**
 * @param {Meters} m
 * @param {typeof CORE_BALANCE_ACTIONS[number]} action
 * @returns {Meters}
 */
export function applyCoreBalanceAction(m, action) {
  let heat = Number(m.heat);
  let pressure = Number(m.pressure);
  let charge = Number(m.charge);
  switch (action) {
    case "vent":
      heat -= 12;
      pressure += 5;
      charge += 2;
      break;
    case "bleed":
      heat += 4;
      pressure -= 12;
      charge += 3;
      break;
    case "sink":
      heat += 3;
      pressure += 4;
      charge -= 12;
      break;
    case "shunt": {
      const pull = (v) => {
        const t = 50;
        const step = 6;
        return v + Math.sign(t - v) * Math.min(step, Math.abs(t - v));
      };
      heat = pull(heat);
      pressure = pull(pressure);
      charge = pull(charge);
      break;
    }
    default:
      break;
  }
  return {
    heat: clampMeter(heat),
    pressure: clampMeter(pressure),
    charge: clampMeter(charge),
  };
}

export function normalizeCoreBalanceAction(raw) {
  const v = String(raw || "").trim().toLowerCase();
  return CORE_BALANCE_ACTIONS.includes(v) ? v : null;
}

/**
 * @param {unknown} summary
 */
export function parseCoreBalanceActiveSummary(summary) {
  const s = summary || {};
  if (s.phase !== CORE_BALANCE_PHASE_ACTIVE) return null;
  const tick = Math.floor(Number(s.tick) || 0);
  const maxTicks = Math.floor(Number(s.maxTicks) || 0);
  if (maxTicks < 4 || maxTicks > 40) return null;
  const heat = clampMeter(s.heat);
  const pressure = clampMeter(s.pressure);
  const charge = clampMeter(s.charge);
  const criticalLow = Math.floor(Number(s.criticalLow) || 12);
  const criticalHigh = Math.floor(Number(s.criticalHigh) || 88);
  const safeLow = Math.floor(Number(s.safeLow) || 24);
  const safeHigh = Math.floor(Number(s.safeHigh) || 76);
  if (criticalLow >= criticalHigh) return null;
  return {
    tick,
    maxTicks,
    heat,
    pressure,
    charge,
    criticalLow,
    criticalHigh,
    safeLow,
    safeHigh,
  };
}

export function meterCriticalLabel(heat, pressure, charge, low, high) {
  if (heat <= low || heat >= high) return "heat";
  if (pressure <= low || pressure >= high) return "pressure";
  if (charge <= low || charge >= high) return "charge";
  return null;
}

/**
 * @param {string} sessionId
 * @param {NonNullable<ReturnType<typeof parseCoreBalanceActiveSummary>>} active
 * @param {typeof CORE_BALANCE_ACTIONS[number]} action
 */
export function advanceCoreBalanceTick(sessionId, active, action) {
  const afterAction = applyCoreBalanceAction(
    { heat: active.heat, pressure: active.pressure, charge: active.charge },
    action,
  );
  const drift = driftAtSessionTick(sessionId, active.tick);
  const heat = clampMeter(afterAction.heat + drift.heat);
  const pressure = clampMeter(afterAction.pressure + drift.pressure);
  const charge = clampMeter(afterAction.charge + drift.charge);
  const nextTick = active.tick + 1;

  const fail = meterCriticalLabel(heat, pressure, charge, active.criticalLow, active.criticalHigh);
  if (fail) {
    return {
      kind: "lose",
      failMeter: fail,
      heat,
      pressure,
      charge,
      tick: nextTick,
    };
  }
  if (nextTick >= active.maxTicks) {
    return {
      kind: "win",
      failMeter: null,
      heat,
      pressure,
      charge,
      tick: nextTick,
    };
  }
  return {
    kind: "continue",
    failMeter: null,
    heat,
    pressure,
    charge,
    tick: nextTick,
  };
}
