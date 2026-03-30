/**
 * Dev-only helpers to inspect OV2 Board Path DB rows (console). No production UI.
 */

import { fetchBoardPathSessionDetailed } from "./board-path/ov2BoardPathSessionApi";
import { fetchOv2RoomById, fetchOv2RoomMembers } from "./ov2RoomsApi";

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} roomId
 * @returns {Promise<Record<string, unknown>>}
 */
export async function ov2BoardPathSmokeInspect(supabase, roomId) {
  const room = await fetchOv2RoomById(roomId);
  const members = await fetchOv2RoomMembers(roomId);
  const sessionProbe = await fetchBoardPathSessionDetailed(supabase, roomId);
  const out = { room, members, sessionProbe };
  console.info("[ov2-bp-smoke]", out);
  return out;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 */
export function installOv2BoardPathDevSmoke(supabase) {
  if (typeof window === "undefined") return;
  window.__ov2BpSmoke = async roomId => {
    const rid =
      roomId ||
      (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("room") : null) ||
      "";
    if (!rid) {
      console.warn("[ov2-bp-smoke] Pass room UUID or open with ?room=<uuid>");
      return null;
    }
    return ov2BoardPathSmokeInspect(supabase, String(rid));
  };
  console.info("[ov2-bp-smoke] Dev helper installed: await __ov2BpSmoke() or __ov2BpSmoke(roomId)");
}
