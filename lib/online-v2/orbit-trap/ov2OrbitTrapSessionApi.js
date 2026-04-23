/**
 * OV2 Orbit Trap — RPC + Realtime boundary (no React).
 */

import { supabaseMP as supabase } from "../../supabaseClients";

export const OV2_ORBIT_TRAP_PRODUCT_GAME_ID = "ov2_orbit_trap";

/**
 * Build engine-shaped state from authoritative JSON (for client-side legal hints only).
 * @param {Record<string, unknown>|null|undefined} rpcState
 */
export function orbitTrapGameStateFromRpc(rpcState) {
  if (!rpcState || typeof rpcState !== "object") return null;
  const fixedRaw = rpcState.fixedOrbKeys;
  const fixedArr = Array.isArray(fixedRaw) ? fixedRaw.map(x => String(x)) : [];
  const actFromState = rpcState.activeSeats;
  let activeSeatList = Array.isArray(actFromState)
    ? [...new Set(actFromState.map(x => Math.floor(Number(x))).filter(x => Number.isInteger(x) && x >= 0 && x <= 3))].sort(
        (a, b) => a - b
      )
    : [];
  if (activeSeatList.length < 2) activeSeatList = [0, 1, 2, 3];
  const activeSet = new Set(activeSeatList);

  const playersRaw = rpcState.players;
  const players = Array.isArray(playersRaw)
    ? playersRaw.map((p, seatIdx) => {
        const o = p && typeof p === "object" ? /** @type {Record<string, unknown>} */ (p) : {};
        const inPlay =
          typeof o.inPlay === "boolean" ? o.inPlay : activeSet.has(seatIdx);
        return {
          ring: String(o.ring ?? "outer"),
          slot: Math.floor(Number(o.slot) || 0),
          orbsHeld: Math.floor(Number(o.orbsHeld) || 0),
          lockToken: Boolean(o.lockToken),
          stunActive: Boolean(o.stunActive),
          trapSlowPending: Boolean(o.trapSlowPending),
          boostPending: Boolean(o.boostPending),
          inPlay,
        };
      })
    : [];
  while (players.length < 4) {
    players.push({
      ring: "outer",
      slot: 0,
      orbsHeld: 0,
      lockToken: false,
      stunActive: false,
      trapSlowPending: false,
      boostPending: false,
    });
  }
  const looseRaw = rpcState.looseOrbs;
  const looseOrbs = Array.isArray(looseRaw)
    ? looseRaw.map(o => {
        const x = o && typeof o === "object" ? /** @type {Record<string, unknown>} */ (o) : {};
        return { ring: String(x.ring ?? "outer"), slot: Math.floor(Number(x.slot) || 0) };
      })
    : [];
  const rl = rpcState.ringLock;
  let ringLock = null;
  if (rl && typeof rl === "object" && rl !== null && !Array.isArray(rl)) {
    const r = /** @type {Record<string, unknown>} */ (rl);
    if (typeof r.ring === "string" && Number.isInteger(Number(r.ownerSeat))) {
      ringLock = { ring: r.ring, ownerSeat: Math.floor(Number(r.ownerSeat)) };
    }
  }
  let winnerSeat = null;
  if (rpcState.winnerSeat !== null && rpcState.winnerSeat !== undefined && rpcState.winnerSeat !== "null") {
    const w = Number(rpcState.winnerSeat);
    if (Number.isInteger(w) && w >= 0 && w <= 3) winnerSeat = w;
  }
  return {
    revision: rpcState.revision != null ? Number(rpcState.revision) : 0,
    phase: String(rpcState.phase ?? "") === "finished" ? "finished" : "playing",
    turnSeat: Math.floor(Number(rpcState.turnSeat) || 0) % 4,
    winnerSeat,
    players: players.slice(0, 4),
    looseOrbs,
    fixedOrbKeys: new Set(fixedArr),
    ringLock,
    startedTurnOnInner: Boolean(rpcState.startedTurnOnInner),
    activeSeats: activeSeatList,
  };
}

/**
 * @param {unknown} err
 */
export function isOv2OrbitTrapBackendUnavailableError(err) {
  const code = err && typeof err === "object" ? /** @type {{ code?: string }} */ (err).code : undefined;
  const msg = String(err && typeof err === "object" && "message" in err ? err.message : err || "").toLowerCase();
  if (code === "PGRST202" || code === "42P01" || code === "42704" || code === "42883") return true;
  if (msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("undefined table")) return true;
  return false;
}

/**
 * @param {Record<string, unknown>} raw
 */
export function normalizeOv2OrbitTrapSnapshot(raw) {
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
  const act = raw.activeSeats;
  const activeSeats = Array.isArray(act) ? act.map(x => Number(x)).filter(x => Number.isInteger(x) && x >= 0 && x <= 3) : [];
  const st = raw.state && typeof raw.state === "object" ? /** @type {Record<string, unknown>} */ (raw.state) : null;

  return {
    sessionId: String(raw.sessionId ?? ""),
    roomId: String(raw.roomId ?? ""),
    matchSeq: raw.matchSeq != null ? Number(raw.matchSeq) : 0,
    revision: raw.revision != null ? Number(raw.revision) : 0,
    phase: String(raw.phase ?? ""),
    status: String(raw.status ?? ""),
    state: st,
    mySeat,
    winnerSeat,
    activeSeats,
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
    const snap = normalizeOv2OrbitTrapSnapshot(/** @type {Record<string, unknown>} */ (d.snapshot));
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
 * @returns {Promise<{ snapshot: NonNullable<ReturnType<typeof normalizeOv2OrbitTrapSnapshot>>|null, rpcError: string|null }>}
 */
export async function fetchOv2OrbitTrapSnapshotDetailed(roomId, _opts) {
  if (!roomId) return { snapshot: null, rpcError: null };
  const pk = _opts?.participantKey != null ? String(_opts.participantKey).trim() : "";
  try {
    const { data, error } = await supabase.rpc("ov2_orbit_trap_get_snapshot", {
      p_room_id: roomId,
      p_participant_key: pk,
    });
    if (error) {
      if (isOv2OrbitTrapBackendUnavailableError(error)) {
        return { snapshot: null, rpcError: "Orbit Trap backend not available (migrations not applied?)" };
      }
      return { snapshot: null, rpcError: error.message || String(error) };
    }
    const body = /** @type {Record<string, unknown>} */ (data);
    if (body?.ok !== true || !body.snapshot) {
      const msg =
        typeof body?.message === "string"
          ? body.message
          : body?.ok === false
            ? "Snapshot request rejected"
            : "Invalid snapshot response";
      return { snapshot: null, rpcError: msg };
    }
    const snap = normalizeOv2OrbitTrapSnapshot(/** @type {Record<string, unknown>} */ (body.snapshot));
    return { snapshot: snap, rpcError: snap ? null : "Invalid snapshot" };
  } catch (e) {
    if (isOv2OrbitTrapBackendUnavailableError(e)) {
      return { snapshot: null, rpcError: "Orbit Trap backend not available (migrations not applied?)" };
    }
    return { snapshot: null, rpcError: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * @param {string} roomId
 * @param {{ participantKey?: string|null }} [_opts]
 */
export async function fetchOv2OrbitTrapSnapshot(roomId, _opts) {
  const { snapshot } = await fetchOv2OrbitTrapSnapshotDetailed(roomId, _opts);
  return snapshot;
}

/**
 * @param {string} roomId
 * @param {{ participantKey?: string|null, activeSessionId?: string|null, onSnapshot: (s: NonNullable<ReturnType<typeof normalizeOv2OrbitTrapSnapshot>>) => void, onError?: (e: Error) => void }} handlers
 */
export function subscribeOv2OrbitTrapSnapshot(roomId, handlers) {
  if (!roomId || typeof handlers?.onSnapshot !== "function") {
    return () => {};
  }
  const pk = handlers.participantKey != null ? String(handlers.participantKey).trim() : "";
  const sid =
    handlers.activeSessionId != null && String(handlers.activeSessionId).trim() !== ""
      ? String(handlers.activeSessionId).trim()
      : "";
  let cancelled = false;
  let lastAppliedRevision = -1;

  const pushLatest = async () => {
    if (cancelled) return;
    const { snapshot: snap, rpcError } = await fetchOv2OrbitTrapSnapshotDetailed(roomId, { participantKey: pk });
    if (rpcError && handlers.onError && !cancelled) {
      handlers.onError(new Error(rpcError));
    }
    if (snap && !cancelled) {
      if (snap.revision < lastAppliedRevision) {
        return;
      }
      lastAppliedRevision = snap.revision;
      handlers.onSnapshot(snap);
    }
  };

  try {
    const channel = supabase
      .channel(`ov2-orbit-trap:${roomId}:${sid || "no_sess"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ov2_orbit_trap_sessions", filter: `room_id=eq.${roomId}` },
        () => {
          void pushLatest();
        }
      );
    if (sid) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ov2_orbit_trap_seats", filter: `session_id=eq.${sid}` },
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
    void pushLatest();
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
export async function requestOv2OrbitTrapOpenSession(roomId, participantKey, opts) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  const ms = opts?.expectedRoomMatchSeq != null ? Number(opts.expectedRoomMatchSeq) : NaN;
  if (!roomId || !pk || !Number.isFinite(ms)) {
    return { ok: false, error: "room_id, participant_key, and expectedRoomMatchSeq required" };
  }
  try {
    const { data, error } = await supabase.rpc("ov2_orbit_trap_open_session", {
      p_room_id: roomId,
      p_participant_key: pk,
      p_expected_room_match_seq: Math.floor(ms),
    });
    if (error) {
      if (isOv2OrbitTrapBackendUnavailableError(error)) {
        return { ok: false, error: "Orbit Trap backend not available (migrations not applied?)" };
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
 * @param {Record<string, unknown>} action
 * @param {{ expectedRevision?: number|string|null }} [_coord]
 */
export async function requestOv2OrbitTrapApplyAction(roomId, participantKey, action, _coord) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  if (!roomId || !pk || !action || typeof action !== "object") {
    return { ok: false, error: "room_id, participant_key, and action required" };
  }
  const rev = _coord?.expectedRevision;
  const pExpected = rev != null && rev !== "" && Number.isFinite(Number(rev)) ? Math.floor(Number(rev)) : null;
  try {
    const { data, error } = await supabase.rpc("ov2_orbit_trap_apply_action", {
      p_room_id: roomId,
      p_participant_key: pk,
      p_action: action,
      p_expected_revision: pExpected,
    });
    if (error) {
      if (isOv2OrbitTrapBackendUnavailableError(error)) {
        return { ok: false, error: "Orbit Trap backend not available (migrations not applied?)" };
      }
      return { ok: false, error: error.message || String(error) };
    }
    const body = /** @type {Record<string, unknown>} */ (data);
    if (body?.ok === true && body.snapshot) {
      const snap = normalizeOv2OrbitTrapSnapshot(/** @type {Record<string, unknown>} */ (body.snapshot));
      if (!snap) return { ok: false, error: "Invalid snapshot" };
      return { ok: true, snapshot: snap };
    }
    if (body?.ok === false) {
      return {
        ok: false,
        error: typeof body.message === "string" ? body.message : "Action rejected",
        code: typeof body.code === "string" ? body.code : undefined,
        revision: body.revision != null ? Number(body.revision) : undefined,
      };
    }
    return { ok: false, error: "Invalid response" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
