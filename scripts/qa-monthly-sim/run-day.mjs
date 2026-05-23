#!/usr/bin/env node
/**
 * Windows-safe Gate 4 daily runner entry point.
 * Injects --approve-day for live runs (npm on Windows often drops args after `--`).
 *
 * Usage (Windows-safe):
 *   npm run qa:day:2:dry-run
 *   npm run qa:day --day=2 --dry-run
 *   npm run qa:day -- --day=2
 *   set QA_SIM_DAY=2&& npm run qa:day
 *   node scripts/qa-monthly-sim/run-day.mjs --day=2
 */
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const RUNNER = path.join(path.dirname(fileURLToPath(import.meta.url)), "runner.mjs");

/** Normalize Windows/npm oddities: bare `2`, npm_config_* env vars. */
function normalizeUserArgs(argv) {
  const out = [];
  for (const arg of argv) {
    if (/^\d+$/.test(arg)) out.push(`--day=${arg}`);
    else out.push(arg);
  }
  const npmDay = process.env.npm_config_day;
  if (npmDay && !out.some(a => a === "--day" || a.startsWith("--day="))) {
    out.push(`--day=${npmDay}`);
  }
  if (process.env.npm_config_dry_run != null && !out.includes("--dry-run")) {
    out.push("--dry-run");
  }
  if (process.env.npm_config_approve_day != null && !out.includes("--approve-day")) {
    out.push("--approve-day");
  }
  return out;
}

const userArgs = normalizeUserArgs(process.argv.slice(2));
const isDryRun = userArgs.includes("--dry-run");

const forwardArgs = [
  RUNNER,
  "--daily",
  "--all-users",
  "--mode=live",
  "--daily-window-hours=6",
  "--pilot-force-active",
];

if (!isDryRun) forwardArgs.push("--approve-day");

const hasDayArg = userArgs.some(a => a === "--day" || a.startsWith("--day="));
if (!hasDayArg && process.env.QA_SIM_DAY) {
  forwardArgs.push(`--day=${process.env.QA_SIM_DAY}`);
}

const result = spawnSync(process.execPath, [...forwardArgs, ...userArgs], {
  stdio: "inherit",
  cwd: ROOT,
});

process.exit(result.status ?? 1);
