/**
 * Prefer the logically newer OV2 match snapshot when multiple async sources
 * (initial fetch, realtime, RPC response) can arrive out of order.
 *
 * @param {unknown} prev
 * @param {unknown} next
 * @returns {unknown} `next` when it should replace `prev`, else `prev`.
 */
export function ov2PreferNewerSnapshot(prev, next) {
  if (next == null || typeof next !== "object") return prev;
  const cur = prev && typeof prev === "object" ? prev : null;
  const curSid = cur?.sessionId != null ? String(cur.sessionId) : "";
  const nextSid = next?.sessionId != null ? String(next.sessionId) : "";
  const curRev = cur?.revision != null ? Number(cur.revision) : -Infinity;
  const nextRev = next?.revision != null ? Number(next.revision) : -Infinity;
  if (curSid && nextSid && nextSid !== curSid) return prev;
  if (Number.isFinite(curRev) && Number.isFinite(nextRev) && nextRev < curRev) return prev;
  return next;
}
