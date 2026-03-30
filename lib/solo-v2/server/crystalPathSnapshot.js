import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "./sessionTypes";
import {
  buildCrystalPathSettlementSummary,
  CRYSTAL_PATH_MIN_WAGER,
  CRYSTAL_PATH_ROW_COUNT,
  CRYSTAL_PATH_TILE_COUNT,
} from "../crystalPathConfig";
import { computePlayingNumbers } from "./crystalPathEngine";
import { QUICK_FLIP_CONFIG } from "../quickFlipConfig";

export function normalizeCrystalTile(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n >= CRYSTAL_PATH_TILE_COUNT) return null;
  return n;
}

export function normalizeCrystalRowIndex(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n >= CRYSTAL_PATH_ROW_COUNT) return null;
  return n;
}

function entryCostFromSessionRow(sessionRow) {
  const stake = Math.floor(Number(sessionRow?.entry_amount || 0));
  return stake >= CRYSTAL_PATH_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
}

function fundingSourceFromSessionRow(sessionRow) {
  return sessionRow?.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
}

export function parseCrystalPathActiveSummary(sessionRow) {
  const s = sessionRow?.server_outcome_summary || {};
  if (s.phase !== "crystal_path_active") return null;
  const safeColumns = Array.isArray(s.safeColumns) ? s.safeColumns.map(c => Math.floor(Number(c))) : [];
  if (safeColumns.length !== CRYSTAL_PATH_ROW_COUNT) return null;
  if (safeColumns.some(c => !Number.isFinite(c) || c < 0 || c >= CRYSTAL_PATH_TILE_COUNT)) return null;

  const currentRowIndex = Math.max(0, Math.floor(Number(s.currentRowIndex) || 0));
  const clearedRows = Array.isArray(s.clearedRows)
    ? s.clearedRows
        .map(c => Math.floor(Number(c)))
        .filter(n => Number.isFinite(n) && n >= 0 && n < CRYSTAL_PATH_ROW_COUNT)
    : [];
  const digHistory = Array.isArray(s.digHistory)
    ? s.digHistory.filter(
        h =>
          h &&
          typeof h === "object" &&
          Number.isFinite(Math.floor(Number(h.rowIndex))) &&
          Number.isFinite(Math.floor(Number(h.column))),
      )
    : [];
  const lastProcessedPickEventId = Math.max(0, Math.floor(Number(s.lastProcessedPickEventId) || 0));

  return {
    safeColumns,
    currentRowIndex,
    clearedRows,
    digHistory,
    lastProcessedPickEventId,
    lastTurn: s.lastTurn && typeof s.lastTurn === "object" ? s.lastTurn : null,
  };
}

async function readCrystalPathPickEventsAfter(supabase, sessionId, minIdExclusive) {
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
      String(r?.event_payload?.action || "") === "crystal_path_pick" &&
      String(r?.event_payload?.gameKey || "") === "crystal_path",
  );
  return { ok: true, rows: picks };
}

function buildPlayingPayload(_sessionRow, active, entryCost) {
  const row = active.currentRowIndex;
  const clearedLen = active.clearedRows.length;
  const nums = computePlayingNumbers(entryCost, row, clearedLen);
  return {
    rowCount: CRYSTAL_PATH_ROW_COUNT,
    columnCount: CRYSTAL_PATH_TILE_COUNT,
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

export function stripCrystalPathSecretsFromSummary(rawSummary) {
  if (!rawSummary || typeof rawSummary !== "object") return rawSummary;
  const phase = String(rawSummary.phase || "");
  if (phase !== "crystal_path_active") return rawSummary;
  const next = { ...rawSummary };
  delete next.safeColumns;
  return next;
}

export async function buildCrystalPathSessionSnapshot(supabase, sessionRow) {
  if (!sessionRow || sessionRow.game_key !== "crystal_path") {
    return {
      ok: true,
      snapshot: {
        gameKey: sessionRow?.game_key || null,
        readState: "not_crystal_path",
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
    const safeLayout = Array.isArray(summary.safeColumns)
      ? summary.safeColumns.map(c => Math.floor(Number(c)))
      : null;
    const settlementSummary =
      summary.settlementSummary ||
      buildCrystalPathSettlementSummary({
        terminalKind,
        payoutReturn,
        entryCost,
        fundingSource,
      });

    const digHistory = Array.isArray(summary.digHistory) ? summary.digHistory : [];

    return {
      ok: true,
      snapshot: {
        gameKey: "crystal_path",
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
          finalRowIndex:
            summary.finalRowIndex != null ? Math.floor(Number(summary.finalRowIndex)) : null,
          lastPickColumn: summary.lastPickColumn != null ? Math.floor(Number(summary.lastPickColumn)) : null,
          safeColumns: safeLayout,
          digHistory,
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
        gameKey: "crystal_path",
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
          gameKey: "crystal_path",
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

  const active = parseCrystalPathActiveSummary(sessionRow);
  if (!active) {
    return {
      ok: true,
      snapshot: {
        gameKey: "crystal_path",
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

  const pickRead = await readCrystalPathPickEventsAfter(supabase, sessionRow.id, active.lastProcessedPickEventId);
  if (!pickRead.ok) {
    return { ok: false, error: pickRead.error };
  }

  const currentRow = active.currentRowIndex;
  const forRow = pickRead.rows.filter(r => normalizeCrystalRowIndex(r?.event_payload?.rowIndex) === currentRow);
  const tiles = new Set();
  for (const r of forRow) {
    const t = normalizeCrystalTile(r?.event_payload?.column);
    if (t !== null) tiles.add(t);
  }

  let pickConflict = tiles.size > 1;
  let pendingPick = null;

  if (!pickConflict && tiles.size === 1) {
    const last = forRow[forRow.length - 1];
    const column = normalizeCrystalTile(last?.event_payload?.column);
    const eid = last?.id != null ? Number(last.id) : null;
    if (column !== null && Number.isFinite(eid) && eid > 0) {
      pendingPick = {
        rowIndex: currentRow,
        column,
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
      gameKey: "crystal_path",
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
