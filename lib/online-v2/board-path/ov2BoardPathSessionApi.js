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
 *   | { ok: true, session: Record<string, unknown>, seats: Record<string, unknown>[], activeSessionId: string, roomMatchSeq: number }
 *   | { ok: false, code: string, message: string }
 * >}
 */
export async function fetchBoardPathSessionDetailed(supabase, roomId) {
  if (!roomId) {
    return { ok: false, code: "NO_ROOM_ID", message: "Missing room id." };
  }

  const { data: room, error: roomErr } = await supabase
    .from("ov2_rooms")
    .select("active_session_id, match_seq")
    .eq("id", roomId)
    .maybeSingle();

  if (roomErr) {
    return { ok: false, code: "ROOM_FETCH", message: roomErr.message || "Failed to load room." };
  }
  const roomMatchSeq = Math.floor(Number(room?.match_seq)) || 0;
  const aid = room?.active_session_id;
  if (aid == null || (typeof aid === "string" && aid.trim() === "")) {
    return { ok: false, code: "NO_ACTIVE_SESSION_ID", message: "Room has no active session id yet." };
  }

  const sessionId = String(aid);

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
    activeSessionId: sessionId,
    roomMatchSeq,
    session: /** @type {Record<string, unknown>} */ (session),
    seats: Array.isArray(seats) ? seats.map(s => /** @type {Record<string, unknown>} */ (s)) : [],
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
