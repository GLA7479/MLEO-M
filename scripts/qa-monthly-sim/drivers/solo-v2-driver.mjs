import { gameKeyToApiSegment } from "../lib/soloGames.mjs";
import { timingFields } from "../lib/logHelpers.mjs";
import { soloAutomationStatus } from "../lib/soloAutomation.mjs";

export async function runSoloV2Action(ctx, item) {
  const { client, persona, logger, stats, coverage } = ctx;
  const gameKey = item?.params?.gameKey || "quick_flip";
  const seg = gameKeyToApiSegment(gameKey);
  const playerRef = `qa-${persona.id}`;
  const entryAmount = persona.risk === "high" ? 500 : 25;

  let vaultBefore = stats.lastVault;
  if (vaultBefore == null) {
    const bal = await client.get("/api/arcade/vault/balance");
    vaultBefore = Number(bal.data?.balance ?? 0);
    stats.lastVault = vaultBefore;
  }

  const create = await client.post(
    "/api/solo-v2/sessions/create",
    {
      gameKey,
      sessionMode: "standard",
      entryAmount,
      clientNonce: `qa-${persona.id}-${Date.now()}`,
    },
    { headers: { "x-solo-v2-player": playerRef } }
  );

  const sessionId = create.data?.sessionId || create.data?.session?.id;
  if (!create.ok || !sessionId) {
    stats.errors += 1;
    const st = soloAutomationStatus(gameKey, {
      ok: false,
      error: create.data?.message || "create failed",
    });
    coverage?.recordSolo(gameKey, st.status, st.reason);
    await logger.logEvent({
      ...timingFields(ctx),
      userId: persona.id,
      module: "solo_v2",
      action: "create_session",
      gameKey,
      outcome: st.status,
      errorMessage: st.reason,
      responseMs: create.ms,
      rawResponse: create.data,
    });
    return create;
  }

  if (gameKey === "quick_flip") {
    await client.post(
      `/api/solo-v2/sessions/${sessionId}/event`,
      {
        eventType: "client_action",
        eventPayload: {
          gameKey: "quick_flip",
          action: "choice_submit",
          side: "heads",
        },
      },
      { headers: { "x-solo-v2-player": playerRef } }
    );
  } else if (gameKey === "odd_even") {
    await client.post(
      `/api/solo-v2/sessions/${sessionId}/event`,
      {
        eventType: "client_action",
        eventPayload: {
          gameKey: "odd_even",
          action: "odd_even_submit",
          side: "odd",
        },
      },
      { headers: { "x-solo-v2-player": playerRef } }
    );
  }

  const resolve = await client.post(
    `/api/solo-v2/${seg}/resolve`,
    { sessionId },
    { headers: { "x-solo-v2-player": playerRef } }
  );

  const settlement = resolve.data?.result?.settlementSummary || resolve.data?.settlementSummary;
  const netDelta = Number(settlement?.netDelta ?? 0);
  const vaultAfter = vaultBefore + netDelta;
  stats.lastVault = vaultAfter;
  stats.earned += Math.max(0, netDelta);
  stats.spent += Math.max(0, -netDelta);
  stats.soloSessions += 1;
  stats.gameCounts[gameKey] = (stats.gameCounts[gameKey] || 0) + 1;

  const st = soloAutomationStatus(gameKey, {
    ok: resolve.ok,
    data: resolve.data,
    error: resolve.data?.message,
  });
  coverage?.recordSolo(gameKey, st.status, st.reason);

  const outcome =
    st.status === "covered"
      ? netDelta > 0
        ? "win"
        : netDelta < 0
          ? "loss"
          : "push"
      : st.status;
  if (!resolve.ok && st.status === "error") stats.errors += 1;

  await logger.logEvent({
    ...timingFields(ctx),
    userId: persona.id,
    module: "solo_v2",
    action: "resolve",
    gameKey,
    sessionId,
    vaultBefore,
    vaultAfter,
    delta: netDelta,
    outcome,
    errorMessage: st.status !== "covered" ? st.reason : null,
    responseMs: resolve.ms,
    rawResponse: { ...resolve.data, coverageStatus: st },
  });

  logger.trackSession(persona.id, sessionId, {
    userId: persona.id,
    module: "solo_v2",
    gameKey,
    startedAt: new Date().toISOString(),
    vaultStart: vaultBefore,
    vaultEnd: vaultAfter,
    netDelta,
    outcome,
    actionsCount: 2,
    errorCount: st.status === "error" ? 1 : 0,
  });

  return resolve;
}
