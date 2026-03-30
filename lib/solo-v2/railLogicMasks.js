import { RAIL_TILE_CORNER, RAIL_TILE_EMPTY, RAIL_TILE_STRAIGHT } from "./railLogicConstants";

const N = 1;
const E = 2;
const S = 4;
const W = 8;

function rotateMaskCw(m) {
  let o = 0;
  if (m & N) o |= E;
  if (m & E) o |= S;
  if (m & S) o |= W;
  if (m & W) o |= N;
  return o;
}

export function maskForTileRotation(tileType, rot) {
  const t = Math.floor(Number(tileType) || 0);
  const r = Math.floor(Number(rot) || 0) % 4;
  let b = 0;
  if (t === RAIL_TILE_STRAIGHT) b = E | W;
  else if (t === RAIL_TILE_CORNER) b = N | E;
  else return 0;
  let out = b;
  for (let i = 0; i < r; i += 1) out = rotateMaskCw(out);
  return out;
}

export { RAIL_TILE_CORNER, RAIL_TILE_EMPTY, RAIL_TILE_STRAIGHT };
