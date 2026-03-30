/**
 * OV2 economy constants + idempotency helpers.
 * Vault I/O: only `onlineV2VaultBridge`. DB: `ov2_rooms`, `ov2_room_members`, `ov2_economy_events`, `ov2_settlement_lines`.
 */

export const ONLINE_V2_MIN_STAKE_UNITS = 100;

export const ONLINE_V2_SUGGESTED_STAKE_PRESETS = Object.freeze([
  100, 1_000, 10_000, 100_000, 1_000_000, 10_000_000, 100_000_000,
]);

export const ONLINE_V2_ROOM_PHASE = Object.freeze({
  LOBBY: "lobby",
  /** Host confirmed start; gameplay tables not created yet. */
  PENDING_START: "pending_start",
  PENDING_STAKES: "pending_stakes",
  ACTIVE: "active",
  SETTLING: "settling",
  CLOSED: "closed",
  ABORTED: "aborted",
});

export const ONLINE_V2_MEMBER_WALLET_STATE = Object.freeze({
  NONE: "none",
  RESERVED: "reserved",
  COMMITTED: "committed",
  REFUNDED: "refunded",
  FORFEITED: "forfeited",
});

export const ONLINE_V2_ECONOMY_EVENT_KIND = Object.freeze({
  RESERVE: "reserve",
  COMMIT: "commit",
  RELEASE_RESERVE: "release_reserve",
  REFUND: "refund",
  FORFEIT: "forfeit",
  ADJUST: "adjust",
  /** Board Path (Phase 5+): ledger marker after settlement RPC; no vault transfer. */
  SESSION_FINALIZE: "session_finalize",
  /** Board Path Phase 6: room-level ledger marker; no vault transfer. */
  ROOM_FINALIZE: "room_finalize",
});

export const ONLINE_V2_SETTLEMENT_LINE_KIND = Object.freeze({
  MATCH_PAYOUT: "match_payout",
  PARTIAL_PAYOUT: "partial_payout",
  REFUND: "refund",
  FEE: "fee",
  GRID_ROW: "grid_row",
  GRID_FULL: "grid_full",
  BOARD_PATH_WIN: "board_path_win",
  BOARD_PATH_LOSS: "board_path_loss",
  BOARD_PATH_DRAW: "board_path_draw",
});

/** `ov2_rooms.product_game_id`; keep aligned with `onlineV2GameRegistry`. */
export const ONLINE_V2_GAME_KINDS = Object.freeze({
  BOARD_PATH: "ov2_board_path",
  MARK_GRID: "ov2_mark_grid",
});

export function isValidOnlineV2StakeAmount(stakeAmount) {
  const n = Math.floor(Number(stakeAmount));
  return Number.isFinite(n) && n >= ONLINE_V2_MIN_STAKE_UNITS;
}

export function clampSuggestedOnlineV2Stake(raw) {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return ONLINE_V2_MIN_STAKE_UNITS;
  return Math.max(ONLINE_V2_MIN_STAKE_UNITS, n);
}

export function buildOnlineV2EconomyEventKey(verb, roomId, participantKey, matchSeq, nonce = "") {
  return `ov2:ecm:${verb}:${roomId}:${participantKey}:${matchSeq}:${nonce}`;
}

export function buildOnlineV2SettlementKey(roomId, matchSeq, recipientParticipantKey, lineKind, nonce = "") {
  return `ov2:settle:${roomId}:${matchSeq}:${recipientParticipantKey}:${lineKind}:${nonce}`;
}

/** Idempotency key for `ov2_board_path_finalize_session` economy row (one per session). */
export function buildOnlineV2BoardPathFinalizeEventKey(sessionId) {
  return `ov2:bp:finalize:${sessionId}`;
}

/** Idempotency key for `ov2_board_path_finalize_room` economy row (one per room). */
export function buildOnlineV2BoardPathRoomFinalizeEventKey(roomId) {
  return `ov2:bp:room_finalize:${roomId}`;
}
