/**
 * Authoritative registry: one seated participant at a time across OV2 fixed-table
 * products (21 Challenge, Color Wheel, Community Cards). Synced from engine JSON
 * after successful operate commits; pre-check auto-releases a foreign seat then re-validates.
 */

function occupiedParticipantKeys(engine) {
  const out = new Set();
  const seats = engine?.seats;
  if (!Array.isArray(seats)) return out;
  for (const s of seats) {
    const pk = String(s?.participantKey || "").trim();
    if (pk) out.add(pk);
  }
  return out;
}

export function ov2WaveSeatingChanged(beforeEngine, afterEngine) {
  const A = occupiedParticipantKeys(beforeEngine);
  const B = occupiedParticipantKeys(afterEngine);
  if (A.size !== B.size) return true;
  for (const x of A) if (!B.has(x)) return true;
  for (const x of B) if (!A.has(x)) return true;
  return false;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} admin
 */
const OV2_PLACEHOLDER_PARTICIPANT = "00000000-0000-0000-0000-000000000000";

/**
 * Private create/join: release any seat not at `allowOnlyRoomId`, then fail only if a foreign
 * row remains (e.g. release failed). `allowOnlyRoomId` null = release any prior seat before create.
 * @param {import("@supabase/supabase-js").SupabaseClient} admin
 * @param {string|null|undefined} allowOnlyRoomId - if set, seating at this room only is allowed
 */
export async function assertWaveFixedNoForeignActiveSeat(admin, participantKey, allowOnlyRoomId) {
  const pk = String(participantKey || "").trim();
  if (!pk || pk === OV2_PLACEHOLDER_PARTICIPANT) {
    return {
      ok: false,
      code: "PARTICIPANT_REQUIRED",
      message: "Participant id is required for private rooms.",
    };
  }
  const { autoReleaseForeignWaveFixedSeat } = await import("./ov2WaveAutoReleaseForeignSeat.js");
  const released = await autoReleaseForeignWaveFixedSeat(admin, pk, allowOnlyRoomId);
  if (!released.ok) return released;
  const { data, error } = await admin
    .from("ov2_wave_fixed_active_seat")
    .select("room_id")
    .eq("participant_key", pk)
    .maybeSingle();
  if (error) {
    return { ok: false, code: "SEAT_REGISTRY_READ_FAILED", message: error.message || "seat_registry_read_failed" };
  }
  if (!data) return { ok: true };
  if (allowOnlyRoomId != null && String(data.room_id) === String(allowOnlyRoomId)) return { ok: true };
  return {
    ok: false,
    code: "ALREADY_SEATED_ELSEWHERE",
    message: "You already have a seat at another table. Open that table or leave it before joining a new one.",
  };
}

export async function assertWaveFixedSeatFree(admin, participantKey, targetRoomId) {
  const pk = String(participantKey || "").trim();
  if (!pk) return { ok: true };
  const { autoReleaseForeignWaveFixedSeat } = await import("./ov2WaveAutoReleaseForeignSeat.js");
  const released = await autoReleaseForeignWaveFixedSeat(admin, pk, targetRoomId);
  if (!released.ok) return released;
  const { data, error } = await admin
    .from("ov2_wave_fixed_active_seat")
    .select("room_id")
    .eq("participant_key", pk)
    .maybeSingle();
  if (error) {
    return { ok: false, code: "SEAT_REGISTRY_READ_FAILED", message: error.message || "seat_registry_read_failed" };
  }
  if (!data) return { ok: true };
  if (String(data.room_id) === String(targetRoomId)) return { ok: true };
  return {
    ok: false,
    code: "ALREADY_SEATED_ELSEWHERE",
    message: "You already have a seat at another table. Open that table or leave it before joining a new one.",
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} admin
 */
export async function reconcileWaveFixedSeatRegistryForRoom(admin, productGameId, roomId, engine) {
  const occupied = occupiedParticipantKeys(engine);
  const { data: regRows, error: regErr } = await admin
    .from("ov2_wave_fixed_active_seat")
    .select("participant_key")
    .eq("room_id", roomId);
  if (regErr) {
    console.error("[ov2-wave-seat-registry] list failed", regErr.message);
    return;
  }
  for (const row of regRows || []) {
    const pk = String(row?.participant_key || "").trim();
    if (!pk || occupied.has(pk)) continue;
    const { error: delErr } = await admin
      .from("ov2_wave_fixed_active_seat")
      .delete()
      .eq("participant_key", pk)
      .eq("room_id", roomId);
    if (delErr) console.error("[ov2-wave-seat-registry] delete failed", delErr.message);
  }
  const ts = new Date().toISOString();
  const pid = String(productGameId || "").trim();
  for (const pk of occupied) {
    const { error: upErr } = await admin.from("ov2_wave_fixed_active_seat").upsert(
      {
        participant_key: pk,
        room_id: roomId,
        product_game_id: pid,
        updated_at: ts,
      },
      { onConflict: "participant_key" },
    );
    if (upErr) console.error("[ov2-wave-seat-registry] upsert failed", upErr.message);
  }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} admin
 */
export async function touchOv2RoomActivityIfPrivate(admin, roomId, roomRow) {
  const priv = Boolean(roomRow?.is_private);
  const wave = roomRow?.meta && typeof roomRow.meta === "object" && roomRow.meta.ov2_wave_private === "1";
  if (!priv || !wave) return;
  await admin
    .from("ov2_rooms")
    .update({ last_activity_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", roomId);
}

/**
 * After a successful persist: sync seat registry if occupancy changed; bump private room activity.
 * @param {import("@supabase/supabase-js").SupabaseClient} admin
 */
export async function applyWaveSeatRegistryAfterSuccess(admin, productGameId, roomId, roomRow, beforeEngine, nextEngine) {
  if (ov2WaveSeatingChanged(beforeEngine, nextEngine)) {
    await reconcileWaveFixedSeatRegistryForRoom(admin, productGameId, roomId, nextEngine);
  }
  await touchOv2RoomActivityIfPrivate(admin, roomId, roomRow);
}
