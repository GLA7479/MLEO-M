/** Idempotency keys for Color Wheel economy rows (API + server vault). */

export function buildIdemCommit(roomId, matchSeq, suffix) {
  return `ov2:cw:commit:${roomId}:${matchSeq}:${suffix}`;
}

export function buildIdemSettle(roomId, matchSeq, suffix) {
  return `ov2:cw:settle:${roomId}:${matchSeq}:${suffix}`;
}
