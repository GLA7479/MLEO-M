/**
 * OV2 Tanks V1 — RPC boundary (no React).
 */

import { supabaseMP as supabase } from "../../supabaseClients";
import { OV2_TANKS_PRODUCT_GAME_ID } from "./ov2TanksRulesConstants";

export { OV2_TANKS_PRODUCT_GAME_ID };

export function isOv2TanksBackendUnavailableError(err) {
  const code = err && typeof err === "object" ? /** @type {{ code?: string }} */ (err).code : undefined;
  const msg = String(err && typeof err === "object" && "message" in err ? err.message : err || "").toLowerCase();
  if (code === "PGRST202" || code === "42P01" || code === "42704" || code === "42883") return true;
  if (msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("undefined table")) return true;
  return false;
}

/**
 * @param {unknown} v
 * @returns {number[]}
 */
function coerceNumArray(v) {
  if (!Array.isArray(v)) return [];
  return v.map(x => Number(x)).filter(n => Number.isFinite(n));
}

/**
 * @param {Record<string, unknown>} raw
 */
export function normalizeOv2TanksSnapshot(raw) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  let mySeat = null;
  const myRaw = o.mySeat;
  if (myRaw !== null && myRaw !== undefined && myRaw !== "null") {
    const n = Number(myRaw);
    if (Number.isInteger(n) && (n === 0 || n === 1)) mySeat = n;
  }
  let winnerSeat = null;
  const wRaw = o.winnerSeat;
  if (wRaw !== null && wRaw !== undefined && wRaw !== "null") {
    const w = Number(wRaw);
    if (Number.isInteger(w) && (w === 0 || w === 1)) winnerSeat = w;
  }
  const pubIn = o.public && typeof o.public === "object" ? /** @type {Record<string, unknown>} */ (o.public) : {};
  const parity = o.parity && typeof o.parity === "object" ? /** @type {Record<string, unknown>} */ (o.parity) : {};

  const samples = coerceNumArray(pubIn.samples);
  const pub = { ...pubIn };
  if (samples.length) pub.samples = samples;

  const tanksRaw = pub.tanks;
  const tanks = [];
  if (Array.isArray(tanksRaw)) {
    for (let i = 0; i < tanksRaw.length; i += 1) {
      const t = tanksRaw[i];
      if (!t || typeof t !== "object") continue;
      const tr = /** @type {Record<string, unknown>} */ (t);
      const seat = Number(tr.seat);
      const x = Number(tr.x);
      const y = Number(tr.y);
      if (!Number.isInteger(seat) || (seat !== 0 && seat !== 1)) continue;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      tanks.push({ seat, x, y });
    }
  }
  if (tanks.length) pub.tanks = tanks;

  const serverNowMs = Number(o.serverNowMs);
  const turnMsRemaining = Number(o.turnMsRemaining);
  const isMyTurn = Boolean(o.isMyTurn);

  return {
    revision: o.revision != null ? Number(o.revision) : 0,
    sessionId: String(o.sessionId ?? ""),
    roomId: String(o.roomId ?? ""),
    phase: String(o.phase ?? ""),
    mySeat,
    winnerSeat,
    serverNowMs: Number.isFinite(serverNowMs) ? serverNowMs : 0,
    turnMsRemaining: Number.isFinite(turnMsRemaining) ? Math.max(0, turnMsRemaining) : 0,
    isMyTurn,
    public: pub,
    parity,
  };
}

/**
 * @param {unknown} data
 */
function parseSnapshotRpc(data) {
  if (!data || typeof data !== "object") {
    return { ok: false, error: "Invalid response" };
  }
  const d = /** @type {Record<string, unknown>} */ (data);
  if (d.ok === true && d.snapshot) {
    const snap = normalizeOv2TanksSnapshot(/** @type {Record<string, unknown>} */ (d.snapshot));
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
export async function fetchOv2TanksSnapshot(roomId, _opts) {
  if (!roomId) return null;
  const pk = _opts?.participantKey != null ? String(_opts.participantKey).trim() : "";
  try {
    const { data, error } = await supabase.rpc("ov2_tanks_get_snapshot", {
      p_room_id: roomId,
      p_participant_key: pk,
    });
    if (error) {
      if (isOv2TanksBackendUnavailableError(error)) return null;
      return null;
    }
    const body = /** @type {Record<string, unknown>} */ (data);
    if (body?.ok !== true || !body.snapshot) return null;
    return normalizeOv2TanksSnapshot(/** @type {Record<string, unknown>} */ (body.snapshot));
  } catch (e) {
    if (isOv2TanksBackendUnavailableError(e)) return null;
    return null;
  }
}

/**
 * @param {string} roomId
 * @param {{ participantKey?: string|null, onSnapshot: (s: NonNullable<ReturnType<typeof normalizeOv2TanksSnapshot>>) => void, onError?: (e: Error) => void }} handlers
 */
export function subscribeOv2TanksSnapshot(roomId, handlers) {
  if (!roomId || typeof handlers?.onSnapshot !== "function") {
    return () => {};
  }
  const pk = handlers.participantKey != null ? String(handlers.participantKey).trim() : "";
  let cancelled = false;
  const pushLatest = async () => {
    if (cancelled) return;
    const snap = await fetchOv2TanksSnapshot(roomId, { participantKey: pk });
    if (snap && !cancelled) handlers.onSnapshot(snap);
  };
  try {
    const channel = supabase
      .channel(`ov2-tanks:${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ov2_tanks_sessions", filter: `room_id=eq.${roomId}` },
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
export async function requestOv2TanksOpenSession(roomId, participantKey, _opts) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  const leader = _opts?.presenceLeaderKey != null ? String(_opts.presenceLeaderKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "room_id and participant_key required" };
  if (!leader) return { ok: false, error: "presence leader key required" };
  try {
    const { data, error } = await supabase.rpc("ov2_tanks_open_session", {
      p_room_id: roomId,
      p_participant_key: pk,
      p_presence_leader_key: leader,
    });
    if (error) {
      if (isOv2TanksBackendUnavailableError(error)) {
        return { ok: false, error: "Tanks backend not available (migrations not applied?)" };
      }
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
 */
export async function requestOv2TanksPing(roomId, participantKey) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "room_id and participant_key required" };
  try {
    const { data, error } = await supabase.rpc("ov2_tanks_ping", {
      p_room_id: roomId,
      p_participant_key: pk,
    });
    if (error) {
      if (isOv2TanksBackendUnavailableError(error)) {
        return { ok: false, error: "Tanks backend not available (migrations not applied?)" };
      }
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
 * @param {{ weapon: string, angleDeg: number, power: number }} shot
 */
export async function requestOv2TanksFire(roomId, participantKey, shot) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "room_id and participant_key required" };
  const weapon = String(shot?.weapon || "").trim();
  const angleDeg = Number(shot?.angleDeg);
  const power = Number(shot?.power);
  try {
    const { data, error } = await supabase.rpc("ov2_tanks_fire", {
      p_room_id: roomId,
      p_participant_key: pk,
      p_weapon: weapon,
      p_angle_deg: angleDeg,
      p_power: power,
    });
    if (error) {
      if (isOv2TanksBackendUnavailableError(error)) {
        return { ok: false, error: "Tanks backend not available (migrations not applied?)" };
      }
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
 */
export async function requestOv2TanksClaimSettlement(roomId, participantKey) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "room_id and participant_key required" };
  try {
    const { data, error } = await supabase.rpc("ov2_tanks_claim_settlement", {
      p_room_id: roomId,
      p_participant_key: pk,
    });
    if (error) {
      if (isOv2TanksBackendUnavailableError(error)) {
        return { ok: false, error: "Tanks backend not available (migrations not applied?)" };
      }
      return { ok: false, error: error.message || String(error) };
    }
    if (!data || typeof data !== "object") return { ok: false, error: "Invalid response" };
    const d = /** @type {Record<string, unknown>} */ (data);
    if (d.ok === true) {
      return {
        ok: true,
        idempotent: Boolean(d.idempotent),
        totalAmount: d.total_amount != null ? Number(d.total_amount) : 0,
        lines: d.lines,
      };
    }
    return {
      ok: false,
      error: typeof d.message === "string" ? d.message : "Request failed",
      code: typeof d.code === "string" ? d.code : undefined,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
