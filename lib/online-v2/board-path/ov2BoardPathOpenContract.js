/**
 * OV2 Board Path — local session open eligibility (app-only; no DB).
 * Host-only initiation; guests hydrate from shared local record only.
 */

import { ONLINE_V2_GAME_KINDS, ONLINE_V2_MEMBER_WALLET_STATE, ONLINE_V2_ROOM_PHASE } from "../ov2Economy";
import { getOv2MinPlayersForProduct } from "../onlineV2GameRegistry";
import { boardPathRoomEligibleForSessionOpen } from "../ov2BoardPathBootstrapContract";

/**
 * @param {{ host_participant_key?: string|null }|null|undefined} room
 * @param {{ participant_key: string }[]} members
 * @returns {string|null}
 */
export function resolveBoardPathHostParticipantKey(room, members) {
  if (!room || !Array.isArray(members) || members.length === 0) return null;
  const raw = room.host_participant_key;
  const h = typeof raw === "string" ? raw.trim() : "";
  if (!h) return null;
  return members.some(m => m.participant_key === h) ? h : null;
}

/**
 * @param {string|null|undefined} selfKey
 * @param {string|null|undefined} hostKey
 */
export function isBoardPathSelfHost(selfKey, hostKey) {
  return Boolean(selfKey && hostKey && selfKey === hostKey);
}

function nMatchSeq(v) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : 0;
}

function allMembersCommitted(members) {
  return (
    Array.isArray(members) &&
    members.length > 0 &&
    members.every(m => m.wallet_state === ONLINE_V2_MEMBER_WALLET_STATE.COMMITTED)
  );
}

/**
 * Room is in a state where a Board Path match session may be opened (server or local bridge).
 * @param {{ lifecycle_phase?: string }|null|undefined} room
 */
export function isBoardPathRoomInPreSessionMatchPhase(room) {
  if (!room?.lifecycle_phase) return false;
  const p = room.lifecycle_phase;
  if (p === ONLINE_V2_ROOM_PHASE.ACTIVE) return true;
  if (p === ONLINE_V2_ROOM_PHASE.PENDING_STAKES) return true;
  return false;
}

/**
 * Backend has not yet bound a session row to the room.
 * @param {{ active_session_id?: string|null }|null|undefined} room
 */
export function boardPathRoomLacksBackendSessionId(room) {
  const id = room?.active_session_id;
  if (id == null) return true;
  if (typeof id === "string" && id.trim() === "") return true;
  return false;
}

/**
 * @param {{ product_game_id?: string }|null|undefined} room
 */
export function isBoardPathProductRoom(room) {
  const id = room?.product_game_id || ONLINE_V2_GAME_KINDS.BOARD_PATH;
  return id === ONLINE_V2_GAME_KINDS.BOARD_PATH;
}

/**
 * Defensive: enough seated members for the product.
 * @param {{ product_game_id?: string }|null|undefined} room
 * @param {{ participant_key: string }[]} members
 */
export function boardPathHasMinMembers(room, members) {
  const productId = room?.product_game_id || ONLINE_V2_GAME_KINDS.BOARD_PATH;
  const min = getOv2MinPlayersForProduct(productId);
  return Array.isArray(members) && members.length >= min;
}

/**
 * Stake + lifecycle gate for opening a session locally (mirrors adapter “ready for session” band).
 * @param {{ lifecycle_phase?: string, active_session_id?: string|null }|null|undefined} room
 * @param {{ participant_key: string, wallet_state?: string }[]} members
 */
export function boardPathRoomStakeEligibleForLocalSession(room, members) {
  if (!room) return false;
  const p = room.lifecycle_phase;
  if (p === ONLINE_V2_ROOM_PHASE.ACTIVE) {
    return boardPathRoomEligibleForSessionOpen(room, members);
  }
  if (p === ONLINE_V2_ROOM_PHASE.PENDING_STAKES) {
    return allMembersCommitted(members);
  }
  return false;
}

/**
 * Full gate: may the **host** create a new local session for this room/match?
 * @param {{ id?: string|null, lifecycle_phase?: string, active_session_id?: string|null, product_game_id?: string, host_participant_key?: string|null }|null|undefined} room
 * @param {{ participant_key: string, wallet_state?: string, display_name?: string|null }[]} members
 * @param {string|null|undefined} selfParticipantKey
 */
export function shouldHostOpenLocalBoardPathSession(room, members, selfParticipantKey) {
  if (!room?.id || typeof room.id !== "string") return false;
  if (!boardPathRoomLacksBackendSessionId(room)) return false;
  if (!isBoardPathProductRoom(room)) return false;
  if (!isBoardPathRoomInPreSessionMatchPhase(room)) return false;
  if (!boardPathHasMinMembers(room, members)) return false;
  if (!boardPathRoomStakeEligibleForLocalSession(room, members)) return false;

  const selfKey = typeof selfParticipantKey === "string" ? selfParticipantKey.trim() : "";
  if (!selfKey || !members.some(m => m.participant_key === selfKey)) return false;

  const hostKey = resolveBoardPathHostParticipantKey(room, members);
  if (!hostKey) return false;
  if (!isBoardPathSelfHost(selfKey, hostKey)) return false;

  return true;
}

/**
 * Guest may read a local session record for hydration (never create).
 * Same lifecycle/stake gates; host identity not required to match self.
 */
export function shouldGuestHydrateLocalBoardPathSession(room, members, selfParticipantKey) {
  if (!room?.id || typeof room.id !== "string") return false;
  if (!boardPathRoomLacksBackendSessionId(room)) return false;
  if (!isBoardPathProductRoom(room)) return false;
  if (!isBoardPathRoomInPreSessionMatchPhase(room)) return false;
  if (!boardPathHasMinMembers(room, members)) return false;
  if (!boardPathRoomStakeEligibleForLocalSession(room, members)) return false;

  const selfKey = typeof selfParticipantKey === "string" ? selfParticipantKey.trim() : "";
  if (!selfKey || !members.some(m => m.participant_key === selfKey)) return false;

  const hostKey = resolveBoardPathHostParticipantKey(room, members);
  if (!hostKey) return false;
  if (isBoardPathSelfHost(selfKey, hostKey)) return false;

  return true;
}

/**
 * Stable key for localStorage + in-memory maps (per room + match sequence).
 * @param {string} roomId
 * @param {number|string} matchSeq
 */
export function boardPathLocalSessionStorageKey(roomId, matchSeq) {
  return `ov2:board-path:session-open:${roomId}:${nMatchSeq(matchSeq)}`;
}

/**
 * Room has a backend session id but the client context session row is missing or stale → fetch from DB.
 * @param {{ active_session_id?: string|null }|null|undefined} room
 * @param {{ id?: string|null }|null|undefined} session
 */
export function shouldFetchBoardPathSession(room, session) {
  const aid = room?.active_session_id;
  if (aid == null || (typeof aid === "string" && aid.trim() === "")) return false;
  if (!session?.id) return true;
  return String(session.id) !== String(aid);
}

/** Dev / Storybook room ids — skip Supabase open+fetch (deterministic in-memory bundle only). */
export function boardPathRoomIdIsOfflineFixture(roomId) {
  return /^00000000-0000-4000-8000-/i.test(String(roomId || ""));
}
