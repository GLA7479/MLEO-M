/**
 * RPC fetch for `public.ov2_snakes_board_edges()` — isolated from `ov2SnakesBoardEdges.js`
 * so that module stays import-safe (no supabase) and cannot participate in circular init.
 */

import { supabaseMP as supabase } from "../../supabaseClients";
import { parseOv2SnakesBoardEdgesRpcResult } from "./ov2SnakesBoardEdges";

/** @param {unknown} err */
function isSnakesMpRpcUnavailable(err) {
  const code = err && typeof err === "object" ? /** @type {{ code?: string }} */ (err).code : undefined;
  const msg = String(err && typeof err === "object" && "message" in err ? err.message : err || "").toLowerCase();
  if (code === "PGRST202" || code === "42P01" || code === "42704" || code === "42883") return true;
  if (msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("undefined table")) return true;
  return false;
}

/**
 * @returns {Promise<{ ok: true, edges: NonNullable<ReturnType<typeof parseOv2SnakesBoardEdgesRpcResult>> } | { ok: false, error: string, edges: null }>}
 */
export async function fetchOv2SnakesBoardEdgesFromDb() {
  try {
    const { data, error } = await supabase.rpc("ov2_snakes_board_edges");
    if (error) {
      const msg = error.message || String(error);
      if (isSnakesMpRpcUnavailable(error)) {
        return { ok: false, error: msg, edges: null };
      }
      return { ok: false, error: msg, edges: null };
    }
    const edges = parseOv2SnakesBoardEdgesRpcResult(data);
    if (!edges) {
      return { ok: false, error: "Invalid edges payload", edges: null };
    }
    return { ok: true, edges };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isSnakesMpRpcUnavailable(e)) {
      return { ok: false, error: msg, edges: null };
    }
    return { ok: false, error: msg, edges: null };
  }
}
