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
    // `ov2_shared_get_room_canonical_ledger` returns "Room not found or invalid credentials." for
    // auth/member-state mismatches — substring "not found" must NOT trigger a redirect loop with /online-v2/rooms.
    const fatalWrongProduct =
      err.includes("this room is not a") && err.includes("table");
    const fatalMissingRoom =
      (err.includes("room not found") || err.includes("room is not")) &&
      !err.includes("invalid credentials");
    const fatal = fatalWrongProduct || fatalMissingRoom;
    if (!fatal) return;
    clearOv2SharedLastRoomSessionKey();
    const t = window.setTimeout(() => void router.replace("/online-v2/rooms"), 700);
    return () => clearTimeout(t);
  }, [router.isReady, roomId, loadError, router]);
}
