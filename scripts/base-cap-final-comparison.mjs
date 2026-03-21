/**
 * FINAL cap comparison only — does not modify SQL/config/UI.
 * Compares daily_mleo_cap candidates with fixed mleo_gain_mult=0.40 and softcut A_current.
 * Live production baseline after implementation: daily_mleo_cap = 3400 (this file still sweeps 3000–3600).
 *
 * Run: node scripts/base-cap-final-comparison.mjs
 * Output: scripts/base-cap-final-comparison.json + BASE_CAP_FINAL_COMPARISON.md
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  ARCHETYPES,
  SOFTCUT_CURVES,
  simulateLifecycle,
  runStressValidationSuite,
  STRESS_SCENARIOS,
} from "./base-progression-longterm-sim.mjs";

const CAPS = [3000, 3200, 3400, 3600];
const GAIN = 0.4;
const CORE = 0.015;
const SOFT_A = [...SOFTCUT_CURVES.A_current, { upto: 9.99, factor: 0.06 }];

const PLAYER_PROFILES = [
  { id: "early", refinery: 2, mleoMult: 1.06, bankBonus: 1.04 },
  { id: "early-mid", refinery: 4, mleoMult: 1.12, bankBonus: 1.1 },
  { id: "mid", refinery: 6, mleoMult: 1.25, bankBonus: 1.15 },
  { id: "advanced", refinery: 10, mleoMult: 1.45, bankBonus: 1.25 },
];

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

function profileMetricsMicro(refinery, mleoMult, bankBonus, gainMult, cap, soft) {
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

  const h = (r) => {
    const t = timeToRatio(r);
    return t != null ? +t.toFixed(2) : null;
  };

  return {
    mleo24hAbsolute: +m24.toFixed(2),
    pctOfCap24h: +pctCap.toFixed(2),
    hitsCapDaily: m24 >= cap - 0.01,
    hTo25: h(0.25),
    hTo50: h(0.5),
    hTo75: h(0.75),
    hTo90: h(0.9),
    hTo100: h(1.0),
  };
}

function runMicroForAllCaps() {
  const soft = makeSoftcutFactor(SOFT_A);
  const out = {};
  for (const cap of CAPS) {
    out[cap] = PLAYER_PROFILES.map((p) => ({
      profile: p.id,
      ...profileMetricsMicro(p.refinery, p.mleoMult, p.bankBonus, GAIN, cap, soft),
    }));
  }
  return out;
}

function runLongTermForAllCaps() {
  const soft = SOFTCUT_CURVES.A_current;
  const out = {};
  for (const dailyCap of CAPS) {
    out[dailyCap] = ARCHETYPES.map((a) => {
      const r = simulateLifecycle({
        archetype: a,
        upgradeStyle: "balanced",
        dailyCap,
        gainMult: GAIN,
        softSteps: soft,
        maxDay: 180,
      });
      return {
        archetype: r.archetype,
        firstDayMilestone: r.firstDayMilestone,
        capWindows: r.capWindows,
        weeklyAvg: r.weeklyAvg,
        growthEngaged: r.weeklyAvg.d91_180 / Math.max(1e-9, r.weeklyAvg.w1_7),
      };
    });
  }
  return out;
}

function runStressForAllCaps() {
  const soft = SOFTCUT_CURVES.A_current;
  const out = {};
  for (const dailyCap of CAPS) {
    out[dailyCap] = runStressValidationSuite({
      dailyCap,
      gainMult: GAIN,
      soft,
    });
  }
  return out;
}

/** Focus scenarios: B, C, D, E */
const STRESS_FOCUS = ["B_modeled", "C_faster", "D_much_faster", "E_extreme_fast"];

function summarizeStress(stressBundle) {
  const { stressValidation } = stressBundle;
  const rows = [];
  for (const sid of STRESS_FOCUS) {
    const block = stressValidation[sid];
    if (!block) continue;
    rows.push({
      scenario: sid,
      label: block.label,
      extreme: {
        p100: block.byArchetype?.find((x) => x.archetype === "extreme")?.firstDayMilestone?.p100 ?? null,
        cap31_90:
          block.byArchetype?.find((x) => x.archetype === "extreme")?.capWindows?.["31-90"] ?? 0,
        cap91_180:
          block.byArchetype?.find((x) => x.archetype === "extreme")?.capWindows?.["91-180"] ?? 0,
        danger: block.dangerFlags,
      },
      engaged: {
        p25: block.byArchetype?.find((x) => x.archetype === "engaged")?.firstDayMilestone?.p25 ?? null,
      },
    });
  }
  return rows;
}

function scoreCapForVerdict(dailyCap, longTerm, stressFull) {
  const eng = longTerm.find((x) => x.archetype === "engaged");
  const ext = longTerm.find((x) => x.archetype === "extreme");
  const hc = longTerm.find((x) => x.archetype === "hardcore-optimizer");

  const growth = eng?.growthEngaged ?? 1;
  const extHitsLate = (ext?.capWindows?.["91-180"] || 0) + (ext?.capWindows?.["31-90"] || 0);
  const extP100 = ext?.firstDayMilestone?.p100;

  const modeled = stressFull.stressValidation?.B_modeled;
  const exMod = modeled?.byArchetype?.find((x) => x.archetype === "extreme");
  const spam = exMod?.capWindows?.["31-90"] || 0;
  const danger = modeled?.dangerFlags || {};

  let score = 0;
  // Longevity: want some cap presence for extreme late (not "dead") but not spam
  if (extHitsLate <= 20 && extHitsLate >= 1) score += 3;
  if (extHitsLate === 0) score += 2;
  if (spam >= 15) score -= 4;
  if (danger.extreme_cap_spam_midgame) score -= 5;
  // Engaged growth over 6 months
  if (growth >= 8) score += 2;
  else if (growth >= 5) score += 1;
  // Engaged should not hit p75 too early — if null good
  if (eng?.firstDayMilestone?.p75 == null) score += 1;
  // Higher cap = more headroom (design goal cap rare)
  score += (dailyCap - 3000) / 400;

  return +score.toFixed(2);
}

function buildVerdictTable(longTermAll, stressAll) {
  return CAPS.map((cap) => {
    const lt = longTermAll[cap];
    const st = stressAll[cap];
    const s = scoreCapForVerdict(cap, lt, st);

    const eng = lt.find((x) => x.archetype === "engaged");
    const ext = lt.find((x) => x.archetype === "extreme");

    let progressFeel = "medium";
    if (eng?.firstDayMilestone?.p25 == null) progressFeel = "lower %-of-cap feedback";
    if (eng?.firstDayMilestone?.p25 != null && eng.firstDayMilestone.p25 < 120) progressFeel = "stronger %-milestones";

    let longevity = "good";
    if ((ext?.capWindows?.["91-180"] || 0) > 15) longevity = "cap-heavy late";
    if ((ext?.capWindows?.["91-180"] || 0) === 0 && (ext?.capWindows?.["31-90"] || 0) === 0)
      longevity = "very rare cap";

    let earlyCapRisk = "low";
    const eB = st.stressValidation?.E_extreme_fast?.byArchetype?.find((x) => x.archetype === "extreme");
    if ((eB?.capWindows?.["31-90"] || 0) >= 15) earlyCapRisk = "high (E scenario)";
    else if ((eB?.capWindows?.["8-30"] || 0) >= 2) earlyCapRisk = "medium";

    let coldRisk = "low";
    if (cap >= 3400 && eng?.firstDayMilestone?.p25 == null) coldRisk = "medium (harder %-bar)";

    let overall = "viable";
    if (s < -2) overall = "risky";
    if (s >= 6) overall = "strong";

    return {
      dailyCap: cap,
      heuristicScore: s,
      progressFeel,
      longevity,
      riskEarlyCap: earlyCapRisk,
      riskTooCold: coldRisk,
      overall,
    };
  }).sort((a, b) => b.heuristicScore - a.heuristicScore);
}

function main() {
  const micro = runMicroForAllCaps();
  const longTerm = runLongTermForAllCaps();
  const stress = runStressForAllCaps();

  const stressSummary = {};
  for (const cap of CAPS) {
    stressSummary[cap] = summarizeStress(stress[cap]);
  }

  const verdict = buildVerdictTable(longTerm, stress);

  const report = {
    constants: { caps: CAPS, mleo_gain_mult: GAIN, softcut: "A_current", maxDay: 180 },
    microSnapshots24h: micro,
    longTermProgression: longTerm,
    stressByCap: Object.fromEntries(
      CAPS.map((c) => [c, { focusScenarios: stressSummary[c], full: stress[c] }])
    ),
    verdictRanked: verdict,
  };

  const jsonPath = fileURLToPath(new URL("./base-cap-final-comparison.json", import.meta.url));
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");

  const md = renderMarkdown(report, verdict);
  const mdPath = fileURLToPath(new URL("./BASE_CAP_FINAL_COMPARISON.md", import.meta.url));
  writeFileSync(mdPath, md, "utf8");

  console.log(`Wrote:\n  ${jsonPath}\n  ${mdPath}`);
}

function renderMarkdown(report, verdict) {
  let o = `# BASE — Final cap comparison (script-only)\n\n`;
  o += `**Fixed:** \`mleo_gain_mult = 0.40\`, softcut **A_current**, assumptions = long-term sim (balanced).\n\n`;
  o += `**Candidates:** ${CAPS.join(", ")}\n\n`;

  o += `## A) Micro (24h ideal refinery)\n\n`;
  for (const cap of CAPS) {
    o += `### Cap ${cap}\n\n`;
    o += `| Profile | MLEO 24h | % cap | h→25% | h→50% | h→75% | h→90% | h→100% |\n`;
    o += `|---------|----------|-------|-------|-------|-------|-------|--------|\n`;
    for (const row of report.microSnapshots24h[cap]) {
      o += `| ${row.profile} | ${row.mleo24hAbsolute} | ${row.pctOfCap24h}% | ${fmt(row.hTo25)} | ${fmt(row.hTo50)} | ${fmt(row.hTo75)} | ${fmt(row.hTo90)} | ${fmt(row.hTo100)} |\n`;
    }
    o += `\n`;
  }

  o += `## B) Long-term (first day hitting % of cap, 180d)\n\n`;
  for (const cap of CAPS) {
    o += `### Cap ${cap}\n\n`;
    o += `| Archetype | p25 | p50 | p75 | p90 | p100 | 1–7 | 8–30 | 31–90 | 91–180 |\n`;
    o += `|-----------|-----|-----|-----|-----|------|-----|------|-------|--------|\n`;
    for (const r of report.longTermProgression[cap]) {
      const m = r.firstDayMilestone;
      const w = r.capWindows;
      o += `| ${r.archetype} | ${n(m.p25)} | ${n(m.p50)} | ${n(m.p75)} | ${n(m.p90)} | ${n(m.p100)} | ${w["1-7"]} | ${w["8-30"]} | ${w["31-90"]} | ${w["91-180"]} |\n`;
    }
    o += `\n`;
  }

  o += `## C) Stress (B_modeled, C_faster, D_much_faster, E_extreme_fast)\n\n`;
  for (const cap of CAPS) {
    o += `### Cap ${cap}\n\n`;
    const focus = report.stressByCap[cap].focusScenarios;
    for (const f of focus) {
      o += `**${f.label}**\n`;
      o += `- extreme: first p100 day = ${n(f.extreme.p100)}, cap days 31–90 = ${f.extreme.cap31_90}, 91–180 = ${f.extreme.cap91_180}\n`;
      o += `- engaged: first p25 day = ${n(f.engaged.p25)}\n`;
      o += `- danger flags: ${JSON.stringify(f.extreme.danger)}\n\n`;
    }
  }

  o += `## D) Verdict table\n\n`;
  o += `| Cap | Progress feel | Longevity | Early cap risk | Too-cold risk | Overall |\n`;
  o += `|-----|---------------|-----------|----------------|---------------|----------|\n`;
  for (const v of verdict) {
    o += `| ${v.dailyCap} | ${v.progressFeel} | ${v.longevity} | ${v.riskEarlyCap} | ${v.riskTooCold} | ${v.overall} |\n`;
  }

  o += `\n## E) Ranking & recommendation\n\n`;
  const sorted = [...verdict].sort((a, b) => b.heuristicScore - a.heuristicScore);
  o += `1. **${sorted[0].dailyCap}** (score ${sorted[0].heuristicScore})\n`;
  o += `2. **${sorted[1].dailyCap}** (score ${sorted[1].heuristicScore})\n`;
  o += `3. **${sorted[2].dailyCap}** (score ${sorted[2].heuristicScore})\n`;
  o += `4. **${sorted[3].dailyCap}** (score ${sorted[3].heuristicScore})\n\n`;
  o += `**Winner:** **${sorted[0].dailyCap}** — best balance on this heuristic (longevity vs cap pressure vs growth).\n\n`;
  o += `**Runner-up:** **${sorted[1].dailyCap}**.\n\n`;
  o += `_Heuristic only — tune weights after live telemetry._\n`;

  return o;
}

function fmt(x) {
  return x == null ? "—" : String(x);
}
function n(x) {
  return x == null ? "—" : x;
}

main();
