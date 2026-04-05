/**
 * OV2 Backgammon — local draft turn helpers (isolated from other OV2 games).
 */

import { ov2BgClientApplyStepFull, ov2BgClientLegalFirstMoves } from "./ov2BackgammonClientLegality";

/**
 * Immutable-style base from server `board` json.
 * @param {Record<string, unknown>} boardLike
 * @param {number|null} turnSeat
 */
export function ov2BgDraftBaseFromServerBoard(boardLike, turnSeat) {
  const b = boardLike && typeof boardLike === "object" ? boardLike : {};
  const pts = Array.isArray(b.pts) ? b.pts.map(x => Number(x)) : [];
  while (pts.length < 24) pts.push(0);
  return {
    pts: pts.slice(0, 24),
    bar: Array.isArray(b.bar) ? b.bar.map(x => Number(x)) : [0, 0],
    off: Array.isArray(b.off) ? b.off.map(x => Number(x)) : [0, 0],
    dice: b.dice,
    diceAvail: Array.isArray(b.diceAvail) ? b.diceAvail.map(x => Number(x)) : [],
    turnSeat: turnSeat != null && turnSeat !== "" ? Number(turnSeat) : null,
  };
}

/**
 * @param {ReturnType<typeof ov2BgDraftBaseFromServerBoard>} base
 * @param {number} turn
 * @param {{ from: number, to: number, die: number }[]} steps
 */
export function ov2BgReplayDraftSteps(base, turn, steps) {
  let board = {
    pts: [...base.pts],
    bar: [...base.bar],
    off: [...base.off],
    diceAvail: [...base.diceAvail],
    dice: base.dice,
    turnSeat: turn,
  };
  for (let i = 0; i < steps.length; i++) {
    const st = steps[i];
    const r = ov2BgClientApplyStepFull(board, turn, st.from, st.to, st.die);
    if (!r.ok) {
      return { ok: false, board, failedIndex: i, code: r.code };
    }
    board = { ...r.board, turnSeat: turn };
  }
  return { ok: true, board };
}

/**
 * While exactly one legal step exists on the draft board, append it (client-only).
 * Stops when 0 or 2+ moves — so two dice reaching the same (from,to) never auto-picks.
 *
 * @param {ReturnType<typeof ov2BgDraftBaseFromServerBoard>} draftBase
 * @param {number} turn
 * @param {{ from: number, to: number, die: number }[]} steps
 * @returns {{ from: number, to: number, die: number }[]}
 */
export function ov2BgAutoChainForcedMoves(draftBase, turn, steps) {
  let s = [...steps];
  for (;;) {
    const rep = ov2BgReplayDraftSteps(draftBase, turn, s);
    if (!rep.ok) return s;
    const b = rep.board;
    const board = {
      pts: Array.isArray(b.pts) ? b.pts.map(x => Number(x)) : [],
      bar: Array.isArray(b.bar) ? b.bar.map(x => Number(x)) : [0, 0],
      off: Array.isArray(b.off) ? b.off.map(x => Number(x)) : [0, 0],
      diceAvail: Array.isArray(b.diceAvail) ? b.diceAvail.map(x => Number(x)) : [],
      turnSeat: turn,
      dice: b.dice,
    };
    while (board.pts.length < 24) board.pts.push(0);
    const moves = ov2BgClientLegalFirstMoves(board);
    if (moves.length !== 1) return s;
    const m = moves[0];
    const next = [...s, m];
    const rep2 = ov2BgReplayDraftSteps(draftBase, turn, next);
    if (!rep2.ok) return s;
    s = next;
  }
}
