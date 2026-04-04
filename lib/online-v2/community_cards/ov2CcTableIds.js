/**
 * Fixed Community Cards room UUIDs — keep aligned with
 * `migrations/online-v2/community_cards/069_ov2_community_cards_public_tables_expand_10_per_category.sql`.
 */

export const OV2_CC_PRODUCT_GAME_ID = "ov2_community_cards";

/** @type {readonly { stake: number; maxSeats: 5 | 9; roomIds: readonly string[] }[]} */
export const OV2_CC_PUBLIC_CATEGORIES = Object.freeze([
  Object.freeze({ stake: 100, maxSeats: 5, roomIds: Object.freeze(["cc0da001-0000-4000-8000-000000000001", "cc0da001-0000-4000-8000-000000000011", "cc0da001-0000-4000-8000-000000000012", "cc0da001-0000-4000-8000-000000000013", "cc0da001-0000-4000-8000-000000000014", "cc0da001-0000-4000-8000-000000000015", "cc0da001-0000-4000-8000-000000000016", "cc0da001-0000-4000-8000-000000000017", "cc0da001-0000-4000-8000-000000000018", "cc0da001-0000-4000-8000-000000000019"]) }),
  Object.freeze({ stake: 100, maxSeats: 9, roomIds: Object.freeze(["cc0da002-0000-4000-8000-000000000002", "cc0da002-0000-4000-8000-000000000011", "cc0da002-0000-4000-8000-000000000012", "cc0da002-0000-4000-8000-000000000013", "cc0da002-0000-4000-8000-000000000014", "cc0da002-0000-4000-8000-000000000015", "cc0da002-0000-4000-8000-000000000016", "cc0da002-0000-4000-8000-000000000017", "cc0da002-0000-4000-8000-000000000018", "cc0da002-0000-4000-8000-000000000019"]) }),
  Object.freeze({ stake: 1000, maxSeats: 5, roomIds: Object.freeze(["cc0da003-0000-4000-8000-000000000003", "cc0da003-0000-4000-8000-000000000011", "cc0da003-0000-4000-8000-000000000012", "cc0da003-0000-4000-8000-000000000013", "cc0da003-0000-4000-8000-000000000014", "cc0da003-0000-4000-8000-000000000015", "cc0da003-0000-4000-8000-000000000016", "cc0da003-0000-4000-8000-000000000017", "cc0da003-0000-4000-8000-000000000018", "cc0da003-0000-4000-8000-000000000019"]) }),
  Object.freeze({ stake: 1000, maxSeats: 9, roomIds: Object.freeze(["cc0da004-0000-4000-8000-000000000004", "cc0da004-0000-4000-8000-000000000011", "cc0da004-0000-4000-8000-000000000012", "cc0da004-0000-4000-8000-000000000013", "cc0da004-0000-4000-8000-000000000014", "cc0da004-0000-4000-8000-000000000015", "cc0da004-0000-4000-8000-000000000016", "cc0da004-0000-4000-8000-000000000017", "cc0da004-0000-4000-8000-000000000018", "cc0da004-0000-4000-8000-000000000019"]) }),
  Object.freeze({ stake: 10000, maxSeats: 5, roomIds: Object.freeze(["cc0da005-0000-4000-8000-000000000005", "cc0da005-0000-4000-8000-000000000011", "cc0da005-0000-4000-8000-000000000012", "cc0da005-0000-4000-8000-000000000013", "cc0da005-0000-4000-8000-000000000014", "cc0da005-0000-4000-8000-000000000015", "cc0da005-0000-4000-8000-000000000016", "cc0da005-0000-4000-8000-000000000017", "cc0da005-0000-4000-8000-000000000018", "cc0da005-0000-4000-8000-000000000019"]) }),
  Object.freeze({ stake: 10000, maxSeats: 9, roomIds: Object.freeze(["cc0da006-0000-4000-8000-000000000006", "cc0da006-0000-4000-8000-000000000011", "cc0da006-0000-4000-8000-000000000012", "cc0da006-0000-4000-8000-000000000013", "cc0da006-0000-4000-8000-000000000014", "cc0da006-0000-4000-8000-000000000015", "cc0da006-0000-4000-8000-000000000016", "cc0da006-0000-4000-8000-000000000017", "cc0da006-0000-4000-8000-000000000018", "cc0da006-0000-4000-8000-000000000019"]) }),
  Object.freeze({ stake: 100000, maxSeats: 5, roomIds: Object.freeze(["cc0da007-0000-4000-8000-000000000007", "cc0da007-0000-4000-8000-000000000011", "cc0da007-0000-4000-8000-000000000012", "cc0da007-0000-4000-8000-000000000013", "cc0da007-0000-4000-8000-000000000014", "cc0da007-0000-4000-8000-000000000015", "cc0da007-0000-4000-8000-000000000016", "cc0da007-0000-4000-8000-000000000017", "cc0da007-0000-4000-8000-000000000018", "cc0da007-0000-4000-8000-000000000019"]) }),
  Object.freeze({ stake: 100000, maxSeats: 9, roomIds: Object.freeze(["cc0da008-0000-4000-8000-000000000008", "cc0da008-0000-4000-8000-000000000011", "cc0da008-0000-4000-8000-000000000012", "cc0da008-0000-4000-8000-000000000013", "cc0da008-0000-4000-8000-000000000014", "cc0da008-0000-4000-8000-000000000015", "cc0da008-0000-4000-8000-000000000016", "cc0da008-0000-4000-8000-000000000017", "cc0da008-0000-4000-8000-000000000018", "cc0da008-0000-4000-8000-000000000019"]) }),
  Object.freeze({ stake: 1000000, maxSeats: 5, roomIds: Object.freeze(["cc0da009-0000-4000-8000-000000000009", "cc0da009-0000-4000-8000-000000000011", "cc0da009-0000-4000-8000-000000000012", "cc0da009-0000-4000-8000-000000000013", "cc0da009-0000-4000-8000-000000000014", "cc0da009-0000-4000-8000-000000000015", "cc0da009-0000-4000-8000-000000000016", "cc0da009-0000-4000-8000-000000000017", "cc0da009-0000-4000-8000-000000000018", "cc0da009-0000-4000-8000-000000000019"]) }),
  Object.freeze({ stake: 1000000, maxSeats: 9, roomIds: Object.freeze(["cc0da00a-0000-4000-8000-00000000000a", "cc0da00a-0000-4000-8000-000000000011", "cc0da00a-0000-4000-8000-000000000012", "cc0da00a-0000-4000-8000-000000000013", "cc0da00a-0000-4000-8000-000000000014", "cc0da00a-0000-4000-8000-000000000015", "cc0da00a-0000-4000-8000-000000000016", "cc0da00a-0000-4000-8000-000000000017", "cc0da00a-0000-4000-8000-000000000018", "cc0da00a-0000-4000-8000-000000000019"]) }),
]);

export const OV2_CC_ALL_ROOM_IDS = Object.freeze(OV2_CC_PUBLIC_CATEGORIES.flatMap(c => [...c.roomIds]));

export const OV2_CC_ROOMS_BY_STAKE = Object.freeze(
  Object.fromEntries(
    [100, 1_000, 10_000, 100_000, 1_000_000].map(stake => [
      stake,
      Object.freeze({
        max5: OV2_CC_PUBLIC_CATEGORIES.find(c => c.stake === stake && c.maxSeats === 5).roomIds[0],
        max9: OV2_CC_PUBLIC_CATEGORIES.find(c => c.stake === stake && c.maxSeats === 9).roomIds[0],
      }),
    ]),
  ),
);

export const OV2_CC_STAKE_TIERS = Object.freeze([100, 1_000, 10_000, 100_000, 1_000_000]);

export const OV2_CC_ROOM_MAX_SEATS_BY_ID = Object.freeze(
  OV2_CC_PUBLIC_CATEGORIES.reduce((acc, cat) => {
    for (const id of cat.roomIds) acc[id] = cat.maxSeats;
    return acc;
  }, /** @type {Record<string, number>} */ ({})),
);

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

export function resolveOv2CcCategoryIndex(stake, maxSeats) {
  const s = Math.floor(Number(stake));
  const m = Math.floor(Number(maxSeats));
  return OV2_CC_PUBLIC_CATEGORIES.findIndex(c => c.stake === s && c.maxSeats === m);
}
