/** Shared idempotency keys for C21 economy rows (API + server vault). */

export function buildIdemCommit(roomId, matchSeq, suffix) {
  return `ov2:c21:commit:${roomId}:${matchSeq}:${suffix}`;
}

export function buildIdemSettle(roomId, matchSeq, suffix) {
  return `ov2:c21:settle:${roomId}:${matchSeq}:${suffix}`;
}
