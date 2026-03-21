/**
 * Compare BASE long-term sim at daily_mleo_cap 2800 vs 3200 (gain 0.40, softcut A_current, B_modeled).
 * Does not change production code. Run: node scripts/base-cap-2800-vs-3200.mjs
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  ARCHETYPES,
  SOFTCUT_CURVES,
  simulateLifecycle,
  runStressValidationSuite,
} from "./base-progression-longterm-sim.mjs";

const GAIN = 0.4;
const SOFT = SOFTCUT_CURVES.A_current;

function lifecycleSummary(dailyCap) {
  return ARCHETYPES.map((a) => {
    const r = simulateLifecycle({
      archetype: a,
      upgradeStyle: "balanced",
      dailyCap,
      gainMult: GAIN,
      softSteps: SOFT,
      maxDay: 180,
    });
    return {
      archetype: r.archetype,
      firstDayMilestone: r.firstDayMilestone,
      capWindows: r.capWindows,
      weeklyAvg: r.weeklyAvg,
    };
  });
}

const baseline2800 = { dailyCap: 2800, gainMult: GAIN, soft: SOFT };
const baseline3200 = { dailyCap: 3200, gainMult: GAIN, soft: SOFT };

const report = {
  note: "gain=0.40, softcut=A_current, upgrade/reinvest sensitivity = 1× (B_modeled)",
  longTerm: {
    cap2800: lifecycleSummary(2800),
    cap3200: lifecycleSummary(3200),
  },
  stress: {
    cap2800: runStressValidationSuite(baseline2800),
    cap3200: runStressValidationSuite(baseline3200),
  },
};

const outPath = fileURLToPath(new URL("./base-cap-2800-vs-3200-output.json", import.meta.url));
writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
console.error(`\nWrote ${outPath}`);
