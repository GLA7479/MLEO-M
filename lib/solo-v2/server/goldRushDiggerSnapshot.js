import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "./sessionTypes";
import {
  buildGoldRushDiggerSettlementSummary,
  GOLD_RUSH_COLUMN_COUNT,
  GOLD_RUSH_DIGGER_MIN_WAGER,
  GOLD_RUSH_ROW_COUNT,
} from "../goldRushDiggerConfig";
import { computePlayingNumbers } from "./goldRushDiggerEngine";
import { QUICK_FLIP_CONFIG } from "../quickFlipConfig";

export function normalizeGoldRushColumn(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n >= GOLD_RUSH_COLUMN_COUNT) return null;
  return n;
}

export function normalizeGoldRushRowIndex(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n >= GOLD_RUSH_ROW_COUNT) return null;
  return n;
}

function entryCostFromSessionRow(sessionRow) {
  const stake = Math.floor(Number(sessionRow?.entry_amount || 0));
  return stake >= GOLD_RUSH_DIGGER_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
}

function fundingSourceFromSessionRow(sessionRow) {
  return sessionRow?.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
}

export function parseGoldRushDiggerActiveSummary(sessionRow) {
  const s = sessionRow?.server_outcome_summary || {};
  if (s.phase !== "gold_rush_digger_active") return null;
  const bombColumns = Array.isArray(s.bombColumns) ? s.bombColumns.map(c => Math.floor(Number(c))) : [];
  if (bombColumns.length !== GOLD_RUSH_ROW_COUNT) return null;
  if (bombColumns.some(c => !Number.isFinite(c) || c < 0 || c >= GOLD_RUSH_COLUMN_COUNT)) return null;

  const currentRowIndex = Math.max(0, Math.floor(Number(s.currentRowIndex) || 0));
  const clearedRows = Array.isArray(s.clearedRows) ? s.clearedRows : [];
  const digHistory = Array.isArray(s.digHistory) ? s.digHistory : [];
  const lastProcessedPickEventId = Math.max(0, Math.floor(Number(s.lastProcessedPickEventId) || 0));

  return {
    rowCount: GOLD_RUSH_ROW_COUNT,
    columnCount: GOLD_RUSH_COLUMN_COUNT,
    bombColumns,
    currentRowIndex,
    clearedRows,
    digHistory,
    lastProcessedPickEventId,
    lastTurn: s.lastTurn && typeof s.lastTurn === "object" ? s.lastTurn : null,
  };
}

async function readGoldRushPickEventsAfter(supabase, sessionId, minIdExclusive) {
  const query = await supabase
    .from("solo_v2_session_events")
    .select("id,event_payload,created_at")
    .eq("session_id", sessionId)
    .eq("event_type", "client_action")
    .gt("id", minIdExclusive)
    .order("id", { ascending: true })
    .limit(120);

  if (query.error) return { ok: false, error: query.error };
  const rows = Array.isArray(query.data) ? query.data : [];
  const picks = rows.filter(
    r =>
      String(r?.event_payload?.action || "") === "gold_rush_pick" &&
      String(r?.event_payload?.gameKey || "") === "gold_rush_digger",
  );
  return { ok: true, rows: picks };
}

function buildPlayingPayload(_sessionRow, active, entryCost) {
  const row = active.currentRowIndex;
  const clearedLen = active.clearedRows.length;
  const nums = computePlayingNumbers(entryCost, row, clearedLen);
  return {
    rowCount: GOLD_RUSH_ROW_COUNT,
    columnCount: GOLD_RUSH_COLUMN_COUNT,
    currentRowIndex: row,
    clearedRows: active.clearedRows,
    digHistory: active.digHistory,
    currentMultiplier: nums.currentMultiplier,
    nextMultiplier: nums.nextMultiplier,
    currentPayout: nums.currentPayout,
    nextPayout: nums.nextPayout,
    lastTurn: active.lastTurn,
  };
}

export async function buildGoldRushDiggerSessionSnapshot(supabase, sessionRow) {
  if (!sessionRow || sessionRow.game_key !== "gold_rush_digger") {
    return {
      ok: true,
      snapshot: {
        gameKey: sessionRow?.game_key || null,
        readState: "not_gold_rush_digger",
        canResolveTurn: false,
        canCashOut: false,
        playing: null,
        pendingPick: null,
        pickConflict: false,
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
          : "bomb";
    const payoutReturn = Math.max(0, Math.floor(Number(summary.payoutReturn) || 0));
    const settlementSummary =
      summary.settlementSummary ||
      buildGoldRushDiggerSettlementSummary({
        terminalKind,
        payoutReturn,
        entryCost,
        fundingSource,
      });

    return {
      ok: true,
      snapshot: {
        gameKey: "gold_rush_digger",
        readState: "resolved",
        canResolveTurn: false,
        canCashOut: false,
        playing: null,
        pendingPick: null,
        pickConflict: false,
        resolvedResult: {
          terminalKind,
          payoutReturn,
          isWin: terminalKind !== "bomb",
          finalRowIndex: summary.finalRowIndex != null ? Math.floor(Number(summary.finalRowIndex)) : null,
          lastPickColumn: summary.lastPickColumn != null ? Math.floor(Number(summary.lastPickColumn)) : null,
          bombColumn: summary.bombColumn != null ? Math.floor(Number(summary.bombColumn)) : null,
          bombColumns: Array.isArray(summary.bombColumns)
            ? summary.bombColumns.map(c => Math.floor(Number(c)))
            : null,
          digHistory: Array.isArray(summary.digHistory) ? summary.digHistory : [],
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
        gameKey: "gold_rush_digger",
        readState: "invalid",
        canResolveTurn: false,
        canCashOut: false,
        playing: null,
        pendingPick: null,
        pickConflict: false,
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
          gameKey: "gold_rush_digger",
          readState: "invalid",
          canResolveTurn: false,
          canCashOut: false,
          playing: null,
          pendingPick: null,
          pickConflict: false,
          resolvedResult: null,
        },
      };
    }
  }

  const active = parseGoldRushDiggerActiveSummary(sessionRow);
  if (!active) {
    return {
      ok: true,
      snapshot: {
        gameKey: "gold_rush_digger",
        readState: "invalid",
        canResolveTurn: false,
        canCashOut: false,
        playing: null,
        pendingPick: null,
        pickConflict: false,
        resolvedResult: null,
      },
    };
  }

  const pickRead = await readGoldRushPickEventsAfter(supabase, sessionRow.id, active.lastProcessedPickEventId);
  if (!pickRead.ok) {
    return { ok: false, error: pickRead.error };
  }

  const currentRow = active.currentRowIndex;
  const forRow = pickRead.rows.filter(r => normalizeGoldRushRowIndex(r?.event_payload?.rowIndex) === currentRow);
  const columns = new Set();
  for (const r of forRow) {
    const col = normalizeGoldRushColumn(r?.event_payload?.column);
    if (col !== null) columns.add(col);
  }

  let pickConflict = columns.size > 1;
  let pendingPick = null;

  if (!pickConflict && columns.size === 1) {
    const last = forRow[forRow.length - 1];
    const col = normalizeGoldRushColumn(last?.event_payload?.column);
    const eid = last?.id != null ? Number(last.id) : null;
    if (col !== null && Number.isFinite(eid) && eid > 0) {
      pendingPick = {
        rowIndex: currentRow,
        column: col,
        pickEventId: eid,
        pickSubmittedAt: last?.created_at || null,
      };
    }
  }

  const playing = buildPlayingPayload(sessionRow, active, entryCost);
  const canCashOut = active.clearedRows.length >= 1 && !pendingPick && !pickConflict;

  const readState = pickConflict ? "pick_conflict" : pendingPick ? "choice_submitted" : "choice_required";

  return {
    ok: true,
    snapshot: {
      gameKey: "gold_rush_digger",
      readState,
      canResolveTurn: Boolean(pendingPick) && !pickConflict,
      canCashOut,
      playing,
      pendingPick,
      pickConflict,
      resolvedResult: null,
    },
  };
}
