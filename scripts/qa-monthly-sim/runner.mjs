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
import { buildPreflightTimeline } from "./lib/preflightScheduler.mjs";
import { buildLivePreflightTimeline, LIVE_MODULE_EXEC_MS, LIVE_PACING_MS } from "./lib/livePreflightScheduler.mjs";
import { estimateTimeline, assertTimelineFitsWindow, formatEstimate } from "./lib/pilotEstimator.mjs";
import { runTimeline } from "./lib/pilotTimeline.mjs";
import { collectPreflightReport } from "./preflight-collect.mjs";
import { collectLivePreflightReport } from "./live-preflight-collect.mjs";
import { buildDailyTimeline, defaultDailyPerUserBudget } from "./lib/dailyScheduler.mjs";
import {
  getOrCreateCampaign,
  resolveSimDay,
  assertDayCanStart,
  markDayStarted,
  markDayCompleted,
} from "./lib/campaignStore.mjs";
import { writeCampaignDayCheckpoint } from "./lib/dailyCheckpoint.mjs";
import { collectDailyReport } from "./daily-collect.mjs";

loadEnvLocal();

/** Gate 3.5 orchestration preflight guards. */
function assertOrchestrationPreflightAllowed(args) {
  if (!args.orchestrationPreflight) return;
  if (args.mode !== "local") {
    throw new Error("--orchestration-preflight requires --mode=local");
  }
  if (!args.compressed) {
    throw new Error("--orchestration-preflight requires --compressed");
  }
  if (!args.pilotForceActive) {
    throw new Error("--orchestration-preflight requires --pilot-force-active");
  }
  if (!args.allUsers) {
    throw new Error("--orchestration-preflight requires --all-users (20 personas)");
  }
  if (args.approvePilot || args.approveFullRun) {
    throw new Error("--orchestration-preflight is not allowed with --approve-pilot or --approve-full-run");
  }
  if (args.mode === "live") {
    throw new Error("--orchestration-preflight is not allowed with --mode=live");
  }
}

/** Gate 3.6 live preflight guards. */
function assertLivePreflightAllowed(args) {
  if (!args.livePreflight) return;
  if (args.mode !== "live") {
    throw new Error("--live-preflight requires --mode=live");
  }
  if (args.compressed) {
    throw new Error("--live-preflight is not allowed with --compressed");
  }
  if (args.mock) {
    throw new Error("--live-preflight is not allowed with --mock");
  }
  if (!args.approveLivePreflight) {
    throw new Error("--live-preflight requires --approve-live-preflight");
  }
  if (!args.pilotForceActive) {
    throw new Error("--live-preflight requires --pilot-force-active");
  }
  if (!args.allUsers) {
    throw new Error("--live-preflight requires --all-users (20 personas)");
  }
  if (args.approvePilot || args.approveFullRun) {
    throw new Error("--live-preflight is not allowed with --approve-pilot or --approve-full-run");
  }
  if (args.orchestrationPreflight) {
    throw new Error("--live-preflight is not allowed with --orchestration-preflight");
  }
}

/** Gate 4 daily automation guards. */
function assertDailyAllowed(args) {
  if (!args.daily) return;
  if (args.mode !== "live") {
    throw new Error("--daily requires --mode=live");
  }
  if (args.compressed) {
    throw new Error("--daily is not allowed with --compressed");
  }
  if (args.mock) {
    throw new Error("--daily is not allowed with --mock");
  }
  if (!args.dryRun && !args.approveDay) {
    throw new Error("--daily requires --approve-day (omit only for --dry-run)");
  }
  if (!args.allUsers) {
    throw new Error("--daily requires --all-users (20 personas)");
  }
  if (!args.pilotForceActive) {
    throw new Error("--daily requires --pilot-force-active");
  }
  if (args.dailyWindowHours >= 24 && !args.approvePilot24h) {
    throw new Error("--daily-window-hours=24 requires --approve-pilot-24h (Gate 4-B only)");
  }
  if (args.approvePilot || args.approveFullRun) {
    throw new Error("--daily is not allowed with --approve-pilot or --approve-full-run");
  }
  if (args.orchestrationPreflight || args.livePreflight) {
    throw new Error("--daily is not allowed with preflight flags");
  }
}

/** Gate 3 validation only: force personas active without changing monthly RNG rules. */
function assertForceActiveAllowed(args) {
  if (args.orchestrationPreflight || args.livePreflight || args.daily) return;
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

function requestPacingMs(args, isPilot) {
  if (args.compressed && args.mode === "local") return 900;
  if (isPilot && args.mode === "live") return 1500;
  return 0;
}

async function runPersonaDay(persona, schedule, opts) {
  const client = new QaHttpClient({
    baseUrl: opts.baseUrl,
    personaId: persona.id,
    mock: opts.mock,
    pacingMs: opts.pacingMs ?? 0,
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

async function assertLocalHealth(baseUrl) {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/csrf-token`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    throw new Error(`Local health check failed for ${baseUrl}: ${e.message}. Start npm run dev first.`);
  }
}

async function assertLiveHealth(baseUrl) {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/csrf-token`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    throw new Error(`Live health check failed for ${baseUrl}: ${e.message}`);
  }
}

async function runOrchestrationPreflight(args) {
  assertOrchestrationPreflightAllowed(args);
  const personas = PERSONAS;
  const runAnchorDate = args.runAnchorDate || new Date().toISOString().slice(0, 10);
  const anchorMs = Date.now();
  const windowMinutes = args.pilotWindowMinutes;
  const immediateExecution = true;

  const { timeline, meta } = buildPreflightTimeline(personas, {
    windowMinutes,
    perUserBudget: args.perUserBudget,
    simDay: args.day,
    anchorMs,
  });

  const estimate = estimateTimeline(timeline, windowMinutes, { pacingMs: 900 });
  const estimateOut = formatEstimate(estimate);

  if (args.dryRun) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: "orchestration-preflight-dry-run",
          baseUrl: args.baseUrl,
          estimate: estimateOut,
          meta,
          interleaveProof: timeline.slice(0, 20).map(t => ({
            userId: t.persona.id,
            module: t.module,
            action: t.action,
            scheduledAt: t.scheduledAt,
          })),
          fitsWindow: estimate.fits,
        },
        null,
        2
      )
    );
    if (!estimate.fits) process.exit(2);
    return;
  }

  try {
    assertTimelineFitsWindow(estimate);
  } catch (e) {
    console.error(JSON.stringify({ ok: false, reason: e.message, estimate: e.estimate ?? estimateOut }, null, 2));
    process.exit(2);
  }

  await assertLocalHealth(args.baseUrl);

  console.log(JSON.stringify({ ok: true, phase: "preflight-estimate", estimate: estimateOut }, null, 2));

  let runId;
  const startMs = Date.now();
  const deadlineAt = startMs + windowMinutes * 60_000;

  try {
    runId = await createRun({
      mode: args.mode,
      seed: args.seed,
      monthNumber: args.month,
      label: "orchestration-preflight",
    });
  } catch (e) {
    console.warn("[preflight] DB run create failed — continuing with local run id:", e.message);
    runId = `local-${Date.now()}`;
  }

  const logger = new EventLogger({ runId, simDay: args.day, dryRun: false });
  const coverage = new CoverageTracker();
  let timelineResult = { results: [], userStatus: new Map(), skippedDeadline: 0, deadlineReached: false };
  let runStatus = "completed";

  const plannedPerUser = estimate.perUserCounts;

  try {
    timelineResult = await runTimeline({
      timeline,
      deadlineAt,
      baseUrl: args.baseUrl,
      mock: args.mock,
      dryRun: false,
      logger,
      coverage,
      runId,
      simDay: args.day,
      pacingMs: 900,
      immediateExecution,
      executeAction,
    });
    if (timelineResult.deadlineReached) runStatus = "partial";
  } catch (e) {
    runStatus = "partial";
    console.error("[preflight] timeline error:", e.message);
    await logger.writeAlert({
      type: "runner_error",
      severity: "fail",
      details: { message: String(e.message), gate: "3.5" },
    });
  } finally {
    const coverageFile = writeCoverageArtifact(runId, args.day, coverage, args.mode);
    const userStatusObj = Object.fromEntries(timelineResult.userStatus);
    writeCheckpoint(runId, args.day, {
      runId,
      day: args.day,
      mode: args.mode,
      gate: "3.5-orchestration-preflight",
      runAnchorDate,
      immediateExecution,
      deadlineAt: new Date(deadlineAt).toISOString(),
      estimate: estimateOut,
      meta,
      userStatus: userStatusObj,
      skippedDeadline: timelineResult.skippedDeadline,
      results: timelineResult.results.map(r => ({
        user: r.persona,
        vaultEnd: r.vaultEnd,
        actionTimings: r.actionTimings,
      })),
      coverage: coverage.toReport(),
    });

    try {
      await finishRun(runId, runStatus === "completed" ? "completed" : "partial");
    } catch {
      /* ignore */
    }

    const endMs = Date.now();
    let reportPath = null;
    try {
      const { outPath } = await collectPreflightReport(runId, {
        startTime: new Date(startMs).toISOString(),
        endTime: new Date(endMs).toISOString(),
        runtimeMs: endMs - startMs,
        status: runStatus,
        estimate: estimateOut,
        plannedPerUser,
        userStatus: userStatusObj,
      });
      reportPath = outPath;
    } catch (e) {
      console.warn("[preflight] report collect failed:", e.message);
    }

    const cov = coverage.toReport();
  console.log(
    JSON.stringify(
      {
        ok: true,
        gate: "3.5",
        runId,
        status: runStatus,
        mode: args.mode,
        baseUrl: args.baseUrl,
        windowMinutes,
        deadlineAt: new Date(deadlineAt).toISOString(),
        runtimeMs: endMs - startMs,
        plannedUsers: 20,
        usersExecuted: timelineResult.results.length,
        skippedDeadline: timelineResult.skippedDeadline,
        deadlineReached: timelineResult.deadlineReached,
        estimate: estimateOut,
        dbLogging: logger.dbOk,
        coverageFile,
        reportPath,
        coverageSummary: {
          minersCovered: cov.miners?.covered ?? 0,
          baseCovered: cov.base?.covered ?? 0,
          soloCovered: cov.soloV2?.covered ?? 0,
          ov2Covered: cov.ov2?.covered ?? 0,
          outsideWindowActions: cov.timing?.outsideWindowCount ?? 0,
        },
        userStatus: userStatusObj,
        next: "Owner reviews Gate 3.5 report; Gate 3.6 blocked until approval",
      },
      null,
      2
    )
  );
  }
}

async function runLivePreflight(args) {
  assertLivePreflightAllowed(args);
  const personas = PERSONAS;
  const runAnchorDate = args.runAnchorDate || new Date().toISOString().slice(0, 10);
  const anchorMs = Date.now();
  const windowMinutes = args.liveWindowMinutes;
  const immediateExecution = false;

  const { timeline, meta } = buildLivePreflightTimeline(personas, {
    windowMinutes,
    perUserBudget: args.perUserBudget,
    simDay: args.day,
    anchorMs,
  });

  const estimate = estimateTimeline(timeline, windowMinutes, {
    pacingMs: LIVE_PACING_MS,
    moduleExecMs: LIVE_MODULE_EXEC_MS,
  });
  const estimateOut = formatEstimate(estimate);

  if (args.dryRun) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: "live-preflight-dry-run",
          baseUrl: args.baseUrl,
          estimate: estimateOut,
          meta,
          interleaveProof: timeline.slice(0, 20).map(t => ({
            userId: t.persona.id,
            module: t.module,
            action: t.action,
            scheduledAt: t.scheduledAt,
          })),
          fitsWindow: estimate.fits,
        },
        null,
        2
      )
    );
    if (!estimate.fits) process.exit(2);
    return;
  }

  try {
    assertTimelineFitsWindow(estimate);
  } catch (e) {
    console.error(JSON.stringify({ ok: false, reason: e.message, estimate: e.estimate ?? estimateOut }, null, 2));
    process.exit(2);
  }

  await assertLiveHealth(args.baseUrl);

  console.log(JSON.stringify({ ok: true, phase: "live-preflight-estimate", estimate: estimateOut }, null, 2));

  let runId;
  const startMs = Date.now();
  const deadlineAt = startMs + windowMinutes * 60_000;

  try {
    runId = await createRun({
      mode: args.mode,
      seed: args.seed,
      monthNumber: args.month,
      label: "live-preflight",
    });
  } catch (e) {
    console.warn("[live-preflight] DB run create failed — continuing with local run id:", e.message);
    runId = `local-${Date.now()}`;
  }

  const logger = new EventLogger({ runId, simDay: args.day, dryRun: false });
  const coverage = new CoverageTracker();
  let timelineResult = { results: [], userStatus: new Map(), skippedDeadline: 0, deadlineReached: false };
  let runStatus = "completed";

  const plannedPerUser = estimate.perUserCounts;

  try {
    timelineResult = await runTimeline({
      timeline,
      deadlineAt,
      baseUrl: args.baseUrl,
      mock: false,
      dryRun: false,
      logger,
      coverage,
      runId,
      simDay: args.day,
      pacingMs: LIVE_PACING_MS,
      immediateExecution,
      executeAction,
    });
    if (timelineResult.deadlineReached) runStatus = "partial";
  } catch (e) {
    runStatus = "partial";
    console.error("[live-preflight] timeline error:", e.message);
    await logger.writeAlert({
      type: "runner_error",
      severity: "fail",
      details: { message: String(e.message), gate: "3.6" },
    });
  } finally {
    const coverageFile = writeCoverageArtifact(runId, args.day, coverage, args.mode);
    const userStatusObj = Object.fromEntries(timelineResult.userStatus);
    writeCheckpoint(runId, args.day, {
      runId,
      day: args.day,
      mode: args.mode,
      gate: "3.6-live-preflight",
      runAnchorDate,
      immediateExecution,
      deadlineAt: new Date(deadlineAt).toISOString(),
      estimate: estimateOut,
      meta,
      userStatus: userStatusObj,
      skippedDeadline: timelineResult.skippedDeadline,
      results: timelineResult.results.map(r => ({
        user: r.persona,
        vaultEnd: r.vaultEnd,
        actionTimings: r.actionTimings,
      })),
      coverage: coverage.toReport(),
    });

    try {
      await finishRun(runId, runStatus === "completed" ? "completed" : "partial");
    } catch {
      /* ignore */
    }

    const endMs = Date.now();
    let reportPath = null;
    try {
      const { outPath } = await collectLivePreflightReport(runId, {
        startTime: new Date(startMs).toISOString(),
        endTime: new Date(endMs).toISOString(),
        runtimeMs: endMs - startMs,
        status: runStatus,
        estimate: estimateOut,
        plannedPerUser,
        userStatus: userStatusObj,
      });
      reportPath = outPath;
    } catch (e) {
      console.warn("[live-preflight] report collect failed:", e.message);
    }

    const cov = coverage.toReport();
    console.log(
      JSON.stringify(
        {
          ok: true,
          gate: "3.6",
          runId,
          status: runStatus,
          mode: args.mode,
          baseUrl: args.baseUrl,
          windowMinutes,
          deadlineAt: new Date(deadlineAt).toISOString(),
          runtimeMs: endMs - startMs,
          plannedUsers: 20,
          usersExecuted: timelineResult.results.length,
          skippedDeadline: timelineResult.skippedDeadline,
          deadlineReached: timelineResult.deadlineReached,
          estimate: estimateOut,
          dbLogging: logger.dbOk,
          coverageFile,
          reportPath,
          coverageSummary: {
            minersCovered: cov.miners?.covered ?? 0,
            baseCovered: cov.base?.covered ?? 0,
            soloCovered: cov.soloV2?.covered ?? 0,
            ov2Covered: cov.ov2?.covered ?? 0,
            outsideWindowActions: cov.timing?.outsideWindowCount ?? 0,
          },
          userStatus: userStatusObj,
          next: "Owner reviews Gate 3.6 report; Gate 4 blocked until approval",
        },
        null,
        2
      )
    );
  }
}

async function runDaily(args) {
  assertDailyAllowed(args);
  const personas = PERSONAS;
  const runAnchorDate = args.runAnchorDate || new Date().toISOString().slice(0, 10);

  const campaign = args.dryRun
    ? args.campaignId
      ? getOrCreateCampaign({ campaignId: args.campaignId, seed: args.seed })
      : { campaignId: "dry-run-preview", seed: args.seed, lastCompletedDay: 0, days: {} }
    : getOrCreateCampaign({
        campaignId: args.campaignId,
        seed: args.seed,
        label: "gate4-daily",
      });

  const simDay = args.dayExplicit ? args.day : resolveSimDay(campaign, null);
  args.day = simDay;

  if (!args.dryRun) {
    await assertDayCanStart(campaign, simDay, { resetDay: Boolean(args.resetDay) });
  }

  const perUserBudget = args.perUserBudgetExplicit
    ? args.perUserBudget
    : defaultDailyPerUserBudget(args.dailyWindowHours);
  const anchorMs = Date.now();
  const windowMinutes = args.dailyWindowHours * 60;
  const immediateExecution = false;

  const { timeline, meta } = buildDailyTimeline(personas, {
    simDay,
    dailyWindowHours: args.dailyWindowHours,
    perUserBudget,
    anchorMs,
    runAnchorDate,
  });

  const estimate = estimateTimeline(timeline, windowMinutes, {
    pacingMs: LIVE_PACING_MS,
    moduleExecMs: LIVE_MODULE_EXEC_MS,
  });
  const estimateOut = formatEstimate(estimate);

  if (args.dryRun) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: "daily-dry-run",
          gate: "4",
          campaignId: campaign.campaignId,
          simDay,
          baseUrl: args.baseUrl,
          dailyWindowHours: args.dailyWindowHours,
          perUserBudget,
          estimate: estimateOut,
          meta,
          interleaveProof: timeline.slice(0, 20).map(t => ({
            userId: t.persona.id,
            module: t.module,
            action: t.action,
            scheduledAt: t.scheduledAt,
          })),
          fitsWindow: estimate.fits,
          nextCommand: "npm run qa:day -- --approve-day --daily-window-hours=6",
        },
        null,
        2
      )
    );
    if (!estimate.fits) process.exit(2);
    return;
  }

  try {
    assertTimelineFitsWindow(estimate);
  } catch (e) {
    console.error(JSON.stringify({ ok: false, reason: e.message, estimate: e.estimate ?? estimateOut }, null, 2));
    process.exit(2);
  }

  await assertLiveHealth(args.baseUrl);

  console.log(
    JSON.stringify(
      {
        ok: true,
        phase: "daily-estimate",
        campaignId: campaign.campaignId,
        simDay,
        estimate: estimateOut,
      },
      null,
      2
    )
  );

  let runId;
  const startMs = Date.now();
  const deadlineAt = startMs + windowMinutes * 60_000;
  const runNotes = { campaignId: campaign.campaignId, dayNumber: simDay, seed: args.seed };

  try {
    runId = await createRun({
      mode: args.mode,
      seed: args.seed,
      monthNumber: args.month,
      label: "gate4-daily",
      notes: runNotes,
    });
  } catch (e) {
    console.warn("[daily] DB run create failed — continuing with local run id:", e.message);
    runId = `local-${Date.now()}`;
  }

  markDayStarted(campaign, simDay, runId);

  const logger = new EventLogger({ runId, simDay, dryRun: false });
  const coverage = new CoverageTracker();
  let timelineResult = { results: [], userStatus: new Map(), skippedDeadline: 0, deadlineReached: false };
  let runStatus = "completed";
  const plannedPerUser = estimate.perUserCounts;

  try {
    timelineResult = await runTimeline({
      timeline,
      deadlineAt,
      baseUrl: args.baseUrl,
      mock: false,
      dryRun: false,
      logger,
      coverage,
      runId,
      simDay,
      pacingMs: LIVE_PACING_MS,
      immediateExecution,
      executeAction,
    });
    if (timelineResult.deadlineReached) runStatus = "partial";
  } catch (e) {
    runStatus = "partial";
    console.error("[daily] timeline error:", e.message);
    await logger.writeAlert({
      type: "runner_error",
      severity: "fail",
      details: { message: String(e.message), gate: "4", campaignId: campaign.campaignId, simDay },
    });
  } finally {
    const coverageFile = writeCoverageArtifact(runId, simDay, coverage, args.mode);
    const userStatusObj = Object.fromEntries(timelineResult.userStatus);
    const checkpointPath = writeCampaignDayCheckpoint(campaign.campaignId, simDay, {
      runId,
      simDay,
      campaignId: campaign.campaignId,
      mode: args.mode,
      gate: "4-daily",
      runAnchorDate,
      immediateExecution,
      deadlineAt: new Date(deadlineAt).toISOString(),
      deadlineReached: timelineResult.deadlineReached,
      estimate: estimateOut,
      meta,
      userStatus: userStatusObj,
      skippedDeadline: timelineResult.skippedDeadline,
      results: timelineResult.results.map(r => ({
        user: r.persona,
        vaultEnd: r.vaultEnd,
        actionTimings: r.actionTimings,
      })),
      coverage: coverage.toReport(),
    });

    writeCheckpoint(runId, simDay, {
      runId,
      day: simDay,
      campaignId: campaign.campaignId,
      mode: args.mode,
      gate: "4-daily",
      runAnchorDate,
      immediateExecution,
      deadlineAt: new Date(deadlineAt).toISOString(),
      estimate: estimateOut,
      meta,
      userStatus: userStatusObj,
      skippedDeadline: timelineResult.skippedDeadline,
      results: timelineResult.results.map(r => ({
        user: r.persona,
        vaultEnd: r.vaultEnd,
        actionTimings: r.actionTimings,
      })),
      coverage: coverage.toReport(),
    });

    try {
      await finishRun(runId, runStatus === "completed" ? "completed" : "partial");
    } catch {
      /* ignore */
    }

    const endMs = Date.now();
    let reportPaths = { json: null, html: null };
    try {
      const { jsonPath, htmlPath } = await collectDailyReport({
        campaignId: campaign.campaignId,
        simDay,
        runId,
        extra: {
          startTime: new Date(startMs).toISOString(),
          endTime: new Date(endMs).toISOString(),
          runtimeMs: endMs - startMs,
          status: runStatus,
          estimate: estimateOut,
          plannedPerUser,
          userStatus: userStatusObj,
          dailyWindowHours: args.dailyWindowHours,
          deadlineReached: timelineResult.deadlineReached,
        },
      });
      reportPaths = { json: jsonPath, html: htmlPath };
    } catch (e) {
      console.warn("[daily] report collect failed:", e.message);
    }

    markDayCompleted(campaign, simDay, { runId, status: runStatus, reportPaths });

    const cov = coverage.toReport();
    console.log(
      JSON.stringify(
        {
          ok: true,
          gate: "4",
          campaignId: campaign.campaignId,
          simDay,
          runId,
          status: runStatus,
          mode: args.mode,
          baseUrl: args.baseUrl,
          dailyWindowHours: args.dailyWindowHours,
          deadlineAt: new Date(deadlineAt).toISOString(),
          runtimeMs: endMs - startMs,
          plannedUsers: 20,
          usersExecuted: timelineResult.results.length,
          skippedDeadline: timelineResult.skippedDeadline,
          deadlineReached: timelineResult.deadlineReached,
          estimate: estimateOut,
          dbLogging: logger.dbOk,
          coverageFile,
          checkpointPath,
          reportJson: reportPaths.json,
          reportHtml: reportPaths.html,
          coverageSummary: {
            minersCovered: cov.miners?.covered ?? 0,
            baseCovered: cov.base?.covered ?? 0,
            soloCovered: cov.soloV2?.covered ?? 0,
            ov2Covered: cov.ov2?.covered ?? 0,
            outsideWindowActions: cov.timing?.outsideWindowCount ?? 0,
          },
          userStatus: userStatusObj,
          next: "Owner reviews daily report; run next day with npm run qa:day -- --approve-day",
        },
        null,
        2
      )
    );
  }
}

async function main() {
  const args = parseArgs(process.argv);

  try {
    assertLiveNotCompressed(args.mode, args.compressed);
    assertOrchestrationPreflightAllowed(args);
    assertLivePreflightAllowed(args);
    assertDailyAllowed(args);
    assertForceActiveAllowed(args);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  if (args.orchestrationPreflight) {
    return runOrchestrationPreflight(args);
  }

  if (args.livePreflight) {
    return runLivePreflight(args);
  }

  if (args.daily) {
    return runDaily(args);
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
  const pacingMs = requestPacingMs(args, isPilot);

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
        pacingMs,
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
