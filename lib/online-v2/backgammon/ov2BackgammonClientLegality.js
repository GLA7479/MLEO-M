/**
 * Client-side move preview only — mirrors `public.ov2_bg_validate_step` (080 engine).
 * Server RPCs remain authoritative; illegal client picks still fail server-side.
 */

/** @param {unknown} avail */
function availContains(avail, die) {
  if (!Array.isArray(avail)) return false;
  return avail.some(x => Number(x) === die);
}

/** @param {number[]} pts */
function ptGet(pts, i) {
  if (i < 0 || i > 23) return 0;
  const v = pts[i];
  return Number.isFinite(v) ? v : 0;
}

function barGet(bar, seat) {
  if (!Array.isArray(bar) || seat < 0 || seat > 1) return 0;
  const v = bar[seat];
  return Number.isFinite(v) ? v : 0;
}

function seat0AllPastOpponentHome(pts) {
  for (let i = 6; i <= 23; i++) {
    if (ptGet(pts, i) > 0) return false;
  }
  return true;
}

function seat1AllPastOpponentHome(pts) {
  for (let i = 0; i <= 17; i++) {
    if (ptGet(pts, i) < 0) return false;
  }
  return true;
}

function seat0HighestHomeOccupied(pts) {
  let hi = -1;
  for (let i = 0; i <= 5; i++) {
    if (ptGet(pts, i) > 0) hi = i;
  }
  return hi;
}

function seat1HighestHomeOccupied(pts) {
  let hi = -1;
  for (let i = 18; i <= 23; i++) {
    if (ptGet(pts, i) < 0) hi = i;
  }
  return hi;
}

function landingOkSeat0(pts, to) {
  if (to < 0 || to > 23) return false;
  const t = ptGet(pts, to);
  return t >= -1;
}

function landingOkSeat1(pts, to) {
  if (to < 0 || to > 23) return false;
  const t = ptGet(pts, to);
  return t <= 1;
}

/**
 * @param {{
 *   pts: number[],
 *   bar: number[],
 *   diceAvail: number[],
 *   turnSeat?: number,
 * }} board
 * @param {number} turn
 * @param {number} fromPt -1 bar
 * @param {number} toPt -1 bear off
 * @param {number} die
 */
export function ov2BgClientValidateStep(board, turn, fromPt, toPt, die) {
  const pts = Array.isArray(board.pts) ? board.pts.map(x => Number(x)) : [];
  while (pts.length < 24) pts.push(0);
  const bar = Array.isArray(board.bar) ? board.bar.map(x => Number(x)) : [0, 0];
  const avail = Array.isArray(board.diceAvail) ? board.diceAvail.map(x => Number(x)) : [];

  if (!Number.isFinite(die) || die < 1 || die > 6) {
    return { ok: false, code: "BAD_DIE" };
  }
  if (!availContains(avail, die)) {
    return { ok: false, code: "DIE_NOT_AVAILABLE" };
  }

  const b0 = barGet(bar, 0);
  const b1 = barGet(bar, 1);

  if (turn === 0) {
    if (b0 > 0) {
      if (fromPt !== -1) return { ok: false, code: "MUST_MOVE_FROM_BAR" };
      const toCalc = 24 - die;
      if (toCalc < 18 || toCalc > 23) return { ok: false, code: "BAD_BAR_ENTRY" };
      if (toPt !== toCalc) return { ok: false, code: "BAR_TARGET_MISMATCH" };
      if (!landingOkSeat0(pts, toCalc)) return { ok: false, code: "BLOCKED" };
      return { ok: true, mode: "bar0", land_to: toCalc };
    }

    if (fromPt < 0 || fromPt > 23) return { ok: false, code: "BAD_FROM" };
    const fromV = ptGet(pts, fromPt);
    if (fromV <= 0) return { ok: false, code: "EMPTY_FROM" };

    const allHome = barGet(bar, 0) === 0 && seat0AllPastOpponentHome(pts);

    if (toPt === -1) {
      if (!allHome || fromPt > 5 || fromPt < 0) return { ok: false, code: "ILLEGAL_BEAROFF" };
      const need = fromPt + 1;
      const hi = seat0HighestHomeOccupied(pts);
      if (hi < 0) return { ok: false, code: "ILLEGAL_BEAROFF" };
      if (die === need || (die > need && fromPt === hi)) {
        return { ok: true, mode: "bear0", from_pt: fromPt };
      }
      return { ok: false, code: "ILLEGAL_BEAROFF" };
    }

    const toCalc = fromPt - die;
    if (allHome) {
      if (toCalc < 0) return { ok: false, code: "USE_BEAROFF" };
    } else if (toCalc < 0) {
      return { ok: false, code: "ILLEGAL_MOVE" };
    }

    if (toPt !== toCalc) return { ok: false, code: "TO_MISMATCH" };
    if (!landingOkSeat0(pts, toCalc)) return { ok: false, code: "BLOCKED" };
    return { ok: true, mode: "move0", from_pt: fromPt, land_to: toCalc };
  }

  if (turn === 1) {
    if (b1 > 0) {
      if (fromPt !== -1) return { ok: false, code: "MUST_MOVE_FROM_BAR" };
      const toCalc = die - 1;
      if (toCalc < 0 || toCalc > 5) return { ok: false, code: "BAD_BAR_ENTRY" };
      if (toPt !== toCalc) return { ok: false, code: "BAR_TARGET_MISMATCH" };
      if (!landingOkSeat1(pts, toCalc)) return { ok: false, code: "BLOCKED" };
      return { ok: true, mode: "bar1", land_to: toCalc };
    }

    if (fromPt < 0 || fromPt > 23) return { ok: false, code: "BAD_FROM" };
    const fromV = ptGet(pts, fromPt);
    if (fromV >= 0) return { ok: false, code: "EMPTY_FROM" };

    const allHome = barGet(bar, 1) === 0 && seat1AllPastOpponentHome(pts);

    if (toPt === -1) {
      if (!allHome || fromPt < 18 || fromPt > 23) return { ok: false, code: "ILLEGAL_BEAROFF" };
      const need = 24 - fromPt;
      const hi = seat1HighestHomeOccupied(pts);
      if (hi < 0) return { ok: false, code: "ILLEGAL_BEAROFF" };
      if (die === need || (die > need && fromPt === hi)) {
        return { ok: true, mode: "bear1", from_pt: fromPt };
      }
      return { ok: false, code: "ILLEGAL_BEAROFF" };
    }

    const toCalc = fromPt + die;
    if (allHome) {
      if (toCalc > 23) return { ok: false, code: "USE_BEAROFF" };
    } else if (toCalc > 23) {
      return { ok: false, code: "ILLEGAL_MOVE" };
    }

    if (toPt !== toCalc) return { ok: false, code: "TO_MISMATCH" };
    if (!landingOkSeat1(pts, toCalc)) return { ok: false, code: "BLOCKED" };
    return { ok: true, mode: "move1", from_pt: fromPt, land_to: toCalc };
  }

  return { ok: false, code: "BAD_TURN" };
}

/** Unique die values present in diceAvail (order: high first, like UI). */
function uniqueDiceSorted(avail) {
  const seen = new Set();
  const out = [];
  for (const d of avail) {
    const n = Number(d);
    if (!Number.isFinite(n) || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  out.sort((a, b) => b - a);
  return out;
}

/**
 * Legal destination points for one step from `fromPt` (-1 = bar) for current `board` / `turnSeat`.
 * @returns {Set<number>} includes -1 when bear-off is legal
 */
export function ov2BgClientLegalDestinationsForFrom(board, fromPt) {
  const turn = board.turnSeat != null ? Number(board.turnSeat) : NaN;
  const out = new Set();
  if (turn !== 0 && turn !== 1) return out;
  const avail = Array.isArray(board.diceAvail) ? board.diceAvail.map(x => Number(x)) : [];
  if (avail.length === 0) return out;

  for (const die of uniqueDiceSorted(avail)) {
    for (let to = -1; to <= 23; to++) {
      const v = ov2BgClientValidateStep(board, turn, fromPt, to, die);
      if (v.ok) out.add(to);
    }
  }
  return out;
}

/**
 * Pick a die value from `diceAvail` that validates for this step (prefers larger die).
 */
export function ov2BgClientPickDieForMove(board, fromPt, toPt) {
  const turn = board.turnSeat != null ? Number(board.turnSeat) : NaN;
  if (turn !== 0 && turn !== 1) return null;
  const avail = Array.isArray(board.diceAvail) ? board.diceAvail.map(x => Number(x)) : [];
  for (const die of uniqueDiceSorted(avail)) {
    const v = ov2BgClientValidateStep(board, turn, fromPt, toPt, die);
    if (v.ok) return die;
  }
  return null;
}
