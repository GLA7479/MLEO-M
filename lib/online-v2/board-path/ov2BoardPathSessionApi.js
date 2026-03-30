/**
 * OV2 Board Path — Supabase session open + fetch (replaces localStorage / in-memory open path).
 */

/** @typedef {import("@supabase/supabase-js").SupabaseClient} SupabaseClient */

/**
 * @param {SupabaseClient} supabase
 * @param {string} roomId
 * @param {string} participantKey
 * @returns {Promise<Record<string, unknown>|null>}
 */
/**
 * @param {SupabaseClient} supabase
 * @param {string} roomId
 * @param {string} participantKey
 * @param {number|null|undefined} expectedRevision
 */
export async function rpcOv2BoardPathRollSession(supabase, roomId, participantKey, expectedRevision) {
  const { data, error } = await supabase.rpc("ov2_board_path_roll_session", {
    p_room_id: roomId,
    p_participant_key: participantKey,
    p_expected_revision: expectedRevision ?? null,
  });
  if (error) {
    return { ok: false, code: "RPC_ERROR", message: error.message };
  }
  if (!data || typeof data !== "object") {
    return { ok: false, code: "EMPTY", message: "Empty RPC response" };
  }
  return /** @type {Record<string, unknown>} */ (data);
}

/**
 * @param {SupabaseClient} supabase
 * @param {string} roomId
 * @param {string} participantKey
 * @param {number|null|undefined} expectedRevision
 */
export async function rpcOv2BoardPathMoveSession(supabase, roomId, participantKey, expectedRevision) {
  const { data, error } = await supabase.rpc("ov2_board_path_move_session", {
    p_room_id: roomId,
    p_participant_key: participantKey,
    p_expected_revision: expectedRevision ?? null,
  });
  if (error) {
    return { ok: false, code: "RPC_ERROR", message: error.message };
  }
  if (!data || typeof data !== "object") {
    return { ok: false, code: "EMPTY", message: "Empty RPC response" };
  }
  return /** @type {Record<string, unknown>} */ (data);
}

/**
 * @param {SupabaseClient} supabase
 * @param {string} roomId
 * @param {string} participantKey
 * @param {number|null|undefined} expectedRevision
 */
export async function rpcOv2BoardPathEndTurnSession(supabase, roomId, participantKey, expectedRevision) {
  const { data, error } = await supabase.rpc("ov2_board_path_end_turn_session", {
    p_room_id: roomId,
    p_participant_key: participantKey,
    p_expected_revision: expectedRevision ?? null,
  });
  if (error) {
    return { ok: false, code: "RPC_ERROR", message: error.message };
  }
  if (!data || typeof data !== "object") {
    return { ok: false, code: "EMPTY", message: "Empty RPC response" };
  }
  return /** @type {Record<string, unknown>} */ (data);
}

export async function rpcOv2BoardPathRequestRematch(supabase, roomId, participantKey) {
  const { data, error } = await supabase.rpc("ov2_board_path_request_rematch", {
    p_room_id: roomId,
    p_participant_key: participantKey,
  });
  if (error) {
    return { ok: false, code: "RPC_ERROR", message: error.message };
  }
  if (!data || typeof data !== "object") {
    return { ok: false, code: "EMPTY", message: "Empty RPC response" };
  }
  return /** @type {Record<string, unknown>} */ (data);
}

export async function rpcOv2BoardPathCancelRematch(supabase, roomId, participantKey) {
  const { data, error } = await supabase.rpc("ov2_board_path_cancel_rematch", {
    p_room_id: roomId,
    p_participant_key: participantKey,
  });
  if (error) {
    return { ok: false, code: "RPC_ERROR", message: error.message };
  }
  if (!data || typeof data !== "object") {
    return { ok: false, code: "EMPTY", message: "Empty RPC response" };
  }
  return /** @type {Record<string, unknown>} */ (data);
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} roomId
 * @param {string} participantKey
 * @param {number|null|undefined} expectedMatchSeq
 */
export async function rpcOv2BoardPathStartNextMatch(supabase, roomId, participantKey, expectedMatchSeq) {
  const { data, error } = await supabase.rpc("ov2_board_path_start_next_match", {
    p_room_id: roomId,
    p_participant_key: participantKey,
    p_expected_match_seq: expectedMatchSeq ?? null,
  });
  if (error) {
    return { ok: false, code: "RPC_ERROR", message: error.message };
  }
  if (!data || typeof data !== "object") {
    return { ok: false, code: "EMPTY", message: "Empty RPC response" };
  }
  return /** @type {Record<string, unknown>} */ (data);
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} roomId
 * @param {string} sessionId
 * @param {string} hostParticipantKey
 */
export async function rpcOv2BoardPathFinalizeSession(supabase, roomId, sessionId, hostParticipantKey) {
  const { data, error } = await supabase.rpc("ov2_board_path_finalize_session", {
    p_room_id: roomId,
    p_session_id: sessionId,
    p_participant_key: hostParticipantKey,
  });
  if (error) {
    return { ok: false, code: "RPC_ERROR", message: error.message };
  }
  if (!data || typeof data !== "object") {
    return { ok: false, code: "EMPTY", message: "Empty RPC response" };
  }
  return /** @type {Record<string, unknown>} */ (data);
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} roomId
 * @param {string} hostParticipantKey
 */
export async function rpcOv2BoardPathFinalizeRoom(supabase, roomId, hostParticipantKey) {
  const { data, error } = await supabase.rpc("ov2_board_path_finalize_room", {
    p_room_id: roomId,
    p_participant_key: hostParticipantKey,
  });
  if (error) {
    return { ok: false, code: "RPC_ERROR", message: error.message };
  }
  if (!data || typeof data !== "object") {
    return { ok: false, code: "EMPTY", message: "Empty RPC response" };
  }
  return /** @type {Record<string, unknown>} */ (data);
}

export async function rpcOv2BoardPathOpenSession(supabase, roomId, participantKey) {
  const { data, error } = await supabase.rpc("ov2_board_path_open_session", {
    p_room_id: roomId,
    p_participant_key: participantKey,
  });
  if (error) {
    return { ok: false, code: "RPC_ERROR", message: error.message };
  }
  if (!data || typeof data !== "object") {
    return { ok: false, code: "EMPTY", message: "Empty RPC response" };
  }
  return /** @type {Record<string, unknown>} */ (data);
}

/**
 * Load active board path session + seats with stable error codes (for UI / smoke).
 * @param {SupabaseClient} supabase
 * @param {string} roomId
 * @returns {Promise<
 *   | { ok: true, room: Record<string, unknown>, session: Record<string, unknown>, seats: Record<string, unknown>[], activeSessionId: string, roomMatchSeq: number, settlementLines: Record<string, unknown>[], boardPathSessions: Record<string, unknown>[], roomSettlementLines: Record<string, unknown>[] }
 *   | { ok: false, code: string, message: string, room?: Record<string, unknown>, roomMatchSeq?: number }
 * >}
 */
export async function fetchBoardPathSessionDetailed(supabase, roomId) {
  if (!roomId) {
    return { ok: false, code: "NO_ROOM_ID", message: "Missing room id." };
  }

  const roomFields =
    "id, created_at, updated_at, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, max_seats, match_seq, pot_locked, active_session_id, closed_reason, settlement_status, settlement_revision, finalized_at, finalized_match_seq, meta";

  const [roomRes, sessSnapRes, linesRoomRes] = await Promise.all([
    supabase.from("ov2_rooms").select(roomFields).eq("id", roomId).maybeSingle(),
    supabase.from("ov2_board_path_sessions").select("id, match_seq, phase, settlement_status").eq("room_id", roomId),
    supabase.from("ov2_settlement_lines").select("*").eq("room_id", roomId),
  ]);

  const { data: room, error: roomErr } = roomRes;

  if (roomErr) {
    return { ok: false, code: "ROOM_FETCH", message: roomErr.message || "Failed to load room." };
  }
  if (!room || typeof room !== "object") {
    return { ok: false, code: "ROOM_ROW_MISSING", message: "Room not found." };
  }

  const roomRow = /** @type {Record<string, unknown>} */ (room);
  const roomMatchSeq = Math.floor(Number(roomRow.match_seq)) || 0;
  const aid = roomRow.active_session_id;
  if (aid == null || (typeof aid === "string" && aid.trim() === "")) {
    return {
      ok: false,
      code: "NO_ACTIVE_SESSION_ID",
      message: "Room has no active session id yet.",
      room: roomRow,
      roomMatchSeq,
    };
  }

  const sessionId = String(aid);

  const boardPathSessions = !sessSnapRes.error && Array.isArray(sessSnapRes.data)
    ? sessSnapRes.data.map(r => /** @type {Record<string, unknown>} */ (r))
    : [];

  const roomSettlementLines = !linesRoomRes.error && Array.isArray(linesRoomRes.data)
    ? linesRoomRes.data.map(r => /** @type {Record<string, unknown>} */ (r))
    : [];

  const settlementLines = roomSettlementLines.filter(r => String(r.game_session_id) === sessionId);

  const { data: session, error: sessErr } = await supabase
    .from("ov2_board_path_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessErr) {
    return { ok: false, code: "SESSION_FETCH", message: sessErr.message || "Failed to load session row." };
  }
  if (!session) {
    return { ok: false, code: "SESSION_ROW_MISSING", message: "Session row not found for active_session_id." };
  }
  if (String(session.id) !== sessionId) {
    return { ok: false, code: "SESSION_ID_MISMATCH", message: "Session id does not match room.active_session_id." };
  }

  const { data: seats, error: seatsErr } = await supabase
    .from("ov2_board_path_seats")
      .select("*")
      .eq("session_id", sessionId)
      .order("seat_index", { ascending: true });

  if (seatsErr) {
    return { ok: false, code: "SEATS_FETCH", message: seatsErr.message || "Failed to load seats." };
  }

  return {
    ok: true,
    room: roomRow,
    activeSessionId: sessionId,
    roomMatchSeq,
    session: /** @type {Record<string, unknown>} */ (session),
    seats: Array.isArray(seats) ? seats.map(s => /** @type {Record<string, unknown>} */ (s)) : [],
    settlementLines,
    boardPathSessions,
    roomSettlementLines,
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} roomId
 * @returns {Promise<Record<string, unknown>[]|null>}
 */
export async function fetchOv2RoomMembersForRoom(supabase, roomId) {
  if (!roomId) return null;
  const { data, error } = await supabase.from("ov2_room_members").select("*").eq("room_id", roomId);
  if (error || !Array.isArray(data)) return null;
  return data.map(r => /** @type {Record<string, unknown>} */ (r));
}

/**
 * Load active board path session + seats for a room (by `ov2_rooms.active_session_id`).
 * @param {SupabaseClient} supabase
 * @param {string} roomId
 * @returns {Promise<{ session: Record<string, unknown>, seats: Record<string, unknown>[] }|null>}
 */
export async function fetchBoardPathSession(supabase, roomId) {
  const d = await fetchBoardPathSessionDetailed(supabase, roomId);
  if (!d.ok) return null;
  return { session: d.session, seats: d.seats };
}
