/**
 * OV2 Checkers — RPC + Realtime boundary (no React).
 */

import { supabaseMP as supabase } from "../../supabaseClients";

export const OV2_CHECKERS_PRODUCT_GAME_ID = "ov2_checkers";

export function isOv2CheckersBackendUnavailableError(err) {
  const code = err && typeof err === "object" ? /** @type {{ code?: string }} */ (err).code : undefined;
  const msg = String(err && typeof err === "object" && "message" in err ? err.message : err || "").toLowerCase();
  if (code === "PGRST202" || code === "42P01" || code === "42704" || code === "42883") return true;
  if (msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("undefined table")) return true;
  return false;
}

/**
 * @param {Record<string, unknown>} raw
 */
export function normalizeOv2CheckersSnapshot(raw) {
  if (!raw || typeof raw !== "object") return null;
  let mySeat = null;
  const myRaw = raw.mySeat;
  if (myRaw !== null && myRaw !== undefined && myRaw !== "null") {
    const n = Number(myRaw);
    if (Number.isInteger(n) && n >= 0 && n <= 1) mySeat = n;
  }
  let winnerSeat = null;
  const wRaw = raw.winnerSeat;
  if (wRaw !== null && wRaw !== undefined && wRaw !== "null") {
    const w = Number(wRaw);
    if (Number.isInteger(w) && (w === 0 || w === 1)) winnerSeat = w;
  }
  const tdRaw = raw.turnDeadline;
  const turnDeadline =
    tdRaw != null && tdRaw !== "" && Number.isFinite(Number(tdRaw)) ? Math.floor(Number(tdRaw)) : null;
  const jca = raw.jumpChainAt;
  const jumpChainAt =
    jca !== null && jca !== undefined && jca !== "null" && Number.isFinite(Number(jca))
      ? Math.floor(Number(jca))
      : null;
  const missedTurns =
    raw.missedTurns && typeof raw.missedTurns === "object"
      ? /** @type {Record<string, number>} */ (raw.missedTurns)
      : null;
  return {
    revision: raw.revision != null ? Number(raw.revision) : 0,
    sessionId: String(raw.sessionId ?? ""),
    roomId: String(raw.roomId ?? ""),
    phase: String(raw.phase ?? ""),
    activeSeats: Array.isArray(raw.activeSeats) ? raw.activeSeats.map(x => Number(x)) : [0, 1],
    mySeat,
    board: raw.board && typeof raw.board === "object" ? /** @type {Record<string, unknown>} */ (raw.board) : {},
    turnSeat: raw.turnSeat != null ? Number(raw.turnSeat) : null,
    winnerSeat,
    canClientMove: raw.canClientMove === true,
    boardViewReadOnly: raw.boardViewReadOnly === true,
    turnDeadline,
    missedTurns,
    jumpChainAt,
  };
}

function parseSnapshotRpc(data) {
  if (!data || typeof data !== "object") {
    return { ok: false, error: "Invalid response" };
  }
  const d = /** @type {Record<string, unknown>} */ (data);
  if (d.ok === true && d.snapshot) {
    const snap = normalizeOv2CheckersSnapshot(/** @type {Record<string, unknown>} */ (d.snapshot));
    if (!snap) return { ok: false, error: "Invalid snapshot" };
    return { ok: true, snapshot: snap };
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
export async function fetchOv2CheckersSnapshot(roomId, _opts) {
  if (!roomId) return null;
  const pk = _opts?.participantKey != null ? String(_opts.participantKey).trim() : "";
  try {
    const { data, error } = await supabase.rpc("ov2_checkers_get_snapshot", {
      p_room_id: roomId,
      p_participant_key: pk,
    });
    if (error) {
      if (isOv2CheckersBackendUnavailableError(error)) return null;
      return null;
    }
    const body = /** @type {Record<string, unknown>} */ (data);
    if (body?.ok !== true || !body.snapshot) return null;
    return normalizeOv2CheckersSnapshot(/** @type {Record<string, unknown>} */ (body.snapshot));
  } catch (e) {
    if (isOv2CheckersBackendUnavailableError(e)) return null;
    return null;
  }
}

/**
 * @param {string} roomId
 * @param {{ participantKey?: string|null, onSnapshot: (s: NonNullable<ReturnType<typeof normalizeOv2CheckersSnapshot>>) => void, onError?: (e: Error) => void }} handlers
 */
export function subscribeOv2CheckersSnapshot(roomId, handlers) {
  if (!roomId || typeof handlers?.onSnapshot !== "function") {
    return () => {};
  }
  const pk = handlers.participantKey != null ? String(handlers.participantKey).trim() : "";
  let cancelled = false;
  const pushLatest = async () => {
    if (cancelled) return;
    const snap = await fetchOv2CheckersSnapshot(roomId, { participantKey: pk });
    if (snap && !cancelled) handlers.onSnapshot(snap);
  };
  try {
    const channel = supabase
      .channel(`ov2-checkers:${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ov2_checkers_sessions", filter: `room_id=eq.${roomId}` },
        () => {
          void pushLatest();
        }
      )
      .subscribe((status, err) => {
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
 * @param {{ presenceLeaderKey?: string|null }} [_opts]
 */
export async function requestOv2CheckersOpenSession(roomId, participantKey, _opts) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  const leader = _opts?.presenceLeaderKey != null ? String(_opts.presenceLeaderKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "room_id and participant_key required" };
  if (!leader) return { ok: false, error: "presence leader key required" };
  try {
    const { data, error } = await supabase.rpc("ov2_checkers_open_session", {
      p_room_id: roomId,
      p_participant_key: pk,
      p_presence_leader_key: leader,
    });
    if (error) {
      if (isOv2CheckersBackendUnavailableError(error)) {
        return { ok: false, error: "Checkers backend not available (migrations not applied?)" };
      }
      return { ok: false, error: error.message || String(error) };
    }
    return parseSnapshotRpc(data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function requestOv2CheckersMarkTurnTimeout(roomId, participantKey, _opts) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "Missing room or participant" };
  const rev = _opts?.revision;
  try {
    const { data, error } = await supabase.rpc("ov2_checkers_mark_turn_timeout", {
      p_room_id: roomId,
      p_participant_key: pk,
      p_expected_revision: rev != null && rev !== "" ? Number(rev) : null,
    });
    if (error) {
      if (isOv2CheckersBackendUnavailableError(error)) return { ok: false, error: "Checkers backend not available" };
      return { ok: false, error: error.message || String(error) };
    }
    return parseSnapshotRpc(data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * @param {string} roomId
 * @param {string} participantKey
 * @param {number} fromIdx
 * @param {number} toIdx
 * @param {{ revision?: number|string }} [_opts]
 */
export async function requestOv2CheckersApplyStep(roomId, participantKey, fromIdx, toIdx, _opts) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "Missing room or participant" };
  const rev = _opts?.revision;
  try {
    const { data, error } = await supabase.rpc("ov2_checkers_apply_step", {
      p_room_id: roomId,
      p_participant_key: pk,
      p_from: Math.floor(Number(fromIdx)),
      p_to: Math.floor(Number(toIdx)),
      p_expected_revision: rev != null && rev !== "" ? Number(rev) : null,
    });
    if (error) {
      if (isOv2CheckersBackendUnavailableError(error)) return { ok: false, error: "Checkers backend not available" };
      return { ok: false, error: error.message || String(error) };
    }
    return parseSnapshotRpc(data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function parseIntentOk(data) {
  if (!data || typeof data !== "object") return { ok: false, error: "Invalid response" };
  const d = /** @type {Record<string, unknown>} */ (data);
  if (d.ok === true) return { ok: true, idempotent: d.idempotent === true };
  return {
    ok: false,
    error: typeof d.message === "string" ? d.message : "Request failed",
    code: typeof d.code === "string" ? d.code : undefined,
  };
}

export async function requestOv2CheckersRequestRematch(roomId, participantKey) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "Missing room or participant" };
  try {
    const { data, error } = await supabase.rpc("ov2_checkers_request_rematch", {
      p_room_id: roomId,
      p_participant_key: pk,
    });
    if (error) return { ok: false, error: error.message || String(error) };
    return parseIntentOk(data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function requestOv2CheckersCancelRematch(roomId, participantKey) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "Missing room or participant" };
  try {
    const { data, error } = await supabase.rpc("ov2_checkers_cancel_rematch", {
      p_room_id: roomId,
      p_participant_key: pk,
    });
    if (error) return { ok: false, error: error.message || String(error) };
    return parseIntentOk(data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function requestOv2CheckersStartNextMatch(roomId, participantKey, expectedMatchSeq) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "Missing room or participant" };
  try {
    const { data, error } = await supabase.rpc("ov2_checkers_start_next_match", {
      p_room_id: roomId,
      p_participant_key: pk,
      p_expected_match_seq:
        expectedMatchSeq != null && Number.isFinite(Number(expectedMatchSeq)) ? Math.floor(Number(expectedMatchSeq)) : null,
    });
    if (error) return { ok: false, error: error.message || String(error) };
    if (!data || typeof data !== "object") return { ok: false, error: "Invalid response" };
    const d = /** @type {Record<string, unknown>} */ (data);
    if (d.ok === true) {
      return {
        ok: true,
        matchSeq: d.match_seq != null ? Number(d.match_seq) : undefined,
        room: d.room && typeof d.room === "object" ? /** @type {Record<string, unknown>} */ (d.room) : undefined,
        members: Array.isArray(d.members) ? d.members : undefined,
      };
    }
    return {
      ok: false,
      error: typeof d.message === "string" ? d.message : "Request failed",
      code: typeof d.code === "string" ? d.code : undefined,
      ready: d.ready,
      eligible: d.eligible,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
