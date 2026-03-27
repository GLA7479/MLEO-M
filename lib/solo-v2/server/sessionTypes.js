export const SOLO_V2_SESSION_STATUS = {
  CREATED: "created",
  IN_PROGRESS: "in_progress",
  RESOLVED: "resolved",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
};

export const SOLO_V2_SESSION_MODE = {
  STANDARD: "standard",
  FREEPLAY: "freeplay",
};

export const SOLO_V2_ALLOWED_EVENT_TYPES = new Set([
  "client_action",
  "heartbeat",
  "view_change",
  "session_note",
]);
