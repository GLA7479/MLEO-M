import { getQaDb } from "./lib/db.mjs";

const SOLO_EV = {
  quick_flip: { entry: 25, rtp: 0.96 },
  odd_even: { entry: 25, rtp: 0.96 },
  dice_pick: { entry: 25, rtp: 0.95 },
};

export async function validateVaultConsistency({ runId, userId, sessionId, vaultBefore, delta, vaultAfter, logger }) {
  const expected = vaultBefore + delta;
  if (vaultAfter != null && Math.abs(expected - vaultAfter) > 0) {
    await logger.writeAlert({
      userId,
      type: "vault_mismatch",
      severity: "fail",
      details: { sessionId, vaultBefore, delta, vaultAfter, expected },
    });
    return false;
  }
  return true;
}

export async function checkDuplicateRewards(runId, sessionId, logger, userId) {
  if (!runId || !sessionId) return;
  try {
    const db = getQaDb();
    const { data } = await db
      .from("qa_sim_event")
      .select("id")
      .eq("run_id", runId)
      .eq("session_id", sessionId)
      .not("delta", "is", null)
      .gt("delta", 0);
    if ((data?.length || 0) > 1) {
      await logger.writeAlert({
        userId,
        type: "duplicate_reward",
        severity: "fail",
        details: { sessionId, count: data.length },
      });
    }
  } catch {
    /* table may not exist yet */
  }
}

export async function checkSessionGain({ userId, gameKey, netDelta, logger }) {
  const ev = SOLO_EV[gameKey];
  if (!ev) return;
  const maxWin = Math.ceil(ev.entry * 2);
  if (netDelta > maxWin * 5) {
    await logger.writeAlert({
      userId,
      type: "suspicious_gain",
      severity: "warning",
      details: { gameKey, netDelta, maxWin },
    });
  }
}

export async function aggregateGameRtp(runId, simDay) {
  try {
    const db = getQaDb();
    const { data } = await db
      .from("qa_sim_event")
      .select("game_key, delta, entry_amount:raw_response")
      .eq("run_id", runId)
      .eq("module", "solo_v2")
      .not("game_key", "is", null);
    const byGame = {};
    for (const row of data || []) {
      const g = row.game_key;
      if (!byGame[g]) byGame[g] = { sum: 0, n: 0 };
      byGame[g].sum += Number(row.delta || 0);
      byGame[g].n += 1;
    }
    return byGame;
  } catch {
    return {};
  }
}
