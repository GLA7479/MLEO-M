#!/usr/bin/env node
/**
 * Gate 3.6 live preflight metrics collector (read-only).
 * Usage: node scripts/qa-monthly-sim/live-preflight-collect.mjs --run-id=<uuid>
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadEnvLocal } from "./lib/loadEnv.mjs";
import { getQaDb } from "./lib/db.mjs";
import { PERSONAS } from "./personas.mjs";

loadEnvLocal();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REPORTS = path.join(ROOT, "reports");
const CHECKPOINTS = path.join(path.dirname(fileURLToPath(import.meta.url)), "checkpoints");

function parseArgs() {
  let runId = null;
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith("--run-id=")) runId = a.split("=")[1];
  }
  return { runId };
}

function loadCoverage(runId) {
  if (!fs.existsSync(REPORTS)) return null;
  const files = fs.readdirSync(REPORTS).filter(f => f.startsWith(`coverage-${runId}-`));
  if (!files.length) return null;
  const latest = files.sort().at(-1);
  return { path: path.join(REPORTS, latest), data: JSON.parse(fs.readFileSync(path.join(REPORTS, latest), "utf8")) };
}

function loadCheckpoint(runId) {
  if (!fs.existsSync(CHECKPOINTS)) return null;
  const files = fs.readdirSync(CHECKPOINTS).filter(f => f.startsWith(`run-${runId}-day-`));
  if (!files.length) return null;
  const latest = files.sort().at(-1);
  return { path: path.join(CHECKPOINTS, latest), data: JSON.parse(fs.readFileSync(path.join(CHECKPOINTS, latest), "utf8")) };
}

export async function collectLivePreflightReport(runId, extra = {}) {
  const db = getQaDb();

  const tableCounts = {};
  for (const [table, col] of [
    ["qa_sim_run", "id"],
    ["qa_sim_event", "run_id"],
    ["qa_sim_session", "run_id"],
    ["qa_sim_daily_summary", "run_id"],
    ["qa_sim_economy_snapshot", "run_id"],
    ["qa_sim_alert", "run_id"],
  ]) {
    const { count } = await db.from(table).select("*", { count: "exact", head: true }).eq(col, runId);
    tableCounts[table] = count;
  }

  const { data: run } = await db.from("qa_sim_run").select("*").eq("id", runId).maybeSingle();
  const { data: alerts } = await db.from("qa_sim_alert").select("*").eq("run_id", runId);
  const alertByType = {};
  for (const a of alerts || []) alertByType[a.alert_type] = (alertByType[a.alert_type] || 0) + 1;

  const { data: events } = await db
    .from("qa_sim_event")
    .select("*")
    .eq("run_id", runId)
    .order("recorded_at", { ascending: true });

  const perUser = {};
  for (const p of PERSONAS) {
    perUser[p.id] = {
      userId: p.id,
      plannedActions: extra.plannedPerUser?.[p.id] ?? 0,
      executedActions: 0,
      modules: { miners: 0, base: 0, solo_v2: 0, ov2: 0 },
      status: extra.userStatus?.[p.id]?.status ?? "never_started",
    };
  }

  const moduleFirstLast = { miners: {}, base: {}, solo_v2: {}, ov2: {} };
  for (const e of events || []) {
    if (!perUser[e.user_id]) continue;
    perUser[e.user_id].executedActions += 1;
    if (perUser[e.user_id].modules[e.module] != null) perUser[e.user_id].modules[e.module] += 1;
    if (perUser[e.user_id].status === "never_started") perUser[e.user_id].status = "executed";
    const ml = moduleFirstLast[e.module];
    if (ml && !ml.first) ml.first = e.recorded_at;
    if (ml) ml.last = e.recorded_at;
  }

  const outsideWindow = (events || []).filter(e => e.raw_response?.outsideWindow).length;
  const coverage = loadCoverage(runId);
  const checkpoint = loadCheckpoint(runId);
  const cov = coverage?.data?.coverage || checkpoint?.data?.coverage || null;

  const baseLast = moduleFirstLast.base?.last;
  const ov2First = moduleFirstLast.ov2?.first;
  const soloFirst = moduleFirstLast.solo_v2?.first;
  const ov2NotBlockedByBase = baseLast && ov2First ? ov2First < baseLast : ov2First != null;
  const soloNotBlockedByBase = baseLast && soloFirst ? soloFirst < baseLast : soloFirst != null;

  const report = {
    gate: "3.6",
    runId,
    run: run || null,
    startTime: run?.started_at ?? extra.startTime ?? null,
    endTime: run?.ended_at ?? extra.endTime ?? null,
    runtimeMs: extra.runtimeMs ?? null,
    status: run?.status ?? extra.status ?? null,
    mode: "live",
    compressed: false,
    plannedUsers: 20,
    usersExecuted: Object.values(perUser).filter(u => u.executedActions > 0).length,
    usersSkipped: Object.values(perUser).filter(u => u.status === "skipped_deadline").length,
    usersFailed: Object.values(perUser).filter(u => u.status === "error").length,
    perUser,
    tableCounts,
    alerts: {
      total: (alerts || []).length,
      byType: alertByType,
      vault_mismatch: alertByType.vault_mismatch || 0,
      duplicate_reward: alertByType.duplicate_reward || 0,
      runner_error: alertByType.runner_error || 0,
      coverage_gap: alertByType.coverage_gap || 0,
      outside_window: alertByType.outside_window || 0,
    },
    coverage: {
      miners: cov?.miners ?? null,
      base: cov?.base ?? null,
      soloV2: cov?.soloV2 ?? null,
      ov2: cov?.ov2 ?? null,
    },
    moduleTouch: {
      miners: (events || []).some(e => e.module === "miners"),
      base: (events || []).some(e => e.module === "base"),
      solo_v2: (events || []).some(e => e.module === "solo_v2"),
      ov2: (events || []).some(e => e.module === "ov2"),
      ov2NotBlockedByBase,
      soloNotBlockedByBase,
    },
    timing: {
      eventCount: (events || []).length,
      outsideWindowCount: outsideWindow,
      samples: (events || []).slice(0, 30).map(e => ({
        userId: e.user_id,
        module: e.module,
        action: e.action,
        plannedAt: e.raw_response?.plannedAt || e.simulated_at,
        executedAt: e.raw_response?.executedAt || e.recorded_at,
        waitedMs: e.raw_response?.waitedMs,
        outsideWindow: Boolean(e.raw_response?.outsideWindow),
      })),
    },
    estimate: extra.estimate ?? null,
    paths: {
      coverage: coverage?.path ?? null,
      checkpoint: checkpoint?.path ?? null,
      report: path.join(REPORTS, `live-preflight-report-${runId}.json`),
    },
    generatedAt: new Date().toISOString(),
  };

  fs.mkdirSync(REPORTS, { recursive: true });
  const outPath = report.paths.report;
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  return { report, outPath };
}

async function main() {
  const { runId } = parseArgs();
  if (!runId) {
    console.error("Usage: live-preflight-collect.mjs --run-id=<uuid>");
    process.exit(1);
  }
  const { report, outPath } = await collectLivePreflightReport(runId);
  console.log(JSON.stringify({ ok: true, reportPath: outPath, report }, null, 2));
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("live-preflight-collect.mjs")) {
  main().catch(e => {
    console.error(e);
    process.exit(1);
  });
}
