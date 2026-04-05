/**
 * @param {import("../room-core/roomTypes").Ov2SharedPublicRoom | null | undefined} room
 * @returns {boolean}
 */
export function isOv2QuickMatchRoom(room) {
  const qm = room?.quick_match;
  if (qm && typeof qm === "object") {
    if (qm.v === 1) return true;
    if (typeof qm.lobby_deadline_at === "string" && qm.lobby_deadline_at.length > 0) return true;
  }
  const metaQm = room?.meta?.ov2_quick_match;
  if (metaQm && typeof metaQm === "object") {
    if (metaQm.v === 1) return true;
    if (typeof metaQm.lobby_deadline_at === "string" && metaQm.lobby_deadline_at.length > 0) return true;
  }
  return false;
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
