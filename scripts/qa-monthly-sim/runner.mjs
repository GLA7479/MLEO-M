#!/usr/bin/env node
/**
 * Monthly Real User Behavior Simulator — orchestrator.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseArgs } from "./lib/config.mjs";
import { loadEnvLocal } from "./lib/loadEnv.mjs";
import { createRun, finishRun } from "./lib/db.mjs";
import { EventLogger } from "./lib/eventLogger.mjs";
import { QaHttpClient } from "./lib/httpClient.mjs";
import { PERSONAS, resolvePersonaList } from "./personas.mjs";
import { buildSchedulesForDay } from "./scheduler.mjs";
import { writeCheckpoint, readLatestCheckpoint } from "./checkpoint.mjs";
import { runMinersAction } from "./drivers/miners-driver.mjs";
import { runBaseAction } from "./drivers/base-driver.mjs";
import { runSoloV2Action } from "./drivers/solo-v2-driver.mjs";
import { runOv2Action } from "./drivers/ov2-driver.mjs";
import { CoverageTracker } from "./lib/coverageTracker.mjs";
import {
  assertLiveNotCompressed,
  isImmediateExecutionMode,
  waitUntilScheduled,
} from "./lib/wallClock.mjs";
import { buildMonthlySoloCoveragePlan } from "./lib/monthlyCoveragePlan.mjs";

loadEnvLocal();

/** Gate 3 validation only: force personas active without changing monthly RNG rules. */
function assertForceActiveAllowed(args) {
  if (!args.forceActive) return;
  if (args.mode === "live") {
    throw new Error("--force-active is not allowed with --mode=live");
  }
  if (!args.compressed || args.mode !== "local") {
    throw new Error("--force-active requires --mode=local --compressed (validation only)");
  }
  if (args.approvePilot || args.approveFullRun) {
    throw new Error("--force-active is not allowed with --approve-pilot or --approve-full-run");
  }
  if (args.allUsers) {
    throw new Error("--force-active is not allowed with --all-users (30-day run)");
  }
}

const REPORTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../reports");

const PILOT_USERS = ["qa_ghost", "qa_miner_core", "qa_base_ops", "qa_solo_safe", "qa_ov2_social"];
const PHASE3_USERS = ["qa_ghost", "qa_miner_core"];

async function executeAction(ctx, item) {
  const { module, action } = item;
  if (module === "miners") return runMinersAction(ctx, action);
  if (module === "base") return runBaseAction(ctx, action);
  if (module === "solo_v2") return runSoloV2Action(ctx, item);
  if (module === "ov2") return runOv2Action(ctx, item);
  return { ok: false };
}

async function runPersonaDay(persona, schedule, opts) {
  const client = new QaHttpClient({
    baseUrl: opts.baseUrl,
    personaId: persona.id,
    mock: opts.mock,
  });
  const stats = {
    lastVault: null,
    earned: 0,
    spent: 0,
    errors: 0,
    minersSessions: 0,
    baseSessions: 0,
    soloSessions: 0,
    ov2Sessions: 0,
    gameCounts: {},
    startMs: Date.now(),
  };
  const logger = opts.logger;
  const coverage = opts.coverage;
  const immediate = opts.immediateExecution;

  const ctx = {
    client,
    persona,
    logger,
    stats,
    simDay: opts.simDay,
    baseUrl: opts.baseUrl,
    mock: opts.mock,
    runId: opts.runId,
    coverage,
  };

  const actionTimings = [];

  for (const item of schedule.actions) {
    const plannedAt = item.scheduledAt || item.wallClockLabel;
    const wait = await waitUntilScheduled(plannedAt, { immediate });
    coverage.recordTiming({
      userId: persona.id,
      module: item.module,
      action: item.action,
      gameKey: item.params?.gameKey || item.params?.ov2GameId,
      plannedAt,
      executedAt: wait.executedAt,
      waitedMs: wait.waitedMs,
      outsideWindow: wait.outsideWindow,
    });

    if (wait.outsideWindow) {
      await logger.writeAlert({
        userId: persona.id,
        type: "outside_window",
        severity: "warning",
        details: { plannedAt, executedAt: wait.executedAt, action: item.action, module: item.module },
      });
    }

    if (!opts.dryRun) {
      ctx.actionTiming = {
        plannedAt,
        executedAt: wait.executedAt,
        waitedMs: wait.waitedMs,
        outsideWindow: wait.outsideWindow,
      };
      await executeAction(ctx, item);
    }

    actionTimings.push({
      plannedAt,
      executedAt: wait.executedAt,
      waitedMs: wait.waitedMs,
      outsideWindow: wait.outsideWindow,
      module: item.module,
      action: item.action,
    });
  }

  const balRes = opts.dryRun
    ? { data: { balance: stats.lastVault ?? 0 } }
    : await client.get("/api/arcade/vault/balance");
  const vaultEnd = Number(balRes.data?.balance ?? stats.lastVault ?? 0);

  const topGame = Object.entries(stats.gameCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  await logger.writeDailySummary(persona.id, {
    date: new Date().toISOString().slice(0, 10),
    totalActiveMs: Date.now() - stats.startMs,
    sessionCount: stats.soloSessions + stats.ov2Sessions + stats.minersSessions,
    minersSessions: stats.minersSessions,
    baseSessions: stats.baseSessions,
    soloV2Sessions: stats.soloSessions,
    ov2Sessions: stats.ov2Sessions,
    totalEarned: stats.earned,
    totalSpent: stats.spent,
    netDelta: stats.earned - stats.spent,
    vaultEnd,
    errorCount: stats.errors,
    stuckCount: 0,
    topGameKey: topGame,
  });

  await logger.writeEconomySnapshot(persona.id, {
    vaultBalance: vaultEnd,
    totalEarned: stats.earned,
    totalSpent: stats.spent,
  });

  await logger.flushSessions();

  return { persona: persona.id, stats, vaultEnd, actionTimings };
}

function writeCoverageArtifact(runId, day, coverage, mode) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const file = path.join(REPORTS_DIR, `coverage-${runId}-day${day}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        runId,
        day,
        mode,
        generatedAt: new Date().toISOString(),
        coverage: coverage.toReport(),
        monthlySoloPlan: buildMonthlySoloCoveragePlan(),
      },
      null,
      2
    )
  );
  return file;
}

async function main() {
  const args = parseArgs(process.argv);

  try {
    assertLiveNotCompressed(args.mode, args.compressed);
    assertForceActiveAllowed(args);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  if (args.mode === "live" && args.mock) {
    console.error("Refusing --mock with --mode=live (main run must be real).");
    process.exit(1);
  }

  let personas = resolvePersonaList(args);
  const runAnchorDate = args.runAnchorDate || new Date().toISOString().slice(0, 10);
  const immediateExecution = isImmediateExecutionMode({
    dryRun: args.dryRun,
    mode: args.mode,
    compressed: args.compressed,
  });

  if (args.dryRun) {
    if (!personas.length) personas = args.allUsers ? PERSONAS : PERSONAS.filter(p => PHASE3_USERS.includes(p.id));
    const schedules = buildSchedulesForDay(personas, args.day, {
      compressed: args.compressed,
      runAnchorDate,
      forceActive: args.forceActive,
    });
    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: "dry-run",
          baseUrl: args.baseUrl,
          day: args.day,
          runAnchorDate,
          forceActive: args.forceActive,
          immediateExecution: true,
          personas: schedules.map(({ persona, schedule }) => ({
            id: persona.id,
            active: schedule.active,
            forceActive: schedule.forceActive,
            actionCount: schedule.actions.length,
            totalMinutes: schedule.totalMinutes,
            sampleActions: schedule.actions.slice(0, 5).map(a => ({
              scheduledAt: a.scheduledAt,
              module: a.module,
              action: a.action,
              gameKey: a.params?.gameKey,
              ov2GameId: a.params?.ov2GameId,
            })),
          })),
        },
        null,
        2
      )
    );
    return;
  }

  const isFullMonth = args.allUsers && args.month >= 1;
  const isPilot =
    args.users.length === PILOT_USERS.length &&
    PILOT_USERS.every(u => args.users.includes(u));

  if (isFullMonth) {
    if (!args.approveFullRun) {
      console.error("Gate 5: Full 30-day run requires explicit --approve-full-run from owner.");
      process.exit(1);
    }
    if (args.compressed) {
      console.error("Full 30-day run must use real wall-clock time (no --compressed).");
      process.exit(1);
    }
  }

  if (isPilot && args.mode === "live" && !args.approvePilot) {
    console.error("Gate 4: 24-hour live pilot requires --approve-pilot.");
    process.exit(1);
  }

  if (!personas.length) {
    if (isFullMonth) personas = PERSONAS;
    else {
      personas = PERSONAS.filter(p => PHASE3_USERS.includes(p.id));
      args.users = PHASE3_USERS;
    }
  }

  const schedules = buildSchedulesForDay(personas, args.day, {
    compressed: args.compressed,
    runAnchorDate,
    forceActive: args.forceActive,
  });

  let runId = args.runId;
  if (args.resume && runId) {
    const cp = readLatestCheckpoint(runId);
    if (cp?.day) args.day = cp.day + 1;
  } else {
    try {
      runId = await createRun({
        mode: args.mode,
        seed: args.seed,
        monthNumber: args.month,
        label: isFullMonth ? "monthly-30d" : isPilot ? "pilot-24h" : args.forceActive ? "validation-force-active" : "validation",
      });
    } catch (e) {
      console.warn("[runner] DB run create failed — continuing with local run id:", e.message);
      runId = runId || `local-${Date.now()}`;
    }
  }

  const logger = new EventLogger({ runId, simDay: args.day, dryRun: false });
  const coverage = new CoverageTracker();
  const results = [];

  for (const { persona, schedule } of schedules) {
    if (!schedule.active) {
      console.log(`[skip] ${persona.id} inactive on day ${args.day}`);
      continue;
    }
    console.log(
      `[run] ${persona.id} day=${args.day} actions=${schedule.actions.length} mode=${args.mode} wallClock=${!immediateExecution}`
    );
    try {
      const r = await runPersonaDay(persona, schedule, {
        baseUrl: args.baseUrl,
        mock: args.mock,
        dryRun: false,
        compressed: args.compressed,
        simDay: args.day,
        logger,
        runId,
        coverage,
        immediateExecution,
      });
      results.push(r);
    } catch (e) {
      console.error(`[error] ${persona.id}:`, e.message);
      await logger.writeAlert({
        userId: persona.id,
        type: "runner_error",
        severity: "fail",
        details: { message: String(e.message) },
      });
    }
  }

  const coverageFile = writeCoverageArtifact(runId, args.day, coverage, args.mode);

  writeCheckpoint(runId, args.day, {
    runId,
    day: args.day,
    mode: args.mode,
    runAnchorDate,
    immediateExecution,
    results: results.map(r => ({
      user: r.persona,
      vaultEnd: r.vaultEnd,
      actionTimings: r.actionTimings,
    })),
    coverage: coverage.toReport(),
  });

  try {
    await finishRun(runId, "completed");
  } catch {
    /* ignore */
  }

  const cov = coverage.toReport();
  console.log(
    JSON.stringify(
      {
        ok: true,
        runId,
        day: args.day,
        mode: args.mode,
        baseUrl: args.baseUrl,
        forceActive: args.forceActive,
        immediateExecution,
        wallClockHonored: !immediateExecution,
        usersRun: results.length,
        dbLogging: logger.dbOk,
        coverageFile,
        coverageSummary: {
          soloCovered: cov.soloV2.covered,
          soloMissed: cov.soloV2.missed,
          soloGaps: cov.soloV2.coverage_gap,
          ov2Covered: cov.ov2.covered,
          ov2Missed: cov.ov2.missed,
          outsideWindowActions: cov.timing.outsideWindowCount,
        },
        timingSamples: results.flatMap(r => (r.actionTimings || []).slice(0, 3)),
        next: isFullMonth
          ? "Continue tomorrow with --resume --run-id=" + runId
          : "Review results; owner approves next gate",
      },
      null,
      2
    )
  );
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
