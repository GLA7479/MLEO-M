#!/usr/bin/env node
/**
 * QA monthly sim report generator.
 * node scripts/qa-monthly-sim/reporter.mjs --run-id=<uuid> [--day=N] [--final] [--user=qa_ghost]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadEnvLocal } from "./lib/loadEnv.mjs";
import { getQaDb } from "./lib/db.mjs";
import { PERSONAS } from "./personas.mjs";

loadEnvLocal();

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../reports");

function parseArgs() {
  const out = { runId: null, day: null, final: false, user: null, output: null };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith("--run-id=")) out.runId = a.split("=")[1];
    else if (a.startsWith("--day=")) out.day = Number(a.split("=")[1]);
    else if (a === "--final") out.final = true;
    else if (a.startsWith("--user=")) out.user = a.split("=")[1];
    else if (a.startsWith("--output=")) out.output = a.split("=")[1];
  }
  return out;
}

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

async function fetchSummaries(runId, day, userId) {
  const db = getQaDb();
  let q = db.from("qa_sim_daily_summary").select("*").eq("run_id", runId).order("sim_day");
  if (day != null) q = q.eq("sim_day", day);
  if (userId) q = q.eq("user_id", userId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function fetchAlerts(runId) {
  const db = getQaDb();
  const { data } = await db
    .from("qa_sim_alert")
    .select("*")
    .eq("run_id", runId)
    .order("created_at", { ascending: false });
  return data || [];
}

async function fetchTimeline(runId, userId, day) {
  const db = getQaDb();
  let q = db
    .from("qa_sim_event")
    .select("*")
    .eq("run_id", runId)
    .order("simulated_at", { ascending: true })
    .limit(5000);
  if (userId) q = q.eq("user_id", userId);
  const { data } = await q;
  return (data || []).filter(e => !day || new Date(e.simulated_at).getUTCDate() === day);
}

function loadCoverageArtifact(runId, day) {
  const simDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../reports");
  const exact = path.join(simDir, `coverage-${runId}-day${day}.json`);
  if (day != null && fs.existsSync(exact)) return JSON.parse(fs.readFileSync(exact, "utf8"));
  if (!fs.existsSync(simDir)) return null;
  const files = fs.readdirSync(simDir).filter(f => f.startsWith(`coverage-${runId}-`));
  if (!files.length) return null;
  return JSON.parse(fs.readFileSync(path.join(simDir, files[files.length - 1]), "utf8"));
}

function coverageTable(rows, cols) {
  if (!rows?.length) return "<p>none</p>";
  const head = cols.map(c => `<th>${esc(c)}</th>`).join("");
  const body = rows
    .map(r => `<tr>${cols.map(c => `<td>${esc(String(r[c] ?? ""))}</td>`).join("")}</tr>`)
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function buildHtml({ runId, summaries, alerts, timelines, final, coveragePayload, checkpoint }) {
  const byUser = {};
  for (const s of summaries) {
    if (!byUser[s.user_id]) byUser[s.user_id] = [];
    byUser[s.user_id].push(s);
  }

  let topEarner = null;
  let worstLoss = null;
  let maxEarn = -Infinity;
  let maxLoss = Infinity;
  for (const s of summaries) {
    const net = Number(s.net_delta || 0);
    if (net > maxEarn) {
      maxEarn = net;
      topEarner = s;
    }
    if (net < maxLoss) {
      maxLoss = net;
      worstLoss = s;
    }
  }

  const gameCounts = {};
  for (const s of summaries) {
    if (s.top_game_key) gameCounts[s.top_game_key] = (gameCounts[s.top_game_key] || 0) + 1;
  }
  const mostPlayed = Object.entries(gameCounts).sort((a, b) => b[1] - a[1])[0];

  const rows = PERSONAS.map(p => {
    const days = byUser[p.id] || [];
    const totalNet = days.reduce((a, d) => a + Number(d.net_delta || 0), 0);
    const errs = days.reduce((a, d) => a + Number(d.error_count || 0), 0);
    return `<tr><td>${esc(p.id)}</td><td>${esc(p.displayName)}</td><td>${days.length}</td><td>${totalNet}</td><td>${errs}</td></tr>`;
  }).join("");

  const cov = coveragePayload?.coverage || checkpoint?.coverage || null;
  const timing = cov?.timing || checkpoint?.results?.flatMap(r => r.actionTimings) || [];
  const outsideCount =
    cov?.timing?.outsideWindowCount ??
    timing.filter(t => t.outsideWindow).length;

  const soloRows = (cov?.soloV2?.games || []).map(g => ({
    game: g.id,
    status: g.status,
    attempts: g.attempts,
    reason: g.reason || "",
  }));
  const ov2Rows = (cov?.ov2?.games || []).map(g => ({
    game: g.id,
    status: g.status,
    attempts: g.attempts,
    reason: g.reason || "",
  }));
  const baseRows = (cov?.base?.actions || []).map(a => ({
    action: a.action,
    status: a.status,
    attempts: a.attempts,
    note: a.note || a.reason || "",
  }));
  const minersRows = (cov?.miners?.actions || []).map(a => ({
    action: a.action,
    status: a.status,
    attempts: a.attempts,
  }));

  const timingRows = (Array.isArray(timing) ? timing : []).slice(0, 80).map(t => ({
    user: t.userId,
    module: t.module,
    action: t.action,
    plannedAt: t.plannedAt,
    executedAt: t.executedAt,
    waitedMs: t.waitedMs,
    outsideWindow: t.outsideWindow,
  }));

  const alertRows = alerts
    .slice(0, 200)
    .map(
      a =>
        `<tr><td>${esc(a.severity)}</td><td>${esc(a.alert_type)}</td><td>${esc(a.user_id)}</td><td>${esc(a.sim_day)}</td><td><pre>${esc(JSON.stringify(a.details))}</pre></td></tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>QA Sim Report ${esc(runId)}</title>
<style>body{font-family:system-ui,sans-serif;margin:24px;background:#111;color:#eee}table{border-collapse:collapse;width:100%;margin:12px 0}th,td{border:1px solid #444;padding:8px}th{background:#222}h1,h2{color:#9cf}</style>
</head><body>
<h1>MLEO QA Monthly Simulator Report</h1>
<p>Run: <code>${esc(runId)}</code> ${final ? "(final)" : ""}</p>
<h2>Owner summary</h2>
<ul>
<li>Top earner: ${topEarner ? `${esc(topEarner.user_id)} (${topEarner.net_delta} on day ${topEarner.sim_day})` : "n/a"}</li>
<li>Worst loss: ${worstLoss ? `${esc(worstLoss.user_id)} (${worstLoss.net_delta})` : "n/a"}</li>
<li>Most played game key (by day top_game): ${mostPlayed ? `${esc(mostPlayed[0])} (${mostPlayed[1]} days)` : "n/a"}</li>
<li>Alerts: ${alerts.length} (${alerts.filter(a => a.severity === "fail").length} fail)</li>
<li>Actions outside intended window: ${outsideCount}</li>
<li>Wall-clock mode: ${checkpoint?.immediateExecution === false ? "live (honored)" : checkpoint?.immediateExecution === true ? "immediate (local/compressed/dry-run)" : "unknown"}</li>
</ul>
<h2>Coverage — Solo V2 (27 live games)</h2>
<p>Covered: ${cov?.soloV2?.covered ?? "n/a"} / Missed: ${cov?.soloV2?.missed ?? "n/a"} / coverage_gap: ${cov?.soloV2?.coverage_gap ?? "n/a"}</p>
${coverageTable(soloRows, ["game", "status", "attempts", "reason"])}
<h2>Coverage — OV2 active shared games</h2>
<p>Covered: ${cov?.ov2?.covered ?? "n/a"} / Missed: ${cov?.ov2?.missed ?? "n/a"} / coverage_gap: ${cov?.ov2?.coverage_gap ?? "n/a"}</p>
${coverageTable(ov2Rows, ["game", "status", "attempts", "reason"])}
<h2>Coverage — BASE actions</h2>
${coverageTable(baseRows, ["action", "status", "attempts", "note"])}
<h2>Coverage — Miners actions</h2>
${coverageTable(minersRows, ["action", "status", "attempts"])}
<h2>Planned vs actual execution time</h2>
${coverageTable(timingRows, ["user", "module", "action", "plannedAt", "executedAt", "waitedMs", "outsideWindow"])}
<h2>All 20 QA users</h2>
<table><thead><tr><th>ID</th><th>Name</th><th>Active days logged</th><th>Net MLEO</th><th>Errors</th></tr></thead><tbody>${rows}</tbody></table>
<h2>Alerts</h2>
<table><thead><tr><th>Severity</th><th>Type</th><th>User</th><th>Day</th><th>Details</th></tr></thead><tbody>${alertRows || "<tr><td colspan=5>none</td></tr>"}</tbody></table>
<h2>Per-user timelines (sample)</h2>
${Object.entries(timelines)
  .map(
    ([uid, events]) =>
      `<h3>${esc(uid)} (${events.length} events)</h3><pre>${esc(
        events
          .slice(0, 50)
          .map(e => {
            const rr = e.raw_response || {};
            return `${rr.plannedAt || e.simulated_at} → ${rr.executedAt || e.recorded_at} wait=${rr.waitedMs ?? "?"}ms ${e.module}/${e.action} ${e.game_key || ""} Δ${e.delta ?? ""} ${e.outcome}${rr.outsideWindow ? " OUTSIDE_WINDOW" : ""}`;
          })
          .join("\n")
      )}</pre>`
  )
  .join("")}
</body></html>`;
}

async function loadCheckpointFallback(runId) {
  const cpDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "checkpoints");
  if (!fs.existsSync(cpDir)) return null;
  const files = fs.readdirSync(cpDir).filter(f => f.startsWith(`run-${runId}-day-`));
  if (!files.length) return null;
  const summaries = [];
  for (const f of files) {
    const cp = JSON.parse(fs.readFileSync(path.join(cpDir, f), "utf8"));
    for (const r of cp.results || []) {
      summaries.push({
        user_id: r.user,
        sim_day: cp.day,
        net_delta: 0,
        vault_end: r.vaultEnd,
        error_count: 0,
        session_count: 0,
      });
    }
  }
  return summaries;
}

async function main() {
  const args = parseArgs();
  if (!args.runId) {
    console.error("Usage: reporter.mjs --run-id=<uuid> [--day=N] [--final] [--user=id] [--output=path]");
    process.exit(1);
  }

  let summaries = [];
  let alerts = [];
  try {
    summaries = await fetchSummaries(args.runId, args.day, args.user);
    alerts = await fetchAlerts(args.runId);
  } catch (e) {
    console.warn("[reporter] DB unavailable:", e.message);
    summaries = (await loadCheckpointFallback(args.runId)) || [];
  }
  const coveragePayload = loadCoverageArtifact(args.runId, args.day);
  let checkpoint = null;
  try {
    const cpDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "checkpoints");
    const cpFiles = fs.existsSync(cpDir)
      ? fs.readdirSync(cpDir).filter(f => f.startsWith(`run-${args.runId}-day-`))
      : [];
    if (cpFiles.length) {
      checkpoint = JSON.parse(
        fs.readFileSync(path.join(cpDir, cpFiles[cpFiles.length - 1]), "utf8")
      );
    }
  } catch {
    /* ignore */
  }

  const timelines = {};
  const users = args.user ? [args.user] : PERSONAS.map(p => p.id);
  for (const uid of users.slice(0, args.final ? 20 : 5)) {
    try {
      timelines[uid] = await fetchTimeline(args.runId, uid, args.day);
    } catch {
      timelines[uid] = [];
    }
  }

  const html = buildHtml({
    runId: args.runId,
    summaries,
    alerts,
    timelines,
    final: args.final,
    coveragePayload,
    checkpoint,
  });

  fs.mkdirSync(DIR, { recursive: true });
  const outPath =
    args.output ||
    path.join(DIR, args.final ? "monthly-final-report.html" : `day${args.day || "all"}-report.html`);
  fs.writeFileSync(outPath, html);
  const jsonPath = outPath.replace(/\.html$/, ".json");
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        runId: args.runId,
        summaries,
        alerts,
        coverage: coveragePayload?.coverage || checkpoint?.coverage,
        timing: coveragePayload?.coverage?.timing || checkpoint?.results,
        generatedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
  console.log(JSON.stringify({ ok: true, html: outPath, json: jsonPath, summaryRows: summaries.length }, null, 2));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
