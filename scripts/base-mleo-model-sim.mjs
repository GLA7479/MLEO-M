import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * BASE MLEO model simulations — mirrors sql/base_server_authority.sql + base_atomic_rpc.sql
 * Run: node scripts/base-mleo-model-sim.mjs
 * Tuning sweep (48 combos): node scripts/base-mleo-model-sim.mjs --tune
 */

const DAILY_CAP = 3400;
const MLEO_GAIN_MULT = 0.4;
const CORE = 0.015; // refinery raw MLEO core (server line ~784)
const ORE_USE_PER_LEVEL = 1.8;
const SCRAP_USE_PER_LEVEL = 0.7;
const REFINERY_ENERGY_PER_LEVEL = 0.9;

const SOFTCUT = [
  { upto: 0.55, factor: 1.0 },
  { upto: 0.75, factor: 0.55 },
  { upto: 0.9, factor: 0.3 },
  { upto: 1.0, factor: 0.15 },
  { upto: 9.99, factor: 0.06 },
];

function softcutFactor(used, cap) {
  if (!cap || cap <= 0) return 1;
  const ratio = Math.max(0, Number(used || 0)) / cap;
  for (const step of SOFTCUT) {
    if (ratio <= step.upto) return step.factor;
  }
  return 0.06;
}

/** Build softcut lookup from `{ upto, factor }[]` (same semantics as SQL base_softcut_factor). */
function makeSoftcutFactor(steps) {
  const sorted = [...steps].sort((a, b) => a.upto - b.upto);
  return (used, cap) => {
    if (!cap || cap <= 0) return 1;
    const ratio = Math.max(0, Number(used || 0)) / cap;
    for (const step of sorted) {
      if (ratio <= step.upto) return step.factor;
    }
    return sorted[sorted.length - 1].factor;
  };
}

/** Tuning sweep curves (ratio brackets → factor). */
const SOFTCUT_CURVES = {
  A_current: [
    { upto: 0.55, factor: 1.0 },
    { upto: 0.75, factor: 0.55 },
    { upto: 0.9, factor: 0.3 },
    { upto: 1.0, factor: 0.15 },
  ],
  B_medium: [
    { upto: 0.6, factor: 1.0 },
    { upto: 0.8, factor: 0.65 },
    { upto: 0.92, factor: 0.4 },
    { upto: 1.0, factor: 0.2 },
  ],
  C_softer: [
    { upto: 0.65, factor: 1.0 },
    { upto: 0.85, factor: 0.75 },
    { upto: 0.95, factor: 0.5 },
    { upto: 1.0, factor: 0.25 },
  ],
};

const PLAYER_PROFILES = [
  { id: "early", refinery: 2, mleoMult: 1.06, bankBonus: 1.04 },
  { id: "early-mid", refinery: 4, mleoMult: 1.12, bankBonus: 1.1 },
  { id: "mid", refinery: 6, mleoMult: 1.25, bankBonus: 1.15 },
  { id: "advanced", refinery: 10, mleoMult: 1.45, bankBonus: 1.25 },
];

function profileMetrics(refinery, mleoMult, bankBonus, gainMult, cap, softSteps) {
  const soft = makeSoftcutFactor(softSteps);
  const rawPerSec = refinery * CORE * mleoMult * bankBonus * gainMult;
  let m = 0;
  for (let s = 0; s < 86400; s++) {
    if (m >= cap) break;
    const f = soft(m, cap);
    const add = Math.min(rawPerSec * f, cap - m);
    m += add;
  }
  const m24 = m;
  const pctCap = (m24 / cap) * 100;

  const timeToRatio = (ratioTarget) => {
    let mm = 0;
    let ss = 0;
    const target = cap * ratioTarget;
    const maxSec = 86400 * 60;
    while (ss < maxSec && mm < target - 1e-9) {
      if (mm >= cap) break;
      const f = soft(mm, cap);
      const add = Math.min(rawPerSec * f, cap - mm);
      if (add <= 1e-15) break;
      mm += add;
      ss++;
    }
    return mm >= target - 1e-6 ? ss / 3600 : null;
  };

  const h55 = timeToRatio(0.55);
  const h75 = timeToRatio(0.75);
  const h90 = timeToRatio(0.9);
  const h100 = timeToRatio(1.0);

  return {
    mleo24h: +m24.toFixed(2),
    pctOfCap: +pctCap.toFixed(2),
    hitsCapDaily: m24 >= cap - 0.01,
    hTo55pctCap: h55 != null ? +h55.toFixed(2) : null,
    hTo75pctCap: h75 != null ? +h75.toFixed(2) : null,
    hTo90pctCap: h90 != null ? +h90.toFixed(2) : null,
    hTo100pctCap: h100 != null ? +h100.toFixed(2) : null,
    _pct: pctCap,
    _m24: m24,
    _h100: h100,
  };
}

function scoreCombo(p) {
  const e = p.early._pct / 100;
  const em = p.earlyMid._pct / 100;
  const mid = p.mid._pct / 100;
  const adv = p.advanced._pct / 100;
  const advHits = p.advanced.hitsCapDaily;
  const h100adv = p.advanced._h100;

  let score = 0;
  if (e < 0.48) score += 28;
  else if (e < 0.55) score += 18;
  else if (e < 0.62) score += 8;
  else score -= 25;

  if (em >= 0.52 && em < 0.88) score += 28;
  else if (em >= 0.45 && em < 0.92) score += 16;
  else if (em < 0.52) score += 6;
  else score -= 12;

  if (mid >= 0.72 && mid < 0.985) score += 28;
  else if (mid >= 0.65 && mid < 0.995) score += 16;
  else if (mid >= 0.985 && mid < 1.0) score += 6;
  else score -= 8;

  if (advHits && h100adv != null && h100adv >= 6 && h100adv <= 22) score += 28;
  else if (advHits && h100adv != null && h100adv > 22) score += 18;
  else if (adv >= 0.95 && !advHits) score += 12;
  else if (advHits && h100adv != null && h100adv < 4) score -= 8;

  if (e > 0.62) score -= 15;
  if (em >= 0.95) score -= 10;
  if (mid >= 0.999) score -= 6;

  return +score.toFixed(2);
}

function runTuningSweep() {
  const caps = [2200, 2500, 2800, 3200, 3400];
  const gains = [0.4, 0.5, 0.6, 0.7];
  const curveNames = Object.keys(SOFTCUT_CURVES);
  const all = [];
  for (const dailyCap of caps) {
    for (const gain of gains) {
      for (const curveKey of curveNames) {
        const steps = SOFTCUT_CURVES[curveKey];
        const full = {
          early: profileMetrics(
            PLAYER_PROFILES[0].refinery,
            PLAYER_PROFILES[0].mleoMult,
            PLAYER_PROFILES[0].bankBonus,
            gain,
            dailyCap,
            steps
          ),
          earlyMid: profileMetrics(
            PLAYER_PROFILES[1].refinery,
            PLAYER_PROFILES[1].mleoMult,
            PLAYER_PROFILES[1].bankBonus,
            gain,
            dailyCap,
            steps
          ),
          mid: profileMetrics(
            PLAYER_PROFILES[2].refinery,
            PLAYER_PROFILES[2].mleoMult,
            PLAYER_PROFILES[2].bankBonus,
            gain,
            dailyCap,
            steps
          ),
          advanced: profileMetrics(
            PLAYER_PROFILES[3].refinery,
            PLAYER_PROFILES[3].mleoMult,
            PLAYER_PROFILES[3].bankBonus,
            gain,
            dailyCap,
            steps
          ),
        };
        const score = scoreCombo(full);
        all.push({
          daily_mleo_cap: dailyCap,
          mleo_gain_mult: gain,
          softcut: curveKey,
          _score: score,
          ...full,
        });
      }
    }
  }
  const strip = (o) => {
    const { _pct, _m24, _h100, ...rest } = o;
    return rest;
  };
  const cleaned = all.map((r) => ({
    daily_mleo_cap: r.daily_mleo_cap,
    mleo_gain_mult: r.mleo_gain_mult,
    softcut: r.softcut,
    score: r._score,
    early: strip(r.early),
    "early-mid": strip(r.earlyMid),
    mid: strip(r.mid),
    advanced: strip(r.advanced),
  }));
  const top5 = [...cleaned].sort((a, b) => b.score - a.score).slice(0, 5);
  const compactRows = cleaned.map((r) => ({
    cap: r.daily_mleo_cap,
    gain: r.mleo_gain_mult,
    curve: r.softcut,
    earlyPct: r.early.pctOfCap,
    earlyMidPct: r["early-mid"].pctOfCap,
    midPct: r.mid.pctOfCap,
    advH100h: r.advanced.hTo100pctCap,
    advHitsDaily: r.advanced.hitsCapDaily,
    midHitsDaily: r.mid.hitsCapDaily,
    score: r.score,
  }));
  const out = { totalCombinations: cleaned.length, top5, compactRows, all: cleaned };
  try {
    const here = fileURLToPath(new URL(".", import.meta.url));
    writeFileSync(`${here}tuning-sweep-result.json`, JSON.stringify(out, null, 2), "utf8");
  } catch {
    /* ignore write errors */
  }
  return out;
}

/** Piecewise analytic hours from produced to target (<= cap), constant raw rate R (MLEO/s before softcut). */
function hoursToRatio(produced, cap, rawPerSecond, targetRatio) {
  const targetM = Math.min(cap * targetRatio, cap);
  if (rawPerSecond <= 0 || cap <= 0) return null;
  if (produced >= targetM) return 0;
  const segments = [
    { lo: 0, hi: 0.55 * cap, f: 1.0 },
    { lo: 0.55 * cap, hi: 0.75 * cap, f: 0.55 },
    { lo: 0.75 * cap, hi: 0.9 * cap, f: 0.3 },
    { lo: 0.9 * cap, hi: 1.0 * cap, f: 0.15 },
  ];
  let sec = 0;
  let p = produced;
  const end = targetM;
  for (const seg of segments) {
    if (p >= end) break;
    const start = Math.max(p, seg.lo);
    const stop = Math.min(end, seg.hi);
    if (start < stop) {
      sec += (stop - start) / (rawPerSecond * seg.f);
      p = stop;
    }
  }
  return sec / 3600;
}

/** Hours linear (no softcut) from 0 to target ratio at raw rate. */
function hoursLinearToRatio(cap, rawPerSecond, targetRatio) {
  if (rawPerSecond <= 0) return null;
  return (cap * targetRatio) / rawPerSecond / 3600;
}

/** Discrete 1s integration — matches server tick accumulation style. */
function integrate24hRefineryOnly(refinery, mleoMult, bankBonus, gainMult = MLEO_GAIN_MULT) {
  const rawPerSec = refinery * CORE * mleoMult * bankBonus * gainMult;
  let m = 0;
  let total = 0;
  for (let s = 0; s < 86400; s++) {
    if (m >= DAILY_CAP) break;
    const f = softcutFactor(m, DAILY_CAP);
    const add = Math.min(rawPerSec * f, DAILY_CAP - m);
    m += add;
    total += add;
  }
  return { mleoProduced: m, totalAdded: total, rawPerSec };
}

/** Time to cross M thresholds (seconds), starting at 0. */
function timesToThresholds(refinery, mleoMult, bankBonus, gainMult) {
  const rawPerSec = refinery * CORE * mleoMult * bankBonus * gainMult;
  const thresholds = [0.55, 0.75, 0.9, 1.0].map((r) => DAILY_CAP * r);
  let m = 0;
  let s = 0;
  const out = {};
  const names = ["55%", "75%", "90%", "100%"];
  let ti = 0;
  while (s < 86400 * 30 && ti < thresholds.length) {
    if (m >= thresholds[ti]) {
      out[names[ti]] = s;
      ti++;
      continue;
    }
    if (m >= DAILY_CAP) break;
    const f = softcutFactor(m, DAILY_CAP);
    const add = Math.min(rawPerSec * f, DAILY_CAP - m);
    m += add;
    s++;
  }
  while (ti < names.length) {
    out[names[ti]] = m >= thresholds[ti] ? s : null;
    ti++;
  }
  return { rawPerSec, timesSec: out, finalM: m };
}

/** Section 1 table */
function section1() {
  const levels = [1, 3, 5, 7, 10];
  const profiles = [
    { name: "A baseline", mleoMult: 1.0, bankBonus: 1.0 },
    { name: "B mid", mleoMult: 1.2, bankBonus: 1.1 },
    { name: "C strong", mleoMult: 1.45, bankBonus: 1.2 },
  ];
  const rows = [];
  for (const lv of levels) {
    for (const pr of profiles) {
      const rawPerSec = lv * CORE * pr.mleoMult * pr.bankBonus * MLEO_GAIN_MULT;
      const rawPerHour = rawPerSec * 3600;
      const trueStart = rawPerSec * softcutFactor(0, DAILY_CAP) * 3600;
      const t55 = hoursToRatio(0, DAILY_CAP, rawPerSec, 0.55);
      const t75 = hoursToRatio(0, DAILY_CAP, rawPerSec, 0.75);
      const t90 = hoursToRatio(0, DAILY_CAP, rawPerSec, 0.9);
      const t100 = hoursToRatio(0, DAILY_CAP, rawPerSec, 1.0);
      const integ = integrate24hRefineryOnly(lv, pr.mleoMult, pr.bankBonus);
      const avgToCap =
        t100 && t100 > 0 ? DAILY_CAP / t100 : null;
      const effVsRaw = rawPerHour > 0 ? integ.totalAdded / rawPerHour : 0;
      rows.push({
        refinery: lv,
        profile: pr.name,
        rawPerHour: +rawPerHour.toFixed(4),
        trueAtStartPerHour: +trueStart.toFixed(4),
        hTo55: t55 != null ? +t55.toFixed(3) : null,
        hTo75: t75 != null ? +t75.toFixed(3) : null,
        hTo90: t90 != null ? +t90.toFixed(3) : null,
        hTo100: t100 != null ? +t100.toFixed(3) : null,
        mleo24h: +integ.mleoProduced.toFixed(2),
        avgMleoPerHourToCap: avgToCap != null ? +avgToCap.toFixed(4) : null,
        softcutEffVsRaw24h: +effVsRaw.toFixed(4),
      });
    }
  }
  return rows;
}

/** Section 2 — ratio time to cap without vs with softcut */
function section2() {
  const levels = [1, 3, 5, 7, 10];
  const profiles = [
    { name: "A baseline", mleoMult: 1.0, bankBonus: 1.0 },
    { name: "B mid", mleoMult: 1.2, bankBonus: 1.1 },
    { name: "C strong", mleoMult: 1.45, bankBonus: 1.2 },
  ];
  const rows = [];
  for (const lv of levels) {
    for (const pr of profiles) {
      const rawPerSec = lv * CORE * pr.mleoMult * pr.bankBonus * MLEO_GAIN_MULT;
      const hLinear = hoursLinearToRatio(DAILY_CAP, rawPerSec, 1.0);
      const hSoft = hoursToRatio(0, DAILY_CAP, rawPerSec, 1.0);
      const ratio = hLinear && hSoft ? hSoft / hLinear : null;
      rows.push({
        refinery: lv,
        profile: pr.name,
        hCapNoSoftcut: hLinear != null ? +hLinear.toFixed(3) : null,
        hCapWithSoftcut: hSoft != null ? +hSoft.toFixed(3) : null,
        softcutSlowdownFactor: ratio != null ? +ratio.toFixed(4) : null,
      });
    }
  }
  return rows;
}

/** Section 3 — limited initial ore/scrap pool, no passive income (pool-only). */
function section3() {
  const levels = [3, 5, 10];
  const feedHours = [4, 8, 24];
  const rows = [];
  for (const lv of levels) {
    for (const fh of feedHours) {
      const oreNeed = lv * ORE_USE_PER_LEVEL;
      const scrapNeed = lv * SCRAP_USE_PER_LEVEL;
      const initialOre = oreNeed * fh * 3600;
      const initialScrap = scrapNeed * fh * 3600;
      const mleoMult = 1.0;
      const bankBonus = 1.0;
      const rawPerSec = lv * CORE * mleoMult * bankBonus * MLEO_GAIN_MULT;
      let ore = initialOre;
      let scrap = initialScrap;
      let m = 0;
      let hitCap = false;
      let bottleneck = "";
      for (let s = 0; s < 86400; s++) {
        if (m >= DAILY_CAP) {
          hitCap = true;
          bottleneck = "cap reached";
          break;
        }
        if (ore < oreNeed || scrap < scrapNeed) {
          bottleneck =
            ore < oreNeed && scrap < scrapNeed
              ? "ORE+SCRAP (pool empty together)"
              : ore < oreNeed
                ? "ORE (pool empty)"
                : "SCRAP (pool empty)";
          break;
        }
        ore -= oreNeed;
        scrap -= scrapNeed;
        const f = softcutFactor(m, DAILY_CAP);
        const add = Math.min(rawPerSec * f, DAILY_CAP - m);
        m += add;
      }
      if (!bottleneck) bottleneck = hitCap ? "cap" : "end of 24h sim";

      rows.push({
        refinery: lv,
        feedHoursPool: fh,
        mleo24h: +m.toFixed(2),
        hitCap,
        bottleneck,
      });
    }
  }
  return rows;
}

/**
 * Section 4 — energy + refinery power mode.
 * SQL: ore/scrap use and raw_banked_gain scale with v_refinery_mode → rawPerSec includes `eff`.
 *
 * A) simplified: client-style reserve gate (gameplay approximation).
 * B) sqlStyle: 1s steps, energy += regen − passive, refinery if energy ≥ refineryUse (no reserve floor).
 *    Net drain matches reconcile idea; long ticks would use floor(energy/abs(net)) — here discrete 1s is enough.
 */
function section4() {
  const levels = [3, 5, 10];
  const modes = [1.0, 0.75, 0.5];
  const power = 3;
  const energyCap = 148 + power * 42;
  const energyRegen = 6.4 + power * 2.5;
  const quarry = 1;
  const trade = 1;
  const salvage = 1;
  const rows = [];
  const reserve = Math.max(8, Math.floor(energyCap * 0.05));

  const runSimplified = (energyStart, lv, eff, passiveUse, refineryUse, oreNeed, scrapNeed) => {
    let ore = 1e12;
    let scrap = 1e12;
    let energy = energyStart;
    let m = 0;
    let activeSec = 0;
    const rawPerSec = lv * eff * CORE * MLEO_GAIN_MULT;
    const energyNeed = refineryUse;
    for (let s = 0; s < 86400; s++) {
      energy = Math.min(energyCap, energy + energyRegen);
      energy -= passiveUse;
      const canRefine =
        energy >= reserve + energyNeed && ore >= oreNeed && scrap >= scrapNeed;
      if (canRefine) {
        energy -= energyNeed;
        ore -= oreNeed;
        scrap -= scrapNeed;
        const f = softcutFactor(m, DAILY_CAP);
        const add = Math.min(rawPerSec * f, DAILY_CAP - m);
        m += add;
        activeSec++;
      }
    }
    const trueHourly = activeSec > 0 ? (m / activeSec) * 3600 : 0;
    return { m, activeSec, trueHourly, rawPerSec };
  };

  const runSqlStyle = (energyStart, lv, eff, passiveUse, refineryUse, oreNeed, scrapNeed) => {
    let ore = 1e12;
    let scrap = 1e12;
    let energy = energyStart;
    let m = 0;
    let activeSec = 0;
    const rawPerSec = lv * eff * CORE * MLEO_GAIN_MULT;
    const energyNeed = refineryUse;
    for (let s = 0; s < 86400; s++) {
      energy = Math.min(energyCap, Math.max(0, energy + energyRegen));
      energy -= passiveUse;
      if (energy < 0) energy = 0;
      const canRefine = energy >= energyNeed && ore >= oreNeed && scrap >= scrapNeed;
      if (canRefine) {
        energy -= energyNeed;
        ore -= oreNeed;
        scrap -= scrapNeed;
        const f = softcutFactor(m, DAILY_CAP);
        const add = Math.min(rawPerSec * f, DAILY_CAP - m);
        m += add;
        activeSec++;
      }
    }
    const trueHourly = activeSec > 0 ? (m / activeSec) * 3600 : 0;
    return { m, activeSec, trueHourly, rawPerSec };
  };

  for (const lv of levels) {
    for (const mode of modes) {
      const eff = mode;
      const passiveUse = quarry * 0.6 + trade * 0.62 + salvage * 0.62;
      const refineryUse = lv * REFINERY_ENERGY_PER_LEVEL * eff;
      const oreNeed = lv * ORE_USE_PER_LEVEL * eff;
      const scrapNeed = lv * SCRAP_USE_PER_LEVEL * eff;
      const netIfRefineryRuns = energyRegen - passiveUse - refineryUse;
      const rawPerSec = lv * eff * CORE * MLEO_GAIN_MULT;

      const stableStart = Math.floor(energyCap * 0.75);
      const edgeStartSimplified = reserve + passiveUse + refineryUse + 0.5;
      const edgeStartSql = Math.min(
        Math.floor(energyCap * 0.12),
        Math.max(refineryUse + passiveUse, Math.floor(energyCap * 0.08))
      );

      const simA_stable = runSimplified(stableStart, lv, eff, passiveUse, refineryUse, oreNeed, scrapNeed);
      const simA_edge = runSimplified(edgeStartSimplified, lv, eff, passiveUse, refineryUse, oreNeed, scrapNeed);
      const simB_stable = runSqlStyle(stableStart, lv, eff, passiveUse, refineryUse, oreNeed, scrapNeed);
      const simB_edge = runSqlStyle(edgeStartSql, lv, eff, passiveUse, refineryUse, oreNeed, scrapNeed);

      rows.push({
        refinery: lv,
        modePct: mode * 100,
        rawPerSec: +rawPerSec.toFixed(8),
        netEnergyPerSecIfRefineryRuns: +netIfRefineryRuns.toFixed(4),
        simplified: {
          note: "reserve gate (max(8, 5% cap)); refinery raw rate * mode",
          reserveThreshold: reserve,
          stableStart75pctCap: {
            mleo24h: +simA_stable.m.toFixed(2),
            refineryActiveHours: +(simA_stable.activeSec / 3600).toFixed(2),
            effectiveMleoPerHourWhileActive: +simA_stable.trueHourly.toFixed(4),
          },
          edgeStartNearReserve: {
            mleo24h: +simA_edge.m.toFixed(2),
            refineryActiveHours: +(simA_edge.activeSec / 3600).toFixed(2),
            effectiveMleoPerHourWhileActive: +simA_edge.trueHourly.toFixed(4),
          },
        },
        sqlStyle: {
          note: "1s discrete; no reserve; energy clamp [0,cap]; refinery if energy >= refineryUse",
          edgeStartLowEnergy: edgeStartSql,
          stableStart75pctCap: {
            mleo24h: +simB_stable.m.toFixed(2),
            refineryActiveHours: +(simB_stable.activeSec / 3600).toFixed(2),
            effectiveMleoPerHourWhileActive: +simB_stable.trueHourly.toFixed(4),
          },
          edgeLowStart: {
            mleo24h: +simB_edge.m.toFixed(2),
            refineryActiveHours: +(simB_edge.activeSec / 3600).toFixed(2),
            effectiveMleoPerHourWhileActive: +simB_edge.trueHourly.toFixed(4),
          },
        },
      });
    }
  }
  return rows;
}

/** Section 5 — expedition Monte Carlo (SQL base_launch_expedition) */
function expeditionMleoOnce(bayLevel, deepScan, mleoProducedToday) {
  const mleoChance = 0.08 + bayLevel * 0.01 + (deepScan ? 0.02 : 0);
  const roll = Math.random();
  const bankedRoll = roll < mleoChance ? Math.floor(4 + Math.random() * 8) : 0;
  const rawMleo = bankedRoll * MLEO_GAIN_MULT;
  const soft = softcutFactor(mleoProducedToday, DAILY_CAP);
  const add = Math.floor(Math.min(rawMleo * soft, Math.max(0, DAILY_CAP - mleoProducedToday)));
  return add;
}

function percentile(sorted, p) {
  const idx = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[idx];
}

function section5() {
  const bays = [1, 3, 5];
  const runs = 10_000;
  const out = [];
  for (const bay of bays) {
    for (const deep of [false, true]) {
      const samples = [];
      for (let i = 0; i < runs; i++) {
        samples.push(expeditionMleoOnce(bay, deep, 0));
      }
      samples.sort((a, b) => a - b);
      const avg = samples.reduce((a, b) => a + b, 0) / runs;
      const daily = (nExp) => {
        const totals = [];
        for (let i = 0; i < 2000; i++) {
          let m = 0;
          let tot = 0;
          for (let e = 0; e < nExp; e++) {
            const add = expeditionMleoOnce(bay, deep, m);
            m += add;
            tot += add;
          }
          totals.push(tot);
        }
        totals.sort((a, b) => a - b);
        return {
          n: nExp,
          avg: totals.reduce((a, b) => a + b, 0) / totals.length,
          p50: percentile(totals, 50),
          p90: percentile(totals, 90),
        };
      };
      out.push({
        bay,
        deepScan: deep,
        perExp: {
          avg: +avg.toFixed(4),
          p50: percentile(samples, 50),
          p90: percentile(samples, 90),
        },
        daily6: daily(6),
        daily12: daily(12),
        daily24: daily(24),
      });
    }
  }
  return out;
}

/** Section 5b — combined refinery + expeditions cap time. exPerDay <= 0 → refinery only (no expeditions). */
function section5b(refineryLv, mleoMult, bankBonus, exPerDay, bay, deepScan) {
  const rawPerSec = refineryLv * CORE * mleoMult * bankBonus * MLEO_GAIN_MULT;
  let m = 0;
  let s = 0;
  const runExpeditions = exPerDay > 0;
  const expInterval = runExpeditions ? 86400 / exPerDay : Infinity;
  let nextExp = runExpeditions ? 0 : Infinity;
  while (s < 86400 * 10 && m < DAILY_CAP) {
    if (runExpeditions && s >= nextExp) {
      const add = expeditionMleoOnce(bay, deepScan, m);
      m += add;
      nextExp += expInterval;
    }
    const f = softcutFactor(m, DAILY_CAP);
    const add = Math.min(rawPerSec * f, DAILY_CAP - m);
    m += add;
    s++;
    if (m >= DAILY_CAP) break;
  }
  return s / 3600;
}

function printTable(title, rows) {
  console.log("\n" + "=".repeat(20) + " " + title + " " + "=".repeat(20));
  console.log(JSON.stringify(rows, null, 2));
}

const RUN_TUNING = process.argv.includes("--tune");
const RUN_COMPARE_CAPS = process.argv.includes("--compare-2800-3200");

if (RUN_COMPARE_CAPS) {
  const caps = [2800, 3200];
  const gain = MLEO_GAIN_MULT;
  const steps = [...SOFTCUT_CURVES.A_current, { upto: 9.99, factor: 0.06 }];
  const rows = [];
  for (const cap of caps) {
    for (const p of PLAYER_PROFILES) {
      const m = profileMetrics(p.refinery, p.mleoMult, p.bankBonus, gain, cap, steps);
      rows.push({
        dailyCap: cap,
        profile: p.id,
        mleo24h: m.mleo24h,
        pctOfCap24h: m.pctOfCap,
        hitsCapDaily: m.hitsCapDaily,
        hTo55pctCap: m.hTo55pctCap,
        hTo75pctCap: m.hTo75pctCap,
        hTo90pctCap: m.hTo90pctCap,
        hTo100pctCap: m.hTo100pctCap,
      });
    }
  }
  console.log(JSON.stringify({ gain, softcut: "A_current", snapshots: rows }, null, 2));
} else if (RUN_TUNING) {
  const out = runTuningSweep();
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log(
    "BASE MLEO SQL-aligned simulation (CORE=0.015, gain_mult=0.4, cap=" + DAILY_CAP + ")"
  );
  printTable("1) Refinery only (ideal)", section1());
  printTable("2) Time to cap: no softcut vs softcut", section2());
  printTable("3) Limited feed pool (no quarry income)", section3());
  printTable("4) Energy pressure — simplified (A) + sqlStyle (B), quarry+trade+salvage+power3", section4());
  printTable("5) Expeditions (Monte Carlo)", section5());

  const capTimes = [
    { label: "ref only r3", h: section5b(3, 1, 1, 0, 3, false) },
    { label: "r3 + 6exp/d bay3", h: section5b(3, 1, 1, 6, 3, false) },
    { label: "r3 + 12exp/d", h: section5b(3, 1, 1, 12, 3, false) },
  ];
  console.log("\nCap time (hours) refinery + expeditions:", capTimes);

/** Section 6 — player profiles (explicit assumptions, SQL-aligned refinery core). */
function section6() {
  const profiles = [
    {
      id: "A early",
      refinery: 2,
      mleoMult: 1.06,
      bankBonus: 1.04,
      expeditionsPerDay: 2,
      stability: "OK",
    },
    {
      id: "B early-mid",
      refinery: 4,
      mleoMult: 1.12,
      bankBonus: 1.1,
      expeditionsPerDay: 6,
      stability: "OK",
    },
    {
      id: "C mid",
      refinery: 6,
      mleoMult: 1.25,
      bankBonus: 1.15,
      expeditionsPerDay: 12,
      stability: "OK",
    },
    {
      id: "D advanced",
      refinery: 10,
      mleoMult: 1.45,
      bankBonus: 1.25,
      expeditionsPerDay: 18,
      stability: "OK",
    },
  ];
  return profiles.map((p) => {
    const rawPerSec = p.refinery * CORE * p.mleoMult * p.bankBonus * MLEO_GAIN_MULT;
    const h55 = hoursToRatio(0, DAILY_CAP, rawPerSec, 0.55);
    const h75 = hoursToRatio(0, DAILY_CAP, rawPerSec, 0.75);
    const h90 = hoursToRatio(0, DAILY_CAP, rawPerSec, 0.9);
    const h100 = hoursToRatio(0, DAILY_CAP, rawPerSec, 1.0);
    const integ = integrate24hRefineryOnly(p.refinery, p.mleoMult, p.bankBonus);
    const capReachable = h100 != null && h100 <= 24;
    const bottleneck =
      integ.mleoProduced >= DAILY_CAP
        ? "hit daily cap"
        : integ.mleoProduced < 800
          ? "low refinery / mult"
          : "softcut + time";
    return {
      ...p,
      mleo24hRefineryOnly: +integ.mleoProduced.toFixed(1),
      hTo55: h55 != null ? +h55.toFixed(2) : null,
      hTo75: h75 != null ? +h75.toFixed(2) : null,
      hTo90: h90 != null ? +h90.toFixed(2) : null,
      hTo100: h100 != null ? +h100.toFixed(2) : null,
      capReachableIn24h: capReachable,
      bottleneckGuess: bottleneck,
    };
  });
}

  printTable("6) Player profiles (ideal refinery)", section6());
}
