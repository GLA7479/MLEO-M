/**
 * Shared OV2 unified room types (client). Authoritative state lives in Postgres RPCs.
 */

/** @typedef {'OPEN' | 'STARTING' | 'IN_GAME' | 'CLOSED'} Ov2SharedRoomStatus */
/** @typedef {'public' | 'private' | 'hidden'} Ov2SharedVisibilityMode */
/** @typedef {'host' | 'member'} Ov2SharedMemberRole */
/** @typedef {'joined' | 'left' | 'ejected' | 'disconnected'} Ov2SharedMemberState */

/**
 * @typedef {Object} Ov2SharedPublicRoom
 * @property {string} id
 * @property {string} product_game_id
 * @property {string} [title]
 * @property {Ov2SharedRoomStatus|null} [status]
 * @property {Ov2SharedVisibilityMode|null} [visibility_mode]
 * @property {string|null} [join_code]
 * @property {boolean} [requires_password]
 * @property {number|null} [min_players]
 * @property {number|null} [max_players]
 * @property {number|null} [stake_per_seat]
 * @property {string|null} [host_member_id]
 * @property {string|null} [created_by_participant_key]
 * @property {string|null} [active_runtime_id]
 * @property {number} [room_revision]
 * @property {string|null} [last_activity_at]
 * @property {boolean} [is_hard_closed]
 * @property {string|null} [hard_closed_at]
 * @property {string|null} [hard_close_reason]
 * @property {string|null} [started_at]
 * @property {string|null} [ended_at]
 * @property {number} [shared_schema_version]
 * @property {Record<string, unknown>} [quick_match] — subset from room meta (Quick Match V1).
 */

/**
 * @typedef {Object} Ov2SharedPublicMember
 * @property {string} id
 * @property {string} room_id
 * @property {string} participant_key
 * @property {string} display_name
 * @property {number|null} [seat_index]
 * @property {Ov2SharedMemberRole|null} [role]
 * @property {Ov2SharedMemberState|null} [member_state]
 * @property {string|null} [joined_at]
 * @property {string|null} [left_at]
 * @property {string|null} [ejected_at]
 * @property {string|null} [eject_reason]
 * @property {string|null} [last_seen_at]
 */

/**
 * @typedef {Object} Ov2SharedRoomSnapshot
 * @property {Ov2SharedPublicRoom} room
 * @property {Ov2SharedPublicMember[]} members
 */

/**
 * @typedef {Object} Ov2SharedRuntimeHandoff
 * @property {string} room_id
 * @property {string} product_game_id
 * @property {number} room_revision
 * @property {string} active_runtime_id
 * @property {string} economy_entry_policy
 * @property {boolean} economy_policy_applied
 * @property {unknown} participants
 */

export const OV2_SHARED_ROOM_PUBLIC_FIELDS =
  "id,created_at,updated_at,product_game_id,title,status,visibility_mode,join_code,min_players,max_players,stake_per_seat,host_member_id,created_by_participant_key,active_runtime_id,room_revision,last_activity_at,is_hard_closed,hard_closed_at,hard_close_reason,started_at,ended_at,shared_schema_version";
