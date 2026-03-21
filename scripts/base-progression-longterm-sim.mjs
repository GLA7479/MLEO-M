/**
 * BASE long-term progression simulation (tooling only — not production).
 *
 * Source alignment:
 * - Refinery raw: sql/base_server_authority.sql ~784: least(ore/1.8, scrap/0.7) * 0.015 * mleo_mult * bank_bonus * mleo_gain_mult
 * - Softcut: base_softcut_factor (piecewise from base_economy_config.softcut_json)
 * - Client uses 0.0165 core in mleo-base.js — SERVER uses 0.015; this sim follows SERVER.
 *
 * Run:
 *   node scripts/base-progression-longterm-sim.mjs
 *   node scripts/base-progression-longterm-sim.mjs --json > scripts/base-progression-longterm-output.json
 *   node scripts/base-progression-longterm-sim.mjs --stress   # validation + sensitivity A–E (baseline 3400/0.40/A)
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// --- Server-aligned core (see sql/base_server_authority.sql)
const CORE = 0.015;

/** Softcut curves (ratio = mleo_produced_today / daily_cap). */
export const SOFTCUT_CURVES = {
  A_current: [
    { upto: 0.55, factor: 1.0 },
    { upto: 0.75, factor: 0.55 },
    { upto: 0.9, factor: 0.3 },
    { upto: 1.0, factor: 0.15 },
    { upto: 9.99, factor: 0.06 },
  ],
  B_medium: [
    { upto: 0.6, factor: 1.0 },
    { upto: 0.8, factor: 0.65 },
    { upto: 0.92, factor: 0.4 },
    { upto: 1.0, factor: 0.2 },
    { upto: 9.99, factor: 0.08 },
  ],
  C_softer: [
    { upto: 0.65, factor: 1.0 },
    { upto: 0.85, factor: 0.75 },
    { upto: 0.95, factor: 0.5 },
    { upto: 1.0, factor: 0.25 },
    { upto: 9.99, factor: 0.1 },
  ],
  D_harsher: [
    { upto: 0.45, factor: 1.0 },
    { upto: 0.65, factor: 0.45 },
    { upto: 0.82, factor: 0.22 },
    { upto: 1.0, factor: 0.08 },
    { upto: 9.99, factor: 0.04 },
  ],
};

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

/**
 * Discrete 1s integration — same semantics as scripts/base-mleo-model-sim.mjs / SQL accumulation.
 * Produces total MLEO added over `seconds` starting from produced0, raw rate constant (upper bound).
 */
function integrateMleoProduced(produced0, cap, rawPerSec, seconds, soft) {
  let p = Math.max(0, produced0);
  const r = Math.max(0, rawPerSec);
  const dur = Math.max(0, Math.floor(seconds));
  let total = 0;
  for (let s = 0; s < dur; s++) {
    if (p >= cap) break;
    const f = soft(p, cap);
    const add = Math.min(r * f, cap - p);
    p += add;
    total += add;
  }
  return { endProduced: p, totalProduced: total, hitCap: p >= cap - 1e-6 };
}

/** Expedition: sql/base_atomic_rpc.sql — banked_mleo ~ U[4,8] floor, * gain_mult, softcut, floor */
function expectedExpeditionBankedMleo(mleoProducedBefore, cap, gainMult, soft) {
  const meanBanked = 6; // ~uniform 4..8
  const raw = meanBanked * gainMult;
  const f = soft(mleoProducedBefore, cap);
  return Math.floor(Math.min(raw * f, Math.max(0, cap - mleoProducedBefore)));
}

const UPGRADE_STYLES = {
  conservative: { label: "conservative", refineryScale: 0.72, researchScale: 0.7, moduleDayBias: 18 },
  balanced: { label: "balanced", refineryScale: 1, researchScale: 1, moduleDayBias: 0 },
  aggressive: { label: "aggressive", refineryScale: 1.38, researchScale: 1.25, moduleDayBias: -12 },
};

/**
 * Archetypes: explicit behavioral parameters (assumptions — not read from live telemetry).
 * refinerySqrtK scales sqrt(day) growth of refinery tier (cap 12).
 */
export const ARCHETYPES = [
  {
    id: "casual-light",
    label: "Casual light",
    sessionsPerDay: 1,
    activeMinutesDefault: 24,
    offlineHours: 20,
    managementQuality: 0.52,
    expeditionPerDay: 0.15,
    reinvest: 0.1,
    refinerySqrtK: 0.58,
    crewPerSqrtDay: 0.06,
    blueprintPerDay: 0.04,
    logisticsPerDay: 0.03,
    researchGate: 1.15,
    moduleGate: 1.25,
  },
  {
    id: "casual-consistent",
    label: "Casual consistent",
    sessionsPerDay: 2,
    activeMinutesDefault: 48,
    offlineHours: 18,
    managementQuality: 0.62,
    expeditionPerDay: 0.45,
    reinvest: 0.18,
    refinerySqrtK: 0.72,
    crewPerSqrtDay: 0.09,
    blueprintPerDay: 0.065,
    logisticsPerDay: 0.045,
    researchGate: 1.0,
    moduleGate: 1.05,
  },
  {
    id: "engaged",
    label: "Engaged",
    sessionsPerDay: 3,
    activeMinutesDefault: 95,
    offlineHours: 14,
    managementQuality: 0.72,
    expeditionPerDay: 1.1,
    reinvest: 0.28,
    refinerySqrtK: 1.02,
    crewPerSqrtDay: 0.12,
    blueprintPerDay: 0.09,
    logisticsPerDay: 0.065,
    researchGate: 0.88,
    moduleGate: 0.92,
  },
  {
    id: "grinder",
    label: "Grinder",
    sessionsPerDay: 4,
    activeMinutesDefault: 185,
    offlineHours: 10,
    managementQuality: 0.82,
    expeditionPerDay: 2.2,
    reinvest: 0.4,
    refinerySqrtK: 1.18,
    crewPerSqrtDay: 0.15,
    blueprintPerDay: 0.12,
    logisticsPerDay: 0.085,
    researchGate: 0.78,
    moduleGate: 0.82,
  },
  {
    id: "hardcore-optimizer",
    label: "Hardcore optimizer",
    sessionsPerDay: 6,
    activeMinutesDefault: 260,
    offlineHours: 7,
    managementQuality: 0.9,
    expeditionPerDay: 3.5,
    reinvest: 0.52,
    refinerySqrtK: 1.32,
    crewPerSqrtDay: 0.18,
    blueprintPerDay: 0.15,
    logisticsPerDay: 0.1,
    researchGate: 0.68,
    moduleGate: 0.68,
  },
  {
    id: "extreme",
    label: "Extreme / insane",
    sessionsPerDay: 8,
    activeMinutesDefault: 400,
    offlineHours: 3.5,
    managementQuality: 0.96,
    expeditionPerDay: 5.5,
    reinvest: 0.62,
    refinerySqrtK: 1.48,
    crewPerSqrtDay: 0.21,
    blueprintPerDay: 0.175,
    logisticsPerDay: 0.115,
    researchGate: 0.55,
    moduleGate: 0.55,
  },
];

const ACTIVITY_MINUTES_LEVELS = [20, 60, 180, 360];

/**
 * Simplified SQL-like derive at calendar day `day`.
 * @param {object} [sensitivity] upgradeMult / reinvestMult — stress-test how fast real progression might be vs model.
 *   - upgradeMult: scales effective progression time for levels/research (1 = as modeled).
 *   - reinvestMult: scales blueprint/logistics accumulation (reinvest efficiency).
 */
function derivePowerAtDay(day, arch, style, gainMult, sensitivity = {}) {
  const um = Number(sensitivity.upgradeMult ?? 1) || 1;
  const rm = Number(sensitivity.reinvestMult ?? 1) || 1;
  const rs = style.refineryScale;
  const resScale = style.researchScale;
  /** Effective progression day (upgrade speed). */
  const d = Math.max(0.25, day * um);
  const effReinvest = arch.reinvest * rm;

  const refinery = Math.min(
    12,
    Math.max(
      0,
      Math.floor(1 + arch.refinerySqrtK * rs * Math.sqrt(Math.max(1, d)) - 0.001)
    )
  );
  const crew = Math.min(8, Math.floor(arch.crewPerSqrtDay * rs * Math.sqrt(Math.max(1, d))));
  const blueprint = Math.min(28, Math.floor(d * arch.blueprintPerDay * effReinvest * rs));
  const logistics = Math.min(15, Math.floor(d * arch.logisticsPerDay * effReinvest * rs));

  const workerBonus = 1 + crew * 0.02;
  const hq = Math.min(12, 1 + Math.floor(d / 55));
  const hqBonus = 1 + hq * 0.03;
  const miner = Math.min(8, Math.floor(d / 40));
  const arcade = Math.min(8, Math.floor(d / 48));
  const minerBonus = 1 + miner * 0.04;
  const stabilityFactor = 0.75 + (88 / 100) * 0.25;

  let mleoMult = workerBonus * hqBonus * minerBonus * stabilityFactor;
  let bankBonus = 1 + blueprint * 0.02 + logistics * 0.025;

  const researchDay = (d * resScale) / arch.researchGate;
  if (researchDay >= 12) mleoMult *= 1.12; // minerSync
  if (researchDay >= 22) bankBonus *= 1.08; // routing
  if (researchDay >= 38) bankBonus *= 1.1; // logistics research
  if (researchDay >= 55) {
    mleoMult *= 0.88;
    bankBonus *= 1.1;
  } // tokenDiscipline

  const modDay = d + style.moduleDayBias * (2 - effReinvest);
  if (modDay >= 70 * arch.moduleGate) {
    mleoMult *= 1.04;
    bankBonus *= 1.08;
  } // vaultCompressor
  if (modDay >= 95 * arch.moduleGate) mleoMult *= 1.08; // minerLink (ore — refinery stability side ignored)

  // Commander path logistics +0.04 bank — engaged+ archetypes assumed to pick it mid-run
  if (d >= 25) bankBonus *= 1.04;

  return { refinery, mleoMult, bankBonus, blueprint, logistics, crew, hq };
}

function rawRefineryPerSecond(refinery, mleoMult, bankBonus, gainMult) {
  if (refinery <= 0) return 0;
  return refinery * CORE * mleoMult * bankBonus * gainMult;
}

export function simulateLifecycle({
  archetype,
  upgradeStyle,
  dailyCap,
  gainMult,
  softSteps,
  activeMinutesOverride,
  maxDay = 180,
  sensitivity = {},
}) {
  const soft = makeSoftcutFactor(softSteps);
  const style = UPGRADE_STYLES[upgradeStyle];
  const activeMin =
    activeMinutesOverride != null ? activeMinutesOverride : archetype.activeMinutesDefault;

  const effectiveSecondsPerDay = Math.min(
    86400,
    Math.max(0, activeMin * 60 * archetype.managementQuality)
  );

  const milestones = [
    ["p25", 0.25],
    ["p50", 0.5],
    ["p75", 0.75],
    ["p90", 0.9],
    ["p100", 1.0],
  ];
  const firstDayMilestone = Object.fromEntries(milestones.map(([k]) => [k, null]));

  const capWindows = {
    "1-7": 0,
    "8-30": 0,
    "31-90": 0,
    "91-180": 0,
  };

  const dailyLog = [];

  for (let day = 1; day <= maxDay; day++) {
    const p = derivePowerAtDay(day, archetype, style, gainMult, sensitivity);
    const raw = rawRefineryPerSecond(p.refinery, p.mleoMult, p.bankBonus, gainMult);

    let produced = 0;
    let hitCap = false;

    const refineryInt = integrateMleoProduced(0, dailyCap, raw, effectiveSecondsPerDay, soft);
    produced += refineryInt.totalProduced;
    hitCap = refineryInt.hitCap;

    // Expected expeditions / day (fractional weight — linear approx on softcut)
    const expN = archetype.expeditionPerDay;
    if (expN > 0 && produced < dailyCap - 1e-9) {
      const one = expectedExpeditionBankedMleo(produced, dailyCap, gainMult, soft);
      produced = Math.min(dailyCap, produced + one * expN);
      if (produced >= dailyCap - 1e-9) hitCap = true;
    }

    const maxRatio = dailyCap > 0 ? produced / dailyCap : 0;

    for (const [key, m] of milestones) {
      if (firstDayMilestone[key] == null && maxRatio >= m - 1e-9) {
        firstDayMilestone[key] = day;
      }
    }

    if (hitCap) {
      if (day <= 7) capWindows["1-7"]++;
      else if (day <= 30) capWindows["8-30"]++;
      else if (day <= 90) capWindows["31-90"]++;
      else capWindows["91-180"]++;
    }

    dailyLog.push({
      day,
      produced: +produced.toFixed(2),
      maxRatio: +maxRatio.toFixed(4),
      hitCap,
      refinery: p.refinery,
      rawPerSec: +raw.toFixed(6),
      bankBonus: +p.bankBonus.toFixed(3),
      mleoMult: +p.mleoMult.toFixed(3),
    });
  }

  const weeklyAvg = (start, end) => {
    const slice = dailyLog.filter((d) => d.day >= start && d.day <= end);
    if (!slice.length) return 0;
    return slice.reduce((a, b) => a + b.produced, 0) / slice.length;
  };

  return {
    archetype: archetype.id,
    upgradeStyle,
    dailyCap,
    gainMult,
    sensitivity: {
      upgradeMult: sensitivity.upgradeMult ?? 1,
      reinvestMult: sensitivity.reinvestMult ?? 1,
    },
    curve: softSteps === SOFTCUT_CURVES.A_current ? "A_current" : "custom",
    activeMinutes: activeMin,
    firstDayMilestone,
    capWindows,
    weeklyAvg: {
      w1_7: weeklyAvg(1, 7),
      w8_30: weeklyAvg(8, 30),
      d31_90: weeklyAvg(31, 90),
      d91_180: weeklyAvg(91, 180),
    },
    sampleDays: [1, 3, 7, 14, 30, 60, 90, 180].map((d) => dailyLog.find((x) => x.day === d)).filter(Boolean),
    dailyLog,
  };
}

function plateauScore(dailyLog) {
  const window = 14;
  if (dailyLog.length < window * 2) return { plateauStartDay: null, note: "not enough days" };
  const avgs = [];
  for (let start = 1; start <= dailyLog.length - window; start++) {
    const sub = dailyLog.filter((d) => d.day >= start && d.day < start + window);
    avgs.push({ start, v: sub.reduce((a, b) => a + b.produced, 0) / sub.length });
  }
  for (let i = 10; i < avgs.length - 1; i++) {
    const prev = avgs[i - 1].v;
    const cur = avgs[i].v;
    if (prev > 0 && (cur - prev) / prev < 0.008 && cur > prev * 0.95) {
      return { plateauStartDay: avgs[i].start, rolling14dAvg: +cur.toFixed(2) };
    }
  }
  return { plateauStartDay: null, note: "no clear marginal plateau" };
}

function scoreLongevity(result) {
  let score = 0;
  const fd = result.firstDayMilestone;
  const d100 = fd.p100 ?? 999;
  const d90 = fd.p90 ?? 999;
  const d75 = fd.p75 ?? 999;

  if (d100 >= 150) score += 25;
  else if (d100 >= 90) score += 18;
  else if (d100 >= 45) score += 8;
  else score -= 12;

  if (d90 >= 60) score += 12;
  if (d75 >= 28) score += 10;

  if (result.capWindows["1-7"] === 0) score += 16;
  if (result.capWindows["8-30"] < 4) score += 10;
  if (result.capWindows["31-90"] < 8) score += 6;

  const growth = result.weeklyAvg.d31_90 / Math.max(1, result.weeklyAvg.w1_7);
  if (growth >= 1.25) score += 18;
  else if (growth >= 1.12) score += 10;

  return +score.toFixed(2);
}

/** Sensitivity sweep on baseline economy params (progression speed vs reinvest). */
export const STRESS_SCENARIOS = {
  A_slower: {
    id: "A_slower",
    label: "A: slower (upgrade 0.75×, reinvest 0.75×)",
    upgradeMult: 0.75,
    reinvestMult: 0.75,
  },
  B_modeled: {
    id: "B_modeled",
    label: "B: as-modeled (1× / 1×)",
    upgradeMult: 1,
    reinvestMult: 1,
  },
  C_faster: {
    id: "C_faster",
    label: "C: faster (1.25× / 1.25×)",
    upgradeMult: 1.25,
    reinvestMult: 1.25,
  },
  D_much_faster: {
    id: "D_much_faster",
    label: "D: much faster (1.5× / 1.5×)",
    upgradeMult: 1.5,
    reinvestMult: 1.5,
  },
  E_extreme_fast: {
    id: "E_extreme_fast",
    label: "E: extreme-fast (2× / 2×)",
    upgradeMult: 2,
    reinvestMult: 2,
  },
};

/**
 * "Too early" danger rules (design guardrails — tune if product vision changes).
 * If true, baseline economy may be too generous under faster real progression.
 */
export const DANGER_THRESHOLDS_DOC = {
  engaged_p75: { maxDay: 90, meaning: "engaged first reaches 75% of daily cap before this day" },
  grinder_p100: { maxDay: 120, meaning: "grinder first full-cap day before this" },
  hardcore_cap_midgame: { windows: ["8-30", "31-90"], minHits: 1, meaning: "any cap day before late window" },
  extreme_p100: { maxDay: 45, meaning: "extreme first full-cap day before this" },
  extreme_cap_burst: { sumWindows: ["1-7", "8-30"], minSum: 3, meaning: "too many early cap days" },
  extreme_cap_spam_midgame: { window: "31-90", minHits: 15, meaning: "extreme hits cap too often before late game" },
};

function dangerFlagsForScenario(results) {
  const get = (id) => results.find((r) => r.archetype === id);
  const engaged = get("engaged");
  const grinder = get("grinder");
  const hardcore = get("hardcore-optimizer");
  const extreme = get("extreme");
  const efd = engaged?.firstDayMilestone || {};
  const gfd = grinder?.firstDayMilestone || {};
  const hcd = hardcore?.capWindows || {};
  const exd = extreme?.firstDayMilestone || {};
  const ecx = extreme?.capWindows || {};

  return {
    engaged_p75_before_day_90: efd.p75 != null && efd.p75 <= 90,
    grinder_p100_before_day_120: gfd.p100 != null && gfd.p100 <= 120,
    hardcore_cap_hits_midgame: (hcd["8-30"] || 0) + (hcd["31-90"] || 0) > 0,
    extreme_p100_before_day_45: exd.p100 != null && exd.p100 <= 45,
    extreme_cap_burst_early: (ecx["1-7"] || 0) + (ecx["8-30"] || 0) >= 3,
    extreme_cap_spam_midgame: (ecx["31-90"] || 0) >= 15,
  };
}

function growthFeelMetrics(results) {
  const pick = (id) => results.find((r) => r.archetype === id);
  const days = [14, 30, 60, 90, 180];
  const row = (id) => {
    const dlog = pick(id)?.dailyLog || [];
    const vals = {};
    for (const d of days) {
      vals[`d${d}`] = dlog.find((x) => x.day === d)?.produced ?? null;
    }
    const r14 = vals.d14;
    const r90 = vals.d90;
    const r30 = vals.d30;
    const r180 = vals.d180;
    return {
      produced: vals,
      ratio_90_vs_14: r14 > 0 && r90 ? +(r90 / r14).toFixed(2) : null,
      ratio_180_vs_30: r30 > 0 && r180 ? +(r180 / r30).toFixed(2) : null,
    };
  };
  return {
    casual_consistent: row("casual-consistent"),
    engaged: row("engaged"),
  };
}

export function runStressValidationSuite(baseline) {
  const scenarios = Object.values(STRESS_SCENARIOS);
  const stressValidation = {};
  const summaryRows = [];

  for (const sc of scenarios) {
    const sensitivity = { upgradeMult: sc.upgradeMult, reinvestMult: sc.reinvestMult };
    const byArchetype = ARCHETYPES.map((a) =>
      simulateLifecycle({
        archetype: a,
        upgradeStyle: "balanced",
        dailyCap: baseline.dailyCap,
        gainMult: baseline.gainMult,
        softSteps: baseline.soft,
        sensitivity,
      })
    );

    stressValidation[sc.id] = {
      label: sc.label,
      upgradeMult: sc.upgradeMult,
      reinvestMult: sc.reinvestMult,
      dangerFlags: dangerFlagsForScenario(byArchetype),
      growthFeel: growthFeelMetrics(byArchetype),
      byArchetype: byArchetype.map((r) => ({
        archetype: r.archetype,
        firstDayMilestone: r.firstDayMilestone,
        capWindows: r.capWindows,
        weeklyAvg: r.weeklyAvg,
      })),
    };

    for (const r of byArchetype) {
      summaryRows.push({
        scenario: sc.id,
        archetype: r.archetype,
        p25: r.firstDayMilestone.p25,
        p50: r.firstDayMilestone.p50,
        p75: r.firstDayMilestone.p75,
        p90: r.firstDayMilestone.p90,
        p100: r.firstDayMilestone.p100,
        capHits_1_30: (r.capWindows["1-7"] || 0) + (r.capWindows["8-30"] || 0),
        capHits_31_90: r.capWindows["31-90"] || 0,
        capHits_91_180: r.capWindows["91-180"] || 0,
      });
    }
  }

  return { stressValidation, summaryTable: summaryRows, scenarios: STRESS_SCENARIOS };
}

function runCandidateMatrix() {
  const caps = [2500, 2800, 3200, 3400, 3600];
  const gains = [0.3, 0.4, 0.5, 0.6];
  const curveNames = Object.keys(SOFTCUT_CURVES);
  const rows = [];

  for (const dailyCap of caps) {
    for (const gainMult of gains) {
      for (const curveName of curveNames) {
        const soft = SOFTCUT_CURVES[curveName];
        const results = ARCHETYPES.map((a) =>
          simulateLifecycle({
            archetype: a,
            upgradeStyle: "balanced",
            dailyCap,
            gainMult,
            softSteps: soft,
            activeMinutesOverride: null,
            maxDay: 180,
          })
        );
        const casual = results.find((r) => r.archetype === "casual-light");
        const extreme = results.find((r) => r.archetype === "extreme");
        const engaged = results.find((r) => r.archetype === "engaged");

        rows.push({
          dailyCap,
          gainMult,
          curve: curveName,
          longevityScore: scoreLongevity(engaged) + scoreLongevity(casual) * 0.5 + scoreLongevity(extreme) * 0.3,
          casualFirst100: casual?.firstDayMilestone.p100,
          engagedP25: engaged?.firstDayMilestone.p25,
          extremeFirst100: extreme?.firstDayMilestone.p100,
          extremeCapHits_1_30:
            (extreme?.capWindows["1-7"] || 0) + (extreme?.capWindows["8-30"] || 0),
          extremeCapHits_total:
            (extreme?.capWindows["1-7"] || 0) +
            (extreme?.capWindows["8-30"] || 0) +
            (extreme?.capWindows["31-90"] || 0) +
            (extreme?.capWindows["91-180"] || 0),
          growthEngaged: engaged?.weeklyAvg.d31_90 / Math.max(1, engaged?.weeklyAvg.w1_7),
          _extreme: extreme,
          _engaged: engaged,
          _casual: casual,
        });
      }
    }
  }

  for (const row of rows) {
    const ext = row._extreme;
    const eng = row._engaged;
    const cas = row._casual;
    const totalHits =
      (ext?.capWindows?.["1-7"] || 0) +
      (ext?.capWindows?.["8-30"] || 0) +
      (ext?.capWindows?.["31-90"] || 0) +
      (ext?.capWindows?.["91-180"] || 0);
    const lateEngagedP25 = eng?.firstDayMilestone?.p25 ?? 0;
    row.rankScore =
      totalHits * 18 +
      (ext?.firstDayMilestone?.p100 ?? 999) * -0.15 +
      (180 - Math.min(180, lateEngagedP25 || 180)) * 0.4 +
      (cas?.weeklyAvg?.d31_90 || 0) * -0.02;
  }
  rows.sort((a, b) => a.rankScore - b.rankScore);
  return rows.slice(0, 15).map(({ _extreme, _engaged, _casual, ...rest }) => {
    delete rest.rankScore;
    return rest;
  });
}

function main() {
  const baseline = {
    dailyCap: 3400,
    gainMult: 0.4,
    soft: SOFTCUT_CURVES.A_current,
  };

  const report = {
    assumptions: {
      core: CORE,
      note:
        "Server tick uses 0.015 * mleo_mult * bank_bonus * mleo_gain_mult. Client refinery uses 0.0165 — sim uses SERVER.",
      progression:
        "Refinery/blueprint/logistics/crew scale with sqrt(day) and archetype reinvest; research gates approximate sql/base_server_authority.sql boolean bonuses.",
      activity:
        "effectiveSeconds = activeMinutes * 60 * managementQuality; no separate offline tick merge (conservative).",
      expeditions: "Poisson-ish mean expeditionPerDay with expected banked MLEO from expedition RPC shape.",
    },
    assumptionAudit: [
      {
        key: "refinery_progression_speed",
        desc: "sqrt(effectiveDay)×refinerySqrtK capped 12",
        bias: "neutral",
        ifLiveFasterThanModel: "cap milestones move EARLIER (risk)",
        ifLiveSlower: "milestones move LATER (optimistic vs cap anxiety)",
      },
      {
        key: "mleoMult_progression",
        desc: "crew/hq/miner/research toggles from effective day d",
        bias: "neutral",
        ifLiveFasterThanModel: "EARLIER %cap days",
        ifLiveSlower: "LATER",
      },
      {
        key: "bankBonus_progression",
        desc: "blueprint+logistics from d×reinvest×reinvestMult",
        bias: "neutral",
        ifLiveFasterThanModel: "EARLIER high %cap",
        ifLiveSlower: "LATER",
      },
      {
        key: "expedition_scaling",
        desc: "mean expedition count/day × expected banked roll; no DATA gate",
        bias: "optimistic",
        ifLiveFasterThanModel: "slightly EARLIER cap touches",
        ifLiveSlower: "N/A",
      },
      {
        key: "managementQuality",
        desc: "shrinks effective online refinery seconds",
        bias: "conservative",
        ifLiveFasterThanModel: "better uptime than modeled → EARLIER caps",
        ifLiveSlower: "worse play → LATER",
      },
      {
        key: "reinvest_speed",
        desc: "embedded in archetype.reinvest × sensitivity",
        bias: "neutral",
        ifLiveFasterThanModel: "EARLIER bankBonus jumps",
        ifLiveSlower: "LATER",
      },
      {
        key: "active_offline_model",
        desc: "no offline merge into production seconds",
        bias: "conservative",
        ifLiveFasterThanModel: "if offline adds meaningful MLEO → EARLIER",
        ifLiveSlower: "N/A",
      },
      {
        key: "shipping_frequency",
        desc: "not modeled (does not affect mleo_produced_today authority path)",
        bias: "neutral",
        ifLiveFasterThanModel: "no direct cap effect; vault loop ignored",
        ifLiveSlower: "N/A",
      },
      {
        key: "ore_energy_tick_fidelity",
        desc: "assumes refinery runs whenever effectiveSeconds>0",
        bias: "optimistic",
        ifLiveFasterThanModel: "N/A",
        ifLiveSlower: "bottlenecks → LATER caps (sim overstates income)",
      },
      {
        key: "upgrade_cost_model",
        desc: "no GOLD/ORE spend; time-based proxy only",
        bias: "optimistic",
        ifLiveFasterThanModel: "if real costs slow upgrades → LATER than sim",
        ifLiveSlower: "if players rush → EARLIER",
      },
      {
        key: "offline_merge",
        desc: "excluded",
        bias: "conservative",
        ifLiveFasterThanModel: "adds income → EARLIER milestones",
        ifLiveSlower: "N/A",
      },
    ],
    dangerThresholdsReference: DANGER_THRESHOLDS_DOC,
    baselineControl: {},
    archetypesBalanced: [],
    activityGrid: [],
    topCandidates: runCandidateMatrix(),
  };

  const stress = runStressValidationSuite(baseline);
  report.stressValidation = stress.stressValidation;
  report.stressSummaryTable = stress.summaryTable;

  for (const a of ARCHETYPES) {
    report.archetypesBalanced.push(
      simulateLifecycle({
        archetype: a,
        upgradeStyle: "balanced",
        dailyCap: baseline.dailyCap,
        gainMult: baseline.gainMult,
        softSteps: baseline.soft,
      })
    );
  }

  report.baselineControl = {
    engaged: report.archetypesBalanced.find((x) => x.archetype === "engaged"),
    extreme: report.archetypesBalanced.find((x) => x.archetype === "extreme"),
    casual: report.archetypesBalanced.find((x) => x.archetype === "casual-light"),
  };

  for (const arch of ARCHETYPES) {
    for (const am of ACTIVITY_MINUTES_LEVELS) {
      const r = simulateLifecycle({
        archetype: arch,
        upgradeStyle: "balanced",
        dailyCap: baseline.dailyCap,
        gainMult: baseline.gainMult,
        softSteps: baseline.soft,
        activeMinutesOverride: am,
      });
      report.activityGrid.push({
        archetype: arch.id,
        activeMinutes: am,
        firstDay100: r.firstDayMilestone.p100,
        firstDay90: r.firstDayMilestone.p90,
        capHits_1_30: r.capWindows["1-7"] + r.capWindows["8-30"],
        avgProduced_d31_90: r.weeklyAvg.d31_90,
      });
    }
  }

  const styles = ["conservative", "balanced", "aggressive"];
  report.stylesCompare = [];
  for (const st of styles) {
    report.stylesCompare.push(
      simulateLifecycle({
        archetype: ARCHETYPES[3],
        upgradeStyle: st,
        dailyCap: baseline.dailyCap,
        gainMult: baseline.gainMult,
        softSteps: baseline.soft,
      })
    );
  }

  const hc = report.archetypesBalanced.find((x) => x.archetype === "hardcore-optimizer");
  report.plateau = hc ? plateauScore(hc.dailyLog) : null;

  const pickDay = (id, d) =>
    report.archetypesBalanced.find((x) => x.archetype === id)?.dailyLog?.find((z) => z.day === d);
  report.growthCompare = {
    engagedVsCasual_d60: {
      engagedProduced: pickDay("engaged", 60)?.produced,
      casualProduced: pickDay("casual-consistent", 60)?.produced,
    },
    engagedMilestones: [7, 14, 30, 60, 90].map((d) => ({
      day: d,
      produced: pickDay("engaged", d)?.produced,
      refinery: pickDay("engaged", d)?.refinery,
    })),
    ratio_engaged_d180_vs_d14: (() => {
      const p14 = pickDay("engaged", 14)?.produced;
      const p180 = pickDay("engaged", 180)?.produced;
      return p14 > 0 ? +(p180 / p14).toFixed(2) : null;
    })(),
  };

  const json = JSON.stringify(report, null, 2);
  if (process.argv.includes("--json")) {
    console.log(json);
  } else if (process.argv.includes("--stress")) {
    console.log("=== STRESS / SENSITIVITY (baseline 3400 / 0.40 / A_current) ===\n");
    const ids = ["A_slower", "B_modeled", "C_faster", "D_much_faster", "E_extreme_fast"];
    for (const sid of ids) {
      const block = report.stressValidation[sid];
      console.log(`--- ${block.label} ---`);
      console.table(
        report.stressSummaryTable.filter((r) => r.scenario === sid).map((r) => ({
          archetype: r.archetype,
          p25: r.p25,
          p50: r.p50,
          p75: r.p75,
          p90: r.p90,
          p100: r.p100,
          cap1_30: r.capHits_1_30,
          cap31_90: r.capHits_31_90,
        }))
      );
      console.log("dangerFlags:", block.dangerFlags);
      console.log("growthFeel (casual-consistent / engaged):", block.growthFeel);
      console.log("");
    }
  } else {
    console.log("=== BASE long-term progression (balanced, baseline 3400/0.40/A) ===\n");
    for (const a of report.archetypesBalanced) {
      console.log(`--- ${a.archetype} ---`);
      console.log("firstDay milestones (ratio of daily cap):", a.firstDayMilestone);
      console.log("cap hit windows:", a.capWindows);
      console.log("weekly avg produced:", a.weeklyAvg);
      console.log("");
    }
    console.log("=== Activity grid (first day hitting 100% cap) ===");
    const g = report.activityGrid.filter((x) => x.archetype === "extreme");
    console.table(
      g.map((r) => ({
        ...r,
        firstDay100: r.firstDay100,
        firstDay90: r.firstDay90,
      }))
    );
    console.log("\nTop candidate parameter sets (heuristic longevity score):");
    console.table(
      report.topCandidates.map((r) => ({
        dailyCap: r.dailyCap,
        gainMult: r.gainMult,
        curve: r.curve,
        longevity: +r.longevityScore.toFixed(1),
        engagedP25: r.engagedP25,
        extremeP100: r.extremeFirst100,
        extHitsTot: r.extremeCapHits_total,
      }))
    );
  }

  const outPath = fileURLToPath(new URL("./base-progression-longterm-output.json", import.meta.url));
  writeFileSync(outPath, json, "utf8");
  if (!process.argv.includes("--json")) {
    console.log(`\nWrote ${outPath}`);
    if (!process.argv.includes("--stress")) {
      console.log("Tip: node scripts/base-progression-longterm-sim.mjs --stress");
    }
  }
}

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMainModule) main();
