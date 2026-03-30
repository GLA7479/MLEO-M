import { randomInt } from "crypto";
import { maskForTileRotation } from "../railLogicMasks";
import { RAIL_TILE_CORNER, RAIL_TILE_EMPTY, RAIL_TILE_STRAIGHT } from "../railLogicConstants";
import { RAIL_LOGIC_PUZZLES } from "./railLogicPuzzles";

export const RAIL_PHASE_ACTIVE = "rail_logic_active";
export const RAIL_PHASE_RESOLVED = "rail_logic_resolved";

const N = 1;
const E = 2;
const S = 4;
const W = 8;

function gateCharToMask(ch) {
  const c = String(ch || "W").toUpperCase();
  if (c === "N") return N;
  if (c === "E") return E;
  if (c === "S") return S;
  return W;
}

export { maskForTileRotation };

/**
 * Start / end must expose the correct portal side (full-information: gates are marked on the board).
 */
export function railPathExists(w, h, types, rotations, startIdx, endIdx, startGate = "W", endGate = "E") {
  const wc = Math.max(1, Math.floor(Number(w) || 0));
  const hc = Math.max(1, Math.floor(Number(h) || 0));
  const len = wc * hc;
  const s = Math.floor(Number(startIdx) || 0);
  const e = Math.floor(Number(endIdx) || 0);
  if (s < 0 || s >= len || e < 0 || e >= len || s === e) return false;
  if (!Array.isArray(types) || types.length !== len) return false;
  if (!Array.isArray(rotations) || rotations.length !== len) return false;
  if (types[s] === RAIL_TILE_EMPTY || types[e] === RAIL_TILE_EMPTY) return false;

  const sg = gateCharToMask(startGate);
  const eg = gateCharToMask(endGate);
  const startMask = maskForTileRotation(types[s], rotations[s]);
  const endMask = maskForTileRotation(types[e], rotations[e]);
  if ((startMask & sg) === 0 || (endMask & eg) === 0) return false;

  const q = [s];
  const seen = new Set([s]);

  const neighborIdx = (idx, dirBit) => {
    const row = Math.floor(idx / wc);
    const col = idx % wc;
    if (dirBit === N && row > 0) return idx - wc;
    if (dirBit === S && row < hc - 1) return idx + wc;
    if (dirBit === W && col > 0) return idx - 1;
    if (dirBit === E && col < wc - 1) return idx + 1;
    return null;
  };

  const opp = d => {
    if (d === N) return S;
    if (d === E) return W;
    if (d === S) return N;
    if (d === W) return E;
    return 0;
  };

  const tryEdge = (idx, outBit) => {
    const m = maskForTileRotation(types[idx], rotations[idx]);
    if ((m & outBit) === 0) return;
    const j = neighborIdx(idx, outBit);
    if (j == null) return;
    if (types[j] === RAIL_TILE_EMPTY) return;
    const m2 = maskForTileRotation(types[j], rotations[j]);
    if ((m2 & opp(outBit)) === 0) return;
    if (!seen.has(j)) {
      seen.add(j);
      q.push(j);
    }
  };

  while (q.length) {
    const i = q.shift();
    if (i === e) return true;
    tryEdge(i, N);
    tryEdge(i, E);
    tryEdge(i, S);
    tryEdge(i, W);
  }

  return false;
}

export function pickPuzzleIndex() {
  return randomInt(0, RAIL_LOGIC_PUZZLES.length);
}

function cloneInts(a) {
  return a.map(x => Math.floor(Number(x) || 0));
}

export function buildScrambledRotations(puzzle) {
  const len = puzzle.types.length;
  const rots = new Array(len).fill(0);
  for (let attempt = 0; attempt < 120; attempt += 1) {
    for (let i = 0; i < len; i += 1) {
      rots[i] = puzzle.types[i] === RAIL_TILE_EMPTY ? 0 : randomInt(0, 4);
    }
    if (
      !railPathExists(
        puzzle.w,
        puzzle.h,
        puzzle.types,
        rots,
        puzzle.startIdx,
        puzzle.endIdx,
        puzzle.startGate,
        puzzle.endGate,
      )
    ) {
      return rots;
    }
  }
  for (let i = 0; i < len; i += 1) {
    if (puzzle.types[i] !== RAIL_TILE_EMPTY) rots[i] = 1;
  }
  return rots;
}

export function buildRailLogicInitialSummary(puzzleIndex) {
  const idx = Math.max(0, Math.min(RAIL_LOGIC_PUZZLES.length - 1, Math.floor(Number(puzzleIndex) || 0)));
  const puzzle = RAIL_LOGIC_PUZZLES[idx];
  const rotations = buildScrambledRotations(puzzle);
  return {
    phase: RAIL_PHASE_ACTIVE,
    puzzleIndex: idx,
    gridW: puzzle.w,
    gridH: puzzle.h,
    types: cloneInts(puzzle.types),
    rotations,
    startIdx: puzzle.startIdx,
    endIdx: puzzle.endIdx,
    maxMoves: puzzle.maxMoves,
    movesUsed: 0,
    startGate: puzzle.startGate || "W",
    endGate: puzzle.endGate || "E",
  };
}

export function parseRailLogicActiveSummary(summary) {
  const s = summary || {};
  if (s.phase !== RAIL_PHASE_ACTIVE) return null;
  const gridW = Math.floor(Number(s.gridW) || 0);
  const gridH = Math.floor(Number(s.gridH) || 0);
  const types = Array.isArray(s.types) ? s.types.map(x => Math.floor(Number(x) || 0)) : [];
  const rotations = Array.isArray(s.rotations) ? s.rotations.map(x => Math.floor(Number(x) || 0) % 4) : [];
  const startIdx = Math.floor(Number(s.startIdx) || 0);
  const endIdx = Math.floor(Number(s.endIdx) || 0);
  const maxMoves = Math.max(1, Math.floor(Number(s.maxMoves) || 1));
  const movesUsed = Math.max(0, Math.floor(Number(s.movesUsed) || 0));
  if (gridW < 1 || gridH < 1 || types.length !== gridW * gridH || rotations.length !== types.length) return null;
  const startGate = String(s.startGate || "W").toUpperCase();
  const endGate = String(s.endGate || "E").toUpperCase();
  return { gridW, gridH, types, rotations, startIdx, endIdx, maxMoves, movesUsed, startGate, endGate };
}
