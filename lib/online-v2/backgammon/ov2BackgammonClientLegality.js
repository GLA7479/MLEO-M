/**
 * Client-side move preview — mirrors `public.ov2_bg_validate_step` and
 * `public.ov2_bg_apply_step_full` (080).
 *
 * Next-step legality uses enumerateLegalSteps (per RPC). Full paths: allSequencesRecursive.
 */

/** @param {unknown} avail */
function availContains(avail, die) {
  if (!Array.isArray(avail)) return false;
  return avail.some(x => Number(x) === die);
}

/** First matching die removed (same as `ov2_bg_avail_remove_one`). */
function availRemoveOne(avail, die) {
  if (!Array.isArray(avail)) return null;
  const idx = avail.findIndex(x => Number(x) === die);
  if (idx < 0) return null;
  const next = avail.slice();
  next.splice(idx, 1);
  return next;
}

/** @param {number[]} pts */
function ptGet(pts, i) {
  if (i < 0 || i > 23) return 0;
  const v = pts[i];
  return Number.isFinite(v) ? v : 0;
}

function clonePts(pts) {
  const out = Array.isArray(pts) ? pts.map(x => Number(x)) : [];
  while (out.length < 24) out.push(0);
  return out.slice(0, 24);
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

function applyLandingSeat0(board, from, to) {
  const pts = clonePts(board.pts);
  const bar = Array.isArray(board.bar) ? [...board.bar.map(x => Number(x))] : [0, 0];
  const fromV = ptGet(pts, from);
  if (fromV <= 0) return null;
  const t = ptGet(pts, to);
  pts[from] = fromV - 1;
  if (t === -1) {
    bar[1] = bar[1] + 1;
    pts[to] = 1;
  } else if (t >= 0) {
    pts[to] = t + 1;
  } else {
    return null;
  }
  return { ...board, pts, bar };
}

function applyLandingSeat1(board, from, to) {
  const pts = clonePts(board.pts);
  const bar = Array.isArray(board.bar) ? [...board.bar.map(x => Number(x))] : [0, 0];
  const fromV = ptGet(pts, from);
  if (fromV >= 0) return null;
  const t = ptGet(pts, to);
  pts[from] = fromV + 1;
  if (t === 1) {
    bar[0] = bar[0] + 1;
    pts[to] = -1;
  } else if (t <= 0) {
    pts[to] = t - 1;
  } else {
    return null;
  }
  return { ...board, pts, bar };
}

/** Same as `ov2_bg_fix_bar_apply`. */
function fixBarApply(board, mode, landTo) {
  const pts = clonePts(board.pts);
  const bar = Array.isArray(board.bar) ? [...board.bar.map(x => Number(x))] : [0, 0];
  const b = { ...board, pts, bar };
  const t = ptGet(pts, landTo);
  if (mode === "bar0") {
    bar[0] = bar[0] - 1;
    if (t === -1) {
      bar[1] = bar[1] + 1;
      pts[landTo] = 1;
    } else {
      pts[landTo] = t + 1;
    }
    return { ...b, pts, bar };
  }
  if (mode === "bar1") {
    bar[1] = bar[1] - 1;
    if (t === 1) {
      bar[0] = bar[0] + 1;
      pts[landTo] = -1;
    } else {
      pts[landTo] = t - 1;
    }
    return { ...b, pts, bar };
  }
  return null;
}

/** Same as `ov2_bg_apply_validated_step` for non-bar modes + bear. */
function applyValidatedStep(board, meta) {
  const mode = meta.mode;
  const pts = clonePts(board.pts);
  const bar = Array.isArray(board.bar) ? [...board.bar.map(x => Number(x))] : [0, 0];
  const off = Array.isArray(board.off) ? [...board.off.map(x => Number(x))] : [0, 0];
  const b = { ...board, pts, bar, off };
  if (mode === "bear0") {
    const from = meta.from_pt;
    pts[from] = ptGet(pts, from) - 1;
    off[0] = off[0] + 1;
    return { ...b, pts, bar, off };
  }
  if (mode === "bear1") {
    const from = meta.from_pt;
    pts[from] = ptGet(pts, from) + 1;
    off[1] = off[1] + 1;
    return { ...b, pts, bar, off };
  }
  if (mode === "move0") {
    return applyLandingSeat0(b, meta.from_pt, meta.land_to);
  }
  if (mode === "move1") {
    return applyLandingSeat1(b, meta.from_pt, meta.land_to);
  }
  return null;
}

function cloneBoard(board) {
  return {
    pts: clonePts(board.pts),
    bar: Array.isArray(board.bar) ? board.bar.map(x => Number(x)) : [0, 0],
    off: Array.isArray(board.off) ? board.off.map(x => Number(x)) : [0, 0],
    diceAvail: Array.isArray(board.diceAvail) ? board.diceAvail.map(x => Number(x)) : [],
    turnSeat: board.turnSeat,
    dice: board.dice,
  };
}

/**
 * Full step apply + die removal (matches `ov2_bg_apply_step_full`).
 * @returns {{ ok: true, board: object } | { ok: false, code: string }}
 */
export function ov2BgClientApplyStepFull(board, turn, fromPt, toPt, die) {
  const val = ov2BgClientValidateStep(board, turn, fromPt, toPt, die);
  if (!val.ok) return { ok: false, code: val.code };
  const mode = val.mode;
  let nb;
  if (mode === "bar0" || mode === "bar1") {
    const landTo = val.land_to;
    nb = fixBarApply(cloneBoard(board), mode, landTo);
  } else {
    nb = applyValidatedStep(cloneBoard(board), val);
  }
  if (!nb) return { ok: false, code: "APPLY_FAILED" };
  const newAvail = availRemoveOne(board.diceAvail, die);
  if (!newAvail) return { ok: false, code: "AVAIL_REMOVE_FAILED" };
  nb.diceAvail = newAvail;
  return { ok: true, board: nb };
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
  const pts = clonePts(board.pts);
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

/** Unique die values in `diceAvail` (order matches `ov2_bg_any_legal_exists`). */
function uniqueDiceInOrder(avail) {
  const seen = new Set();
  const out = [];
  if (!Array.isArray(avail)) return out;
  for (const d of avail) {
    const n = Number(d);
    if (!Number.isFinite(n) || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/**
 * Enumerate legal steps (same coverage as `ov2_bg_any_legal_exists`).
 * @returns {{ from: number, to: number, die: number }[]}
 */
function enumerateLegalSteps(board, turn) {
  const out = [];
  const avail = board.diceAvail;
  if (!Array.isArray(avail) || avail.length === 0) return out;

  const b0 = barGet(board.bar, 0);
  const b1 = barGet(board.bar, 1);

  for (const d of uniqueDiceInOrder(avail)) {
    if (turn === 0 && b0 > 0) {
      const v = ov2BgClientValidateStep(board, turn, -1, 24 - d, d);
      if (v.ok) out.push({ from: -1, to: 24 - d, die: d });
      continue;
    }
    if (turn === 1 && b1 > 0) {
      const v = ov2BgClientValidateStep(board, turn, -1, d - 1, d);
      if (v.ok) out.push({ from: -1, to: d - 1, die: d });
      continue;
    }

    if ((turn === 0 && b0 === 0) || (turn === 1 && b1 === 0)) {
      const vb = ov2BgClientValidateStep(board, turn, -1, -1, d);
      if (vb.ok) out.push({ from: -1, to: -1, die: d });
      for (let from = 0; from <= 23; from++) {
        for (let to = -1; to <= 23; to++) {
          const v2 = ov2BgClientValidateStep(board, turn, from, to, d);
          if (v2.ok) out.push({ from, to, die: d });
        }
      }
    }
  }
  return out;
}

function clientAnyLegalExists(board, turn) {
  return enumerateLegalSteps(board, turn).length > 0;
}

/** Dedupe steps for branching (same geometric move + die). */
function dedupeSteps(steps) {
  const seen = new Set();
  const out = [];
  for (const s of steps) {
    const k = `${s.from},${s.to},${s.die}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

/**
 * All complete turn sequences from this position: each sequence is a list of
 * steps until `diceAvail` is empty or no legal move remains (terminal states
 * match server behavior between move RPCs).
 *
 * @param {{
 *   pts: number[],
 *   bar: number[],
 *   off?: number[],
 *   diceAvail: number[],
 *   turnSeat?: number,
 * }} board
 * @returns {{ from: number, to: number, die: number }[][]}
 */
export function ov2BgClientAllLegalTurnSequences(board) {
  const turn = board.turnSeat != null ? Number(board.turnSeat) : NaN;
  if (turn !== 0 && turn !== 1) return [];
  return allSequencesRecursive(board, turn);
}

/**
 * All legal **next** steps from the current board (one server RPC each).
 * Uses step enumeration, not DFS-first-of-sequence, so doubles can reuse the
 * same (from,to,die) after the board updates — e.g. four 4s from the same point
 * when checkers remain.
 *
 * @param {{
 *   pts: number[],
 *   bar: number[],
 *   off?: number[],
 *   diceAvail: number[],
 *   turnSeat?: number,
 * }} board
 * @returns {{ from: number, to: number, die: number }[]}
 */
export function ov2BgClientLegalFirstMoves(board) {
  const turn = board.turnSeat != null ? Number(board.turnSeat) : NaN;
  if (turn !== 0 && turn !== 1) return [];
  return dedupeSteps(enumerateLegalSteps(board, turn));
}

/**
 * Legal destination points for one step from `fromPt` (-1 = bar).
 * @returns {Set<number>} includes -1 when bear-off is legal
 */
export function ov2BgClientLegalDestinationsForFrom(board, fromPt) {
  const turn = board.turnSeat != null ? Number(board.turnSeat) : NaN;
  const out = new Set();
  if (turn !== 0 && turn !== 1) return out;
  for (const m of ov2BgClientLegalFirstMoves(board)) {
    if (m.from === fromPt) out.add(m.to);
  }
  return out;
}

/**
 * Legal dice values for (from, to) among legal first moves (player must choose if >1).
 * Sorted ascending.
 * @returns {number[]}
 */
export function ov2BgClientLegalDiceForFromTo(board, fromPt, toPt) {
  const turn = board.turnSeat != null ? Number(board.turnSeat) : NaN;
  if (turn !== 0 && turn !== 1) return [];
  const dice = new Set();
  for (const m of ov2BgClientLegalFirstMoves(board)) {
    if (m.from === fromPt && m.to === toPt) dice.add(m.die);
  }
  return [...dice].sort((a, b) => a - b);
}

function allSequencesRecursive(board, turn) {
  const avail = board.diceAvail;
  if (!Array.isArray(avail) || avail.length === 0) {
    return [[]];
  }
  if (!clientAnyLegalExists(board, turn)) {
    return [[]];
  }
  const steps = dedupeSteps(enumerateLegalSteps(board, turn));
  const out = [];
  for (const step of steps) {
    const r = ov2BgClientApplyStepFull(board, turn, step.from, step.to, step.die);
    if (!r.ok) continue;
    const subs = allSequencesRecursive(r.board, turn);
    const continuations = subs.length > 0 ? subs : [[]];
    for (const sub of continuations) {
      out.push([step, ...sub]);
    }
  }
  return out;
}

function maxDiceKey(board) {
  const pts = clonePts(board.pts);
  const bar = Array.isArray(board.bar) ? board.bar.map(x => Number(x)) : [0, 0];
  const off = Array.isArray(board.off) ? board.off.map(x => Number(x)) : [0, 0];
  const avail = Array.isArray(board.diceAvail) ? board.diceAvail.map(x => Number(x)) : [];
  return `${avail.join(",")}|${pts.join(",")}|${bar.join(",")}|${off.join(",")}`;
}

/**
 * Maximum number of dice that can be played from this position (compulsory-move rule).
 */
export function ov2BgClientMaxDicePlayable(board, turn, memo = new Map()) {
  const avail = board.diceAvail;
  if (!Array.isArray(avail) || avail.length === 0) return 0;
  const k = maxDiceKey(board);
  if (memo.has(k)) return memo.get(k);

  const steps = dedupeSteps(enumerateLegalSteps(board, turn));
  if (steps.length === 0) {
    memo.set(k, 0);
    return 0;
  }

  let best = 0;
  for (const step of steps) {
    const r = ov2BgClientApplyStepFull(board, turn, step.from, step.to, step.die);
    if (!r.ok) continue;
    const m = 1 + ov2BgClientMaxDicePlayable(r.board, turn, memo);
    if (m > best) best = m;
  }
  memo.set(k, best);
  return best;
}

function distinctDiceValues(avail) {
  const s = new Set();
  if (!Array.isArray(avail)) return [];
  for (const x of avail) {
    const n = Number(x);
    if (Number.isFinite(n)) s.add(n);
  }
  return [...s].sort((a, b) => a - b);
}

/**
 * Validates a full turn submission: replay, terminal state, maximal dice, forced higher die when only one playable.
 * @param {{ pts: number[], bar: number[], off?: number[], diceAvail: number[], turnSeat?: number }} initialBoard
 * @param {{ from: number, to: number, die: number }[]} steps
 * @returns {{ ok: true } | { ok: false, code: string, message: string }}
 */
export function ov2BgClientValidateSubmitSteps(initialBoard, steps) {
  const turn = initialBoard.turnSeat != null ? Number(initialBoard.turnSeat) : NaN;
  if (turn !== 0 && turn !== 1) {
    return { ok: false, code: "BAD_TURN", message: "Invalid turn" };
  }
  const initialAvail = Array.isArray(initialBoard.diceAvail) ? initialBoard.diceAvail.map(x => Number(x)) : [];
  const maxPlay = ov2BgClientMaxDicePlayable(initialBoard, turn);

  if (maxPlay === 0) {
    if (steps.length > 0) {
      return { ok: false, code: "NO_MOVES_BUT_STEPS", message: "No legal moves; clear the turn." };
    }
    return { ok: true };
  }

  if (steps.length !== maxPlay) {
    return {
      ok: false,
      code: "NOT_MAXIMAL_DICE",
      message: `Must play ${maxPlay} dice, not ${steps.length}.`,
    };
  }

  let board = {
    pts: clonePts(initialBoard.pts),
    bar: Array.isArray(initialBoard.bar) ? initialBoard.bar.map(x => Number(x)) : [0, 0],
    off: Array.isArray(initialBoard.off) ? initialBoard.off.map(x => Number(x)) : [0, 0],
    diceAvail: [...initialAvail],
    turnSeat: turn,
    dice: initialBoard.dice,
  };

  for (let i = 0; i < steps.length; i++) {
    const st = steps[i];
    const r = ov2BgClientApplyStepFull(board, turn, st.from, st.to, st.die);
    if (!r.ok) {
      return { ok: false, code: r.code || "ILLEGAL_MOVE", message: `Illegal move at step ${i + 1}` };
    }
    board = { ...r.board, turnSeat: turn };
  }

  const availAfter = board.diceAvail;
  const hasDice = Array.isArray(availAfter) && availAfter.length > 0;
  const anyLegal = hasDice && clientAnyLegalExists(board, turn);
  if (hasDice && anyLegal) {
    return { ok: false, code: "INCOMPLETE_TURN", message: "Dice remain with legal moves." };
  }

  if (maxPlay === 1) {
    const dist = distinctDiceValues(initialAvail);
    if (dist.length >= 2) {
      const playableDice = new Set(
        enumerateLegalSteps(
          {
            pts: clonePts(initialBoard.pts),
            bar: Array.isArray(initialBoard.bar) ? initialBoard.bar.map(x => Number(x)) : [0, 0],
            diceAvail: [...initialAvail],
            turnSeat: turn,
          },
          turn
        ).map(s => s.die)
      );
      const forcedCandidates = dist.filter(d => playableDice.has(d));
      if (forcedCandidates.length > 0) {
        const forced = Math.max(...forcedCandidates);
        if (steps[0].die !== forced) {
          return {
            ok: false,
            code: "MUST_PLAY_HIGHER_DIE",
            message: `When only one die can be played, use the ${forced}.`,
          };
        }
      }
    }
  }

  return { ok: true };
}
