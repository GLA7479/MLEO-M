import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const C21_TIERS = [10, 100, 1000, 10000, 100000, 1000000];
const C21_LEGACY = {
  100: "c21ade01-0000-4000-8000-000000000001",
  1000: "c21ade02-0000-4000-8000-000000000002",
  10000: "c21ade03-0000-4000-8000-000000000003",
  100000: "c21ade04-0000-4000-8000-000000000004",
  1000000: "c21ade05-0000-4000-8000-000000000005",
};

function c21Uuid(tier, tableIdx) {
  if (C21_LEGACY[tier] && tableIdx === 1) return C21_LEGACY[tier];
  const k = tableIdx;
  if (tier === 10) return `c21ade10-0000-4000-8000-${String(k).padStart(12, "0")}`;
  if (tier === 100) return `c21ade01-0000-4000-8000-${String(9 + k).padStart(12, "0")}`;
  if (tier === 1000) return `c21ade02-0000-4000-8000-${String(9 + k).padStart(12, "0")}`;
  if (tier === 10000) return `c21ade03-0000-4000-8000-${String(9 + k).padStart(12, "0")}`;
  if (tier === 100000) return `c21ade04-0000-4000-8000-${String(9 + k).padStart(12, "0")}`;
  if (tier === 1000000) return `c21ade05-0000-4000-8000-${String(9 + k).padStart(12, "0")}`;
  throw new Error(`bad c21 tier ${tier}`);
}

const CW_LEGACY = {
  1: "c0d3e106-0000-4000-8000-000000000006",
  10: "c0d3e107-0000-4000-8000-000000000007",
  100: "c0d3e101-0000-4000-8000-000000000001",
  1000: "c0d3e102-0000-4000-8000-000000000002",
  10000: "c0d3e103-0000-4000-8000-000000000003",
  100000: "c0d3e104-0000-4000-8000-000000000004",
  1000000: "c0d3e105-0000-4000-8000-000000000005",
};
const CW_PREFIX = {
  1: "c0d3e106",
  10: "c0d3e107",
  100: "c0d3e101",
  1000: "c0d3e102",
  10000: "c0d3e103",
  100000: "c0d3e104",
  1000000: "c0d3e105",
};

function cwUuid(stake, tableIdx) {
  if (tableIdx === 1) return CW_LEGACY[stake];
  return `${CW_PREFIX[stake]}-0000-4000-8000-${String(9 + tableIdx).padStart(12, "0")}`;
}

const CC_STAKES = [100, 1000, 10000, 100000, 1000000];
const CC_LEGACY = {
  "100_5": "cc0da001-0000-4000-8000-000000000001",
  "100_9": "cc0da002-0000-4000-8000-000000000002",
  "1000_5": "cc0da003-0000-4000-8000-000000000003",
  "1000_9": "cc0da004-0000-4000-8000-000000000004",
  "10000_5": "cc0da005-0000-4000-8000-000000000005",
  "10000_9": "cc0da006-0000-4000-8000-000000000006",
  "100000_5": "cc0da007-0000-4000-8000-000000000007",
  "100000_9": "cc0da008-0000-4000-8000-000000000008",
  "1000000_5": "cc0da009-0000-4000-8000-000000000009",
  "1000000_9": "cc0da00a-0000-4000-8000-00000000000a",
};
const CC_PREFIX = {
  "100_5": "cc0da001",
  "100_9": "cc0da002",
  "1000_5": "cc0da003",
  "1000_9": "cc0da004",
  "10000_5": "cc0da005",
  "10000_9": "cc0da006",
  "100000_5": "cc0da007",
  "100000_9": "cc0da008",
  "1000000_5": "cc0da009",
  "1000000_9": "cc0da00a",
};

function ccKey(stake, max9) {
  return `${stake}_${max9 ? "9" : "5"}`;
}

function ccUuid(stake, max9, tableIdx) {
  const k = ccKey(stake, max9);
  if (tableIdx === 1) return CC_LEGACY[k];
  return `${CC_PREFIX[k]}-0000-4000-8000-${String(9 + tableIdx).padStart(12, "0")}`;
}

function c21Title(tier, i) {
  const lab =
    tier >= 1_000_000
      ? "1M"
      : tier >= 100_000
        ? "100K"
        : tier >= 10_000
          ? "10K"
          : tier >= 1000
            ? "1K"
            : tier >= 100
              ? "100"
              : "10";
  return `21 Challenge • ${lab} • T${i}`;
}

function cwTitle(stake, i) {
  const lab =
    stake >= 1_000_000
      ? "1M"
      : stake >= 100_000
        ? "100K"
        : stake >= 10_000
          ? "10K"
          : stake >= 1000
            ? "1K"
            : stake >= 100
              ? "100"
              : stake >= 10
                ? "10"
                : "1";
  return `Color Wheel • ${lab} • T${i}`;
}

function ccTitle(stake, maxSeats, i) {
  const lab =
    stake >= 1_000_000
      ? "1M"
      : stake >= 100_000
        ? "100K"
        : stake >= 10_000
          ? "10K"
          : stake >= 1000
            ? "1K"
            : "100";
  return `Community Cards • ${lab} • ${maxSeats}-max • T${i}`;
}

function ccMetaJson(stake, maxSeats) {
  const sb =
    stake >= 1_000_000
      ? 10_000
      : stake >= 100_000
        ? 1000
        : stake >= 10_000
          ? 100
          : stake >= 1000
            ? 10
            : 1;
  const bb = sb * 2;
  const maxBuyin = stake * 10;
  return JSON.stringify({
    ov2_cc_max_seats: maxSeats,
    ov2_cc_small_blind: sb,
    ov2_cc_big_blind: bb,
    ov2_cc_max_buyin: maxBuyin,
  }).replace(/'/g, "''");
}

// --- Write JS configs
let jsC21 = `/**
 * Fixed persistent 21 Challenge tables. UUIDs must match
 * \`migrations/online-v2/c21/067_ov2_c21_public_tables_expand_10_per_tier.sql\`.
 */

export const OV2_C21_MIN_STAKE_UNITS = 10;

export const OV2_C21_STAKE_TIERS = Object.freeze([10, 100, 1_000, 10_000, 100_000, 1_000_000]);

/** @type {Record<number, readonly string[]>} stake units → ov2_rooms.id (10 per tier) */
export const OV2_C21_ROOM_IDS_BY_STAKE = Object.freeze({
`;
for (const tier of C21_TIERS) {
  const ids = [];
  for (let t = 1; t <= 10; t++) ids.push(`"${c21Uuid(tier, t)}"`);
  jsC21 += `  ${tier}: Object.freeze([${ids.join(", ")}]),\n`;
}
jsC21 += `});

/** First table per tier (legacy bookmarks) */
export const OV2_C21_ROOM_ID_BY_STAKE = Object.freeze(
  OV2_C21_STAKE_TIERS.reduce((acc, tier) => {
    acc[tier] = OV2_C21_ROOM_IDS_BY_STAKE[tier][0];
    return acc;
  }, /** @type {Record<number, string>} */ ({})),
);

export const OV2_C21_PRODUCT_GAME_ID = "ov2_c21";

export function resolveOv2C21RoomIdForStake(stakeUnits, tableIndex0 = 0) {
  const n = Math.floor(Number(stakeUnits));
  const list = OV2_C21_ROOM_IDS_BY_STAKE[n];
  if (!list || !list.length) return null;
  const i = Math.max(0, Math.min(list.length - 1, Math.floor(Number(tableIndex0) || 0)));
  return list[i] || null;
}

export function parseStakeFromRoomMeta(meta) {
  const m = meta && typeof meta === "object" ? meta : {};
  const u = Math.floor(Number(m.ov2_c21_stake_units));
  return Number.isFinite(u) && u > 0 ? u : null;
}
`;

const CW_TIERS = [1, 10, 100, 1000, 10000, 100000, 1000000];
let jsCw = `/**
 * Fixed persistent Color Wheel tables. UUIDs must match
 * \`migrations/online-v2/color_wheel/068_ov2_color_wheel_public_tables_expand_10_per_tier.sql\`.
 */

export const OV2_CW_STAKE_TIERS = Object.freeze([1, 10, 100, 1000, 10000, 100000, 1000000]);

/** @type {Record<number, readonly string[]>} */
export const OV2_CW_ROOM_IDS_BY_STAKE = Object.freeze({
`;
for (const tier of CW_TIERS) {
  const ids = [];
  for (let t = 1; t <= 10; t++) ids.push(`"${cwUuid(tier, t)}"`);
  jsCw += `  ${tier}: Object.freeze([${ids.join(", ")}]),\n`;
}
jsCw += `});

export const OV2_CW_ROOM_ID_BY_STAKE = Object.freeze(
  OV2_CW_STAKE_TIERS.reduce((acc, tier) => {
    acc[tier] = OV2_CW_ROOM_IDS_BY_STAKE[tier][0];
    return acc;
  }, /** @type {Record<number, string>} */ ({})),
);

export const OV2_CW_PRODUCT_GAME_ID = "ov2_color_wheel";

export const OV2_CW_MAX_SEATS = 6;

export function resolveOv2CwRoomIdForStake(stakeUnits, tableIndex0 = 0) {
  const n = Math.floor(Number(stakeUnits));
  const list = OV2_CW_ROOM_IDS_BY_STAKE[n];
  if (!list || !list.length) return null;
  const i = Math.max(0, Math.min(list.length - 1, Math.floor(Number(tableIndex0) || 0)));
  return list[i] || null;
}

export function parseStakeFromRoomMeta(meta) {
  const m = meta && typeof meta === "object" ? meta : {};
  const u = Math.floor(Number(m.ov2_cw_stake_units));
  return Number.isFinite(u) && u > 0 ? u : null;
}
`;

let jsCc = `/**
 * Fixed Community Cards room UUIDs — keep aligned with
 * \`migrations/online-v2/community_cards/069_ov2_community_cards_public_tables_expand_10_per_category.sql\`.
 */

export const OV2_CC_PRODUCT_GAME_ID = "ov2_community_cards";

/** @type {readonly { stake: number; maxSeats: 5 | 9; roomIds: readonly string[] }[]} */
export const OV2_CC_PUBLIC_CATEGORIES = Object.freeze([
`;
for (const stake of CC_STAKES) {
  for (const maxSeats of [5, 9]) {
    const ids = [];
    for (let t = 1; t <= 10; t++) ids.push(`"${ccUuid(stake, maxSeats === 9, t)}"`);
    jsCc += `  Object.freeze({ stake: ${stake}, maxSeats: ${maxSeats}, roomIds: Object.freeze([${ids.join(", ")}]) }),\n`;
  }
}
jsCc += `]);

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
`;

fs.writeFileSync(path.join(root, "lib/online-v2/c21/ov2C21TableIds.js"), jsC21);
fs.writeFileSync(path.join(root, "lib/online-v2/color_wheel/ov2CwTableIds.js"), jsCw);
fs.writeFileSync(path.join(root, "lib/online-v2/community_cards/ov2CcTableIds.js"), jsCc);

// --- SQL chunks
let sqlC21 = `-- OV2 21 Challenge — expand to 6 tiers × 10 public tables (60). Preserves legacy UUIDs as first table per tier (100..1M).
-- Apply after prior C21 migrations. Does NOT run automatically.

BEGIN;

`;
for (const tier of C21_TIERS) {
  for (let i = 1; i <= 10; i++) {
    const id = c21Uuid(tier, i);
    const meta = JSON.stringify({ ov2_c21_stake_units: tier }).replace(/'/g, "''");
    sqlC21 += `INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  '${id}'::uuid,
  'ov2_c21',
  '${c21Title(tier, i).replace(/'/g, "''")}',
  'active',
  ${tier},
  NULL,
  false,
  '${meta}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

`;
  }
}
sqlC21 += `INSERT INTO public.ov2_c21_live_state (room_id, match_seq, revision, engine)
SELECT r.id, 0, 0, '{}'::jsonb
FROM public.ov2_rooms r
WHERE r.product_game_id = 'ov2_c21'
ON CONFLICT (room_id) DO NOTHING;

COMMIT;
`;
fs.writeFileSync(path.join(root, "migrations/online-v2/c21/067_ov2_c21_public_tables_expand_10_per_tier.sql"), sqlC21);

let sqlCw = `-- OV2 Color Wheel — 7 stakes × 10 public tables (70). Preserves legacy UUIDs as table 1 per stake.
BEGIN;

`;
for (const stake of CW_TIERS) {
  for (let i = 1; i <= 10; i++) {
    const id = cwUuid(stake, i);
    const meta = JSON.stringify({ ov2_cw_stake_units: stake }).replace(/'/g, "''");
    sqlCw += `INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  '${id}'::uuid,
  'ov2_color_wheel',
  '${cwTitle(stake, i).replace(/'/g, "''")}',
  'active',
  ${stake},
  NULL,
  false,
  '${meta}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

`;
  }
}
sqlCw += `INSERT INTO public.ov2_color_wheel_live_state (room_id, match_seq, revision, engine)
SELECT r.id, 0, 0, '{}'::jsonb
FROM public.ov2_rooms r
WHERE r.product_game_id = 'ov2_color_wheel'
ON CONFLICT (room_id) DO NOTHING;

COMMIT;
`;
fs.writeFileSync(
  path.join(root, "migrations/online-v2/color_wheel/068_ov2_color_wheel_public_tables_expand_10_per_tier.sql"),
  sqlCw,
);

let sqlCc = `-- OV2 Community Cards — 10 categories × 10 tables (100). Preserves legacy UUIDs as table 1 per category.
BEGIN;

`;
for (const stake of CC_STAKES) {
  for (const maxSeats of [5, 9]) {
    for (let i = 1; i <= 10; i++) {
      const id = ccUuid(stake, maxSeats === 9, i);
      const meta = ccMetaJson(stake, maxSeats);
      sqlCc += `INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  '${id}'::uuid,
  'ov2_community_cards',
  '${ccTitle(stake, maxSeats, i).replace(/'/g, "''")}',
  'active',
  ${stake},
  NULL,
  false,
  '${meta}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

`;
    }
  }
}
sqlCc += `INSERT INTO public.ov2_community_cards_live_state (room_id, match_seq, revision, engine)
SELECT r.id, 0, 0, '{}'::jsonb
FROM public.ov2_rooms r
WHERE r.product_game_id = 'ov2_community_cards'
ON CONFLICT (room_id) DO NOTHING;

INSERT INTO public.ov2_community_cards_private (room_id, revision, payload)
SELECT r.id, 0, '{}'::jsonb
FROM public.ov2_rooms r
WHERE r.product_game_id = 'ov2_community_cards'
ON CONFLICT (room_id) DO NOTHING;

COMMIT;
`;
fs.writeFileSync(
  path.join(root, "migrations/online-v2/community_cards/069_ov2_community_cards_public_tables_expand_10_per_category.sql"),
  sqlCc,
);

console.log("Generated table IDs + migrations 067-069");
