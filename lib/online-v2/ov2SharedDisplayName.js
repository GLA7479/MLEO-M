/**
 * Single shared OV2 display name for Shared rooms, 21 Challenge, and Community Cards (localStorage).
 */

export const OV2_SHARED_DISPLAY_NAME_KEY = "ov2_display_name_v1";

const LEGACY_DISPLAY_NAME_KEYS = ["ov2_c21_display_name_v1", "ov2_cc_display_name_v1"];

/**
 * @returns {string}
 */
export function readOv2SharedDisplayName() {
  if (typeof window === "undefined") return "";
  try {
    let v = window.localStorage.getItem(OV2_SHARED_DISPLAY_NAME_KEY);
    if (v != null && v !== "") return v;
    for (const legacy of LEGACY_DISPLAY_NAME_KEYS) {
      const l = window.localStorage.getItem(legacy);
      if (l != null && l !== "") {
        window.localStorage.setItem(OV2_SHARED_DISPLAY_NAME_KEY, l);
        return l;
      }
    }
    return "";
  } catch {
    return "";
  }
}

/**
 * @param {string} raw
 */
export function writeOv2SharedDisplayName(raw) {
  if (typeof window === "undefined") return;
  try {
    const s = raw == null ? "" : String(raw);
    window.localStorage.setItem(OV2_SHARED_DISPLAY_NAME_KEY, s);
    for (const legacy of LEGACY_DISPLAY_NAME_KEYS) {
      window.localStorage.removeItem(legacy);
    }
  } catch {
    /* ignore */
  }
}
