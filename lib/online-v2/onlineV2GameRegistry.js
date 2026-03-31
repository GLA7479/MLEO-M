/**
 * OV2 product registry (routes + public ids per game).
 */

import { ONLINE_V2_GAME_KINDS, ONLINE_V2_MIN_STAKE_UNITS } from "./ov2Economy";

export const ONLINE_V2_GAME_IDS = ONLINE_V2_GAME_KINDS;

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
];

/**
 * @param {string} productGameId
 * @returns {number}
 */
export function getOv2MinPlayersForProduct(productGameId) {
  const g = ONLINE_V2_REGISTRY.find(x => x.id === productGameId);
  return g?.minPlayers ?? 2;
}
