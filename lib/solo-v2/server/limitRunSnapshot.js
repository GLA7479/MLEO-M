import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "./sessionTypes";
import {
  buildLimitRunSettlementSummary,
  LIMIT_RUN_MIN_WAGER,
  limboProjectedPayout,
  limboWinChancePercent,
  normalizeLimitRunTargetMultiplier,
} from "../limitRunConfig";
import { QUICK_FLIP_CONFIG } from "../quickFlipConfig";

function entryCostFromSessionRow(sessionRow) {
  const stake = Math.floor(Number(sessionRow?.entry_amount || 0));
  return stake >= LIMIT_RUN_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
}

function fundingSourceFromSessionRow(sessionRow) {
  return sessionRow?.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
}

export function parseLimitRunActiveSummary(sessionRow) {
  const s = sessionRow?.server_outcome_summary || {};
  if (s.phase !== "limit_run_active") return null;
  if (s.limbo !== true) return null;
  const lastProcessedRollEventId = Math.max(0, Math.floor(Number(s.lastProcessedRollEventId) || 0));
  return { limbo: true, lastProcessedRollEventId };
}

async function readLimitRunRollEventsAfter(supabase, sessionId, minIdExclusive) {
  const query = await supabase
    .from("solo_v2_session_events")
    .select("id,event_payload,created_at")
    .eq("session_id", sessionId)
    .eq("event_type", "client_action")
    .gt("id", minIdExclusive)
    .order("id", { ascending: true })
    .limit(40);

  if (query.error) return { ok: false, error: query.error };
  const rows = Array.isArray(query.data) ? query.data : [];
  const rolls = rows.filter(
    r =>
      String(r?.event_payload?.action || "") === "limit_run_roll" &&
      String(r?.event_payload?.gameKey || "") === "limit_run",
  );
  return { ok: true, rows: rolls };
}

function buildPlayingLimbo(sessionRow, pendingTarget) {
  const entry = entryCostFromSessionRow(sessionRow);
  const target = pendingTarget != null ? Number(pendingTarget) : null;
  const winChance =
    target != null && Number.isFinite(target) ? limboWinChancePercent(target) : null;
  const projected =
    target != null && Number.isFinite(target) ? limboProjectedPayout(entry, target) : null;

  return {
    limbo: true,
    entryAmount: entry,
    pendingTargetMultiplier: target != null && Number.isFinite(target) ? target : null,
    winChancePercent: winChance != null && Number.isFinite(winChance) ? winChance : null,
    projectedPayout: projected != null && Number.isFinite(projected) ? projected : null,
  };
}

export async function buildLimitRunSessionSnapshot(supabase, sessionRow) {
  if (!sessionRow || sessionRow.game_key !== "limit_run") {
    return {
      ok: true,
      snapshot: {
        gameKey: sessionRow?.game_key || null,
        readState: "not_limit_run",
        canResolveTurn: false,
        canCashOut: false,
        playing: null,
        pendingLock: null,
        lockConflict: false,
        rollConflict: false,
        pendingRoll: null,
        resolvedResult: null,
      },
    };
  }

  const entryCost = entryCostFromSessionRow(sessionRow);
  const fundingSource = fundingSourceFromSessionRow(sessionRow);

  if (sessionRow.session_status === SOLO_V2_SESSION_STATUS.RESOLVED) {
    const summary = sessionRow.server_outcome_summary || {};
    const terminalKind =
      summary.terminalKind === "cashout"
        ? "cashout"
        : summary.terminalKind === "full_clear"
          ? "full_clear"
          : "overload";
    const payoutReturn = Math.max(0, Math.floor(Number(summary.payoutReturn) || 0));
    const settlementSummary =
      summary.settlementSummary ||
      buildLimitRunSettlementSummary({
        terminalKind,
        payoutReturn,
        entryCost,
        fundingSource,
      });

    return {
      ok: true,
      snapshot: {
        gameKey: "limit_run",
        readState: "resolved",
        canResolveTurn: false,
        canCashOut: false,
        playing: null,
        pendingLock: null,
        lockConflict: false,
        rollConflict: false,
        pendingRoll: null,
        resolvedResult: {
          terminalKind,
          payoutReturn,
          isWin: terminalKind !== "overload",
          rollMultiplier:
            summary.rollMultiplier != null ? Number(summary.rollMultiplier) : null,
          targetMultiplier:
            summary.targetMultiplier != null ? Number(summary.targetMultiplier) : null,
          won: summary.won === true || (terminalKind === "full_clear" && payoutReturn > 0),
          overloadReason: summary.overloadReason != null ? String(summary.overloadReason) : null,
          resolvedAt: summary.resolvedAt || sessionRow.resolved_at || null,
          settlementSummary,
        },
      },
    };
  }

  if (![SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS].includes(sessionRow.session_status)) {
    return {
      ok: true,
      snapshot: {
        gameKey: "limit_run",
        readState: "invalid",
        canResolveTurn: false,
        canCashOut: false,
        playing: null,
        pendingLock: null,
        lockConflict: false,
        rollConflict: false,
        pendingRoll: null,
        resolvedResult: null,
      },
    };
  }

  const expiresAtRaw = sessionRow.expires_at;
  if (expiresAtRaw) {
    const expiresMs = new Date(expiresAtRaw).getTime();
    if (Number.isFinite(expiresMs) && expiresMs < Date.now()) {
      return {
        ok: true,
        snapshot: {
          gameKey: "limit_run",
          readState: "invalid",
          canResolveTurn: false,
          canCashOut: false,
          playing: null,
          pendingLock: null,
          lockConflict: false,
          rollConflict: false,
          pendingRoll: null,
          resolvedResult: null,
        },
      };
    }
  }

  const active = parseLimitRunActiveSummary(sessionRow);
  if (!active) {
    return {
      ok: true,
      snapshot: {
        gameKey: "limit_run",
        readState: "invalid",
        canResolveTurn: false,
        canCashOut: false,
        playing: null,
        pendingLock: null,
        lockConflict: false,
        rollConflict: false,
        pendingRoll: null,
        resolvedResult: null,
      },
    };
  }

  const rollRead = await readLimitRunRollEventsAfter(supabase, sessionRow.id, active.lastProcessedRollEventId);
  if (!rollRead.ok) {
    return { ok: false, error: rollRead.error };
  }

  const forRoll = rollRead.rows;
  const rollConflict = forRoll.length > 1;
  let pendingRoll = null;

  if (!rollConflict && forRoll.length === 1) {
    const row = forRoll[0];
    const eid = row?.id != null ? Number(row.id) : null;
    const target = normalizeLimitRunTargetMultiplier(row?.event_payload?.targetMultiplier);
    if (Number.isFinite(eid) && eid > 0 && target !== null) {
      pendingRoll = {
        rollEventId: eid,
        targetMultiplier: target,
        submittedAt: row?.created_at || null,
      };
    }
  }

  const playing = buildPlayingLimbo(sessionRow, pendingRoll?.targetMultiplier ?? null);

  let readState = "ready";
  if (rollConflict) readState = "roll_conflict";
  else if (pendingRoll) readState = "roll_submitted";

  const canResolveTurn = !rollConflict && Boolean(pendingRoll);
  const canCashOut = false;

  return {
    ok: true,
    snapshot: {
      gameKey: "limit_run",
      readState,
      canResolveTurn,
      canCashOut,
      playing,
      pendingLock: null,
      lockConflict: rollConflict,
      rollConflict,
      pendingRoll,
      resolvedResult: null,
    },
  };
}
