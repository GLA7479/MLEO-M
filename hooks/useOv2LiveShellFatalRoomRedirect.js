import { useEffect } from "react";
import { clearOv2SharedLastRoomSessionKey } from "../lib/online-v2/onlineV2GameRegistry";

/**
 * Wrong/missing room row for a live shell: clear resume key and return to shared rooms (bad-path only).
 */
export function useOv2LiveShellFatalRoomRedirect(router, roomId, loadError) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!router.isReady || !roomId || !loadError) return;
    const err = String(loadError).toLowerCase();
    const fatal =
      err.includes("not found") || err.includes("not a ludo") || err.includes("not a rummy");
    if (!fatal) return;
    clearOv2SharedLastRoomSessionKey();
    const t = window.setTimeout(() => void router.replace("/online-v2/rooms"), 700);
    return () => clearTimeout(t);
  }, [router.isReady, roomId, loadError, router]);
}
