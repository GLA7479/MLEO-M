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
 * Load active board path session + seats for a room (by `ov2_rooms.active_session_id`).
 * @param {SupabaseClient} supabase
 * @param {string} roomId
 * @returns {Promise<{ session: Record<string, unknown>, seats: Record<string, unknown>[] }|null>}
 */
export async function fetchBoardPathSession(supabase, roomId) {
  if (!roomId) return null;

  const { data: room, error: roomErr } = await supabase
    .from("ov2_rooms")
    .select("active_session_id")
    .eq("id", roomId)
    .maybeSingle();

  if (roomErr || !room?.active_session_id) return null;

  const sessionId = String(room.active_session_id);

  const { data: session, error: sessErr } = await supabase
    .from("ov2_board_path_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessErr || !session) return null;

  const { data: seats, error: seatsErr } = await supabase
    .from("ov2_board_path_seats")
    .select("*")
    .eq("session_id", sessionId)
    .order("seat_index", { ascending: true });

  if (seatsErr) return null;

  return {
    session: /** @type {Record<string, unknown>} */ (session),
    seats: Array.isArray(seats) ? seats.map(s => /** @type {Record<string, unknown>} */ (s)) : [],
  };
}
