/**
 * Faithful port of ov2_ck_* helpers from 087_ov2_checkers_engine.sql for deterministic repro.
 * Run: node scripts/ov2-checkers-engine-sim.mjs
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
  return ((r + c) % 2) === 1;
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

function kingHasCapture(cells, r, c, turn) {
  const opp = turn === 0 ? 1 : 0;
  const diags = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ];
  for (const [ddr, ddc] of diags) {
    let rr = r;
    let cc = c;
    let hit = 0;
    for (;;) {
      rr += ddr;
      cc += ddc;
      if (rr < 0 || rr > 7 || cc < 0 || cc > 7) break;
      const pr = cellGet(cells, rr * 8 + cc);
      if (pr === 0) continue;
      if (owner(pr) === turn) break;
      if (owner(pr) !== opp) break;
      hit = 1;
      for (;;) {
        rr += ddr;
        cc += ddc;
        if (rr < 0 || rr > 7 || cc < 0 || cc > 7) break;
        if (!isDark(rr, cc)) break;
        const land = cellGet(cells, rr * 8 + cc);
        if (land === 0) return true;
        break;
      }
      break;
    }
  }
  return false;
}

function cellHasCapture(cells, idx, turn) {
  const r = Math.floor(idx / 8);
  const c = idx % 8;
  const p = cellGet(cells, idx);
  if (owner(p) !== turn) return false;
  if (isKing(p)) return kingHasCapture(cells, r, c, turn);
  return manHasCapture(cells, r, c, turn);
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
  if (stepR !== fwd) return { ok: false, code: "MAN_FORWARD_CAP" };
  const sdr = dr > 0 ? 1 : -1;
  const sdc = dc > 0 ? 1 : -1;
  const rm = fr + sdr;
  const cm = fc + sdc;
  const mid = cellGet(cells, rm * 8 + cm);
  if (owner(mid) !== opp) return { ok: false };
  return { ok: true, capture: true, mid_idx: rm * 8 + cm };
}

function applyMove(board, pFrom, pTo) {
  const cells = [...board.cells];
  const turn = board.turnSeat;
  const chainAt = board.jumpChain?.at ?? null;
  if (chainAt != null && pFrom !== chainAt) return { ok: false, code: "CHAIN_LOCK" };
  const fr = Math.floor(pFrom / 8);
  const fc = pFrom % 8;
  const tr = Math.floor(pTo / 8);
  const tc = pTo % 8;
  let p = cellGet(cells, pFrom);
  if (owner(p) !== turn) return { ok: false };

  let mv;
  if (chainAt != null) {
    mv = isKing(p) ? null : tryManCapture(cells, fr, fc, tr, tc, turn);
    if (isKing(p)) mv = { ok: false }; // simplify: no king chain in this sim unless needed
  } else {
    mv = tryManCapture(cells, fr, fc, tr, tc, turn);
  }

  if (!mv?.ok) return { ok: false, code: mv?.code };

  let next = [...cells];
  next[pFrom] = 0;
  next[mv.mid_idx] = 0;
  let promo = p;
  if (turn === 0 && !isKing(p) && tr === 7) promo = 2;
  if (turn === 1 && !isKing(p) && tr === 0) promo = 4;
  next[pTo] = promo;

  const moreCap = cellHasCapture(next, pTo, turn);
  return {
    ok: true,
    moreCap,
    promo,
    nextCells: next,
    turn,
    pTo,
  };
}

// Repro: seat 0 man double-jump forward (not involving king rank promotion)
function buildDoubleJumpBoard() {
  const cells = Array(64).fill(0);
  // Man seat0 at (2,3) idx 19
  cells[19] = 1;
  // Opponents at (3,4) 28 and (5,6) 46
  cells[28] = 3;
  cells[46] = 3;
  return { cells, turnSeat: 0, jumpChain: null };
}

console.log("=== Double-jump geometry (man, no promotion) ===");
const b0 = buildDoubleJumpBoard();
const m1 = tryManCapture(b0.cells, 2, 3, 4, 5, 0);
console.log("first jump legal?", m1);
const after1 = applyMove(b0, 19, 37);
console.log("after apply 19->37:", after1);

// Repro: man lands on king row (row 7) with ANOTHER capture available as king (backward into board)
function buildCrownChainBoard() {
  const cells = Array(64).fill(0);
  // Seat 0 man at (5,2) idx 42 — 5+2=7 dark
  cells[42] = 1;
  // Enemy at (6,3) idx 51 for first jump landing (7,4)
  cells[51] = 3;
  // Another enemy at (5,4) idx 44 for second jump after crown? King at (7,4) capture (5,2) no...
  // King at (7,4) needs enemy adjacent then empty: e.g. enemy at (6,3) already captured
  // After first jump: king at (7,4). Put enemy at (6,5) idx 53, empty (5,6) idx 46
  cells[53] = 3;
  return { cells, turnSeat: 0, jumpChain: null };
}

console.log("\n=== Crown + second capture (king ray) ===");
const b1 = buildCrownChainBoard();
const m1b = tryManCapture(b1.cells, 5, 2, 7, 4, 0);
console.log("jump to crown row legal?", m1b);
const afterC = applyMove(b1, 42, 60); // (7,4)=60
console.log("after crown jump 42->60:", afterC);
console.log("king at 60 has capture?", cellHasCapture(afterC.nextCells, 60, 0));

// Critical: deferred promotion — if we kept MAN on row 7, would man_has_capture see second jump?
console.log("\n=== If landing piece stayed MAN on row 7 (hypothetical wrong rule) ===");
const fake = [...(afterC.nextCells || [])];
fake[60] = 1; // force man on king row
console.log("man_has_capture from (7,4) as man?", manHasCapture(fake, 7, 4, 0));
