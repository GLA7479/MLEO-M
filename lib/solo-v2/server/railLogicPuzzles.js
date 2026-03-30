/**
 * Full-information Rail Logic layouts: tile map is always visible to the player.
 * startGate / endGate: which side connects to the mine (start) / exit portal.
 */
import { RAIL_TILE_CORNER, RAIL_TILE_EMPTY, RAIL_TILE_STRAIGHT } from "../railLogicConstants";

export { RAIL_TILE_CORNER, RAIL_TILE_EMPTY, RAIL_TILE_STRAIGHT };

/** @type {{ id: string; w: number; h: number; types: number[]; startIdx: number; endIdx: number; maxMoves: number; startGate?: string; endGate?: string }[]} */
export const RAIL_LOGIC_PUZZLES = [
  {
    id: "midline_4x3",
    w: 4,
    h: 3,
    types: [0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0],
    startIdx: 4,
    endIdx: 7,
    maxMoves: 28,
    startGate: "W",
    endGate: "E",
  },
  {
    id: "spine_L_4x4",
    w: 4,
    h: 4,
    types: [
      0, 0, 0, 0,
      0, 0, 0, 0,
      1, 1, 1, 2,
      0, 0, 0, 2,
    ],
    startIdx: 8,
    endIdx: 15,
    maxMoves: 36,
    startGate: "W",
    endGate: "E",
  },
  {
    id: "vertical_rail_3x4",
    w: 3,
    h: 4,
    types: [
      0, 1, 0,
      0, 1, 0,
      0, 1, 0,
      0, 1, 0,
    ],
    startIdx: 10,
    endIdx: 1,
    maxMoves: 24,
    startGate: "S",
    endGate: "N",
  },
];
