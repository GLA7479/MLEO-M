import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "./sessionTypes";
import {
  buildVaultDoorsSettlementSummary,
  VAULT_DOORS_DOOR_COUNT,
  VAULT_DOORS_MIN_WAGER,
  VAULT_DOORS_STAGE_COUNT,
} from "../vaultDoorsConfig";
import { computePlayingNumbers } from "./vaultDoorsEngine";
import { QUICK_FLIP_CONFIG } from "../quickFlipConfig";

export function normalizeVaultDoor(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n >= VAULT_DOORS_DOOR_COUNT) return null;
  return n;
}

export function normalizeVaultRowIndex(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n >= VAULT_DOORS_STAGE_COUNT) return null;
  return n;
}

function entryCostFromSessionRow(sessionRow) {
  const stake = Math.floor(Number(sessionRow?.entry_amount || 0));
  return stake >= VAULT_DOORS_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
}

function fundingSourceFromSessionRow(sessionRow) {
  return sessionRow?.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
}

export function parseVaultDoorsActiveSummary(sessionRow) {
  const s = sessionRow?.server_outcome_summary || {};
  if (s.phase !== "vault_doors_active") return null;
  const trapDoors = Array.isArray(s.trapDoors) ? s.trapDoors.map(c => Math.floor(Number(c))) : [];
  if (trapDoors.length !== VAULT_DOORS_STAGE_COUNT) return null;
  if (trapDoors.some(c => !Number.isFinite(c) || c < 0 || c >= VAULT_DOORS_DOOR_COUNT)) return null;

  const currentRowIndex = Math.max(0, Math.floor(Number(s.currentRowIndex) || 0));
  const clearedRows = Array.isArray(s.clearedRows)
    ? s.clearedRows
        .map(c => Math.floor(Number(c)))
        .filter(n => Number.isFinite(n) && n >= 0 && n < VAULT_DOORS_STAGE_COUNT)
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
    trapDoors,
    currentRowIndex,
    clearedRows,
    digHistory,
    lastProcessedPickEventId,
    lastTurn: s.lastTurn && typeof s.lastTurn === "object" ? s.lastTurn : null,
  };
}

async function readVaultDoorsPickEventsAfter(supabase, sessionId, minIdExclusive) {
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
      String(r?.event_payload?.action || "") === "vault_doors_pick" &&
      String(r?.event_payload?.gameKey || "") === "vault_doors",
  );
  return { ok: true, rows: picks };
}

function buildPlayingPayload(_sessionRow, active, entryCost) {
  const row = active.currentRowIndex;
  const clearedLen = active.clearedRows.length;
  const nums = computePlayingNumbers(entryCost, row, clearedLen);
  return {
    rowCount: VAULT_DOORS_STAGE_COUNT,
    columnCount: VAULT_DOORS_DOOR_COUNT,
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

/**
 * Strip sealed trap layout from raw session summary for active runs (client GET).
 */
export function stripVaultDoorsSecretsFromSummary(rawSummary) {
  if (!rawSummary || typeof rawSummary !== "object") return rawSummary;
  const phase = String(rawSummary.phase || "");
  if (phase !== "vault_doors_active") return rawSummary;
  const next = { ...rawSummary };
  delete next.trapDoors;
  return next;
}

export async function buildVaultDoorsSessionSnapshot(supabase, sessionRow) {
  if (!sessionRow || sessionRow.game_key !== "vault_doors") {
    return {
      ok: true,
      snapshot: {
        gameKey: sessionRow?.game_key || null,
        readState: "not_vault_doors",
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
    const trapLayout = Array.isArray(summary.bombColumns)
      ? summary.bombColumns.map(c => Math.floor(Number(c)))
      : Array.isArray(summary.trapDoors)
        ? summary.trapDoors.map(c => Math.floor(Number(c)))
        : null;
    const settlementSummary =
      summary.settlementSummary ||
      buildVaultDoorsSettlementSummary({
        terminalKind,
        payoutReturn,
        entryCost,
        fundingSource,
      });

    const digHistory = Array.isArray(summary.digHistory) ? summary.digHistory : [];

    return {
      ok: true,
      snapshot: {
        gameKey: "vault_doors",
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
          bombColumns: trapLayout,
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
        gameKey: "vault_doors",
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
          gameKey: "vault_doors",
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

  const active = parseVaultDoorsActiveSummary(sessionRow);
  if (!active) {
    return {
      ok: true,
      snapshot: {
        gameKey: "vault_doors",
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

  const pickRead = await readVaultDoorsPickEventsAfter(supabase, sessionRow.id, active.lastProcessedPickEventId);
  if (!pickRead.ok) {
    return { ok: false, error: pickRead.error };
  }

  const currentRow = active.currentRowIndex;
  const forRow = pickRead.rows.filter(r => normalizeVaultRowIndex(r?.event_payload?.rowIndex) === currentRow);
  const doors = new Set();
  for (const r of forRow) {
    const d = normalizeVaultDoor(r?.event_payload?.column);
    if (d !== null) doors.add(d);
  }

  let pickConflict = doors.size > 1;
  let pendingPick = null;

  if (!pickConflict && doors.size === 1) {
    const last = forRow[forRow.length - 1];
    const column = normalizeVaultDoor(last?.event_payload?.column);
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
      gameKey: "vault_doors",
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
