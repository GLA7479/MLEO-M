/**
 * OV2 product registry (routes + public ids per game).
 */

import { ONLINE_V2_GAME_KINDS, ONLINE_V2_MIN_STAKE_UNITS } from "./ov2Economy";

export const ONLINE_V2_GAME_IDS = ONLINE_V2_GAME_KINDS;

/** SessionStorage key for resuming last shared room (`OnlineV2RoomsScreen` + live shells). */
export const OV2_SHARED_LAST_ROOM_SESSION_KEY = "ov2_shared_last_room_id_v1";

/** Minimum length for a real `ov2_rooms.id` in the `?room=` query (UUID). */
export const OV2_ROOM_ID_QUERY_MIN_LEN = 32;

export function clearOv2SharedLastRoomSessionKey() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(OV2_SHARED_LAST_ROOM_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function isOv2RoomIdQueryParam(value) {
  if (value == null || value === "") return false;
  return String(value).trim().length >= OV2_ROOM_ID_QUERY_MIN_LEN;
}

/** Only products supported by the shared-room flow (single source of truth). */
export const ONLINE_V2_ACTIVE_SHARED_PRODUCT_IDS = Object.freeze([
  ONLINE_V2_GAME_IDS.LUDO,
  ONLINE_V2_GAME_IDS.RUMMY51,
  ONLINE_V2_GAME_IDS.BINGO,
  ONLINE_V2_GAME_IDS.BACKGAMMON,
]);

export function isOv2ActiveSharedProductId(productGameId) {
  const id = String(productGameId ?? "").trim();
  return ONLINE_V2_ACTIVE_SHARED_PRODUCT_IDS.includes(id);
}

/**
 * @typedef {Object} OnlineV2RegistryEntry
 * @property {string} id
 * @property {string} routePath
 * @property {string} title
 * @property {"scaffold" | "planned"} phase
 * @property {number} minStakeUnits
 * @property {number} defaultStakeUnits
 * @property {number} minPlayers — minimum seated members to allow start
 */

/** @type {OnlineV2RegistryEntry[]} */
export const ONLINE_V2_REGISTRY = [
  {
    id: ONLINE_V2_GAME_IDS.BOARD_PATH,
    routePath: "/ov2-board-path",
    title: "Board Path",
    phase: "scaffold",
    minStakeUnits: ONLINE_V2_MIN_STAKE_UNITS,
    defaultStakeUnits: 1_000,
    minPlayers: 2,
  },
  {
    id: ONLINE_V2_GAME_IDS.MARK_GRID,
    routePath: "/ov2-mark-grid",
    title: "Mark Grid",
    phase: "scaffold",
    minStakeUnits: ONLINE_V2_MIN_STAKE_UNITS,
    defaultStakeUnits: 10_000,
    minPlayers: 2,
  },
  {
    id: ONLINE_V2_GAME_IDS.LUDO,
    routePath: "/ov2-ludo",
    title: "Ludo",
    phase: "planned",
    minStakeUnits: ONLINE_V2_MIN_STAKE_UNITS,
    defaultStakeUnits: 10_000,
    minPlayers: 2,
  },
  {
    id: ONLINE_V2_GAME_IDS.BINGO,
    routePath: "/ov2-bingo",
    title: "Bingo",
    phase: "planned",
    minStakeUnits: ONLINE_V2_MIN_STAKE_UNITS,
    defaultStakeUnits: 10_000,
    minPlayers: 2,
  },
  {
    id: ONLINE_V2_GAME_IDS.RUMMY51,
    routePath: "/ov2-rummy51",
    title: "Rummy 51",
    phase: "planned",
    minStakeUnits: ONLINE_V2_MIN_STAKE_UNITS,
    defaultStakeUnits: 10_000,
    minPlayers: 2,
  },
  {
    id: ONLINE_V2_GAME_IDS.BACKGAMMON,
    routePath: "/ov2-backgammon",
    title: "Backgammon",
    phase: "planned",
    minStakeUnits: ONLINE_V2_MIN_STAKE_UNITS,
    defaultStakeUnits: 10_000,
    minPlayers: 2,
  },
  {
    id: ONLINE_V2_GAME_IDS.CHALLENGE21,
    routePath: "/ov2-21-challenge",
    title: "21 Challenge",
    phase: "planned",
    minStakeUnits: ONLINE_V2_MIN_STAKE_UNITS,
    defaultStakeUnits: 10_000,
    minPlayers: 1,
  },
  {
    id: ONLINE_V2_GAME_IDS.COMMUNITY_CARDS,
    routePath: "/ov2-community-cards",
    title: "Community Cards",
    phase: "planned",
    minStakeUnits: ONLINE_V2_MIN_STAKE_UNITS,
    defaultStakeUnits: 10_000,
    minPlayers: 2,
  },
  {
    id: ONLINE_V2_GAME_IDS.COLOR_WHEEL,
    routePath: "/ov2-color-wheel",
    title: "Color Wheel",
    phase: "planned",
    minStakeUnits: ONLINE_V2_MIN_STAKE_UNITS,
    defaultStakeUnits: 10_000,
    minPlayers: 1,
  },
];

/** Shared-room lobby filters and create-room picker (active shared products only). */
export const ONLINE_V2_SHARED_LOBBY_GAMES = ONLINE_V2_REGISTRY.filter(g => isOv2ActiveSharedProductId(g.id));

/**
 * @param {string} productGameId
 * @returns {number}
 */
export function getOv2MinPlayersForProduct(productGameId) {
  const g = ONLINE_V2_REGISTRY.find(x => x.id === productGameId);
  return g?.minPlayers ?? 2;
}

/**
 * Shared-room max table size (Ludo/Rummy 4, Bingo 8). Used by Quick Match + create-room defaults.
 * @param {string} productGameId
 * @returns {number}
 */
export function getOv2DefaultMaxPlayersForProduct(productGameId) {
  const id = String(productGameId || "").trim();
  if (id === ONLINE_V2_GAME_IDS.BINGO) return 8;
  if (id === ONLINE_V2_GAME_IDS.BACKGAMMON) return 2;
  return 4;
}
