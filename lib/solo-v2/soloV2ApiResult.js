/** Shared Solo V2 fetch response classification for session APIs. */

export const SOLO_V2_API_RESULT = {
  SUCCESS: "success",
  PENDING_MIGRATION: "pending_migration",
  UNAVAILABLE: "unavailable",
  CONFLICT: "conflict",
  VALIDATION: "validation_error",
  ERROR: "error",
};

export function classifySoloV2ApiResult(response, payload) {
  const category = String(payload?.category || "");
  const status = String(payload?.status || "");
  if (response.ok) return SOLO_V2_API_RESULT.SUCCESS;
  if (category === "pending_migration") return SOLO_V2_API_RESULT.PENDING_MIGRATION;
  if (category === "unavailable") return SOLO_V2_API_RESULT.UNAVAILABLE;
  if (category === "conflict") return SOLO_V2_API_RESULT.CONFLICT;
  if (category === "validation_error") return SOLO_V2_API_RESULT.VALIDATION;
  if (status === "pending_migration") return SOLO_V2_API_RESULT.PENDING_MIGRATION;
  if (status === "unavailable" || status === "server_error") return SOLO_V2_API_RESULT.UNAVAILABLE;
  return SOLO_V2_API_RESULT.ERROR;
}

export function buildSoloV2ApiErrorMessage(payload, fallback) {
  return String(payload?.message || "").trim() || fallback;
}

export function isSoloV2EventRejectedStaleSessionMessage(message) {
  const m = String(message || "").toLowerCase();
  if (!m) return false;
  if (m.includes("session expired")) return true;
  if (m.includes("session is not writable")) return true;
  if (m.includes("ownership mismatch")) return true;
  if (m.includes("session not found")) return true;
  return false;
}
