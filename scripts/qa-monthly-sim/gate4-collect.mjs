#!/usr/bin/env node
/**
 * Gate 4 pilot metrics collector (read-only).
 * Usage: node scripts/qa-monthly-sim/gate4-collect.mjs --run-id=<uuid>
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadEnvLocal } from "./lib/loadEnv.mjs";
import { getQaDb } from "./lib/db.mjs";

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

async function main() {
  const { runId } = parseArgs();
  if (!runId) {
    console.error("Usage: gate4-collect.mjs --run-id=<uuid>");
    process.exit(1);
  }
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
  const alertBySeverity = {};
  for (const a of alerts || []) {
    alertByType[a.alert_type] = (alertByType[a.alert_type] || 0) + 1;
    alertBySeverity[a.severity] = (alertBySeverity[a.severity] || 0) + 1;
  }

  const { data: events } = await db
    .from("qa_sim_event")
    .select("*")
    .eq("run_id", runId)
    .order("recorded_at", { ascending: true });

  const usersRun = new Set((events || []).map(e => e.user_id)).size;
  const modEvents = {};
  for (const e of events || []) modEvents[e.module] = (modEvents[e.module] || 0) + 1;

  const outsideWindow = (events || []).filter(e => e.raw_response?.outsideWindow).length;
  const timingSamples = (events || []).slice(0, 20).map(e => ({
    userId: e.user_id,
    module: e.module,
    action: e.action,
    plannedAt: e.raw_response?.plannedAt || e.simulated_at,
    executedAt: e.raw_response?.executedAt || e.recorded_at,
    waitedMs: e.raw_response?.waitedMs,
    outsideWindow: Boolean(e.raw_response?.outsideWindow),
  }));

  const { data: summaries } = await db.from("qa_sim_daily_summary").select("*").eq("run_id", runId);
  let topEarner = null;
  let worstLoss = null;
  for (const s of summaries || []) {
    const net = Number(s.net_delta || 0);
    if (!topEarner || net > Number(topEarner.net_delta)) topEarner = s;
    if (!worstLoss || net < Number(worstLoss.net_delta)) worstLoss = s;
  }

  const gameProfit = {};
  for (const e of events || []) {
    if (!e.game_key || e.delta == null) continue;
    gameProfit[e.game_key] = (gameProfit[e.game_key] || 0) + Number(e.delta);
  }
  const mostProfitableGame = Object.entries(gameProfit).sort((a, b) => b[1] - a[1])[0];

  const errorBuckets = {};
  for (const e of events || []) {
    if (e.outcome !== "error" && e.outcome !== "coverage_gap") continue;
    const key = `${e.module}/${e.action}${e.game_key ? `:${e.game_key}` : ""}`;
    if (!errorBuckets[key]) errorBuckets[key] = { count: 0, samples: [] };
    errorBuckets[key].count += 1;
    if (errorBuckets[key].samples.length < 3) {
      errorBuckets[key].samples.push(e.error_message || e.outcome);
    }
  }
  const repeatedErrors = Object.entries(errorBuckets)
    .filter(([, v]) => v.count >= 2)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([k, v]) => ({ key: k, count: v.count, samples: v.samples }));

  const { data: sessions } = await db.from("qa_sim_session").select("*").eq("run_id", runId);
  const stuckSessions = (sessions || []).filter(s => s.stuck);
  const orphanedRooms = (events || []).filter(
    e =>
      e.module === "ov2" &&
      (e.error_message?.includes("orphan") ||
        e.raw_response?.errorMessage?.includes("orphan") ||
        JSON.stringify(e.raw_response || {}).includes("orphan"))
  );

  const coverage = loadCoverage(runId);
  const checkpoint = loadCheckpoint(runId);
  const cov = coverage?.data?.coverage || checkpoint?.data?.coverage;

  const report = {
    runId,
    run: run || null,
    startTime: run?.started_at || null,
    endTime: run?.ended_at || null,
    status: run?.status || null,
    mode: run?.mode || null,
    label: run?.run_label || null,
    usersRun,
    tableCounts,
    alerts: {
      total: (alerts || []).length,
      byType: alertByType,
      bySeverity: alertBySeverity,
      vault_mismatch: alertByType.vault_mismatch || 0,
      duplicate_reward: alertByType.duplicate_reward || 0,
      runner_error: alertByType.runner_error || 0,
      coverage_gap: alertByType.coverage_gap || 0,
      fail: alertBySeverity.fail || 0,
      warning: alertBySeverity.warning || 0,
    },
    eventsByModule: modEvents,
    timing: {
      eventCount: (events || []).length,
      outsideWindowCount: outsideWindow,
      samples: timingSamples,
      coverageTiming: cov?.timing || null,
    },
    coverage: {
      miners: cov?.miners || null,
      base: cov?.base || null,
      soloV2: cov?.soloV2 || null,
      ov2: cov?.ov2 || null,
    },
    economy: { topEarner, worstLoss, mostProfitableGame: mostProfitableGame ? { game: mostProfitableGame[0], netDelta: mostProfitableGame[1] } : null },
    repeatedErrors,
    stuckSessions,
    orphanedRooms: orphanedRooms.map(e => ({
      userId: e.user_id,
      action: e.action,
      message: e.error_message,
      at: e.recorded_at,
    })),
    paths: {
      coverage: coverage?.path || null,
      checkpoint: checkpoint?.path || null,
      pilotLog: path.join(REPORTS, "gate4-pilot-run.log"),
    },
    generatedAt: new Date().toISOString(),
  };

  const outPath = path.join(REPORTS, `gate4-report-${runId}.json`);
  fs.mkdirSync(REPORTS, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, reportPath: outPath, ...report }, null, 2));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
