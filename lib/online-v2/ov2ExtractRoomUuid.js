/**
 * Pull first UUID v4-ish from pasted link or raw id (case-insensitive).
 */
export function extractOv2RoomUuidFromText(raw) {
  const m = String(raw || "").match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
  );
  return m ? m[0].toLowerCase() : null;
}
