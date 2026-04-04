/**
 * Fixed persistent Color Wheel tables. UUIDs must match
 * `065_ov2_color_wheel_persistent_live_tables.sql` and
 * `066_ov2_color_wheel_stake_1_10_rooms.sql`.
 */

export const OV2_CW_STAKE_TIERS = Object.freeze([1, 10, 100, 1000, 10000, 100000, 1000000]);

/** @type {Record<number, string>} stake units → ov2_rooms.id */
export const OV2_CW_ROOM_ID_BY_STAKE = Object.freeze({
  1: "c0d3e106-0000-4000-8000-000000000006",
  10: "c0d3e107-0000-4000-8000-000000000007",
  100: "c0d3e101-0000-4000-8000-000000000001",
  1000: "c0d3e102-0000-4000-8000-000000000002",
  10000: "c0d3e103-0000-4000-8000-000000000003",
  100000: "c0d3e104-0000-4000-8000-000000000004",
  1000000: "c0d3e105-0000-4000-8000-000000000005",
});

export const OV2_CW_PRODUCT_GAME_ID = "ov2_color_wheel";

export const OV2_CW_MAX_SEATS = 6;

export function resolveOv2CwRoomIdForStake(stakeUnits) {
  const n = Math.floor(Number(stakeUnits));
  const id = OV2_CW_ROOM_ID_BY_STAKE[n];
  return id || null;
}

export function parseStakeFromRoomMeta(meta) {
  const m = meta && typeof meta === "object" ? meta : {};
  const u = Math.floor(Number(m.ov2_cw_stake_units));
  return Number.isFinite(u) && u > 0 ? u : null;
}
