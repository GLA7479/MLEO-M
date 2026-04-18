/**
 * OV2 Snakes & Ladders — session adapter (RPC + Realtime).
 */

import { supabaseMP as supabase } from "../../supabaseClients";
import { normalizeAuthoritativeSnapshot } from "../ludo/ov2LudoSessionAdapter";

export const OV2_SNAKES_LADDERS_PRODUCT_GAME_ID = "ov2_snakes_ladders";

function isBackendUnavailable(err) {
  const code = err && typeof err === "object" ? /** @type {{ code?: string }} */ (err).code : undefined;
  const msg = String(err && typeof err === "object" && "message" in err ? err.message : err || "").toLowerCase();
  if (code === "PGRST202" || code === "42P01" || code === "42704" || code === "42883") return true;
  if (msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("undefined table")) return true;
  return false;
}

/**
 * @param {Record<string, unknown>} snap
 */
function coerceSnapshotShape(snap) {
  if (!snap || typeof snap !== "object") return snap;
  const out = { ...snap };
  const parity = out.parity && typeof out.parity === "object" ? /** @type {Record<string, unknown>} */ (out.parity) : null;
  const mtRaw = parity && parity.missed_turns != null ? parity.missed_turns : null;
  if (mtRaw && typeof mtRaw === "object" && !Array.isArray(mtRaw) && out.missedTurns == null) {
    out.missedTurns = /** @type {Record<string, number>} */ (mtRaw);
  }
  const b = out.board && typeof out.board === "object" ? { ...out.board } : {};
  if (!b.pieces) b.pieces = {};
  if (!b.finished) b.finished = {};
  const ac = Array.isArray(out.activeSeats) ? out.activeSeats : [];
  b.seatCount = ac.length;
  if (!b.activeSeats) b.activeSeats = ac;
  out.board = b;
  return out;
}

/**
 * @param {Record<string, unknown>|null|undefined} raw
 */
export function normalizeSnakesAuthoritativeSnapshot(raw) {
  if (!raw || typeof raw !== "object") return null;
  return normalizeAuthoritativeSnapshot(coerceSnapshotShape(/** @type {Record<string, unknown>} */ (raw)));
}

function parseRpc(data) {
  if (!data || typeof data !== "object") return { ok: false, error: "Invalid response" };
  const d = /** @type {Record<string, unknown>} */ (data);
  if (d.ok === true && d.snapshot) {
    const snap = normalizeSnakesAuthoritativeSnapshot(/** @type {Record<string, unknown>} */ (d.snapshot));
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
 * @param {{ signal?: AbortSignal, participantKey?: string|null }} [_opts]
 */
export async function fetchOv2SnakesLaddersAuthoritativeSnapshot(roomId, _opts) {
  if (!roomId) return null;
  const participantKey = _opts?.participantKey != null ? String(_opts.participantKey).trim() : "";
  try {
    const { data, error } = await supabase.rpc("ov2_snakes_ladders_get_snapshot", {
      p_room_id: roomId,
      p_participant_key: participantKey,
    });
    if (error) {
      if (isBackendUnavailable(error)) return null;
      return null;
    }
    if (!data || typeof data !== "object") return null;
    const body = /** @type {Record<string, unknown>} */ (data);
    if (body.ok !== true || !body.snapshot) return null;
    return normalizeSnakesAuthoritativeSnapshot(/** @type {Record<string, unknown>} */ (body.snapshot));
  } catch (e) {
    if (isBackendUnavailable(e)) return null;
    return null;
  }
}

/**
 * @param {string} roomId
 * @param {{ participantKey?: string|null, onSnapshot: (s: import("../ludo/ov2LudoSessionAdapter").Ov2LudoAuthoritativeSnapshot) => void, onError?: (e: Error) => void }} handlers
 */
export function subscribeOv2SnakesLaddersAuthoritativeSnapshot(roomId, handlers) {
  if (!roomId || typeof handlers?.onSnapshot !== "function") return () => {};
  const pk = handlers.participantKey != null ? String(handlers.participantKey).trim() : "";
  let cancelled = false;
  const pushLatest = async () => {
    if (cancelled) return;
    const snap = await fetchOv2SnakesLaddersAuthoritativeSnapshot(roomId, { participantKey: pk });
    if (snap && !cancelled) handlers.onSnapshot(snap);
  };
  try {
    const channel = supabase
      .channel(`ov2-snakes:${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ov2_snakes_ladders_sessions", filter: `room_id=eq.${roomId}` },
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
export async function requestOv2SnakesLaddersOpenSession(roomId, participantKey, _opts) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  const leader = _opts?.presenceLeaderKey != null ? String(_opts.presenceLeaderKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "room_id and participant_key required" };
  if (!leader) return { ok: false, error: "presence leader key required" };
  try {
    const { data, error } = await supabase.rpc("ov2_snakes_ladders_open_session", {
      p_room_id: roomId,
      p_participant_key: pk,
      p_presence_leader_key: leader,
    });
    if (error) {
      if (isBackendUnavailable(error)) return { ok: false, error: "Snakes backend not available" };
      return { ok: false, error: error.message || String(error) };
    }
    return parseRpc(data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * @param {string} roomId
 * @param {string} _sessionId
 * @param {{ participantKey?: string|null, revision?: string|number }} [_opts]
 */
export async function requestOv2SnakesLaddersRoll(roomId, _sessionId, _opts) {
  void _sessionId;
  const pk = _opts?.participantKey != null ? String(_opts.participantKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "room_id and participant_key required" };
  const rev = _opts?.revision;
  try {
    const { data, error } = await supabase.rpc("ov2_snakes_ladders_roll", {
      p_room_id: roomId,
      p_participant_key: pk,
      p_expected_revision: rev != null && rev !== "" ? Number(rev) : null,
    });
    if (error) return { ok: false, error: error.message || String(error) };
    return parseRpc(data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * @param {string} roomId
 * @param {string} _sessionId
 * @param {{ participantKey?: string|null, revision?: string|number }} [_opts]
 */
export async function requestOv2SnakesLaddersCompleteMove(roomId, _sessionId, _opts) {
  void _sessionId;
  const pk = _opts?.participantKey != null ? String(_opts.participantKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "room_id and participant_key required" };
  const rev = _opts?.revision;
  try {
    const { data, error } = await supabase.rpc("ov2_snakes_ladders_complete_move", {
      p_room_id: roomId,
      p_participant_key: pk,
      p_expected_revision: rev != null && rev !== "" ? Number(rev) : null,
    });
    if (error) return { ok: false, error: error.message || String(error) };
    return parseRpc(data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * @param {string} roomId
 * @param {string} _sessionId
 * @param {{ participantKey?: string|null, revision?: string|number }} [_opts]
 */
export async function requestOv2SnakesLaddersOfferDouble(roomId, _sessionId, _opts) {
  void _sessionId;
  const pk = _opts?.participantKey != null ? String(_opts.participantKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "room_id and participant_key required" };
  const rev = _opts?.revision;
  try {
    const { data, error } = await supabase.rpc("ov2_snakes_ladders_offer_double", {
      p_room_id: roomId,
      p_participant_key: pk,
      p_expected_revision: rev != null && rev !== "" ? Number(rev) : null,
    });
    if (error) return { ok: false, error: error.message || String(error) };
    return parseRpc(data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * @param {string} roomId
 * @param {string} _sessionId
 * @param {"accept"|"decline"} answer
 * @param {{ participantKey?: string|null, revision?: string|number }} [_opts]
 */
export async function requestOv2SnakesLaddersRespondDouble(roomId, _sessionId, answer, _opts) {
  void _sessionId;
  const pk = _opts?.participantKey != null ? String(_opts.participantKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "room_id and participant_key required" };
  const rev = _opts?.revision;
  try {
    const { data, error } = await supabase.rpc("ov2_snakes_ladders_respond_double", {
      p_room_id: roomId,
      p_participant_key: pk,
      p_answer: answer,
      p_expected_revision: rev != null && rev !== "" ? Number(rev) : null,
    });
    if (error) return { ok: false, error: error.message || String(error) };
    return parseRpc(data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * @param {string} roomId
 * @param {number} expiredSeat
 * @param {{ revision?: string|number }} [_opts]
 */
export async function requestOv2SnakesLaddersHandleDoubleTimeout(roomId, expiredSeat, _opts) {
  const rev = _opts?.revision;
  try {
    const { data, error } = await supabase.rpc("ov2_snakes_ladders_handle_double_timeout", {
      p_room_id: roomId,
      p_expired_seat: Number(expiredSeat),
      p_expected_revision: rev != null && rev !== "" ? Number(rev) : null,
    });
    if (error) return { ok: false, error: error.message || String(error) };
    return parseRpc(data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * @param {string} roomId
 * @param {number} turnSeat
 * @param {{ participantKey?: string|null, revision?: string|number, isGone?: boolean }} [_opts]
 */
export async function requestOv2SnakesLaddersMarkMissedTurn(roomId, turnSeat, _opts) {
  const rev = _opts?.revision;
  const turnParticipantKey =
    _opts && "participantKey" in _opts && _opts.participantKey != null ? String(_opts.participantKey).trim() : "";
  const isGone = _opts && "isGone" in _opts ? _opts.isGone === true : false;
  try {
    const { data, error } = await supabase.rpc("ov2_snakes_ladders_mark_missed_turn", {
      p_room_id: roomId,
      p_turn_seat: Number(turnSeat),
      p_turn_participant_key: turnParticipantKey,
      p_turn_is_gone: isGone,
      p_expected_revision: rev != null && rev !== "" ? Number(rev) : null,
    });
    if (error) return { ok: false, error: error.message || String(error) };
    return parseRpc(data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
