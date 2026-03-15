/**
 * Input validation utilities for security
 */

export function sanitizeString(input, maxLength = 1000) {
  if (typeof input !== "string") return "";
  return input.trim().substring(0, maxLength);
}

export function validateNumber(input, min = -Infinity, max = Infinity) {
  const num = Number(input);
  if (!Number.isFinite(num)) return null;
  if (num < min || num > max) return null;
  return Math.floor(num);
}

export function validatePositiveInteger(input, max = Number.MAX_SAFE_INTEGER) {
  return validateNumber(input, 1, max);
}

export function validateNonNegativeInteger(input, max = Number.MAX_SAFE_INTEGER) {
  return validateNumber(input, 0, max);
}

export function validateObject(input, maxKeys = 100) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const keys = Object.keys(input);
  if (keys.length > maxKeys) return null;
  return input;
}

export function validateArray(input, maxLength = 1000) {
  if (!Array.isArray(input)) return null;
  if (input.length > maxLength) return null;
  return input;
}

export function sanitizeGameId(gameId) {
  if (typeof gameId !== "string") return null;
  // Only allow alphanumeric, hyphens, underscores
  const sanitized = gameId.trim().replace(/[^a-zA-Z0-9_-]/g, "");
  if (sanitized.length === 0 || sanitized.length > 50) return null;
  return sanitized;
}

export function validateUuid(uuid) {
  if (typeof uuid !== "string") return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid.trim());
}
