/**
 * Fixed Community Cards room UUIDs — keep aligned with
 * `migrations/online-v2/community_cards/063_ov2_community_cards_persistent_live_tables.sql`.
 */

export const OV2_CC_PRODUCT_GAME_ID = "ov2_community_cards";

/** @type {readonly string[]} */
export const OV2_CC_ALL_ROOM_IDS = Object.freeze([
  "cc0da001-0000-4000-8000-000000000001",
  "cc0da002-0000-4000-8000-000000000002",
  "cc0da003-0000-4000-8000-000000000003",
  "cc0da004-0000-4000-8000-000000000004",
  "cc0da005-0000-4000-8000-000000000005",
  "cc0da006-0000-4000-8000-000000000006",
  "cc0da007-0000-4000-8000-000000000007",
  "cc0da008-0000-4000-8000-000000000008",
  "cc0da009-0000-4000-8000-000000000009",
  "cc0da00a-0000-4000-8000-00000000000a",
]);

/** stake (min entry) -> { roomId5, roomId9 } */
export const OV2_CC_ROOMS_BY_STAKE = Object.freeze({
  100: {
    max5: "cc0da001-0000-4000-8000-000000000001",
    max9: "cc0da002-0000-4000-8000-000000000002",
  },
  1_000: {
    max5: "cc0da003-0000-4000-8000-000000000003",
    max9: "cc0da004-0000-4000-8000-000000000004",
  },
  10_000: {
    max5: "cc0da005-0000-4000-8000-000000000005",
    max9: "cc0da006-0000-4000-8000-000000000006",
  },
  100_000: {
    max5: "cc0da007-0000-4000-8000-000000000007",
    max9: "cc0da008-0000-4000-8000-000000000008",
  },
  1_000_000: {
    max5: "cc0da009-0000-4000-8000-000000000009",
    max9: "cc0da00a-0000-4000-8000-00000000000a",
  },
});

export const OV2_CC_STAKE_TIERS = Object.freeze([100, 1_000, 10_000, 100_000, 1_000_000]);

/**
 * @param {{ product_game_id?: string; stake_per_seat?: number; meta?: Record<string, unknown> } | null} roomRow
 */
export function resolveOv2CcTableConfigFromRoomRow(roomRow) {
  if (!roomRow || String(roomRow.product_game_id) !== OV2_CC_PRODUCT_GAME_ID) return null;
  const tablePrice = Math.max(100, Math.floor(Number(roomRow.stake_per_seat) || 100));
  const m = roomRow.meta && typeof roomRow.meta === "object" ? roomRow.meta : {};
  const maxSeats = Math.min(9, Math.max(5, Math.floor(Number(m.ov2_cc_max_seats) || 9)));
  const sb = Math.max(1, Math.floor(Number(m.ov2_cc_small_blind) || 1));
  const bb = Math.max(sb + 1, Math.floor(Number(m.ov2_cc_big_blind) || sb * 2));
  const maxBuyin = Math.max(
    tablePrice,
    Math.floor(Number(m.ov2_cc_max_buyin) || tablePrice * 10),
  );
  return { tablePrice, maxSeats, sb, bb, maxBuyin };
}
