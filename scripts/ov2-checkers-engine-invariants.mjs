/**
 * Deterministic checks mirroring 087_ov2_checkers_engine.sql man-capture rules.
 * Run: node scripts/ov2-checkers-engine-invariants.mjs
 */

function cellGet(cells, i) {
  if (!Array.isArray(cells) || i < 0 || i > 63) return 0;
  const v = cells[i];
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 && n <= 4 ? n : 0;
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
  return ((r + c) & 1) === 1;
}

function manForwardRowDelta(turn) {
  return turn === 0 ? 1 : -1;
}

/** Opening / forced scan: forward-only man jumps. Chain continuation: all four diagonals. */
function manHasCapture(cells, r, c, turn, forwardOnly = true) {
  const opp = turn === 0 ? 1 : 0;
  const fwd = manForwardRowDelta(turn);
  const dirs = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ];
  for (const [dr, dc] of dirs) {
    if (forwardOnly && dr !== fwd) continue;
    const rm = r + dr;
    const cm = c + dc;
    const r2 = r + 2 * dr;
    const c2 = c + 2 * dc;
    if (r2 < 0 || r2 > 7 || c2 < 0 || c2 > 7) continue;
    if (!isDark(r2, c2)) continue;
    const mid = cellGet(cells, rm * 8 + cm);
    const land = cellGet(cells, r2 * 8 + c2);
    if (land !== 0) continue;
    if (owner(mid) === opp) return true;
  }
  return false;
}

function tryManCapture(cells, fr, fc, tr, tc, turn, chainContinuation = false) {
  const opp = turn === 0 ? 1 : 0;
  if (tr < 0 || tr > 7 || tc < 0 || tc > 7) return { ok: false };
  if (!isDark(tr, tc) || cellGet(cells, tr * 8 + tc) !== 0) return { ok: false };
  const dr = tr - fr;
  const dc = tc - fc;
  if (Math.abs(dr) !== 2 || Math.abs(dc) !== 2) return { ok: false };
  const stepR = dr > 0 ? 1 : dr < 0 ? -1 : 0;
  if (!chainContinuation) {
    const fwd = manForwardRowDelta(turn);
    if (stepR !== fwd) return { ok: false };
  }
  const sdr = dr > 0 ? 1 : -1;
  const sdc = dc > 0 ? 1 : -1;
  const rm = fr + sdr;
  const cm = fc + sdc;
  const mid = cellGet(cells, rm * 8 + cm);
  if (owner(mid) !== opp) return { ok: false };
  return { ok: true };
}

/** Invariant: forward-only man_has matches any opening tryManCapture destination. */
function invariantOpeningScan(cells, turn, label) {
  for (let from = 0; from < 64; from += 1) {
    const p = cellGet(cells, from);
    if (owner(p) !== turn || isKing(p)) continue;
    const fr = Math.floor(from / 8);
    const fc = from % 8;
    const has = manHasCapture(cells, fr, fc, turn, true);
    let anyTry = false;
    for (let to = 0; to < 64; to += 1) {
      if (from === to) continue;
      const tr = Math.floor(to / 8);
      const tc = to % 8;
      const mv = tryManCapture(cells, fr, fc, tr, tc, turn, false);
      if (mv.ok) anyTry = true;
      if (mv.ok && !has) {
        throw new Error(`${label}: try ok but man_has(forward) false from=${from} to=${to}`);
      }
    }
    if (has && !anyTry) {
      throw new Error(`${label}: man_has(forward) true but no try destination from=${from}`);
    }
  }
}

// --- Double-jump board (seat 0) ---
const cells = Array(64).fill(0);
cells[19] = 1;
cells[28] = 3;
cells[46] = 3;

invariantOpeningScan(cells, 0, "double-jump setup");

const cells2 = [...cells];
cells2[19] = 0;
cells2[28] = 0;
cells2[37] = 1;
invariantOpeningScan(cells2, 0, "after first jump");
if (!manHasCapture(cells2, 4, 5, 0, true)) {
  throw new Error("Expected forward double-jump from (4,5)");
}
if (!manHasCapture(cells2, 4, 5, 0, false)) {
  throw new Error("Expected any-direction scan to see capture from (4,5)");
}

// Opening backward: must not count as has-capture or legal try
const back = Array(64).fill(0);
back[35] = 1;
back[26] = 3;
back[17] = 0;
if (manHasCapture(back, 4, 3, 0, true)) throw new Error("Backward opening incorrectly in forward scan");
if (tryManCapture(back, 4, 3, 2, 1, 0, false).ok) {
  throw new Error("Opening backward try should fail");
}

// Chain continuation: backward jump 37->19 after first hop (synthetic board)
const chainCells = [...cells2];
chainCells[46] = 0;
chainCells[28] = 3;
chainCells[19] = 0;
if (!tryManCapture(chainCells, 4, 5, 2, 3, 0, true).ok) {
  throw new Error("Backward continuation in chain should be legal (37->19)");
}
if (tryManCapture(chainCells, 4, 5, 2, 3, 0, false).ok) {
  throw new Error("Same jump must not be legal as opening (no chain)");
}

console.log("All invariants passed.");
