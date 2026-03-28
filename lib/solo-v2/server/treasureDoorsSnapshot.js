import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "./sessionTypes";
import {
  buildTreasureDoorsSettlementSummary,
  TREASURE_DOORS_CHAMBER_COUNT,
  TREASURE_DOORS_DOOR_COUNT,
  TREASURE_DOORS_MIN_WAGER,
} from "../treasureDoorsConfig";
import { computePlayingNumbers } from "./treasureDoorsEngine";
import { QUICK_FLIP_CONFIG } from "../quickFlipConfig";

export function normalizeTreasureDoor(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n >= TREASURE_DOORS_DOOR_COUNT) return null;
  return n;
}

export function normalizeTreasureChamberIndex(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n >= TREASURE_DOORS_CHAMBER_COUNT) return null;
  return n;
}

function entryCostFromSessionRow(sessionRow) {
  const stake = Math.floor(Number(sessionRow?.entry_amount || 0));
  return stake >= TREASURE_DOORS_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
}

function fundingSourceFromSessionRow(sessionRow) {
  return sessionRow?.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
}

export function parseTreasureDoorsActiveSummary(sessionRow) {
  const s = sessionRow?.server_outcome_summary || {};
  if (s.phase !== "treasure_doors_active") return null;
  const trapDoors = Array.isArray(s.trapDoors) ? s.trapDoors.map(c => Math.floor(Number(c))) : [];
  if (trapDoors.length !== TREASURE_DOORS_CHAMBER_COUNT) return null;
  if (trapDoors.some(c => !Number.isFinite(c) || c < 0 || c >= TREASURE_DOORS_DOOR_COUNT)) return null;

  const currentChamberIndex = Math.max(0, Math.floor(Number(s.currentChamberIndex) || 0));
  const clearedChambers = Array.isArray(s.clearedChambers)
    ? s.clearedChambers
        .map(c => Math.floor(Number(c)))
        .filter(n => Number.isFinite(n) && n >= 0 && n < TREASURE_DOORS_CHAMBER_COUNT)
    : [];
  const doorHistory = Array.isArray(s.doorHistory)
    ? s.doorHistory.filter(
        h =>
          h &&
          typeof h === "object" &&
          Number.isFinite(Math.floor(Number(h.chamberIndex))) &&
          Number.isFinite(Math.floor(Number(h.door))),
      )
    : [];
  const lastProcessedPickEventId = Math.max(0, Math.floor(Number(s.lastProcessedPickEventId) || 0));

  return {
    chamberCount: TREASURE_DOORS_CHAMBER_COUNT,
    doorCount: TREASURE_DOORS_DOOR_COUNT,
    trapDoors,
    currentChamberIndex,
    clearedChambers,
    doorHistory,
    lastProcessedPickEventId,
    lastTurn: s.lastTurn && typeof s.lastTurn === "object" ? s.lastTurn : null,
  };
}

async function readTreasureDoorsPickEventsAfter(supabase, sessionId, minIdExclusive) {
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
      String(r?.event_payload?.action || "") === "treasure_doors_pick" &&
      String(r?.event_payload?.gameKey || "") === "treasure_doors",
  );
  return { ok: true, rows: picks };
}

function buildPlayingPayload(_sessionRow, active, entryCost) {
  const chamber = active.currentChamberIndex;
  const clearedLen = active.clearedChambers.length;
  const nums = computePlayingNumbers(entryCost, chamber, clearedLen);
  return {
    chamberCount: TREASURE_DOORS_CHAMBER_COUNT,
    doorCount: TREASURE_DOORS_DOOR_COUNT,
    currentChamberIndex: chamber,
    clearedChambers: active.clearedChambers,
    doorHistory: active.doorHistory,
    currentMultiplier: nums.currentMultiplier,
    nextMultiplier: nums.nextMultiplier,
    currentPayout: nums.currentPayout,
    nextPayout: nums.nextPayout,
    lastTurn: active.lastTurn,
  };
}

export async function buildTreasureDoorsSessionSnapshot(supabase, sessionRow) {
  if (!sessionRow || sessionRow.game_key !== "treasure_doors") {
    return {
      ok: true,
      snapshot: {
        gameKey: sessionRow?.game_key || null,
        readState: "not_treasure_doors",
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
          : "trap";
    const payoutReturn = Math.max(0, Math.floor(Number(summary.payoutReturn) || 0));
    const settlementSummary =
      summary.settlementSummary ||
      buildTreasureDoorsSettlementSummary({
        terminalKind,
        payoutReturn,
        entryCost,
        fundingSource,
      });

    return {
      ok: true,
      snapshot: {
        gameKey: "treasure_doors",
        readState: "resolved",
        canResolveTurn: false,
        canCashOut: false,
        playing: null,
        pendingPick: null,
        pickConflict: false,
        resolvedResult: {
          terminalKind,
          payoutReturn,
          isWin: terminalKind !== "trap",
          finalChamberIndex:
            summary.finalChamberIndex != null ? Math.floor(Number(summary.finalChamberIndex)) : null,
          lastPickDoor: summary.lastPickDoor != null ? Math.floor(Number(summary.lastPickDoor)) : null,
          trapDoor: summary.trapDoor != null ? Math.floor(Number(summary.trapDoor)) : null,
          trapDoors: Array.isArray(summary.trapDoors)
            ? summary.trapDoors.map(c => Math.floor(Number(c)))
            : null,
          doorHistory: Array.isArray(summary.doorHistory) ? summary.doorHistory : [],
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
        gameKey: "treasure_doors",
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
          gameKey: "treasure_doors",
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

  const active = parseTreasureDoorsActiveSummary(sessionRow);
  if (!active) {
    return {
      ok: true,
      snapshot: {
        gameKey: "treasure_doors",
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

  const pickRead = await readTreasureDoorsPickEventsAfter(supabase, sessionRow.id, active.lastProcessedPickEventId);
  if (!pickRead.ok) {
    return { ok: false, error: pickRead.error };
  }

  const currentChamber = active.currentChamberIndex;
  const forChamber = pickRead.rows.filter(
    r => normalizeTreasureChamberIndex(r?.event_payload?.chamberIndex) === currentChamber,
  );
  const doors = new Set();
  for (const r of forChamber) {
    const d = normalizeTreasureDoor(r?.event_payload?.door);
    if (d !== null) doors.add(d);
  }

  let pickConflict = doors.size > 1;
  let pendingPick = null;

  if (!pickConflict && doors.size === 1) {
    const last = forChamber[forChamber.length - 1];
    const door = normalizeTreasureDoor(last?.event_payload?.door);
    const eid = last?.id != null ? Number(last.id) : null;
    if (door !== null && Number.isFinite(eid) && eid > 0) {
      pendingPick = {
        chamberIndex: currentChamber,
        door,
        pickEventId: eid,
        pickSubmittedAt: last?.created_at || null,
      };
    }
  }

  const playing = buildPlayingPayload(sessionRow, active, entryCost);
  const canCashOut = active.clearedChambers.length >= 1 && !pendingPick && !pickConflict;

  const readState = pickConflict ? "pick_conflict" : pendingPick ? "choice_submitted" : "choice_required";

  return {
    ok: true,
    snapshot: {
      gameKey: "treasure_doors",
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
