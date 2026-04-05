/**
 * Exhaustive invariant tests mirroring 087_ov2_checkers_engine.sql man capture logic.
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

function manHasCapture(cells, r, c, turn) {
  const opp = turn === 0 ? 1 : 0;
  const fwd = turn === 0 ? 1 : -1;
  const dr = fwd;
  for (const dc of [-1, 1]) {
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

function tryManCapture(cells, fr, fc, tr, tc, turn) {
  const opp = turn === 0 ? 1 : 0;
  if (tr < 0 || tr > 7 || tc < 0 || tc > 7) return { ok: false };
  if (!isDark(tr, tc) || cellGet(cells, tr * 8 + tc) !== 0) return { ok: false };
  const dr = tr - fr;
  const dc = tc - fc;
  if (Math.abs(dr) !== 2 || Math.abs(dc) !== 2) return { ok: false };
  const fwd = turn === 0 ? 1 : -1;
  const stepR = dr > 0 ? 1 : dr < 0 ? -1 : 0;
  if (stepR !== fwd) return { ok: false };
  const sdr = dr > 0 ? 1 : -1;
  const sdc = dc > 0 ? 1 : -1;
  const rm = fr + sdr;
  const cm = fc + sdc;
  const mid = cellGet(cells, rm * 8 + cm);
  if (owner(mid) !== opp) return { ok: false };
  return { ok: true };
}

function invariantForBoard(cells, turn, label) {
  for (let from = 0; from < 64; from += 1) {
    const p = cellGet(cells, from);
    if (owner(p) !== turn || isKing(p)) continue;
    const fr = Math.floor(from / 8);
    const fc = from % 8;
    const has = manHasCapture(cells, fr, fc, turn);
    let anyTry = false;
    for (let to = 0; to < 64; to += 1) {
      if (from === to) continue;
      const tr = Math.floor(to / 8);
      const tc = to % 8;
      const mv = tryManCapture(cells, fr, fc, tr, tc, turn);
      if (mv.ok) anyTry = true;
      if (mv.ok && !has) {
        throw new Error(`${label}: try ok but man_has false from=${from} to=${to}`);
      }
    }
    if (has && !anyTry) {
      throw new Error(`${label}: man_has true but no try destination from=${from}`);
    }
  }
}

// --- Double-jump board (seat 0): reproduces chain continuation ---
const cells = Array(64).fill(0);
cells[19] = 1;
cells[28] = 3;
cells[46] = 3;

invariantForBoard(cells, 0, "double-jump setup");

// After first capture 19->37
const cells2 = [...cells];
cells2[19] = 0;
cells2[28] = 0;
cells2[37] = 1;
invariantForBoard(cells2, 0, "after first jump");
const hasMore = manHasCapture(cells2, 4, 5, 0);
if (!hasMore) throw new Error("Expected forward double-jump from (4,5)");

// Backward man capture must not register as has-capture (seat 0 at row 4: backward = -1 row)
const back = Array(64).fill(0);
back[35] = 1; // (4,3)
back[26] = 3; // (3,2) — jumped square
back[17] = 0; // (2,1) landing empty backward jump from (4,3)
if (manHasCapture(back, 4, 3, 0)) throw new Error("Backward capture incorrectly detected");
if (tryManCapture(back, 4, 3, 2, 1, 0).ok) throw new Error("Backward try should fail");

console.log("All invariants passed.");
