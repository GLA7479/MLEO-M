/** Wave private room (21 / CC / CW): 5-digit join code helpers. Shared by client modal and server verify. */

export const WAVE_PRIVATE_ROOM_CODE_LEN = 5;

/**
 * Normalize join input to a 5-digit string (leading zeros). Returns null if invalid.
 * @param {string} raw
 * @returns {string|null}
 */
export function normalizeWavePrivateRoomCodeInput(raw) {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 0 || d.length > WAVE_PRIVATE_ROOM_CODE_LEN) return null;
  return d.padStart(WAVE_PRIVATE_ROOM_CODE_LEN, "0");
}
