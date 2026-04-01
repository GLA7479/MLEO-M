/**
 * OV2 Rummy51 — Supabase RPC + Realtime. No legacy Rummy imports.
 */

import { supabaseMP } from "../../supabaseClients";

export const OV2_RUMMY51_PRODUCT_GAME_ID = "ov2_rummy51";

function unwrapRpc(data) {
  if (!data || typeof data !== "object") return { ok: false, error: "Empty RPC response" };
  if (data.ok === false) {
    return {
      ok: false,
      error: String(data.message || data.code || "RPC failed"),
      code: data.code,
      revision: data.revision,
    };
  }
  return { ok: true, raw: data };
}

/**
 * @param {unknown} snap
 * @returns {object|null}
 */
export function normalizeOv2Rummy51Snapshot(snap) {
  if (!snap || typeof snap !== "object") return null;
  const s = /** @type {Record<string, unknown>} */ (snap);
  return {
    sessionId: s.sessionId != null ? String(s.sessionId) : null,
    roomId: s.roomId != null ? String(s.roomId) : null,
    matchSeq: s.matchSeq != null ? Number(s.matchSeq) : 0,
    phase: s.phase != null ? String(s.phase) : "",
    revision: s.revision != null ? Number(s.revision) : 0,
    turnIndex: s.turnIndex != null ? Number(s.turnIndex) : 0,
    turnParticipantKey: s.turnParticipantKey != null ? String(s.turnParticipantKey) : "",
    dealerSeatIndex: s.dealerSeatIndex != null ? Number(s.dealerSeatIndex) : 0,
    activeSeats: Array.isArray(s.activeSeats) ? s.activeSeats : [],
    seed: s.seed != null ? String(s.seed) : "",
    stockCount: s.stockCount != null ? Number(s.stockCount) : 0,
    discardCount: s.discardCount != null ? Number(s.discardCount) : 0,
    discardTop: s.discardTop && typeof s.discardTop === "object" ? s.discardTop : null,
    hands: s.hands && typeof s.hands === "object" ? s.hands : {},
    tableMelds: Array.isArray(s.tableMelds) ? s.tableMelds : [],
    playerState: s.playerState && typeof s.playerState === "object" ? s.playerState : {},
    takenDiscardCardId: s.takenDiscardCardId != null ? String(s.takenDiscardCardId) : null,
    pendingDrawSource: s.pendingDrawSource != null ? String(s.pendingDrawSource) : null,
    roundNumber: s.roundNumber != null ? Number(s.roundNumber) : 1,
    winnerParticipantKey: s.winnerParticipantKey != null ? String(s.winnerParticipantKey) : null,
    winnerName: s.winnerName != null ? String(s.winnerName) : null,
    matchMeta: s.matchMeta && typeof s.matchMeta === "object" ? s.matchMeta : {},
    startedAt: s.startedAt,
    finishedAt: s.finishedAt,
    updatedAt: s.updatedAt,
  };
}

/**
 * @param {string} roomId
 * @returns {Promise<{ ok: boolean, room?: object, members?: object[], session?: object|null, snapshot?: object|null, error?: string }>}
 */
export async function fetchOv2Rummy51Snapshot(roomId) {
  const { data, error } = await supabaseMP.rpc("ov2_rummy51_get_snapshot", { p_room_id: roomId });
  if (error) return { ok: false, error: error.message || String(error) };
  const u = unwrapRpc(data);
  if (!u.ok) return u;
  const raw = u.raw;
  return {
    ok: true,
    room: raw.room,
    members: Array.isArray(raw.members) ? raw.members : [],
    session: raw.session ?? null,
    snapshot: raw.snapshot != null ? normalizeOv2Rummy51Snapshot(raw.snapshot) : null,
  };
}

/**
 * @param {string} roomId
 * @param {string} hostParticipantKey
 */
export async function openOv2Rummy51Session(roomId, hostParticipantKey) {
  const { data, error } = await supabaseMP.rpc("ov2_rummy51_open_session", {
    p_room_id: roomId,
    p_host_participant_key: hostParticipantKey,
  });
  if (error) return { ok: false, error: error.message || String(error) };
  const u = unwrapRpc(data);
  if (!u.ok) return u;
  const snap = u.raw?.snapshot != null ? normalizeOv2Rummy51Snapshot(u.raw.snapshot) : null;
  return { ok: true, snapshot: snap, idempotent: Boolean(u.raw?.idempotent) };
}

/**
 * @param {string} roomId
 * @param {string} participantKey
 * @param {number|null} [expectedRevision]
 */
export async function ov2Rummy51DrawStock(roomId, participantKey, expectedRevision = null) {
  const { data, error } = await supabaseMP.rpc("ov2_rummy51_draw_from_stock", {
    p_room_id: roomId,
    p_participant_key: participantKey,
    p_expected_revision: expectedRevision,
  });
  if (error) return { ok: false, error: error.message || String(error) };
  const u = unwrapRpc(data);
  if (!u.ok) return u;
  const snap = u.raw?.snapshot != null ? normalizeOv2Rummy51Snapshot(u.raw.snapshot) : null;
  return { ok: true, snapshot: snap };
}

export async function ov2Rummy51DrawDiscard(roomId, participantKey, expectedRevision = null) {
  const { data, error } = await supabaseMP.rpc("ov2_rummy51_draw_from_discard", {
    p_room_id: roomId,
    p_participant_key: participantKey,
    p_expected_revision: expectedRevision,
  });
  if (error) return { ok: false, error: error.message || String(error) };
  const u = unwrapRpc(data);
  if (!u.ok) return u;
  const snap = u.raw?.snapshot != null ? normalizeOv2Rummy51Snapshot(u.raw.snapshot) : null;
  return { ok: true, snapshot: snap };
}

/**
 * Return the discard-drawn card to the pile; only while pending_draw_source = 'discard' and before submit.
 */
export async function ov2Rummy51UndoDiscardDraw(roomId, participantKey, expectedRevision = null) {
  const { data, error } = await supabaseMP.rpc("ov2_rummy51_undo_discard_draw", {
    p_room_id: roomId,
    p_participant_key: participantKey,
    p_expected_revision: expectedRevision,
  });
  if (error) return { ok: false, error: error.message || String(error) };
  const u = unwrapRpc(data);
  if (!u.ok) return u;
  const snap = u.raw?.snapshot != null ? normalizeOv2Rummy51Snapshot(u.raw.snapshot) : null;
  return { ok: true, snapshot: snap };
}

/**
 * @param {string} roomId
 * @param {string} participantKey
 * @param {object} turnPayload — { new_melds, table_additions, discard_card_id }
 * @param {number|null} [expectedRevision]
 */
export async function ov2Rummy51SubmitTurn(roomId, participantKey, turnPayload, expectedRevision = null) {
  const { data, error } = await supabaseMP.rpc("ov2_rummy51_submit_turn", {
    p_room_id: roomId,
    p_participant_key: participantKey,
    p_turn_payload: turnPayload,
    p_expected_revision: expectedRevision,
  });
  if (error) return { ok: false, error: error.message || String(error) };
  const u = unwrapRpc(data);
  if (!u.ok) return u;
  const snap = u.raw?.snapshot != null ? normalizeOv2Rummy51Snapshot(u.raw.snapshot) : null;
  return { ok: true, snapshot: snap };
}

export async function requestOv2Rummy51Rematch(roomId, participantKey) {
  const { data, error } = await supabaseMP.rpc("ov2_rummy51_request_rematch", {
    p_room_id: roomId,
    p_participant_key: participantKey,
  });
  if (error) return { ok: false, error: error.message || String(error) };
  return unwrapRpc(data);
}

export async function cancelOv2Rummy51Rematch(roomId, participantKey) {
  const { data, error } = await supabaseMP.rpc("ov2_rummy51_cancel_rematch", {
    p_room_id: roomId,
    p_participant_key: participantKey,
  });
  if (error) return { ok: false, error: error.message || String(error) };
  return unwrapRpc(data);
}

export async function startOv2Rummy51NextMatch(roomId, hostParticipantKey, expectedMatchSeq = null) {
  const { data, error } = await supabaseMP.rpc("ov2_rummy51_start_next_match", {
    p_room_id: roomId,
    p_host_participant_key: hostParticipantKey,
    p_expected_match_seq: expectedMatchSeq,
  });
  if (error) return { ok: false, error: error.message || String(error) };
  const u = unwrapRpc(data);
  if (!u.ok) return u;
  return { ok: true, matchSeq: u.raw?.match_seq, room: u.raw?.room, members: u.raw?.members };
}

/**
 * @param {string} roomId
 * @param {(snap: ReturnType<typeof normalizeOv2Rummy51Snapshot>|null) => void} onSnapshot
 * @returns {() => void}
 */
export function subscribeOv2Rummy51Session(roomId, onSnapshot) {
  const ch = supabaseMP
    .channel(`ov2-rummy51:${roomId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "ov2_rummy51_sessions", filter: `room_id=eq.${roomId}` },
      () => {
        void fetchOv2Rummy51Snapshot(roomId).then(r => {
          if (r.ok) onSnapshot(r.snapshot ?? null);
        });
      }
    )
    .subscribe();
  return () => {
    void ch.unsubscribe();
  };
}
