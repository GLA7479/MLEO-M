/**
 * RPC JSON → edges object. Lives in its own module so `ov2SnakesBoardEdgesFetch` never depends on
 * the same bundle entry as `useOv2SnakesSession` (avoids circular / partial-init "not a function").
 */

/** @typedef {{ ladders: Record<number, number>, snakes: Record<number, number> }} Ov2SnakesBoardEdges */

/**
 * Normalizes JSON returned by `public.ov2_snakes_board_edges()` (string keys from jsonb).
 * @param {unknown} raw
 * @returns {Ov2SnakesBoardEdges|null}
 */
export function parseOv2SnakesBoardEdgesRpcResult(raw) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const L = o.ladders;
  const S = o.snakes;
  if (!L || !S || typeof L !== "object" || typeof S !== "object") return null;
  /** @type {Record<number, number>} */
  const ladders = {};
  /** @type {Record<number, number>} */
  const snakes = {};
  for (const [k, v] of Object.entries(/** @type {Record<string, unknown>} */ (L))) {
    const from = Math.floor(Number(k));
    const to = Math.floor(Number(v));
    if (Number.isInteger(from) && from >= 1 && from <= 100 && Number.isInteger(to) && to >= 1 && to <= 100) {
      ladders[from] = to;
    }
  }
  for (const [k, v] of Object.entries(/** @type {Record<string, unknown>} */ (S))) {
    const from = Math.floor(Number(k));
    const to = Math.floor(Number(v));
    if (Number.isInteger(from) && from >= 1 && from <= 100 && Number.isInteger(to) && to >= 1 && to <= 100) {
      snakes[from] = to;
    }
  }
  if (Object.keys(ladders).length === 0 && Object.keys(snakes).length === 0) return null;
  return { ladders, snakes };
}
