/**
 * OV2 Goal Duel — RPC + Realtime boundary (no React).
 */

import { supabaseMP as supabase } from "../../supabaseClients";

export { OV2_GOAL_DUEL_PRODUCT_GAME_ID } from "./ov2GoalDuelStakes";

export function isOv2GoalDuelBackendUnavailableError(err) {
  const code = err && typeof err === "object" ? /** @type {{ code?: string }} */ (err).code : undefined;
  const msg = String(err && typeof err === "object" && "message" in err ? err.message : err || "").toLowerCase();
  if (code === "PGRST202" || code === "42P01" || code === "42704" || code === "42883") return true;
  if (msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("undefined table")) return true;
  return false;
}

/**
 * @param {Record<string, unknown>} raw
 */
export function normalizeOv2GoalDuelSnapshot(raw) {
  if (!raw || typeof raw !== "object") return null;
  let mySeat = null;
  const myRaw = raw.mySeat;
  if (myRaw !== null && myRaw !== undefined && myRaw !== "null") {
    const n = Number(myRaw);
    if (Number.isInteger(n) && (n === 0 || n === 1)) mySeat = n;
  }
  let winnerSeat = null;
  const wRaw = raw.winnerSeat;
  if (wRaw !== null && wRaw !== undefined && wRaw !== "null") {
    const w = Number(wRaw);
    if (Number.isInteger(w) && (w === 0 || w === 1)) winnerSeat = w;
  }
  const pub = raw.public && typeof raw.public === "object" ? /** @type {Record<string, unknown>} */ (raw.public) : {};

  return {
    revision: raw.revision != null ? Number(raw.revision) : 0,
    sessionId: String(raw.sessionId ?? ""),
    roomId: String(raw.roomId ?? ""),
    phase: String(raw.phase ?? ""),
    mySeat,
    public: pub,
    score0: raw.score0 != null ? Math.floor(Number(raw.score0)) : 0,
    score1: raw.score1 != null ? Math.floor(Number(raw.score1)) : 0,
    myScore:
      mySeat === 0
        ? Math.floor(Number(raw.score0 ?? 0))
        : mySeat === 1
          ? Math.floor(Number(raw.score1 ?? 0))
          : raw.myScore != null
            ? Math.floor(Number(raw.myScore))
            : null,
    matchEndMs: raw.matchEndMs != null && Number.isFinite(Number(raw.matchEndMs)) ? Math.floor(Number(raw.matchEndMs)) : null,
    winnerSeat,
    result: raw.result && typeof raw.result === "object" ? /** @type {Record<string, unknown>} */ (raw.result) : null,
  };
}

function parseSnapshotRpc(data) {
  if (!data || typeof data !== "object") {
    return { ok: false, error: "Invalid response" };
  }
  const d = /** @type {Record<string, unknown>} */ (data);
  if (d.ok === true && d.snapshot) {
    const snap = normalizeOv2GoalDuelSnapshot(/** @type {Record<string, unknown>} */ (d.snapshot));
    if (!snap) return { ok: false, error: "Invalid snapshot" };
    return { ok: true, snapshot: snap };
  }
  if (d.ok === false) {
    return {
      ok: false,
      error: typeof d.message === "string" ? d.message : "Request failed",
      code: typeof d.code === "string" ? d.code : undefined,
      revision: d.revision != null ? Number(d.revision) : undefined,
    };
  }
  return { ok: false, error: "Invalid response" };
}

/**
 * @param {string} roomId
 * @param {{ participantKey?: string|null }} [_opts]
 */
export async function fetchOv2GoalDuelSnapshot(roomId, _opts) {
  if (!roomId) return null;
  const pk = _opts?.participantKey != null ? String(_opts.participantKey).trim() : "";
  try {
    const { data, error } = await supabase.rpc("ov2_goal_duel_get_snapshot", {
      p_room_id: roomId,
      p_participant_key: pk,
    });
    if (error) {
      if (isOv2GoalDuelBackendUnavailableError(error)) return null;
      return null;
    }
    const body = /** @type {Record<string, unknown>} */ (data);
    if (body?.ok !== true || !body.snapshot) return null;
    return normalizeOv2GoalDuelSnapshot(/** @type {Record<string, unknown>} */ (body.snapshot));
  } catch (e) {
    if (isOv2GoalDuelBackendUnavailableError(e)) return null;
    return null;
  }
}

/**
 * @param {string} roomId
 * @param {{ participantKey?: string|null, onSnapshot: (s: NonNullable<ReturnType<typeof normalizeOv2GoalDuelSnapshot>>) => void, onError?: (e: Error) => void }} handlers
 */
export function subscribeOv2GoalDuelSnapshot(roomId, handlers) {
  if (!roomId || typeof handlers?.onSnapshot !== "function") {
    return () => {};
  }
  const pk = handlers.participantKey != null ? String(handlers.participantKey).trim() : "";
  let cancelled = false;
  const pushLatest = async () => {
    if (cancelled) return;
    const snap = await fetchOv2GoalDuelSnapshot(roomId, { participantKey: pk });
    if (snap && !cancelled) handlers.onSnapshot(snap);
  };
  try {
    const channel = supabase
      .channel(`ov2-goal-duel:${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ov2_goal_duel_sessions", filter: `room_id=eq.${roomId}` },
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
export async function requestOv2GoalDuelOpenSession(roomId, participantKey, _opts) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  const leader = _opts?.presenceLeaderKey != null ? String(_opts.presenceLeaderKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "room_id and participant_key required" };
  if (!leader) return { ok: false, error: "presence leader key required" };
  try {
    const { data, error } = await supabase.rpc("ov2_goal_duel_open_session", {
      p_room_id: roomId,
      p_participant_key: pk,
      p_presence_leader_key: leader,
    });
    if (error) {
      if (isOv2GoalDuelBackendUnavailableError(error)) {
        return { ok: false, error: "Goal Duel backend not available (migrations not applied?)" };
      }
      return { ok: false, error: error.message || String(error) };
    }
    return parseSnapshotRpc(data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function requestOv2GoalDuelPing(roomId, participantKey, _opts) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "Missing room or participant" };
  const rev = _opts?.revision;
  try {
    const { data, error } = await supabase.rpc("ov2_goal_duel_ping", {
      p_room_id: roomId,
      p_participant_key: pk,
      p_expected_revision: rev != null && rev !== "" ? Number(rev) : null,
    });
    if (error) {
      if (isOv2GoalDuelBackendUnavailableError(error)) return { ok: false, error: "Backend not available" };
      return { ok: false, error: error.message || String(error) };
    }
    return parseSnapshotRpc(data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * @param {boolean} l
 * @param {boolean} r
 * @param {boolean} j
 * @param {boolean} k
 * @param {{ revision?: unknown }} coordCtx
 */
export async function requestOv2GoalDuelStep(roomId, participantKey, l, r, j, k, coordCtx) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "Missing room or participant" };
  const rev = coordCtx?.revision;
  try {
    const { data, error } = await supabase.rpc("ov2_goal_duel_step", {
      p_room_id: roomId,
      p_participant_key: pk,
      p_l: Boolean(l),
      p_r: Boolean(r),
      p_j: Boolean(j),
      p_k: Boolean(k),
      p_expected_revision: rev != null && rev !== "" ? Number(rev) : null,
    });
    if (error) {
      if (isOv2GoalDuelBackendUnavailableError(error)) return { ok: false, error: "Backend not available" };
      return { ok: false, error: error.message || String(error) };
    }
    return parseSnapshotRpc(data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function requestOv2GoalDuelMarkMatchEvents(roomId, participantKey, _opts) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "Missing room or participant" };
  const rev = _opts?.revision;
  try {
    const { data, error } = await supabase.rpc("ov2_goal_duel_mark_match_events", {
      p_room_id: roomId,
      p_participant_key: pk,
      p_expected_revision: rev != null && rev !== "" ? Number(rev) : null,
    });
    if (error) {
      if (isOv2GoalDuelBackendUnavailableError(error)) return { ok: false, error: "Backend not available" };
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

export async function requestOv2GoalDuelRequestRematch(roomId, participantKey) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "Missing room or participant" };
  try {
    const { data, error } = await supabase.rpc("ov2_goal_duel_request_rematch", {
      p_room_id: roomId,
      p_participant_key: pk,
    });
    if (error) return { ok: false, error: error.message || String(error) };
    return parseIntentOk(data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function requestOv2GoalDuelCancelRematch(roomId, participantKey) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "Missing room or participant" };
  try {
    const { data, error } = await supabase.rpc("ov2_goal_duel_cancel_rematch", {
      p_room_id: roomId,
      p_participant_key: pk,
    });
    if (error) return { ok: false, error: error.message || String(error) };
    return parseIntentOk(data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function requestOv2GoalDuelStartNextMatch(roomId, participantKey, expectedMatchSeq) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "Missing room or participant" };
  try {
    const { data, error } = await supabase.rpc("ov2_goal_duel_start_next_match", {
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
