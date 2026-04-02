/** Idempotency keys for Community Cards economy rows + vault RPC game_id derivation. */

export function buildIdemCommit(roomId, matchSeq, suffix) {
  return `ov2:cc:commit:${roomId}:${matchSeq}:${suffix}`;
}

export function buildIdemSettle(roomId, matchSeq, suffix) {
  return `ov2:cc:settle:${roomId}:${matchSeq}:${suffix}`;
}
