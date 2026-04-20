/**
 * OV2 Snakes & Ladders — RPC + Realtime boundary (no React).
 */

import { supabaseMP as supabase } from "../../supabaseClients";
import { ONLINE_V2_GAME_KINDS } from "../ov2Economy";

export const OV2_SNAKES_PRODUCT_GAME_ID = ONLINE_V2_GAME_KINDS.SNAKES_AND_LADDERS;

export function isOv2SnakesBackendUnavailableError(err) {
  const code = err && typeof err === "object" ? /** @type {{ code?: string }} */ (err).code : undefined;
  const msg = String(err && typeof err === "object" && "message" in err ? err.message : err || "").toLowerCase();
  if (code === "PGRST202" || code === "42P01" || code === "42704" || code === "42883") return true;
  if (msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("undefined table")) return true;
  return false;
}

/**
 * @param {Record<string, unknown>} raw
 */
export function normalizeOv2SnakesSnapshot(raw) {
  if (!raw || typeof raw !== "object") return null;
  const myRaw = raw.mySeat;
  let mySeat = null;
  if (myRaw !== null && myRaw !== undefined && myRaw !== "null") {
    const n = Number(myRaw);
    if (Number.isInteger(n) && n >= 0 && n <= 3) mySeat = n;
  }
  let winnerSeat = null;
  const wRaw = raw.winnerSeat;
  if (wRaw !== null && wRaw !== undefined && wRaw !== "null") {
    const w = Number(wRaw);
    if (Number.isInteger(w) && w >= 0 && w <= 3) winnerSeat = w;
  }
  const turnRaw = raw.turnSeat;
  let turnSeat = null;
  if (turnRaw !== null && turnRaw !== undefined && turnRaw !== "null") {
    const t = Number(turnRaw);
    if (Number.isInteger(t) && t >= 0 && t <= 3) turnSeat = t;
  }
  const lastRaw = raw.lastRoll;
  let lastRoll = null;
  if (lastRaw !== null && lastRaw !== undefined && lastRaw !== "null") {
    const lr = Number(lastRaw);
    if (Number.isFinite(lr)) lastRoll = lr;
  }
  const act = raw.activeSeats;
  const activeSeats = Array.isArray(act) ? act.map(x => Number(x)).filter(x => Number.isInteger(x) && x >= 0 && x <= 3) : [];

  return {
    sessionId: String(raw.sessionId ?? ""),
    roomId: String(raw.roomId ?? ""),
    matchSeq: raw.matchSeq != null ? Number(raw.matchSeq) : 0,
    revision: raw.revision != null ? Number(raw.revision) : 0,
    phase: String(raw.phase ?? ""),
    status: String(raw.status ?? ""),
    turnSeat,
    activeSeats,
    currentTurn: raw.currentTurn != null ? Number(raw.currentTurn) : null,
    board: raw.board && typeof raw.board === "object" ? /** @type {Record<string, unknown>} */ (raw.board) : {},
    mySeat,
    winnerSeat,
    lastRoll,
    canRoll: Boolean(raw.canRoll),
    result: raw.result && typeof raw.result === "object" ? /** @type {Record<string, unknown>} */ (raw.result) : null,
  };
}

/**
 * @param {unknown} data
 */
function parseSnapshotEnvelope(data) {
  if (!data || typeof data !== "object") {
    return { ok: false, error: "Invalid response" };
  }
  const d = /** @type {Record<string, unknown>} */ (data);
  if (d.ok === true && d.snapshot) {
    const snap = normalizeOv2SnakesSnapshot(/** @type {Record<string, unknown>} */ (d.snapshot));
    if (!snap) return { ok: false, error: "Invalid snapshot" };
    return { ok: true, snapshot: snap, idempotent: d.idempotent === true };
  }
  if (d.ok === false) {
    return {
      ok: false,
      error: typeof d.message === "string" ? d.message : "Request failed",
      code: typeof d.code === "string" ? d.code : undefined,
    };
  }
  return { ok: false, error: "Invalid response" };
}

/**
 * @param {string} roomId
 * @param {{ participantKey?: string|null }} [_opts]
 */
export async function fetchOv2SnakesSnapshot(roomId, _opts) {
  if (!roomId) return null;
  const pk = _opts?.participantKey != null ? String(_opts.participantKey).trim() : "";
  try {
    const { data, error } = await supabase.rpc("ov2_snakes_get_snapshot", {
      p_room_id: roomId,
      p_participant_key: pk,
    });
    if (error) {
      if (isOv2SnakesBackendUnavailableError(error)) return null;
      return null;
    }
    const body = /** @type {Record<string, unknown>} */ (data);
    if (body?.ok !== true || !body.snapshot) return null;
    return normalizeOv2SnakesSnapshot(/** @type {Record<string, unknown>} */ (body.snapshot));
  } catch (e) {
    if (isOv2SnakesBackendUnavailableError(e)) return null;
    return null;
  }
}

/**
 * @param {string} roomId
 * @param {{ participantKey?: string|null, activeSessionId?: string|null, onSnapshot: (s: NonNullable<ReturnType<typeof normalizeOv2SnakesSnapshot>>) => void, onError?: (e: Error) => void }} handlers
 */
export function subscribeOv2SnakesSnapshot(roomId, handlers) {
  if (!roomId || typeof handlers?.onSnapshot !== "function") {
    return () => {};
  }
  const pk = handlers.participantKey != null ? String(handlers.participantKey).trim() : "";
  const sid =
    handlers.activeSessionId != null && String(handlers.activeSessionId).trim() !== ""
      ? String(handlers.activeSessionId).trim()
      : "";
  let cancelled = false;
  const pushLatest = async () => {
    if (cancelled) return;
    const snap = await fetchOv2SnakesSnapshot(roomId, { participantKey: pk });
    if (snap && !cancelled) handlers.onSnapshot(snap);
  };
  try {
    const channel = supabase
      .channel(`ov2-snakes:${roomId}:${sid || "no_sess"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ov2_snakes_sessions", filter: `room_id=eq.${roomId}` },
        () => {
          void pushLatest();
        }
      );
    if (sid) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ov2_snakes_seats", filter: `session_id=eq.${sid}` },
        () => {
          void pushLatest();
        }
      );
    }
    channel.subscribe((status, err) => {
      if (status === "CHANNEL_ERROR" && handlers.onError) {
        handlers.onError(err instanceof Error ? err : new Error(String(err ?? "Realtime error")));
      }
    });
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  } catch (e) {
    if (handlers.onError) handlers.onError(e instanceof Error ? e : new Error(String(e)));
    return () => {};
  }
}

/**
 * @param {string} roomId
 * @param {string} participantKey
 * @param {{ expectedRoomMatchSeq: number }} opts
 */
export async function requestOv2SnakesOpenSession(roomId, participantKey, opts) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  const ms = opts?.expectedRoomMatchSeq != null ? Number(opts.expectedRoomMatchSeq) : NaN;
  if (!roomId || !pk || !Number.isFinite(ms)) {
    return { ok: false, error: "room_id, participant_key, and expectedRoomMatchSeq required" };
  }
  try {
    const { data, error } = await supabase.rpc("ov2_snakes_open_session", {
      p_room_id: roomId,
      p_participant_key: pk,
      p_expected_room_match_seq: Math.floor(ms),
    });
    if (error) {
      if (isOv2SnakesBackendUnavailableError(error)) {
        return { ok: false, error: "Snakes & Ladders backend not available (migrations not applied?)" };
      }
      return { ok: false, error: error.message || String(error) };
    }
    const parsed = parseSnapshotEnvelope(data);
    if (!parsed.ok) return { ok: false, error: parsed.error, code: parsed.code };
    return { ok: true, snapshot: parsed.snapshot, idempotent: parsed.idempotent === true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * @param {string} roomId
 * @param {string} participantKey
 * @param {string|number|bigint} idempotencyKey positive bigint-compatible
 * @param {{ expectedRevision?: number|null }} [_coord]
 */
export async function requestOv2SnakesRoll(roomId, participantKey, idempotencyKey, _coord) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  const ik = typeof idempotencyKey === "bigint" ? idempotencyKey : BigInt(String(idempotencyKey));
  if (!roomId || !pk || ik <= 0n) {
    return { ok: false, error: "room_id, participant_key, and positive idempotency_key required" };
  }
  const rev = _coord?.expectedRevision;
  try {
    const { data, error } = await supabase.rpc("ov2_snakes_roll", {
      p_room_id: roomId,
      p_participant_key: pk,
      p_idempotency_key: ik.toString(),
      p_expected_revision:
        rev != null && rev !== "" && Number.isFinite(Number(rev)) ? Math.floor(Number(rev)) : null,
    });
    if (error) {
      if (isOv2SnakesBackendUnavailableError(error)) return { ok: false, error: "Backend not available" };
      return { ok: false, error: error.message || String(error) };
    }
    const parsed = parseSnapshotEnvelope(data);
    if (!parsed.ok) return { ok: false, error: parsed.error, code: parsed.code, revision: undefined };
    const raw = /** @type {Record<string, unknown>} */ (data);
    return {
      ok: true,
      idempotent: raw.idempotent === true,
      snapshot: parsed.snapshot,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
