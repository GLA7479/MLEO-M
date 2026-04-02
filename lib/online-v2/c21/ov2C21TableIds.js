/**
 * Fixed persistent 21 Challenge tables (phase 1). UUIDs must match
 * `migrations/online-v2/c21/061_ov2_c21_persistent_live_tables.sql`.
 */

export const OV2_C21_STAKE_TIERS = Object.freeze([100, 1_000, 10_000, 100_000, 1_000_000]);

/** @type {Record<number, string>} stake units → ov2_rooms.id */
export const OV2_C21_ROOM_ID_BY_STAKE = Object.freeze({
  100: "c21ade01-0000-4000-8000-000000000001",
  1_000: "c21ade02-0000-4000-8000-000000000002",
  10_000: "c21ade03-0000-4000-8000-000000000003",
  100_000: "c21ade04-0000-4000-8000-000000000004",
  1_000_000: "c21ade05-0000-4000-8000-000000000005",
});

export const OV2_C21_PRODUCT_GAME_ID = "ov2_c21";

export function resolveOv2C21RoomIdForStake(stakeUnits) {
  const n = Math.floor(Number(stakeUnits));
  const id = OV2_C21_ROOM_ID_BY_STAKE[n];
  return id || null;
}

export function parseStakeFromRoomMeta(meta) {
  const m = meta && typeof meta === "object" ? meta : {};
  const u = Math.floor(Number(m.ov2_c21_stake_units));
  return Number.isFinite(u) && u > 0 ? u : null;
}
