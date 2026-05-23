#!/usr/bin/env node
/**
 * Gate 4 daily report collector — JSON + HTML.
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

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

function loadCoverage(runId, simDay) {
  if (!fs.existsSync(REPORTS)) return null;
  const exact = path.join(REPORTS, `coverage-${runId}-day${simDay}.json`);
  if (fs.existsSync(exact)) return { path: exact, data: JSON.parse(fs.readFileSync(exact, "utf8")) };
  const files = fs.readdirSync(REPORTS).filter(f => f.startsWith(`coverage-${runId}-`));
  if (!files.length) return null;
  const latest = files.sort().at(-1);
  return { path: path.join(REPORTS, latest), data: JSON.parse(fs.readFileSync(path.join(REPORTS, latest), "utf8")) };
}

function loadCampaignCheckpoint(campaignId, simDay) {
  const file = path.join(CHECKPOINTS, `campaign-${campaignId}-day-${simDay}.json`);
  if (!fs.existsSync(file)) return null;
  return { path: file, data: JSON.parse(fs.readFileSync(file, "utf8")) };
}

function renderHtml(report) {
  const userRows = Object.values(report.perUser || {})
    .map(
      u =>
        `<tr><td>${esc(u.userId)}</td><td>${esc(u.status)}</td><td>${u.plannedActions}</td><td>${u.executedActions}</td><td>${esc(JSON.stringify(u.modules))}</td></tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>QA Daily Report — ${esc(report.campaignId)} day ${report.simDay}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; background: #0f1419; color: #e7ecf3; }
    h1,h2 { color: #7dd3fc; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #334155; padding: 0.5rem; text-align: left; }
    th { background: #1e293b; }
    .ok { color: #86efac; }
    .warn { color: #fcd34d; }
  </style>
</head>
<body>
  <h1>Gate 4 — Daily Report</h1>
  <p><strong>Campaign:</strong> ${esc(report.campaignId)} &nbsp; <strong>Day:</strong> ${report.simDay} &nbsp; <strong>Run:</strong> ${esc(report.runId)}</p>
  <p><strong>Status:</strong> <span class="${report.status === "completed" ? "ok" : "warn"}">${esc(report.status)}</span> &nbsp;
     <strong>Mode:</strong> ${esc(report.mode)} &nbsp; <strong>Runtime:</strong> ${Math.round((report.runtimeMs || 0) / 60000)} min</p>
  <h2>Users (${report.usersExecuted}/${report.plannedUsers})</h2>
  <table><thead><tr><th>User</th><th>Status</th><th>Planned</th><th>Executed</th><th>Modules</th></tr></thead><tbody>${userRows}</tbody></table>
  <h2>Alerts</h2>
  <pre>${esc(JSON.stringify(report.alerts, null, 2))}</pre>
  <h2>Module touch</h2>
  <pre>${esc(JSON.stringify(report.moduleTouch, null, 2))}</pre>
  <h2>Table counts</h2>
  <pre>${esc(JSON.stringify(report.tableCounts, null, 2))}</pre>
  <p><em>Generated ${esc(report.generatedAt)}</em></p>
</body>
</html>`;
}

export async function collectDailyReport({
  campaignId,
  simDay,
  runId,
  extra = {},
}) {
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
  const coverage = loadCoverage(runId, simDay);
  const checkpoint = loadCampaignCheckpoint(campaignId, simDay);
  const cov = coverage?.data?.coverage || checkpoint?.data?.coverage || null;

  const baseLast = moduleFirstLast.base?.last;
  const ov2First = moduleFirstLast.ov2?.first;
  const soloFirst = moduleFirstLast.solo_v2?.first;

  const report = {
    gate: "4",
    campaignId,
    simDay,
    runId,
    run: run || null,
    startTime: run?.started_at ?? extra.startTime ?? null,
    endTime: run?.ended_at ?? extra.endTime ?? null,
    runtimeMs: extra.runtimeMs ?? null,
    status: run?.status ?? extra.status ?? null,
    mode: "live",
    compressed: false,
    dailyWindowHours: extra.dailyWindowHours ?? null,
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
      ov2NotBlockedByBase: baseLast && ov2First ? ov2First < baseLast : ov2First != null,
      soloNotBlockedByBase: baseLast && soloFirst ? soloFirst < baseLast : soloFirst != null,
    },
    timing: {
      eventCount: (events || []).length,
      outsideWindowCount: outsideWindow,
      deadlineReached: extra.deadlineReached ?? false,
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
      reportJson: path.join(REPORTS, `daily-report-${campaignId}-day-${simDay}.json`),
      reportHtml: path.join(REPORTS, `daily-report-${campaignId}-day-${simDay}.html`),
    },
    generatedAt: new Date().toISOString(),
  };

  fs.mkdirSync(REPORTS, { recursive: true });
  const jsonPath = report.paths.reportJson;
  const htmlPath = report.paths.reportHtml;
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(htmlPath, renderHtml(report));

  return { report, jsonPath, htmlPath };
}
