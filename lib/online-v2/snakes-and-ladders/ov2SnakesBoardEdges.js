/**
 * Snakes & Ladders board edges (ladders / snakes).
 *
 * **Canonical source:** `public.ov2_snakes_board_edges()` in Postgres — definitions only in
 * `migrations/online-v2/snakes-and-ladders/151_ov2_snakes_engine_helpers.sql` and
 * `157_ov2_snakes_board_edges_tune.sql` (idempotent for older DBs). This file MUST match those JSON literals.
 * The client loads that function via RPC and uses `OV2_SNAKES_BOARD_EDGES` below only as a
 * **fallback** when the RPC is unavailable (offline / migrations not applied).
 *
 * RPC loader: `ov2SnakesBoardEdgesFetch.js` (`fetchOv2SnakesBoardEdgesFromDb`).
 */

/** @typedef {{ ladders: Record<number, number>, snakes: Record<number, number> }} Ov2SnakesBoardEdges */

export { parseOv2SnakesBoardEdgesRpcResult } from "./ov2SnakesBoardEdgesRpcParse";

export const OV2_SNAKES_BOARD_EDGES = {
  ladders: {
    2: 15,
    7: 28,
    22: 43,
    27: 55,
    41: 63,
    50: 69,
    57: 76,
    65: 82,
    68: 90,
    71: 91,
  },
  snakes: {
    99: 80,
    94: 70,
    89: 52,
    86: 53,
    74: 35,
    62: 19,
    56: 40,
    49: 12,
    45: 23,
    16: 6,
  },
};

/**
 * Cell after dice, before edges — only when roll does not overshoot past 100.
 * @param {number} fromCell
 * @param {number} dice
 * @returns {number|null}
 */
export function ov2SnakesCellAfterDice(fromCell, dice) {
  const from = Math.floor(Number(fromCell));
  const d = Math.floor(Number(dice));
  if (!Number.isFinite(from) || !Number.isFinite(d)) return null;
  if (d < 1 || d > 6) return null;
  if (from < 1 || from > 100) return null;
  if (from + d > 100) return null;
  return from + d;
}

/**
 * @param {number} preCell
 * @param {number} finalCell
 * @param {Ov2SnakesBoardEdges} [edges] defaults to bundled fallback (prefer RPC-loaded map from session)
 * @returns {'ladder'|'snake'|null}
 */
export function ov2SnakesClassifyEdge(preCell, finalCell, edges = OV2_SNAKES_BOARD_EDGES) {
  const pre = Math.floor(Number(preCell));
  const fin = Math.floor(Number(finalCell));
  if (!Number.isFinite(pre) || !Number.isFinite(fin) || pre === fin) return null;
  if (!edges || typeof edges !== "object") return null;
  const ladders = edges.ladders;
  const snakes = edges.snakes;
  if (!ladders || !snakes) return null;
  if (ladders[pre] === fin) return "ladder";
  if (snakes[pre] === fin) return "snake";
  return null;
}
