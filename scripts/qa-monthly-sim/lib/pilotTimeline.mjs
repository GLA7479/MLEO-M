import { QaHttpClient } from "./httpClient.mjs";
import { waitUntilScheduled } from "./wallClock.mjs";

/**
 * Run a global interleaved timeline with a hard deadline.
 * @returns {Promise<{ results: Array, userStatus: Map, skippedDeadline: number, deadlineReached: boolean }>}
 */
export async function runTimeline({
  timeline,
  deadlineAt,
  baseUrl,
  mock,
  dryRun,
  logger,
  coverage,
  runId,
  simDay,
  pacingMs,
  immediateExecution,
  executeAction,
}) {
  const personaState = new Map();
  const userStatus = new Map();
  const results = [];
  let skippedDeadline = 0;
  let deadlineReached = false;
  let index = 0;

  function ensurePersona(persona) {
    if (!personaState.has(persona.id)) {
      personaState.set(persona.id, {
        persona,
        client: new QaHttpClient({ baseUrl, personaId: persona.id, mock, pacingMs }),
        stats: {
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
        },
        actionTimings: [],
        executed: 0,
      });
      userStatus.set(persona.id, { status: "pending", planned: 0, executed: 0, errors: 0 });
    }
    return personaState.get(persona.id);
  }

  for (const item of timeline) {
    const uid = item.persona.id;
    const st = ensurePersona(item.persona);
    userStatus.get(uid).planned += 1;

    if (Date.now() >= deadlineAt) {
      deadlineReached = true;
      skippedDeadline += timeline.length - index;
      for (let j = index; j < timeline.length; j++) {
        const rem = timeline[j];
        const rs = userStatus.get(rem.persona.id);
        if (rs && rs.status === "pending") rs.status = "skipped_deadline";
      }
      break;
    }

    const plannedAt = item.scheduledAt || item.wallClockLabel;
    const wait = await waitUntilScheduled(plannedAt, { immediate: immediateExecution });

    if (Date.now() >= deadlineAt) {
      deadlineReached = true;
      skippedDeadline += timeline.length - index;
      break;
    }

    coverage.recordTiming({
      userId: uid,
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
        userId: uid,
        type: "outside_window",
        severity: "warning",
        details: { plannedAt, executedAt: wait.executedAt, action: item.action, module: item.module },
      });
    }

    const ctx = {
      client: st.client,
      persona: item.persona,
      logger,
      stats: st.stats,
      simDay,
      baseUrl,
      mock,
      runId,
      coverage,
      actionTiming: {
        plannedAt,
        executedAt: wait.executedAt,
        waitedMs: wait.waitedMs,
        outsideWindow: wait.outsideWindow,
      },
    };

    if (!dryRun) {
      try {
        await executeAction(ctx, item);
        st.executed += 1;
        userStatus.get(uid).executed += 1;
        userStatus.get(uid).status = "executed";
      } catch (e) {
        st.stats.errors += 1;
        userStatus.get(uid).errors += 1;
        userStatus.get(uid).status = "error";
        await logger.writeAlert({
          userId: uid,
          type: "runner_error",
          severity: "fail",
          details: { message: String(e.message), action: item.action, module: item.module },
        });
      }
    } else {
      st.executed += 1;
      userStatus.get(uid).executed += 1;
      userStatus.get(uid).status = "executed";
    }

    st.actionTimings.push({
      plannedAt,
      executedAt: wait.executedAt,
      waitedMs: wait.waitedMs,
      outsideWindow: wait.outsideWindow,
      module: item.module,
      action: item.action,
    });

    index += 1;
  }

  if (!dryRun) {
    for (const st of personaState.values()) {
      if (st.executed === 0) continue;
      try {
        const balRes = await st.client.get("/api/arcade/vault/balance");
        const vaultEnd = Number(balRes.data?.balance ?? st.stats.lastVault ?? 0);
        const topGame =
          Object.entries(st.stats.gameCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

        await logger.writeDailySummary(st.persona.id, {
          date: new Date().toISOString().slice(0, 10),
          totalActiveMs: Date.now() - st.stats.startMs,
          sessionCount: st.stats.soloSessions + st.stats.ov2Sessions + st.stats.minersSessions,
          minersSessions: st.stats.minersSessions,
          baseSessions: st.stats.baseSessions,
          soloV2Sessions: st.stats.soloSessions,
          ov2Sessions: st.stats.ov2Sessions,
          totalEarned: st.stats.earned,
          totalSpent: st.stats.spent,
          netDelta: st.stats.earned - st.stats.spent,
          vaultEnd,
          errorCount: st.stats.errors,
          stuckCount: 0,
          topGameKey: topGame,
        });

        await logger.writeEconomySnapshot(st.persona.id, {
          vaultBalance: vaultEnd,
          totalEarned: st.stats.earned,
          totalSpent: st.stats.spent,
        });

        await logger.flushSessions();

        results.push({
          persona: st.persona.id,
          stats: st.stats,
          vaultEnd,
          actionTimings: st.actionTimings,
        });
      } catch {
        /* per-persona finalize best-effort */
      }
    }
  }

  for (const [uid, rs] of userStatus) {
    if (rs.status === "pending" && rs.planned > 0 && rs.executed === 0) {
      rs.status = deadlineReached ? "skipped_deadline" : "never_started";
    }
  }

  return { results, userStatus, skippedDeadline, deadlineReached };
}
