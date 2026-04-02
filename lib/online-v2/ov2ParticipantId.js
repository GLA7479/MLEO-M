/**
 * Stable OV2 participant key (browser-local). Not shared with legacy `mp_client_id`.
 */

const OV2_PARTICIPANT_STORAGE_KEY = "ov2_participant_id_v1";

/** Stable within tab when localStorage is unavailable (refresh/remount). */
let memoryParticipantFallback = null;

function randomUuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getOv2ParticipantId() {
  if (typeof window === "undefined") return "00000000-0000-0000-0000-000000000000";
  try {
    let v = window.localStorage.getItem(OV2_PARTICIPANT_STORAGE_KEY);
    if (!v) {
      v = randomUuid();
      window.localStorage.setItem(OV2_PARTICIPANT_STORAGE_KEY, v);
    }
    return v;
  } catch {
    if (!memoryParticipantFallback) memoryParticipantFallback = randomUuid();
    return memoryParticipantFallback;
  }
}

/** Clears stored id; next `getOv2ParticipantId()` mints a new one (debug / support only). */
export function resetOv2ParticipantId() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(OV2_PARTICIPANT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export { OV2_PARTICIPANT_STORAGE_KEY };
