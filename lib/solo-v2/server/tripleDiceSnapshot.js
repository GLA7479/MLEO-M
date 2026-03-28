import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "./sessionTypes";
import {
  buildTripleDiceSettlementSummary,
  TRIPLE_DICE_MIN_WAGER,
  normalizeTripleDiceTargetTotal,
  tripleDiceProjectedPayout,
  tripleDiceWinChancePercent,
} from "../tripleDiceConfig";
import { QUICK_FLIP_CONFIG } from "../quickFlipConfig";

function entryCostFromSessionRow(sessionRow) {
  const stake = Math.floor(Number(sessionRow?.entry_amount || 0));
  return stake >= TRIPLE_DICE_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
}

function fundingSourceFromSessionRow(sessionRow) {
  return sessionRow?.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
}

export function parseTripleDiceActiveSummary(sessionRow) {
  const s = sessionRow?.server_outcome_summary || {};
  if (s.phase !== "triple_dice_active") return null;
  if (s.tripleDice !== true) return null;
  const lastProcessedRollEventId = Math.max(0, Math.floor(Number(s.lastProcessedRollEventId) || 0));
  return { tripleDice: true, lastProcessedRollEventId };
}

async function readTripleDiceRollEventsAfter(supabase, sessionId, minIdExclusive) {
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
      String(r?.event_payload?.action || "") === "triple_dice_roll" &&
      String(r?.event_payload?.gameKey || "") === "triple_dice",
  );
  return { ok: true, rows: rolls };
}

function buildPlayingTripleDice(sessionRow, pendingTarget) {
  const entry = entryCostFromSessionRow(sessionRow);
  const target = pendingTarget != null ? normalizeTripleDiceTargetTotal(pendingTarget) : null;
  const winChance = target != null ? tripleDiceWinChancePercent(target) : null;
  const projected = target != null ? tripleDiceProjectedPayout(entry, target) : null;

  return {
    tripleDice: true,
    entryAmount: entry,
    pendingTargetTotal: target,
    winChancePercent: winChance != null && Number.isFinite(winChance) ? winChance : null,
    projectedPayout: projected != null && Number.isFinite(projected) ? projected : null,
  };
}

export async function buildTripleDiceSessionSnapshot(supabase, sessionRow) {
  if (!sessionRow || sessionRow.game_key !== "triple_dice") {
    return {
      ok: true,
      snapshot: {
        gameKey: sessionRow?.game_key || null,
        readState: "not_triple_dice",
        canResolveTurn: false,
        canCashOut: false,
        playing: null,
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
      buildTripleDiceSettlementSummary({
        terminalKind,
        payoutReturn,
        entryCost,
        fundingSource,
      });

    return {
      ok: true,
      snapshot: {
        gameKey: "triple_dice",
        readState: "resolved",
        canResolveTurn: false,
        canCashOut: false,
        playing: null,
        rollConflict: false,
        pendingRoll: null,
        resolvedResult: {
          terminalKind,
          payoutReturn,
          isWin: terminalKind !== "overload",
          dice: Array.isArray(summary.dice) ? summary.dice : null,
          rolledTotal: summary.rolledTotal != null ? Number(summary.rolledTotal) : null,
          targetTotal: summary.targetTotal != null ? Number(summary.targetTotal) : null,
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
        gameKey: "triple_dice",
        readState: "invalid",
        canResolveTurn: false,
        canCashOut: false,
        playing: null,
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
          gameKey: "triple_dice",
          readState: "invalid",
          canResolveTurn: false,
          canCashOut: false,
          playing: null,
          rollConflict: false,
          pendingRoll: null,
          resolvedResult: null,
        },
      };
    }
  }

  const active = parseTripleDiceActiveSummary(sessionRow);
  if (!active) {
    return {
      ok: true,
      snapshot: {
        gameKey: "triple_dice",
        readState: "invalid",
        canResolveTurn: false,
        canCashOut: false,
        playing: null,
        rollConflict: false,
        pendingRoll: null,
        resolvedResult: null,
      },
    };
  }

  const rollRead = await readTripleDiceRollEventsAfter(supabase, sessionRow.id, active.lastProcessedRollEventId);
  if (!rollRead.ok) {
    return { ok: false, error: rollRead.error };
  }

  const forRoll = rollRead.rows;
  const rollConflict = forRoll.length > 1;
  let pendingRoll = null;

  if (!rollConflict && forRoll.length === 1) {
    const row = forRoll[0];
    const eid = row?.id != null ? Number(row.id) : null;
    const targetTotal = normalizeTripleDiceTargetTotal(row?.event_payload?.targetTotal);
    if (Number.isFinite(eid) && eid > 0 && targetTotal != null) {
      pendingRoll = {
        rollEventId: eid,
        targetTotal,
        submittedAt: row?.created_at || null,
      };
    }
  }

  const playing = buildPlayingTripleDice(sessionRow, pendingRoll?.targetTotal ?? null);

  let readState = "ready";
  if (rollConflict) readState = "roll_conflict";
  else if (pendingRoll) readState = "roll_submitted";

  const canResolveTurn = !rollConflict && Boolean(pendingRoll);

  return {
    ok: true,
    snapshot: {
      gameKey: "triple_dice",
      readState,
      canResolveTurn,
      canCashOut: false,
      playing,
      rollConflict,
      pendingRoll,
      resolvedResult: null,
    },
  };
}
