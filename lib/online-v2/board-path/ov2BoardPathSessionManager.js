/**
 * OV2 Board Path — session bundle helpers + DB-backed shapes.
 * Open + hydrate run via Supabase (`ov2BoardPathSessionApi.js`); no localStorage / no global open cache.
 */

import { ONLINE_V2_GAME_KINDS } from "../ov2Economy";
import {
  isBoardPathSelfHost,
  resolveBoardPathHostParticipantKey,
  shouldGuestHydrateLocalBoardPathSession,
  shouldHostOpenLocalBoardPathSession,
} from "./ov2BoardPathOpenContract";

/** @typedef {import("../ov2BoardPathAdapter").Ov2BoardPathContext} Ov2BoardPathContext */
/** @typedef {import("../ov2BoardPathAdapter").Ov2BoardPathSessionLike} Ov2BoardPathSessionLike */
/** @typedef {import("../ov2BoardPathBootstrapContract").Ov2BoardPathSeatRowLike} Ov2BoardPathSeatRowLike */

/**
 * @typedef {Object} Ov2BoardPathLocalSessionRecord
 * @property {string} id
 * @property {number} version
 * @property {number} revision
 * @property {string} roomId
 * @property {typeof ONLINE_V2_GAME_KINDS.BOARD_PATH} gameId
 * @property {number} matchSeq
 * @property {"live"|"closed"} status
 * @property {"pregame"|"playing"|"ended"} phase
 * @property {string} createdAt
 * @property {string} openedByParticipantKey
 * @property {number} turnIndex
 * @property {number} roundIndex
 * @property {number|null} activeSeatIndex
 * @property {number|null} winnerSeatIndex
 * @property {string} boardSeed
 * @property {{ turnNumber: number, activeSeatIndex: number|null, startedAt: number }} turnMeta
 * @property {{ pathLength: number, positions: Record<string, number> }} boardState
 * @property {{ source?: string }} meta
 * @property {unknown[]} eventLog
 */

/**
 * @typedef {Object} Ov2BoardPathLocalSeat
 * @property {string} id
 * @property {string} sessionId
 * @property {number} seatIndex
 * @property {string} participantKey
 * @property {string} displayName
 * @property {boolean} isHost
 * @property {boolean} isReady
 * @property {boolean} isSelf
 * @property {"emerald"|"sky"|"amber"|"violet"} tokenColor
 * @property {number} progress
 * @property {boolean} finished
 * @property {boolean} connected
 */

/**
 * @typedef {Object} Ov2BoardPathLocalSessionBundle
 * @property {Ov2BoardPathLocalSessionRecord} localSession
 * @property {Ov2BoardPathLocalSeat[]} localSeats
 * @property {Ov2BoardPathSessionLike} adapterSession
 * @property {Ov2BoardPathSeatRowLike[]} adapterSeats
 * @property {{ openedByParticipantKey: string, createdAt: string }} openMeta
 */

/** @typedef {"none"|"opening"|"hydrating"|"ready"|"active"|"finished"} BoardPathManagerSessionPhase */

export const BOARD_PATH_MANAGER_PHASE = Object.freeze({
  NONE: "none",
  OPENING: "opening",
  HYDRATING: "hydrating",
  READY: "ready",
  ACTIVE: "active",
  FINISHED: "finished",
});

const TOKEN_COLORS = /** @type {const} */ (["emerald", "sky", "amber", "violet"]);

function nMatchSeq(v) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : 0;
}

function isBoardPathDevFreezeEnabled() {
  return typeof window !== "undefined" && String(window.location?.search || "").includes("dev=1");
}

/**
 * @param {Ov2BoardPathLocalSessionRecord|null|undefined} a
 * @param {Ov2BoardPathLocalSessionRecord|null|undefined} b
 */
export function isSameSession(a, b) {
  if (!a || !b) return false;
  return a.id === b.id && a.revision === b.revision;
}

/**
 * @param {unknown} session
 * @returns {boolean}
 */
export function validateSessionShape(session) {
  if (!session || typeof session !== "object") return false;
  const s = /** @type {Record<string, unknown>} */ (session);
  if (typeof s.id !== "string") return false;
  if (!s.turnMeta || typeof s.turnMeta !== "object") return false;
  if (!s.boardState || typeof s.boardState !== "object") return false;
  if (!Array.isArray(s.eventLog)) return false;
  return true;
}

/**
 * @param {unknown} seats
 * @returns {boolean}
 */
export function validateSeats(seats) {
  if (!Array.isArray(seats)) return false;
  for (let i = 0; i < seats.length; i++) {
    const row = seats[i];
    if (!row || typeof row !== "object") return false;
    if (/** @type {{ seatIndex?: unknown }} */ (row).seatIndex !== i) return false;
    const pk = /** @type {{ participantKey?: unknown }} */ (row).participantKey;
    if (typeof pk !== "string" || !pk.trim()) return false;
  }
  return true;
}

/**
 * @param {Ov2BoardPathLocalSessionRecord} session
 */
function maybeFreezeLocalSessionRecordForDev(session) {
  if (!isBoardPathDevFreezeEnabled()) return;
  try {
    if (session.turnMeta && typeof session.turnMeta === "object") Object.freeze(session.turnMeta);
    if (session.boardState && typeof session.boardState === "object") {
      Object.freeze(session.boardState);
      if (session.boardState.positions && typeof session.boardState.positions === "object") {
        Object.freeze(session.boardState.positions);
      }
    }
    Object.freeze(session);
  } catch {
    /* ignore */
  }
}

/**
 * Legacy deterministic id (debug / tests only; DB sessions use uuid).
 * @param {string} roomId
 * @param {number} matchSeq
 */
export function buildBoardPathLocalSessionId(roomId, matchSeq) {
  return `ov2-bp-${String(roomId)}-${nMatchSeq(matchSeq)}`;
}

/**
 * @param {string} sessionId
 * @param {number} seatIndex
 */
export function deterministicBoardPathSeatId(sessionId, seatIndex) {
  return `ov2-bp-seat-${sessionId}-${seatIndex}`;
}

/**
 * Stable seat order: sort all members by `participant_key`, then assign seatIndex 0..n-1.
 * @param {{ participant_key: string }[]} members
 * @param {string} hostKey
 */
export function orderMembersForBoardPathSeats(members, hostKey) {
  void hostKey;
  const list = Array.isArray(members) ? [...members] : [];
  return list.sort((a, b) => a.participant_key.localeCompare(b.participant_key));
}

/**
 * @param {import("../ov2BoardPathAdapter").Ov2BoardPathRoomLike|null|undefined} room
 * @param {import("../ov2BoardPathAdapter").Ov2BoardPathMemberLike[]} members
 * @param {Ov2BoardPathLocalSessionRecord|null|undefined} session
 */
export function isSessionStillValid(room, members, session) {
  if (!room || !session || !Array.isArray(members) || members.length < 2) return false;
  if (String(room.id) !== String(session.roomId)) return false;
  if (nMatchSeq(room.match_seq) !== session.matchSeq) return false;
  const aid = room.active_session_id;
  if (aid == null || (typeof aid === "string" && aid.trim() === "")) return false;
  return String(aid) === String(session.id);
}

/**
 * No-op: legacy local drop removed (no global open cache).
 * @param {string} roomId
 * @param {number|string} matchSeq
 */
export function dropSession(roomId, matchSeq) {
  void roomId;
  void matchSeq;
}

/**
 * @param {string} type
 * @param {Record<string, unknown>} [payload]
 */
export function createLocalEvent(type, payload = {}) {
  return {
    id: `ov2-bp-evt-${Date.now()}`,
    type,
    payload,
    createdAt: Date.now(),
  };
}

/**
 * @param {Ov2BoardPathLocalSessionRecord|null|undefined} session
 * @param {unknown} event
 */
export function appendEvent(session, event) {
  if (!session) return session;

  return {
    ...session,
    eventLog: [...(session.eventLog || []), event],
  };
}

/**
 * @param {Ov2BoardPathLocalSessionRecord} session
 * @param {Ov2BoardPathLocalSeat[]} seats
 */
export function ensureBoardStatePositionsForSeats(session, seats) {
  if (!session || !Array.isArray(seats)) return session;
  const pathLength =
    typeof session.boardState?.pathLength === "number" && !Number.isNaN(session.boardState.pathLength)
      ? Math.max(1, Math.floor(session.boardState.pathLength))
      : 30;
  const positions =
    session.boardState?.positions && typeof session.boardState.positions === "object"
      ? { ...session.boardState.positions }
      : {};
  for (const s of seats) {
    if (s?.participantKey && !Object.prototype.hasOwnProperty.call(positions, s.participantKey)) {
      positions[s.participantKey] = 0;
    }
  }
  return { ...session, boardState: { pathLength, positions } };
}

/**
 * Fill missing turnMeta fields only; preserve DB values.
 * @param {Ov2BoardPathLocalSessionRecord} session
 */
export function ensureTurnMetaDefaults(session) {
  if (!session) return session;
  const tm = session.turnMeta && typeof session.turnMeta === "object" ? session.turnMeta : {};
  let turnNumber =
    typeof tm.turnNumber === "number" && !Number.isNaN(tm.turnNumber) ? Math.max(1, Math.floor(tm.turnNumber)) : null;
  if (turnNumber == null) {
    const ti = session.turnIndex;
    const n = typeof ti === "number" ? ti : Number(ti);
    turnNumber = !Number.isNaN(n) ? Math.max(1, Math.floor(n) + 1) : 1;
  }
  let activeSeatIndex = tm.activeSeatIndex;
  if (activeSeatIndex == null || Number.isNaN(Number(activeSeatIndex))) {
    const asc = session.activeSeatIndex;
    activeSeatIndex = asc != null && !Number.isNaN(Number(asc)) ? Number(asc) : null;
  } else {
    activeSeatIndex = Number(activeSeatIndex);
  }
  const startedRaw = tm.startedAt;
  const startedAt =
    typeof startedRaw === "number" && !Number.isNaN(startedRaw)
      ? startedRaw
      : Number(startedRaw) || 0;
  return {
    ...session,
    turnMeta: {
      ...tm,
      turnNumber,
      activeSeatIndex,
      startedAt,
    },
  };
}

/**
 * @param {Ov2BoardPathLocalSessionRecord|null|undefined} session
 * @param {Ov2BoardPathLocalSeat[]|null|undefined} seats
 */
export function isSessionConsistent(session, seats) {
  if (!session || !Array.isArray(seats)) return false;

  if (session.turnMeta?.activeSeatIndex == null) return true;

  return session.turnMeta.activeSeatIndex < seats.length;
}

/**
 * @param {Ov2BoardPathLocalSessionRecord} session
 * @param {Ov2BoardPathLocalSeat[]} seats
 */
export function advanceTurnLocal(session, seats) {
  if (!session || !Array.isArray(seats) || seats.length === 0) return session;

  const tm = session.turnMeta || { turnNumber: 1, activeSeatIndex: null, startedAt: Date.now() };
  const nextIndex =
    tm.activeSeatIndex == null ? 0 : (tm.activeSeatIndex + 1) % seats.length;

  return {
    ...session,
    turnIndex: (session.turnIndex || 0) + 1,
    turnMeta: {
      ...tm,
      turnNumber: (tm.turnNumber || 1) + 1,
      activeSeatIndex: nextIndex,
      startedAt: Date.now(),
    },
    activeSeatIndex: nextIndex,
  };
}

function normalizeTurnMetaFromDb(o) {
  const t = o && typeof o === "object" ? /** @type {Record<string, unknown>} */ ({ ...o }) : {};
  const tn = typeof t.turnNumber === "number" ? t.turnNumber : Number(t.turnNumber) || 1;
  const ai = t.activeSeatIndex ?? t.active_seat_index;
  const activeSeatIndex =
    ai == null || ai === "" || Number.isNaN(Number(ai)) ? null : Number(ai);
  const startedRaw = t.startedAt ?? t.started_at;
  const startedAt =
    typeof startedRaw === "number" && !Number.isNaN(startedRaw)
      ? startedRaw
      : Number(startedRaw) || 0;
  const step = typeof t.step === "string" ? t.step : undefined;
  const rv = t.rollValue ?? t.roll_value;
  let rollValue;
  if (rv != null && rv !== "") {
    const n = typeof rv === "number" ? rv : Number(rv);
    rollValue = Number.isFinite(n) ? Math.floor(n) : undefined;
  }
  const rolledAt = t.rolledAt ?? t.rolled_at;
  const movedAt = t.movedAt ?? t.moved_at;
  const endedAt = t.endedAt ?? t.ended_at;
  const actedBy = t.actedByParticipantKey ?? t.acted_by_participant_key;
  return {
    ...t,
    turnNumber: tn,
    activeSeatIndex,
    startedAt,
    ...(step ? { step } : {}),
    ...(rollValue != null && rollValue >= 1 ? { rollValue } : {}),
    ...(typeof rolledAt === "number" ? { rolledAt } : {}),
    ...(typeof movedAt === "number" ? { movedAt } : {}),
    ...(typeof endedAt === "number" ? { endedAt } : {}),
    ...(typeof actedBy === "string" ? { actedByParticipantKey: actedBy } : {}),
  };
}

function normalizeBoardStateFromDb(raw) {
  const o = raw && typeof raw === "object" ? raw : {};
  const plRaw = o.pathLength ?? o.path_length;
  const pln = typeof plRaw === "number" ? plRaw : Number(plRaw);
  const pl = Number.isFinite(pln) && pln >= 1 ? Math.floor(pln) : 30;
  const pos = o.positions && typeof o.positions === "object" ? { ...o.positions } : {};
  return { pathLength: pl, positions: pos };
}

/**
 * Map a `ov2_board_path_sessions` row (snake_case) into the local session record shape.
 * @param {Record<string, unknown>} row
 * @param {string} openedByParticipantKey
 * @returns {Ov2BoardPathLocalSessionRecord}
 */
export function boardPathDbSessionRowToLocalRecord(row, openedByParticipantKey) {
  const id = String(row.id);
  const turnRaw = row.turn_meta;
  const tmIn = turnRaw && typeof turnRaw === "object" ? turnRaw : {};
  let turnMeta = normalizeTurnMetaFromDb(tmIn);
  const asc = row.active_seat_index;
  if (asc != null && turnMeta.activeSeatIndex == null) {
    const n = Number(asc);
    if (!Number.isNaN(n)) turnMeta = { ...turnMeta, activeSeatIndex: n };
  }
  const phaseRaw = row.phase ?? row.engine_phase ?? "pregame";
  const pr = typeof phaseRaw === "string" ? phaseRaw : "pregame";
  const phase =
    pr === "playing" || pr === "ended" || pr === "pregame" ? pr : pr === "settling" ? "ended" : "pregame";
  const eventLog = Array.isArray(row.event_log) ? [...row.event_log] : [];
  let createdAt = new Date().toISOString();
  if (row.created_at instanceof Date) createdAt = row.created_at.toISOString();
  else if (typeof row.created_at === "string") createdAt = row.created_at;

  return {
    id,
    version: 1,
    revision: typeof row.revision === "number" ? row.revision : Number(row.revision) || 0,
    roomId: String(row.room_id),
    gameId: ONLINE_V2_GAME_KINDS.BOARD_PATH,
    matchSeq: nMatchSeq(row.match_seq),
    status: typeof row.status === "string" ? row.status : "live",
    phase: /** @type {"pregame"|"playing"|"ended"} */ (
      phase === "ended" ? "ended" : phase === "playing" ? "playing" : "pregame"
    ),
    createdAt,
    openedByParticipantKey: openedByParticipantKey || "",
    turnIndex: typeof row.turn_index === "number" ? row.turn_index : Number(row.turn_index) || 0,
    roundIndex:
      typeof row.round_index === "number" && !Number.isNaN(row.round_index)
        ? Math.max(0, Math.floor(row.round_index))
        : Number(row.round_index) || 0,
    activeSeatIndex: asc == null || Number.isNaN(Number(asc)) ? null : Number(asc),
    winnerSeatIndex: (() => {
      const w = row.winner_seat_index;
      if (w == null || w === "") return null;
      const n = Number(w);
      return Number.isNaN(n) ? null : Math.floor(n);
    })(),
    boardSeed: "",
    turnMeta,
    boardState: normalizeBoardStateFromDb(row.board_state),
    meta: { source: "ov2_db" },
    eventLog,
  };
}

/**
 * @param {import("../ov2BoardPathAdapter").Ov2BoardPathMemberLike[]} members
 * @param {string} hostKey
 * @param {string} sessionId
 * @param {string} selfKey
 * @param {Record<string, unknown>[]} rows
 * @param {Record<string, number>|null|undefined} [positionByParticipantKey]
 * @param {number} [pathLength]
 * @returns {Ov2BoardPathLocalSeat[]}
 */
export function boardPathDbSeatRowsToLocalSeats(members, hostKey, sessionId, selfKey, rows, positionByParticipantKey, pathLength = 30) {
  /** @type {Record<string, import("../ov2BoardPathAdapter").Ov2BoardPathMemberLike>} */
  const byPk = {};
  for (const m of members || []) byPk[m.participant_key] = m;
  const sorted = [...(rows || [])].sort((a, b) => Number(a.seat_index) - Number(b.seat_index));
  const L = Math.max(1, Math.floor(pathLength));
  return sorted.map((r, i) => {
    const pk = String(r.participant_key);
    const m = byPk[pk];
    const label =
      (m?.display_name && String(m.display_name).trim()) || `…${String(pk).slice(0, 4)}`;
    const si = typeof r.seat_index === "number" ? r.seat_index : Number(r.seat_index) ?? i;
    const rawP = positionByParticipantKey && Object.prototype.hasOwnProperty.call(positionByParticipantKey, pk)
      ? positionByParticipantKey[pk]
      : 0;
    const pn = typeof rawP === "number" ? rawP : Number(rawP);
    const progress = Number.isFinite(pn) ? Math.max(0, Math.min(Math.floor(pn), L)) : 0;
    return {
      id: String(r.id),
      sessionId: String(r.session_id ?? sessionId),
      seatIndex: si,
      participantKey: pk,
      displayName: label,
      isHost: Boolean(r.is_host),
      isReady: Boolean(r.is_ready ?? m?.is_ready),
      isSelf: pk === selfKey,
      tokenColor: TOKEN_COLORS[si % TOKEN_COLORS.length],
      progress,
      finished: progress >= L,
      connected: true,
    };
  });
}

/**
 * @param {Ov2BoardPathLocalSessionRecord} localSession
 * @param {Ov2BoardPathLocalSeat[]} localSeats
 * @param {string} selfKey
 * @param {{ openedByParticipantKey: string, createdAt: string }} openMeta
 * @returns {Ov2BoardPathLocalSessionBundle|null}
 */
function finalizeBundle(localSession, localSeats, selfKey, openMeta) {
  let sess = {
    ...localSession,
    version: localSession.version ?? 1,
    revision: typeof localSession.revision === "number" ? localSession.revision : 0,
    turnMeta: localSession.turnMeta ? { ...localSession.turnMeta } : { turnNumber: 1, activeSeatIndex: null, startedAt: Date.now() },
    boardState: localSession.boardState
      ? {
          pathLength: localSession.boardState.pathLength,
          positions:
            localSession.boardState.positions && typeof localSession.boardState.positions === "object"
              ? { ...localSession.boardState.positions }
              : {},
        }
      : { pathLength: 30, positions: {} },
    eventLog: Array.isArray(localSession.eventLog) ? [...localSession.eventLog] : [],
  };
  sess = ensureBoardStatePositionsForSeats(sess, localSeats);
  sess = ensureTurnMetaDefaults(sess);
  if (!validateSessionShape(sess)) return null;
  if (!validateSeats(localSeats)) return null;
  const bs = sess.boardState;
  const L = typeof bs?.pathLength === "number" && !Number.isNaN(bs.pathLength) ? Math.max(1, Math.floor(bs.pathLength)) : 30;
  const pos = bs?.positions && typeof bs.positions === "object" ? bs.positions : {};
  const localSeatsSynced = localSeats.map(s => {
    const raw = pos[s.participantKey];
    const pn = typeof raw === "number" ? raw : Number(raw);
    const progress = Number.isFinite(pn) ? Math.max(0, Math.min(Math.floor(pn), L)) : 0;
    return { ...s, progress, finished: progress >= L };
  });
  maybeFreezeLocalSessionRecordForDev(sess);
  return {
    localSession: sess,
    localSeats: localSeatsSynced,
    adapterSession: localBoardPathSessionToAdapterSession(sess, localSeatsSynced, selfKey),
    adapterSeats: localBoardPathSeatsToAdapterSeats(localSeatsSynced),
    openMeta,
  };
}

/**
 * @param {import("../ov2BoardPathAdapter").Ov2BoardPathRoomLike} room
 * @param {import("../ov2BoardPathAdapter").Ov2BoardPathMemberLike[]} members
 * @param {string} selfKey
 * @param {Record<string, unknown>} sessionRow
 * @param {Record<string, unknown>[]} seatRows
 * @param {string} [openedByParticipantKey]
 * @returns {Ov2BoardPathLocalSessionBundle|null}
 */
export function boardPathBundleFromDatabase(room, members, selfKey, sessionRow, seatRows, openedByParticipantKey) {
  const hk = resolveBoardPathHostParticipantKey(room, members);
  if (!hk || !room?.id) return null;
  const ob = openedByParticipantKey || hk;
  const localSession = boardPathDbSessionRowToLocalRecord(sessionRow, ob);
  const bs = localSession.boardState;
  const posMap = bs?.positions && typeof bs.positions === "object" ? /** @type {Record<string, number>} */ (bs.positions) : {};
  const localSeats = boardPathDbSeatRowsToLocalSeats(
    members,
    hk,
    localSession.id,
    selfKey,
    seatRows,
    posMap,
    bs?.pathLength ?? 30
  );
  const openMeta = { openedByParticipantKey: ob, createdAt: localSession.createdAt };
  return finalizeBundle(localSession, localSeats, selfKey, openMeta);
}

/**
 * @param {{ id: string, match_seq?: number|string }} room
 * @param {{ participant_key: string, display_name?: string|null, is_ready?: boolean }[]} orderedMembers
 * @param {string} hostKey
 * @param {string} sessionId
 * @param {string} selfKey
 */
function buildLocalSeats(room, orderedMembers, hostKey, sessionId, selfKey) {
  /** @type {Ov2BoardPathLocalSeat[]} */
  const out = [];
  orderedMembers.forEach((m, i) => {
    const pk = m.participant_key;
    const label =
      (m.display_name && String(m.display_name).trim()) || `…${String(pk).slice(0, 4)}`;
    out.push({
      id: deterministicBoardPathSeatId(sessionId, i),
      sessionId,
      seatIndex: i,
      participantKey: pk,
      displayName: label,
      isHost: pk === hostKey,
      isReady: Boolean(m.is_ready),
      isSelf: pk === selfKey,
      tokenColor: TOKEN_COLORS[i % TOKEN_COLORS.length],
      progress: 0,
      finished: false,
      connected: true,
    });
  });
  return out;
}

/**
 * @param {Ov2BoardPathLocalSessionRecord} localSession
 * @param {import("../ov2BoardPathAdapter").Ov2BoardPathMemberLike[]} members
 * @param {string} hostKey
 * @param {string} selfKey
 * @param {{ openedByParticipantKey: string, createdAt: string }} openMeta
 * @returns {Ov2BoardPathLocalSessionBundle|null}
 */
/**
 * In-memory bundle for offline fixture room ids (dev mocks). No DB / no localStorage.
 * @param {import("../ov2BoardPathAdapter").Ov2BoardPathRoomLike} room
 * @param {import("../ov2BoardPathAdapter").Ov2BoardPathMemberLike[]} members
 * @param {string} selfKey
 * @returns {Ov2BoardPathLocalSessionBundle|null}
 */
export function syntheticBoardPathBundleForFixtureHost(room, members, selfKey) {
  const hk = resolveBoardPathHostParticipantKey(room, members);
  if (!hk || !room?.id) return null;
  if (!shouldHostOpenLocalBoardPathSession(room, members, selfKey)) return null;
  const matchSeq = nMatchSeq(room.match_seq);
  const sessionId = buildBoardPathLocalSessionId(String(room.id), matchSeq);
  const createdAt = new Date().toISOString();
  /** @type {Ov2BoardPathLocalSessionRecord} */
  const localSession = {
    id: sessionId,
    version: 1,
    revision: 0,
    roomId: String(room.id),
    gameId: ONLINE_V2_GAME_KINDS.BOARD_PATH,
    matchSeq,
    status: "live",
    phase: "pregame",
    createdAt,
    openedByParticipantKey: selfKey,
    turnIndex: 0,
    roundIndex: 0,
    activeSeatIndex: null,
    winnerSeatIndex: null,
    boardSeed: `ov2-bp-seed-${String(room.id)}-${matchSeq}`,
    turnMeta: { turnNumber: 1, activeSeatIndex: null, startedAt: Date.now() },
    boardState: { pathLength: 30, positions: {} },
    meta: { source: "fixture_dev" },
    eventLog: [],
  };
  return assembleBundleFromMembers(localSession, members, hk, selfKey, {
    openedByParticipantKey: selfKey,
    createdAt,
  });
}

/**
 * @param {import("../ov2BoardPathAdapter").Ov2BoardPathRoomLike} room
 * @param {import("../ov2BoardPathAdapter").Ov2BoardPathMemberLike[]} members
 * @param {string} selfKey
 * @returns {Ov2BoardPathLocalSessionBundle|null}
 */
export function syntheticBoardPathBundleForFixtureGuest(room, members, selfKey) {
  const hk = resolveBoardPathHostParticipantKey(room, members);
  if (!hk || !room?.id) return null;
  if (!shouldGuestHydrateLocalBoardPathSession(room, members, selfKey)) return null;
  const matchSeq = nMatchSeq(room.match_seq);
  const sessionId = buildBoardPathLocalSessionId(String(room.id), matchSeq);
  const createdAt = new Date().toISOString();
  /** @type {Ov2BoardPathLocalSessionRecord} */
  const localSession = {
    id: sessionId,
    version: 1,
    revision: 0,
    roomId: String(room.id),
    gameId: ONLINE_V2_GAME_KINDS.BOARD_PATH,
    matchSeq,
    status: "live",
    phase: "pregame",
    createdAt,
    openedByParticipantKey: hk,
    turnIndex: 0,
    roundIndex: 0,
    activeSeatIndex: null,
    winnerSeatIndex: null,
    boardSeed: `ov2-bp-seed-${String(room.id)}-${matchSeq}`,
    turnMeta: { turnNumber: 1, activeSeatIndex: null, startedAt: Date.now() },
    boardState: { pathLength: 30, positions: {} },
    meta: { source: "fixture_dev" },
    eventLog: [],
  };
  return assembleBundleFromMembers(localSession, members, hk, selfKey, {
    openedByParticipantKey: hk,
    createdAt,
  });
}

function assembleBundleFromMembers(localSession, members, hostKey, selfKey, openMeta) {
  const ordered = orderMembersForBoardPathSeats(members, hostKey);
  const sid = localSession.id;
  let localSeats = buildLocalSeats({ id: localSession.roomId, match_seq: localSession.matchSeq }, ordered, hostKey, sid, selfKey);
  if (localSeats.some(s => s.id !== deterministicBoardPathSeatId(sid, s.seatIndex) || s.sessionId !== sid)) {
    localSeats = buildLocalSeats({ id: localSession.roomId, match_seq: localSession.matchSeq }, ordered, hostKey, sid, selfKey);
  }
  if (!validateSeats(localSeats)) {
    localSeats = buildLocalSeats({ id: localSession.roomId, match_seq: localSession.matchSeq }, ordered, hostKey, sid, selfKey);
  }
  return finalizeBundle(localSession, localSeats, selfKey, openMeta);
}

/**
 * @param {import("../ov2BoardPathAdapter").Ov2BoardPathRoomLike} room
 * @param {import("../ov2BoardPathAdapter").Ov2BoardPathMemberLike[]} members
 * @param {string} selfKey
 * @param {Ov2BoardPathLocalSessionRecord} nextSession
 * @param {{ openedByParticipantKey: string, createdAt: string }|null|undefined} openMeta
 * @param {Ov2BoardPathLocalSessionBundle|null|undefined} prevBundle
 * @returns {Ov2BoardPathLocalSessionBundle|null}
 */
export function replaceLocalSession(room, members, selfKey, nextSession, openMeta, prevBundle) {
  if (!room?.id || !nextSession?.id) return null;
  const hk = resolveBoardPathHostParticipantKey(room, members);
  if (!hk) return null;
  const prevS = prevBundle?.localSession ?? null;
  let sessionToBundle = { ...nextSession };
  if (prevS?.id === sessionToBundle.id) {
    sessionToBundle = {
      ...sessionToBundle,
      version: sessionToBundle.version ?? 1,
      revision: (prevS.revision ?? 0) + 1,
    };
  } else {
    sessionToBundle = {
      ...sessionToBundle,
      version: sessionToBundle.version ?? 1,
      revision: typeof sessionToBundle.revision === "number" ? sessionToBundle.revision : 0,
    };
  }
  const om =
    openMeta ||
    prevBundle?.openMeta || {
      openedByParticipantKey: nextSession.openedByParticipantKey,
      createdAt: nextSession.createdAt,
    };
  const seats = prevBundle?.localSeats && validateSeats(prevBundle.localSeats) ? prevBundle.localSeats : null;
  if (seats) {
    return finalizeBundle(sessionToBundle, seats, selfKey, om);
  }
  return assembleBundleFromMembers(sessionToBundle, members, hk, selfKey, om);
}

/**
 * @param {Ov2BoardPathLocalSessionRecord} local
 * @param {Ov2BoardPathLocalSeat[]} seats
 * @param {string} selfParticipantKey
 * @returns {Ov2BoardPathSessionLike}
 */
export function localBoardPathSessionToAdapterSession(local, seats, selfParticipantKey) {
  const selfSeat = seats.find(s => s.participantKey === selfParticipantKey) || null;
  const oppSeat = seats.find(s => s.participantKey !== selfParticipantKey) || null;

  const activeIdxRaw =
    local.turnMeta != null && typeof local.turnMeta === "object" ? local.turnMeta.activeSeatIndex : null;
  const playingWithoutSeat =
    local.phase === "playing" && (activeIdxRaw == null || Number.isNaN(Number(activeIdxRaw)));

  const enginePhaseForAdapter =
    local.phase === "ended" ? "ended" : playingWithoutSeat ? "pregame" : local.phase;

  return {
    id: local.id,
    version: local.version ?? 1,
    revision: typeof local.revision === "number" ? local.revision : 0,
    room_id: local.roomId,
    match_seq: local.matchSeq,
    phase: local.phase,
    engine_phase: enginePhaseForAdapter,
    turn_index: local.turnIndex,
    round_index: local.roundIndex,
    active_seat_index: local.activeSeatIndex,
    activeSeatIndex: local.activeSeatIndex,
    turnMeta: local.turnMeta ? { ...local.turnMeta } : undefined,
    boardState: local.boardState
      ? { pathLength: local.boardState.pathLength, positions: { ...local.boardState.positions } }
      : undefined,
    winner_seat_index: local.winnerSeatIndex,
    winnerSeatIndex: local.winnerSeatIndex,
    you_won: local.winnerSeatIndex != null && selfSeat ? local.winnerSeatIndex === selfSeat.seatIndex : false,
    opponent_won: local.winnerSeatIndex != null && oppSeat ? local.winnerSeatIndex === oppSeat.seatIndex : false,
    lastEvent: Array.isArray(local.eventLog) && local.eventLog.length > 0 ? local.eventLog[local.eventLog.length - 1] : null,
    eventLog: Array.isArray(local.eventLog) ? local.eventLog : [],
  };
}

/**
 * @param {Ov2BoardPathLocalSeat[]} seats
 * @returns {Ov2BoardPathSeatRowLike[]}
 */
export function localBoardPathSeatsToAdapterSeats(seats) {
  return seats.map(s => ({
    id: s.id,
    session_id: s.sessionId,
    seat_index: s.seatIndex,
    participant_key: s.participantKey,
  }));
}

/**
 * Shell-only: pregame → playing with first seat active (no engine / dice).
 * @param {import("../ov2BoardPathAdapter").Ov2BoardPathRoomLike} room
 * @param {import("../ov2BoardPathAdapter").Ov2BoardPathMemberLike[]} members
 * @param {string} selfKey
 * @param {Ov2BoardPathLocalSessionBundle|null|undefined} prevBundle
 * @returns {Ov2BoardPathLocalSessionBundle|null}
 */
export function promoteBoardPathPregameToActiveShell(room, members, selfKey, prevBundle) {
  if (!room?.id || !prevBundle?.localSession || prevBundle.localSession.phase !== "pregame") return null;
  const hk = resolveBoardPathHostParticipantKey(room, members);
  if (!hk) return null;
  const tm = prevBundle.localSession.turnMeta || { turnNumber: 1, activeSeatIndex: null, startedAt: Date.now() };
  const nextSession = {
    ...prevBundle.localSession,
    phase: "playing",
    activeSeatIndex: 0,
    turnMeta: {
      ...tm,
      activeSeatIndex: 0,
      startedAt: Date.now(),
    },
  };
  return replaceLocalSession(room, members, selfKey, nextSession, prevBundle.openMeta, prevBundle);
}

/**
 * Merge bundle session/seats into context; optional `roomFieldPatch` (e.g. `active_session_id` after RPC).
 * @param {Ov2BoardPathContext} base
 * @param {Ov2BoardPathLocalSessionBundle|null} bundle
 * @param {Partial<import("../ov2BoardPathAdapter").Ov2BoardPathRoomLike>|null|undefined} roomFieldPatch
 * @returns {Ov2BoardPathContext}
 */
export function mergeBoardPathBundleIntoContext(base, bundle, roomFieldPatch) {
  if (!base || typeof base !== "object") return base;
  let room = base.room;
  if (room && roomFieldPatch && typeof roomFieldPatch === "object") {
    room = { ...room, ...roomFieldPatch };
  }
  const withRoom = room !== base.room ? { ...base, room } : { ...base };
  if (!bundle) return withRoom;
  return {
    ...withRoom,
    session: bundle.adapterSession,
    seats: bundle.adapterSeats,
  };
}

/**
 * Legacy: merge when room had no `active_session_id` (local bridge). Kept for mocks.
 * @param {Ov2BoardPathContext} base
 * @param {Ov2BoardPathLocalSessionBundle|null} bundle
 * @returns {Ov2BoardPathContext}
 */
export function mergeLocalBoardPathSessionIntoContext(base, bundle) {
  if (!base?.room || !bundle) return base;
  if (base.room.active_session_id != null && String(base.room.active_session_id).trim() !== "") {
    return base;
  }
  const room = { ...base.room, active_session_id: bundle.localSession.id };
  return mergeBoardPathBundleIntoContext({ ...base, room }, bundle, null);
}

/**
 * @param {Ov2BoardPathContext} baseCtx
 * @param {Ov2BoardPathLocalSessionBundle|null} bundle
 * @param {string|null} selfKey
 * @returns {keyof typeof BOARD_PATH_MANAGER_PHASE}
 */
export function deriveBoardPathManagerSessionPhase(baseCtx, bundle, selfKey) {
  const room = baseCtx?.room;
  if (!room) return BOARD_PATH_MANAGER_PHASE.NONE;

  if (bundle) {
    if (bundle.localSession.phase === "ended" || bundle.localSession.winnerSeatIndex != null) {
      return BOARD_PATH_MANAGER_PHASE.FINISHED;
    }
    if (bundle.localSession.phase === "pregame") return BOARD_PATH_MANAGER_PHASE.READY;
    if (bundle.localSession.phase === "playing") return BOARD_PATH_MANAGER_PHASE.ACTIVE;
  }

  const hasBackendSession = room.active_session_id != null && String(room.active_session_id).trim() !== "";
  if (hasBackendSession) {
    const session = baseCtx.session;
    if (!session?.id) return BOARD_PATH_MANAGER_PHASE.HYDRATING;
    if (String(session.id) !== String(room.active_session_id)) return BOARD_PATH_MANAGER_PHASE.HYDRATING;
    return BOARD_PATH_MANAGER_PHASE.ACTIVE;
  }

  const hostKey = resolveBoardPathHostParticipantKey(room, baseCtx.members || []);
  const members = baseCtx.members || [];
  if (
    room.lifecycle_phase === "active" &&
    shouldHostOpenLocalBoardPathSession(room, members, selfKey || "") &&
    isBoardPathSelfHost(selfKey || "", hostKey || "")
  ) {
    return BOARD_PATH_MANAGER_PHASE.OPENING;
  }

  return BOARD_PATH_MANAGER_PHASE.NONE;
}
