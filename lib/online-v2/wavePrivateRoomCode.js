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

/**
 * If `row` is a wave private room (`meta.ov2_wave_private`) with a join code, returns the code; else null.
 * @param {{ is_private?: boolean; meta?: Record<string, unknown>; join_code?: string | null } | null | undefined} row
 * @returns {string|null}
 */
export function ov2WavePrivateJoinCodeFromRoomRow(row) {
  if (!row || typeof row !== "object") return null;
  if (!row.is_private || row.meta?.ov2_wave_private !== "1") return null;
  const jc = row.join_code != null ? String(row.join_code).trim() : "";
  return jc || null;
}
