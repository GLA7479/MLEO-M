/**
 * OV2 Bomber Arena — session RPC + Realtime (neutral module; no other game imports).
 */

import { supabaseMP as supabase } from "../../supabaseClients";
import { ONLINE_V2_GAME_KINDS } from "../ov2Economy";

export const OV2_BOMBER_ARENA_PRODUCT_GAME_ID = ONLINE_V2_GAME_KINDS.BOMBER_ARENA;

function isBackendUnavailable(err) {
  const code = err && typeof err === "object" ? /** @type {{ code?: string }} */ (err).code : undefined;
  const msg = String(err && typeof err === "object" && "message" in err ? err.message : err || "").toLowerCase();
  if (code === "PGRST202" || code === "42P01" || code === "42704" || code === "42883") return true;
  if (msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("undefined table")) return true;
  return false;
}

/**
 * @param {Record<string, unknown>|null|undefined} snap
 */
export function normalizeBomberArenaSnapshot(snap) {
  if (!snap || typeof snap !== "object") return null;
  return /** @type {Record<string, unknown>} */ (snap);
}

/**
 * @param {string} roomId
 * @param {{ participantKey?: string|null }} [_opts]
 */
export async function fetchOv2BomberArenaAuthoritativeSnapshot(roomId, _opts) {
  if (!roomId) return null;
  const participantKey = _opts?.participantKey != null ? String(_opts.participantKey).trim() : "";
  try {
    const { data, error } = await supabase.rpc("ov2_bomber_arena_get_snapshot", {
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
    return normalizeBomberArenaSnapshot(/** @type {Record<string, unknown>} */ (body.snapshot));
  } catch (e) {
    if (isBackendUnavailable(e)) return null;
    return null;
  }
}

/**
 * @param {string} roomId
 * @param {{ participantKey?: string|null, onSnapshot: (s: Record<string, unknown>) => void, onError?: (e: Error) => void }} handlers
 */
export function subscribeOv2BomberArenaAuthoritativeSnapshot(roomId, handlers) {
  if (!roomId || typeof handlers?.onSnapshot !== "function") return () => {};
  const pk = handlers.participantKey != null ? String(handlers.participantKey).trim() : "";
  let cancelled = false;
  const pushLatest = async () => {
    if (cancelled) return;
    const snap = await fetchOv2BomberArenaAuthoritativeSnapshot(roomId, { participantKey: pk });
    if (snap && !cancelled) handlers.onSnapshot(snap);
  };
  try {
    const channel = supabase
      .channel(`ov2-bomber:${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ov2_bomber_arena_sessions", filter: `room_id=eq.${roomId}` },
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
      try {
        void supabase.removeChannel(channel);
      } catch {
        /* ignore */
      }
    };
  } catch {
    return () => {};
  }
}

/**
 * @param {string} roomId
 * @param {string} participantKey
 * @param {{ expectedRoomMatchSeq: number }} opts
 */
export async function requestOv2BomberArenaOpenSession(roomId, participantKey, opts) {
  const rid = roomId != null ? String(roomId).trim() : "";
  const pk = participantKey != null ? String(participantKey).trim() : "";
  const ms = Math.floor(Number(opts?.expectedRoomMatchSeq));
  if (!rid || !pk || !Number.isFinite(ms)) {
    return { ok: false, error: "Missing room, participant, or match sequence." };
  }
  try {
    const { data, error } = await supabase.rpc("ov2_bomber_arena_open_session", {
      p_room_id: rid,
      p_participant_key: pk,
      p_expected_room_match_seq: ms,
    });
    if (error) {
      return { ok: false, error: error.message || String(error) };
    }
    if (!data || typeof data !== "object") {
      return { ok: false, error: "Empty response" };
    }
    const d = /** @type {Record<string, unknown>} */ (data);
    if (d.ok === true && d.snapshot) {
      return {
        ok: true,
        idempotent: d.idempotent === true,
        snapshot: normalizeBomberArenaSnapshot(/** @type {Record<string, unknown>} */ (d.snapshot)),
      };
    }
    return {
      ok: false,
      error: typeof d.message === "string" ? d.message : "Open session failed",
      code: typeof d.code === "string" ? d.code : undefined,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * @param {string} roomId
 * @param {string} sessionId
 * @param {string} participantKey
 * @param {Record<string, unknown>} action
 * @param {number} clientTick
 */
export async function requestOv2BomberArenaPlayerStep(roomId, sessionId, participantKey, action, clientTick) {
  const rid = String(roomId || "").trim();
  const sid = String(sessionId || "").trim();
  const pk = String(participantKey || "").trim();
  const tick = Math.floor(Number(clientTick));
  if (!rid || !sid || !pk || !Number.isFinite(tick) || tick <= 0) {
    return { ok: false, error: "Invalid step arguments" };
  }
  try {
    const { data, error } = await supabase.rpc("ov2_bomber_arena_player_step", {
      p_room_id: rid,
      p_session_id: sid,
      p_participant_key: pk,
      p_action: action,
      p_client_tick: tick,
    });
    if (error) {
      return { ok: false, error: error.message || String(error) };
    }
    if (!data || typeof data !== "object") {
      return { ok: false, error: "Empty response" };
    }
    const d = /** @type {Record<string, unknown>} */ (data);
    if (d.ok === true && d.snapshot) {
      return { ok: true, snapshot: normalizeBomberArenaSnapshot(/** @type {Record<string, unknown>} */ (d.snapshot)) };
    }
    return {
      ok: false,
      error: typeof d.message === "string" ? d.message : "Step rejected",
      code: typeof d.code === "string" ? d.code : undefined,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
