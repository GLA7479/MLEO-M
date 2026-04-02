/**
 * Community Cards: room + participant_key → arcade_device_id (vault identity).
 */

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} admin
 * @param {string} roomId
 * @param {string} participantKey
 * @param {string} deviceId
 */
export async function upsertOv2CcParticipantDevice(admin, roomId, participantKey, deviceId) {
  const rid = String(roomId || "").trim();
  const pk = String(participantKey || "").trim();
  const did = String(deviceId || "").trim();
  if (!rid || !pk || !did) return { ok: false };

  const { error } = await admin.from("ov2_community_cards_participant_devices").upsert(
    {
      room_id: rid,
      participant_key: pk,
      arcade_device_id: did,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "room_id,participant_key" },
  );

  if (error) {
    console.error("[ov2CcParticipantDevice] upsert failed", error.message || error);
    return { ok: false, message: error.message };
  }
  return { ok: true };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} admin
 * @param {string} roomId
 * @param {string} participantKey
 * @returns {Promise<string|null>}
 */
export async function getOv2CcDeviceForParticipant(admin, roomId, participantKey) {
  const rid = String(roomId || "").trim();
  const pk = String(participantKey || "").trim();
  if (!rid || !pk) return null;

  const { data, error } = await admin
    .from("ov2_community_cards_participant_devices")
    .select("arcade_device_id")
    .eq("room_id", rid)
    .eq("participant_key", pk)
    .maybeSingle();

  if (error || !data) return null;
  const out = String(data.arcade_device_id || "").trim();
  return out || null;
}
