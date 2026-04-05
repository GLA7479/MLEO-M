/**
 * @param {import("../room-core/roomTypes").Ov2SharedPublicRoom | null | undefined} room
 * @returns {boolean}
 */
export function isOv2QuickMatchRoom(room) {
  const qm = room?.quick_match;
  if (!qm || typeof qm !== "object") return false;
  if (qm.v === 1) return true;
  return typeof qm.lobby_deadline_at === "string" && qm.lobby_deadline_at.length > 0;
}

/**
 * @param {import("../room-core/roomTypes").Ov2SharedPublicRoom | null | undefined} room
 * @returns {string | null}
 */
export function parseOv2QuickMatchLobbyDeadlineIso(room) {
  const qm = room?.quick_match;
  if (!qm || typeof qm !== "object") return null;
  const raw = qm.lobby_deadline_at;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}
