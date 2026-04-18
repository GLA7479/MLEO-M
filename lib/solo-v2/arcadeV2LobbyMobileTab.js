/** Mobile lobby tab (matches Tailwind `md` breakpoint). */
const STORAGE_KEY = "solo_v2_arcade_mobile_group";
const MAX_GROUP_INDEX = 3;

export function shouldPersistArcadeV2MobileLobbyGroup() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 767px)").matches;
}

export function readArcadeV2MobileLobbyGroup() {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw == null) return null;
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n) || n < 0 || n > MAX_GROUP_INDEX) return null;
    return n;
  } catch {
    return null;
  }
}

export function saveArcadeV2MobileLobbyGroup(index) {
  if (typeof window === "undefined") return;
  const n = Math.max(0, Math.min(MAX_GROUP_INDEX, Math.floor(Number(index)) || 0));
  try {
    sessionStorage.setItem(STORAGE_KEY, String(n));
  } catch {
    // ignore quota / private mode
  }
}

export function navigateBackToArcadeV2() {
  if (typeof window !== "undefined") window.location.href = "/arcade-v2";
}
