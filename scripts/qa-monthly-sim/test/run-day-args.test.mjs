import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const RUN_DAY = path.join(ROOT, "scripts/qa-monthly-sim/run-day.mjs");

describe("run-day.mjs Windows-safe arg forwarding", () => {
  it("dry-run forwards --day=2 and injects daily flags without live run", () => {
    const result = spawnSync(
      process.execPath,
      [RUN_DAY, "--dry-run", "--day=2"],
      { cwd: ROOT, encoding: "utf8", timeout: 30_000 }
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const out = result.stdout;
    assert.match(out, /"simDay"\s*:\s*2/);
    assert.match(out, /daily-dry-run/);
    assert.doesNotMatch(out, /"phase"\s*:\s*"daily-estimate"/);
  });

  it("normalizes bare day number from broken npm forwarding", () => {
    const result = spawnSync(process.execPath, [RUN_DAY, "2", "--dry-run"], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /"simDay"\s*:\s*2/);
    assert.match(result.stdout, /daily-dry-run/);
  });
});
