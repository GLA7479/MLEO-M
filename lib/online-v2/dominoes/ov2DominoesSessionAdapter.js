/**
 * OV2 Dominoes — RPC + Realtime boundary (no React).
 */

import { supabaseMP as supabase } from "../../supabaseClients";

export const OV2_DOMINOES_PRODUCT_GAME_ID = "ov2_dominoes";

export function isOv2DominoesBackendUnavailableError(err) {
  const code = err && typeof err === "object" ? /** @type {{ code?: string }} */ (err).code : undefined;
  const msg = String(err && typeof err === "object" && "message" in err ? err.message : err || "").toLowerCase();
  if (code === "PGRST202" || code === "42P01" || code === "42704" || code === "42883") return true;
  if (msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("undefined table")) return true;
  return false;
}

/**
 * @param {Record<string, unknown>} raw
 */
export function normalizeOv2DominoesSnapshot(raw) {
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
  const missedTurns =
    raw.missedTurns && typeof raw.missedTurns === "object"
      ? /** @type {Record<string, number>} */ (raw.missedTurns)
      : null;
  const line = Array.isArray(raw.line) ? raw.line : raw.board?.line;
  const board = raw.board && typeof raw.board === "object" ? /** @type {Record<string, unknown>} */ (raw.board) : {};
  const myHand = Array.isArray(raw.myHand) ? raw.myHand : [];
  const phaseNorm = String(raw.phase ?? "").toLowerCase();
  const rawResult = raw.result;
  const result =
    phaseNorm === "finished" && rawResult != null && typeof rawResult === "object" && rawResult !== null
      ? /** @type {Record<string, unknown>} */ (rawResult)
      : null;
  return {
    revision: raw.revision != null ? Number(raw.revision) : 0,
    sessionId: String(raw.sessionId ?? ""),
    roomId: String(raw.roomId ?? ""),
    phase: String(raw.phase ?? ""),
    activeSeats: Array.isArray(raw.activeSeats) ? raw.activeSeats.map(x => Number(x)) : [0, 1],
    mySeat,
    board,
    line: Array.isArray(line) ? line : [],
    turnSeat: raw.turnSeat != null ? Number(raw.turnSeat) : null,
    winnerSeat,
    myHand,
    oppHandCount: raw.oppHandCount != null ? Math.max(0, Math.floor(Number(raw.oppHandCount))) : 0,
    boneyardCount: raw.boneyardCount != null ? Math.max(0, Math.floor(Number(raw.boneyardCount))) : 0,
    stakeMultiplier: raw.stakeMultiplier != null ? Math.max(1, Math.min(16, Math.floor(Number(raw.stakeMultiplier)))) : 1,
    doublesAccepted: raw.doublesAccepted != null ? Math.max(0, Math.floor(Number(raw.doublesAccepted))) : 0,
    pendingDouble:
      raw.pendingDouble && typeof raw.pendingDouble === "object" && raw.pendingDouble !== null
        ? /** @type {Record<string, unknown>} */ (raw.pendingDouble)
        : null,
    canClientPlayTiles: raw.canClientPlayTiles === true,
    canOfferDouble: raw.canOfferDouble === true,
    mustRespondDouble: raw.mustRespondDouble === true,
    turnDeadline,
    missedTurns,
    result,
  };
}

function parseSnapshotRpc(data) {
  if (!data || typeof data !== "object") {
    return { ok: false, error: "Invalid response" };
  }
  const d = /** @type {Record<string, unknown>} */ (data);
  if (d.ok === true && d.snapshot) {
    const snap = normalizeOv2DominoesSnapshot(/** @type {Record<string, unknown>} */ (d.snapshot));
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
export async function fetchOv2DominoesSnapshot(roomId, _opts) {
  if (!roomId) return null;
  const pk = _opts?.participantKey != null ? String(_opts.participantKey).trim() : "";
  try {
    const { data, error } = await supabase.rpc("ov2_dominoes_get_snapshot", {
      p_room_id: roomId,
      p_participant_key: pk,
    });
    if (error) {
      if (isOv2DominoesBackendUnavailableError(error)) return null;
      return null;
    }
    const body = /** @type {Record<string, unknown>} */ (data);
    if (body?.ok !== true || !body.snapshot) return null;
    return normalizeOv2DominoesSnapshot(/** @type {Record<string, unknown>} */ (body.snapshot));
  } catch (e) {
    if (isOv2DominoesBackendUnavailableError(e)) return null;
    return null;
  }
}

/**
 * @param {string} roomId
 * @param {{ participantKey?: string|null, onSnapshot: (s: NonNullable<ReturnType<typeof normalizeOv2DominoesSnapshot>>) => void, onError?: (e: Error) => void }} handlers
 */
export function subscribeOv2DominoesSnapshot(roomId, handlers) {
  if (!roomId || typeof handlers?.onSnapshot !== "function") {
    return () => {};
  }
  const pk = handlers.participantKey != null ? String(handlers.participantKey).trim() : "";
  let cancelled = false;
  const pushLatest = async () => {
    if (cancelled) return;
    const snap = await fetchOv2DominoesSnapshot(roomId, { participantKey: pk });
    if (snap && !cancelled) handlers.onSnapshot(snap);
  };
  try {
    const channel = supabase
      .channel(`ov2-dominoes:${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ov2_dominoes_sessions", filter: `room_id=eq.${roomId}` },
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
export async function requestOv2DominoesOpenSession(roomId, participantKey, _opts) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  const leader = _opts?.presenceLeaderKey != null ? String(_opts.presenceLeaderKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "room_id and participant_key required" };
  if (!leader) return { ok: false, error: "presence leader key required" };
  try {
    const { data, error } = await supabase.rpc("ov2_dominoes_open_session", {
      p_room_id: roomId,
      p_participant_key: pk,
      p_presence_leader_key: leader,
    });
    if (error) {
      if (isOv2DominoesBackendUnavailableError(error)) {
        return { ok: false, error: "Dominoes backend not available (migrations not applied?)" };
      }
      return { ok: false, error: error.message || String(error) };
    }
    return parseSnapshotRpc(data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function requestOv2DominoesMarkTurnTimeout(roomId, participantKey, _opts) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "Missing room or participant" };
  const rev = _opts?.revision;
  try {
    const { data, error } = await supabase.rpc("ov2_dominoes_mark_turn_timeout", {
      p_room_id: roomId,
      p_participant_key: pk,
      p_expected_revision: rev != null && rev !== "" ? Number(rev) : null,
    });
    if (error) {
      if (isOv2DominoesBackendUnavailableError(error)) return { ok: false, error: "Dominoes backend not available" };
      return { ok: false, error: error.message || String(error) };
    }
    return parseSnapshotRpc(data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function requestOv2DominoesPlayTile(roomId, participantKey, handIndex, side, _opts) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "Missing room or participant" };
  const rev = _opts?.revision;
  try {
    const { data, error } = await supabase.rpc("ov2_dominoes_play_tile", {
      p_room_id: roomId,
      p_participant_key: pk,
      p_hand_index: Math.floor(Number(handIndex)),
      p_side: String(side || "").trim().toLowerCase(),
      p_expected_revision: rev != null && rev !== "" ? Number(rev) : null,
    });
    if (error) {
      if (isOv2DominoesBackendUnavailableError(error)) return { ok: false, error: "Dominoes backend not available" };
      return { ok: false, error: error.message || String(error) };
    }
    return parseSnapshotRpc(data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function requestOv2DominoesDraw(roomId, participantKey, _opts) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "Missing room or participant" };
  const rev = _opts?.revision;
  try {
    const { data, error } = await supabase.rpc("ov2_dominoes_draw", {
      p_room_id: roomId,
      p_participant_key: pk,
      p_expected_revision: rev != null && rev !== "" ? Number(rev) : null,
    });
    if (error) {
      if (isOv2DominoesBackendUnavailableError(error)) return { ok: false, error: "Dominoes backend not available" };
      return { ok: false, error: error.message || String(error) };
    }
    return parseSnapshotRpc(data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function requestOv2DominoesPass(roomId, participantKey, _opts) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "Missing room or participant" };
  const rev = _opts?.revision;
  try {
    const { data, error } = await supabase.rpc("ov2_dominoes_pass", {
      p_room_id: roomId,
      p_participant_key: pk,
      p_expected_revision: rev != null && rev !== "" ? Number(rev) : null,
    });
    if (error) {
      if (isOv2DominoesBackendUnavailableError(error)) return { ok: false, error: "Dominoes backend not available" };
      return { ok: false, error: error.message || String(error) };
    }
    return parseSnapshotRpc(data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function requestOv2DominoesOfferDouble(roomId, participantKey, _opts) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "Missing room or participant" };
  const rev = _opts?.revision;
  try {
    const { data, error } = await supabase.rpc("ov2_dominoes_offer_double", {
      p_room_id: roomId,
      p_participant_key: pk,
      p_expected_revision: rev != null && rev !== "" ? Number(rev) : null,
    });
    if (error) {
      if (isOv2DominoesBackendUnavailableError(error)) return { ok: false, error: "Dominoes backend not available" };
      return { ok: false, error: error.message || String(error) };
    }
    return parseSnapshotRpc(data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function requestOv2DominoesRespondDouble(roomId, participantKey, accept, _opts) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "Missing room or participant" };
  const rev = _opts?.revision;
  try {
    const { data, error } = await supabase.rpc("ov2_dominoes_respond_double", {
      p_room_id: roomId,
      p_participant_key: pk,
      p_accept: Boolean(accept),
      p_expected_revision: rev != null && rev !== "" ? Number(rev) : null,
    });
    if (error) {
      if (isOv2DominoesBackendUnavailableError(error)) return { ok: false, error: "Dominoes backend not available" };
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

export async function requestOv2DominoesRequestRematch(roomId, participantKey) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "Missing room or participant" };
  try {
    const { data, error } = await supabase.rpc("ov2_dominoes_request_rematch", {
      p_room_id: roomId,
      p_participant_key: pk,
    });
    if (error) return { ok: false, error: error.message || String(error) };
    return parseIntentOk(data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function requestOv2DominoesCancelRematch(roomId, participantKey) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "Missing room or participant" };
  try {
    const { data, error } = await supabase.rpc("ov2_dominoes_cancel_rematch", {
      p_room_id: roomId,
      p_participant_key: pk,
    });
    if (error) return { ok: false, error: error.message || String(error) };
    return parseIntentOk(data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function requestOv2DominoesStartNextMatch(roomId, participantKey, expectedMatchSeq) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "Missing room or participant" };
  try {
    const { data, error } = await supabase.rpc("ov2_dominoes_start_next_match", {
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
