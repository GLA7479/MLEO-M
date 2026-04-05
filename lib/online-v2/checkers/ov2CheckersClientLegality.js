/**
 * Client-side legality hints for highlights (mirrors intended server rules; server is authoritative).
 * Piece codes: 0 empty, 1 seat0 man, 2 seat0 king, 3 seat1 man, 4 seat1 king.
 *
 * Product rules mirrored here:
 * - Men: forward move and forward capture only — never backward capture (including mid-chain).
 * - Kings: may capture (and continue chains) in any diagonal direction; not globally forced to capture.
 * - Forced capture applies when any **man** can capture; kings do not trigger forced capture.
 */

/** @param {unknown} cells */
export function normalizeOv2CheckersCells(cells) {
  const out = new Array(64).fill(0);
  if (!Array.isArray(cells) || cells.length !== 64) return out;
  for (let i = 0; i < 64; i += 1) {
    const n = Math.floor(Number(cells[i]));
    out[i] = Number.isFinite(n) && n >= 0 && n <= 4 ? n : 0;
  }
  return out;
}

function owner(p) {
  if (p === 1 || p === 2) return 0;
  if (p === 3 || p === 4) return 1;
  return -1;
}

function isKing(p) {
  return p === 2 || p === 4;
}

function isDark(r, c) {
  return ((r + c) % 2) === 1;
}

function idx(r, c) {
  return r * 8 + c;
}

/** Seat 0 advances toward increasing row; seat 1 toward decreasing row. */
function manForwardRowDelta(turn) {
  return turn === 0 ? 1 : -1;
}

/**
 * True if any piece of `turn` can capture (men + kings). Useful for diagnostics only;
 * forced-capture mode uses {@link ov2CheckersSideHasMenCapture}.
 * @param {number[]} cells
 * @param {number} turn 0|1
 */
export function ov2CheckersSideHasCapture(cells, turn) {
  for (let i = 0; i < 64; i += 1) {
    if (owner(cells[i]) !== turn) continue;
    if (cellHasCapture(cells, i, turn)) return true;
  }
  return false;
}

/**
 * Forced capture (must take) when any **man** of this side has a legal forward-only capture.
 * Kings do not trigger forced capture.
 * @param {number[]} cells
 * @param {number} turn
 */
export function ov2CheckersSideHasMenCapture(cells, turn) {
  for (let i = 0; i < 64; i += 1) {
    if (owner(cells[i]) !== turn) continue;
    if (isKing(cells[i])) continue;
    if (manHasCapture(cells, i, turn)) return true;
  }
  return false;
}

/**
 * Server indices of men that have at least one opening (forward) capture — for forced-capture UI hints.
 * @param {number[]} cells
 * @param {number} turn
 * @returns {number[]}
 */
export function ov2CheckersForcedMenCaptureFromIndices(cells, turn) {
  const out = [];
  for (let i = 0; i < 64; i += 1) {
    if (owner(cells[i]) !== turn) continue;
    if (isKing(cells[i])) continue;
    if (manHasCapture(cells, i, turn)) out.push(i);
  }
  return out;
}

function cellHasCapture(cells, fromIdx, turn) {
  const r = Math.floor(fromIdx / 8);
  const c = fromIdx % 8;
  const p = cells[fromIdx];
  if (isKing(p)) return kingHasCapture(cells, r, c, turn);
  return manHasCapture(cells, fromIdx, turn);
}

function manHasCapture(cells, fromIdx, turn) {
  const r = Math.floor(fromIdx / 8);
  const c = fromIdx % 8;
  const opp = turn === 0 ? 1 : 0;
  const dirs = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ];
  const fwd = manForwardRowDelta(turn);
  for (const [dr, dc] of dirs) {
    if (dr !== fwd) continue;
    const rm = r + dr;
    const cm = c + dc;
    const r2 = r + 2 * dr;
    const c2 = c + 2 * dc;
    if (r2 < 0 || r2 > 7 || c2 < 0 || c2 > 7) continue;
    if (!isDark(r2, c2)) continue;
    if (cells[idx(r2, c2)] !== 0) continue;
    const mid = cells[idx(rm, cm)];
    if (owner(mid) === opp) return true;
  }
  return false;
}

function kingHasCapture(cells, r, c, turn) {
  const opp = turn === 0 ? 1 : 0;
  const diags = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ];
  for (const [dr, dc] of diags) {
    let rr = r;
    let cc = c;
    let seen = 0;
    for (;;) {
      rr += dr;
      cc += dc;
      if (rr < 0 || rr > 7 || cc < 0 || cc > 7) break;
      const p = cells[idx(rr, cc)];
      if (p === 0) continue;
      if (seen > 0) break;
      if (owner(p) === turn) break;
      if (owner(p) !== opp) break;
      seen = 1;
      let er = rr;
      let ec = cc;
      for (;;) {
        er += dr;
        ec += dc;
        if (er < 0 || er > 7 || ec < 0 || ec > 7) break;
        if (!isDark(er, ec)) break;
        if (cells[idx(er, ec)] === 0) return true;
        break;
      }
      break;
    }
  }
  return false;
}

/**
 * Legal destination indices for a selected `fromIdx` (server indices).
 * @param {number[]} cells
 * @param {number} turn
 * @param {number|null} chainAt
 * @param {number} fromIdx
 */
export function ov2CheckersLegalTosForFrom(cells, turn, chainAt, fromIdx) {
  const out = [];
  if (chainAt != null && fromIdx !== chainAt) return out;
  if (owner(cells[fromIdx]) !== turn) return out;
  const glob = ov2CheckersSideHasMenCapture(cells, turn);
  const fr = Math.floor(fromIdx / 8);
  const fc = fromIdx % 8;
  const p = cells[fromIdx];
  /** Must continue capturing with this piece; independent of men-only `glob` (fixes king chain when no man capture). */
  const inChainHere = chainAt != null && chainAt === fromIdx;

  for (let to = 0; to < 64; to += 1) {
    if (to === fromIdx) continue;
    const tr = Math.floor(to / 8);
    const tc = to % 8;

    if (inChainHere) {
      const ok = isKing(p)
        ? tryKingCapture(cells, fr, fc, tr, tc, turn)
        : tryManCapture(cells, fr, fc, tr, tc, turn);
      if (ok) out.push(to);
      continue;
    }

    if (glob) {
      const ok = isKing(p)
        ? tryKingCapture(cells, fr, fc, tr, tc, turn)
        : tryManCapture(cells, fr, fc, tr, tc, turn);
      if (ok) out.push(to);
      continue;
    }

    const cap = isKing(p)
      ? tryKingCapture(cells, fr, fc, tr, tc, turn)
      : tryManCapture(cells, fr, fc, tr, tc, turn);
    const slide = isKing(p) ? trySlideKing(cells, fr, fc, tr, tc) : trySlideMan(cells, fr, fc, tr, tc, turn);
    if (cap || slide) out.push(to);
  }
  return out;
}

function trySlideMan(cells, fr, fc, tr, tc, turn) {
  if (tr < 0 || tc < 0 || tr > 7 || tc > 7) return false;
  if (!isDark(tr, tc) || cells[idx(tr, tc)] !== 0) return false;
  const dr = tr - fr;
  const dc = tc - fc;
  if (Math.abs(dr) !== 1 || Math.abs(dc) !== 1) return false;
  const fwd = manForwardRowDelta(turn);
  return dr === fwd;
}

function trySlideKing(cells, fr, fc, tr, tc) {
  if (tr < 0 || tc < 0 || tr > 7 || tc > 7) return false;
  if (!isDark(tr, tc) || cells[idx(tr, tc)] !== 0) return false;
  const dr = tr - fr;
  const dc = tc - fc;
  if (Math.abs(dr) !== Math.abs(dc) || dr === 0) return false;
  const steps = Math.abs(dr);
  const sdr = dr > 0 ? 1 : -1;
  const sdc = dc > 0 ? 1 : -1;
  for (let i = 1; i < steps; i += 1) {
    if (cells[idx(fr + sdr * i, fc + sdc * i)] !== 0) return false;
  }
  return true;
}

function tryManCapture(cells, fr, fc, tr, tc, turn) {
  const opp = turn === 0 ? 1 : 0;
  if (tr < 0 || tc < 0 || tr > 7 || tc > 7) return false;
  if (!isDark(tr, tc) || cells[idx(tr, tc)] !== 0) return false;
  const dr = tr - fr;
  const dc = tc - fc;
  if (Math.abs(dr) !== 2 || Math.abs(dc) !== 2) return false;
  const sdr = dr > 0 ? 1 : -1;
  const sdc = dc > 0 ? 1 : -1;
  const fwd = manForwardRowDelta(turn);
  if (sdr !== fwd) return false;
  const mid = cells[idx(fr + sdr, fc + sdc)];
  return owner(mid) === opp;
}

function tryKingCapture(cells, fr, fc, tr, tc, turn) {
  const opp = turn === 0 ? 1 : 0;
  if (tr < 0 || tc < 0 || tr > 7 || tc > 7) return false;
  if (!isDark(tr, tc) || cells[idx(tr, tc)] !== 0) return false;
  const dr = tr - fr;
  const dc = tc - fc;
  if (Math.abs(dr) !== Math.abs(dc) || dr === 0) return false;
  const steps = Math.abs(dr);
  const sdr = dr > 0 ? 1 : -1;
  const sdc = dc > 0 ? 1 : -1;
  let seen = 0;
  for (let i = 1; i < steps; i += 1) {
    const p = cells[idx(fr + sdr * i, fc + sdc * i)];
    if (p === 0) continue;
    if (seen > 0) return false;
    if (owner(p) === turn) return false;
    if (owner(p) !== opp) return false;
    seen = 1;
  }
  return seen === 1;
}

/**
 * Map server linear index to viewer grid (view 0 = top-left). Seat 0 flips 180° so own side is bottom.
 * @param {number} serverIdx
 * @param {number|null} mySeat
 */
function ov2CheckersFlip180(i) {
  const r = Math.floor(i / 8);
  const c = i % 8;
  return (7 - r) * 8 + (7 - c);
}

export function ov2CheckersServerToViewIdx(serverIdx, mySeat) {
  const i = Math.floor(Number(serverIdx));
  if (!Number.isFinite(i) || i < 0 || i > 63) return 0;
  if (mySeat !== 0) return i;
  return ov2CheckersFlip180(i);
}

/**
 * @param {number} viewIdx
 * @param {number|null} mySeat
 */
export function ov2CheckersViewToServerIdx(viewIdx, mySeat) {
  const i = Math.floor(Number(viewIdx));
  if (!Number.isFinite(i) || i < 0 || i > 63) return 0;
  if (mySeat !== 0) return i;
  return ov2CheckersFlip180(i);
}
