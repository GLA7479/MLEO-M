#!/usr/bin/env node
/** Verifies owner approval gates block unauthorized runs. */
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const runner = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "runner.mjs");

function run(args) {
  const r = spawnSync(process.execPath, [runner, ...args], { encoding: "utf8" });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

const tests = [
  {
    name: "Gate 5 blocks full run without approve",
    args: ["--all-users", "--month", "1", "--mode", "live"],
    expectFail: true,
    expectText: "approve-full-run",
  },
  {
    name: "Gate 4 blocks live pilot without approve",
    args: [
      "--users",
      "qa_ghost,qa_miner_core,qa_base_ops,qa_solo_safe,qa_ov2_social",
      "--mode",
      "live",
    ],
    expectFail: true,
    expectText: "approve-pilot",
  },
  {
    name: "Dry-run always allowed",
    args: ["--dry-run", "--all-users", "--day", "1"],
    expectFail: false,
    expectText: '"ok": true',
  },
  {
    name: "Live + compressed blocked",
    args: ["--mode", "live", "--compressed", "--day", "1"],
    expectFail: true,
    expectText: "Refusing --compressed with --mode=live",
  },
  {
    name: "Live pilot without approve blocked",
    args: [
      "--users",
      "qa_ghost,qa_miner_core,qa_base_ops,qa_solo_safe,qa_ov2_social",
      "--mode",
      "live",
    ],
    expectFail: true,
    expectText: "approve-pilot",
  },
];

let pass = 0;
for (const t of tests) {
  const { code, out } = run(t.args);
  const failed = code !== 0;
  const ok = t.expectFail ? failed && out.includes(t.expectText) : !failed && out.includes(t.expectText);
  console.log(ok ? "PASS" : "FAIL", t.name);
  if (ok) pass++;
}
console.log(JSON.stringify({ pass, total: tests.length }, null, 2));
process.exit(pass === tests.length ? 0 : 1);
