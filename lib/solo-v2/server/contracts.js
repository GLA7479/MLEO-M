import { validateObject, validatePositiveInteger, validateUuid } from "../../server/inputValidation";
import { getSoloV2GameByKey } from "./gameCatalog";
import { SOLO_V2_ALLOWED_EVENT_TYPES, SOLO_V2_SESSION_MODE } from "./sessionTypes";

export function resolvePlayerRef(req) {
  const headerValue = String(req.headers["x-solo-v2-player"] || "").trim();
  if (headerValue) return headerValue.slice(0, 120);
  return "solo-v2-anonymous";
}

export function parseCreateSessionPayload(body) {
  const payload = validateObject(body || {}, 20);
  if (!payload) return { ok: false, message: "Invalid payload" };

  const gameKey = String(payload.gameKey || "").trim();
  if (!gameKey) return { ok: false, message: "gameKey is required" };
  if (!getSoloV2GameByKey(gameKey)) return { ok: false, message: "Unknown gameKey" };

  const sessionModeRaw = String(payload.sessionMode || SOLO_V2_SESSION_MODE.STANDARD).trim().toLowerCase();
  const sessionMode = Object.values(SOLO_V2_SESSION_MODE).includes(sessionModeRaw)
    ? sessionModeRaw
    : null;
  if (!sessionMode) return { ok: false, message: "Invalid sessionMode" };

  const entryAmountRaw = payload.entryAmount ?? 0;
  const entryAmountNum = Number(entryAmountRaw);
  let entryAmount = null;
  if (Number.isFinite(entryAmountNum) && entryAmountNum === 0) {
    entryAmount = 0;
  } else {
    entryAmount = validatePositiveInteger(entryAmountRaw, 1_000_000_000);
  }
  if (entryAmount === null) return { ok: false, message: "Invalid entryAmount" };

  const clientNonce = payload.clientNonce ? String(payload.clientNonce).slice(0, 120) : null;
  const idempotencyKey = payload.idempotencyKey ? String(payload.idempotencyKey).slice(0, 120) : null;

  return {
    ok: true,
    value: { gameKey, sessionMode, entryAmount, clientNonce, idempotencyKey },
  };
}

export function parseSessionId(value) {
  const sessionId = String(value || "").trim();
  if (!validateUuid(sessionId)) return null;
  return sessionId;
}

export function parseSessionEventPayload(body) {
  const payload = validateObject(body || {}, 25);
  if (!payload) return { ok: false, message: "Invalid payload" };

  const eventType = String(payload.eventType || "").trim();
  if (!eventType) return { ok: false, message: "eventType is required" };
  if (!SOLO_V2_ALLOWED_EVENT_TYPES.has(eventType)) {
    return { ok: false, message: "Unsupported eventType" };
  }

  const eventPayload = validateObject(payload.eventPayload || {}, 40);
  if (!eventPayload) return { ok: false, message: "Invalid eventPayload" };

  return { ok: true, value: { eventType, eventPayload } };
}
