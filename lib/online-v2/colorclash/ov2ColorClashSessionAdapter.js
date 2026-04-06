/**
 * OV2 Color Clash — RPC + Realtime boundary (no React).
 */

import { supabaseMP as supabase } from "../../supabaseClients";
import { ccParseHandArray } from "./ov2ColorClashCards";

export { OV2_COLORCLASH_PRODUCT_GAME_ID } from "./ov2ColorClashStakes";

export function isOv2ColorClashBackendUnavailableError(err) {
  const code = err && typeof err === "object" ? /** @type {{ code?: string }} */ (err).code : undefined;
  const msg = String(err && typeof err === "object" && "message" in err ? err.message : err || "").toLowerCase();
  if (code === "PGRST202" || code === "42P01" || code === "42704" || code === "42883") return true;
  if (msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("undefined table")) return true;
  return false;
}

/**
 * @param {Record<string, unknown>} raw
 */
export function normalizeOv2ColorClashSnapshot(raw) {
  if (!raw || typeof raw !== "object") return null;
  const pub = raw.public && typeof raw.public === "object" ? /** @type {Record<string, unknown>} */ (raw.public) : {};
  let mySeat = null;
  const myRaw = raw.mySeat;
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
  const tdRaw = raw.turnDeadline;
  const turnDeadline =
    tdRaw != null && tdRaw !== "" && Number.isFinite(Number(tdRaw)) ? Math.floor(Number(tdRaw)) : null;
  const missedTurns =
    raw.missedTurns && typeof raw.missedTurns === "object"
      ? /** @type {Record<string, number>} */ (raw.missedTurns)
      : null;
  const turnSeat = pub.turnSeat != null ? Number(pub.turnSeat) : null;
  const turnPhase = pub.turnPhase != null ? String(pub.turnPhase) : "";
  const currentColor = pub.currentColor != null ? Number(pub.currentColor) : null;
  const direction = pub.direction != null ? Number(pub.direction) : 1;
  const stockCount = pub.stockCount != null ? Math.max(0, Math.floor(Number(pub.stockCount))) : 0;
  const discardCount = pub.discardCount != null ? Math.max(0, Math.floor(Number(pub.discardCount))) : 0;
  let topDiscard = null;
  const td = pub.topDiscard;
  if (td && typeof td === "object" && td !== null && !Array.isArray(td)) {
    topDiscard = /** @type {Record<string, unknown>} */ ({ ...td });
  }
  const handCounts =
    pub.handCounts && typeof pub.handCounts === "object" && !Array.isArray(pub.handCounts)
      ? /** @type {Record<string, unknown>} */ (pub.handCounts)
      : {};
  const eliminated =
    pub.eliminated && typeof pub.eliminated === "object" && !Array.isArray(pub.eliminated)
      ? /** @type {Record<string, unknown>} */ (pub.eliminated)
      : {};

  /** @type {Record<string, unknown>[]|null} */
  let pendingDrawForYou = null;
  const pd = raw.pendingDrawForYou;
  if (pd == null) {
    pendingDrawForYou = null;
  } else if (Array.isArray(pd)) {
    pendingDrawForYou = pd.filter(x => x && typeof x === "object").map(x => /** @type {Record<string, unknown>} */ ({ ...x }));
    if (pendingDrawForYou.length === 0) pendingDrawForYou = null;
  } else if (typeof pd === "object") {
    pendingDrawForYou = [/** @type {Record<string, unknown>} */ ({ ...pd })];
  }

  const clashCountRaw = pub.clashCount;
  const clashCount =
    clashCountRaw != null && Number.isFinite(Number(clashCountRaw)) ? Math.max(0, Math.min(4, Math.floor(Number(clashCountRaw)))) : 0;
  const lockedColorRaw = pub.lockedColor;
  const lockedColor =
    lockedColorRaw != null && lockedColorRaw !== "" && Number.isFinite(Number(lockedColorRaw))
      ? Math.max(0, Math.min(3, Math.floor(Number(lockedColorRaw))))
      : null;
  const lockForSeatRaw = pub.lockForSeat;
  const lockForSeat =
    lockForSeatRaw != null && lockForSeatRaw !== "" && Number.isFinite(Number(lockForSeatRaw))
      ? Math.max(0, Math.min(3, Math.floor(Number(lockForSeatRaw))))
      : null;
  const lockExpiresAfterNextTurn = pub.lockExpiresAfterNextTurn === true || pub.lockExpiresAfterNextTurn === "true";

  const activeSeats = Array.isArray(raw.activeSeats)
    ? raw.activeSeats.map(x => Math.floor(Number(x))).filter(n => Number.isInteger(n) && n >= 0 && n <= 3)
    : [];
  const playerCount =
    raw.playerCount != null && Number.isFinite(Number(raw.playerCount)) ? Math.max(2, Math.min(4, Math.floor(Number(raw.playerCount)))) : activeSeats.length || 2;

  /** @type {Record<string, unknown>|null} */
  let surgeUsedBySeat = null;
  const suMap = raw.surgeUsedBySeat;
  if (suMap && typeof suMap === "object" && !Array.isArray(suMap)) {
    surgeUsedBySeat = /** @type {Record<string, unknown>} */ ({ ...suMap });
  }
  /** @type {boolean|null} */
  let surgeUsedForYou = null;
  const suy = raw.surgeUsedForYou;
  if (suy === true || suy === false) {
    surgeUsedForYou = suy;
  } else if (suy === "true" || suy === 1) {
    surgeUsedForYou = true;
  } else if (suy === "false" || suy === 0) {
    surgeUsedForYou = false;
  }

  return {
    revision: raw.revision != null ? Number(raw.revision) : 0,
    sessionId: String(raw.sessionId ?? ""),
    roomId: String(raw.roomId ?? ""),
    phase: String(raw.phase ?? ""),
    activeSeats,
    playerCount,
    mySeat,
    public: pub,
    turnSeat: Number.isInteger(turnSeat) && turnSeat >= 0 && turnSeat <= 3 ? turnSeat : null,
    turnPhase,
    currentColor: Number.isInteger(currentColor) && currentColor >= 0 && currentColor <= 3 ? currentColor : null,
    direction: direction === -1 ? -1 : 1,
    stockCount,
    discardCount,
    topDiscard,
    handCounts,
    eliminated,
    myHand: ccParseHandArray(raw.myHand),
    pendingDrawForYou,
    clashCount,
    lockedColor,
    lockForSeat,
    lockExpiresAfterNextTurn,
    surgeUsedBySeat,
    surgeUsedForYou,
    winnerSeat,
    turnDeadline,
    missedTurns,
    result: raw.result && typeof raw.result === "object" ? /** @type {Record<string, unknown>} */ (raw.result) : null,
  };
}

function parseSnapshotRpc(data) {
  if (!data || typeof data !== "object") {
    return { ok: false, error: "Invalid response" };
  }
  const d = /** @type {Record<string, unknown>} */ (data);
  if (d.ok === true && d.snapshot) {
    const snap = normalizeOv2ColorClashSnapshot(/** @type {Record<string, unknown>} */ (d.snapshot));
    if (!snap) return { ok: false, error: "Invalid snapshot" };
    return { ok: true, snapshot: snap };
  }
  if (d.ok === false) {
    return {
      ok: false,
      error: typeof d.message === "string" ? d.message : "Request failed",
      code: d.code != null && d.code !== "" ? String(d.code) : undefined,
      revision: d.revision != null ? Number(d.revision) : undefined,
    };
  }
  return { ok: false, error: "Invalid response" };
}

/**
 * @param {string} roomId
 * @param {{ participantKey?: string|null }} [_opts]
 */
export async function fetchOv2ColorClashSnapshot(roomId, _opts) {
  if (!roomId) return null;
  const pk = _opts?.participantKey != null ? String(_opts.participantKey).trim() : "";
  try {
    const { data, error } = await supabase.rpc("ov2_colorclash_get_snapshot", {
      p_room_id: roomId,
      p_participant_key: pk,
    });
    if (error) {
      if (isOv2ColorClashBackendUnavailableError(error)) return null;
      return null;
    }
    const body = /** @type {Record<string, unknown>} */ (data);
    if (body?.ok !== true || !body.snapshot) return null;
    return normalizeOv2ColorClashSnapshot(/** @type {Record<string, unknown>} */ (body.snapshot));
  } catch (e) {
    if (isOv2ColorClashBackendUnavailableError(e)) return null;
    return null;
  }
}

/**
 * @param {string} roomId
 * @param {{ participantKey?: string|null, onSnapshot: (s: NonNullable<ReturnType<typeof normalizeOv2ColorClashSnapshot>>) => void, onError?: (e: Error) => void }} handlers
 */
export function subscribeOv2ColorClashSnapshot(roomId, handlers) {
  if (!roomId || typeof handlers?.onSnapshot !== "function") {
    return () => {};
  }
  const pk = handlers.participantKey != null ? String(handlers.participantKey).trim() : "";
  let cancelled = false;
  const pushLatest = async () => {
    if (cancelled) return;
    const snap = await fetchOv2ColorClashSnapshot(roomId, { participantKey: pk });
    if (snap && !cancelled) handlers.onSnapshot(snap);
  };
  try {
    const channel = supabase
      .channel(`ov2-colorclash:${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ov2_colorclash_sessions", filter: `room_id=eq.${roomId}` },
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
export async function requestOv2ColorClashOpenSession(roomId, participantKey, _opts) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  const leader = _opts?.presenceLeaderKey != null ? String(_opts.presenceLeaderKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "room_id and participant_key required" };
  if (!leader) return { ok: false, error: "presence leader key required" };
  try {
    const { data, error } = await supabase.rpc("ov2_colorclash_open_session", {
      p_room_id: roomId,
      p_participant_key: pk,
      p_presence_leader_key: leader,
    });
    if (error) {
      if (isOv2ColorClashBackendUnavailableError(error)) {
        return { ok: false, error: "Color Clash backend not available (migrations not applied?)" };
      }
      return { ok: false, error: error.message || String(error) };
    }
    return parseSnapshotRpc(data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function requestOv2ColorClashMarkTurnTimeout(roomId, participantKey, _opts) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "Missing room or participant" };
  const rev = _opts?.revision;
  try {
    const { data, error } = await supabase.rpc("ov2_colorclash_mark_turn_timeout", {
      p_room_id: roomId,
      p_participant_key: pk,
      p_expected_revision: rev != null && rev !== "" ? Number(rev) : null,
    });
    if (error) {
      if (isOv2ColorClashBackendUnavailableError(error)) return { ok: false, error: "Color Clash backend not available" };
      return { ok: false, error: error.message || String(error) };
    }
    return parseSnapshotRpc(data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function requestOv2ColorClashDrawCard(roomId, participantKey, _opts) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "Missing room or participant" };
  const rev = _opts?.revision;
  try {
    const { data, error } = await supabase.rpc("ov2_colorclash_draw_card", {
      p_room_id: roomId,
      p_participant_key: pk,
      p_expected_revision: rev != null && rev !== "" ? Number(rev) : null,
    });
    if (error) {
      if (isOv2ColorClashBackendUnavailableError(error)) return { ok: false, error: "Color Clash backend not available" };
      return { ok: false, error: error.message || String(error) };
    }
    return parseSnapshotRpc(data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function requestOv2ColorClashPassAfterDraw(roomId, participantKey, _opts) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "Missing room or participant" };
  const rev = _opts?.revision;
  try {
    const { data, error } = await supabase.rpc("ov2_colorclash_pass_after_draw", {
      p_room_id: roomId,
      p_participant_key: pk,
      p_expected_revision: rev != null && rev !== "" ? Number(rev) : null,
    });
    if (error) {
      if (isOv2ColorClashBackendUnavailableError(error)) return { ok: false, error: "Color Clash backend not available" };
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
 * @param {Record<string, unknown>} card
 * @param {{ chosenColor?: number|null, revision?: unknown, secondCard?: Record<string, unknown>|null, secondChosenColor?: number|null }} [_opts]
 */
export async function requestOv2ColorClashPlayCard(roomId, participantKey, card, _opts) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  if (!roomId || !pk || !card || typeof card !== "object") return { ok: false, error: "Missing arguments" };
  const rev = _opts?.revision;
  const cc = _opts?.chosenColor;
  const sc = _opts?.secondCard;
  const sc2 = _opts?.secondChosenColor;
  try {
    const { data, error } = await supabase.rpc("ov2_colorclash_play_card", {
      p_room_id: roomId,
      p_participant_key: pk,
      p_card: card,
      p_chosen_color: cc != null && cc !== "" && Number.isFinite(Number(cc)) ? Math.floor(Number(cc)) : null,
      p_expected_revision: rev != null && rev !== "" ? Number(rev) : null,
      p_second_card: sc != null && typeof sc === "object" ? sc : null,
      p_second_chosen_color:
        sc2 != null && sc2 !== "" && Number.isFinite(Number(sc2)) ? Math.floor(Number(sc2)) : null,
    });
    if (error) {
      if (isOv2ColorClashBackendUnavailableError(error)) return { ok: false, error: "Color Clash backend not available" };
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

export async function requestOv2ColorClashRequestRematch(roomId, participantKey) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "Missing room or participant" };
  try {
    const { data, error } = await supabase.rpc("ov2_colorclash_request_rematch", {
      p_room_id: roomId,
      p_participant_key: pk,
    });
    if (error) return { ok: false, error: error.message || String(error) };
    return parseIntentOk(data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function requestOv2ColorClashCancelRematch(roomId, participantKey) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "Missing room or participant" };
  try {
    const { data, error } = await supabase.rpc("ov2_colorclash_cancel_rematch", {
      p_room_id: roomId,
      p_participant_key: pk,
    });
    if (error) return { ok: false, error: error.message || String(error) };
    return parseIntentOk(data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function requestOv2ColorClashStartNextMatch(roomId, participantKey, expectedMatchSeq) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "Missing room or participant" };
  try {
    const { data, error } = await supabase.rpc("ov2_colorclash_start_next_match", {
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
