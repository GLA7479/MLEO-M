import assert from "node:assert/strict";
import test from "node:test";
import { ov2OrbitTrapCellKey } from "./ov2OrbitTrapBoardSpec.js";
import {
  createInitialOtState,
  otApplyLock,
  otApplyMove,
  otApplyRotate,
  otActiveRoster,
  otCanApplyLock,
  otGetMoveBudget,
  otListLegalMoveDestinations,
} from "./ov2OrbitTrapEngine.js";

test("initial state: revision 0, seat 0 turn, outer starts", () => {
  const s = createInitialOtState();
  assert.equal(s.revision, 0);
  assert.equal(s.turnSeat, 0);
  assert.deepEqual(otActiveRoster(s), [0, 1, 2, 3]);
  assert.equal(s.players[0].ring, "outer");
  assert.equal(s.players[0].slot, 0);
  assert.equal(s.fixedOrbKeys.has(ov2OrbitTrapCellKey("outer", 5)), true);
});

test("two-player roster: turn alternates only between active seats", () => {
  const s = createInitialOtState();
  s.activeSeats = [0, 2];
  s.players[1].inPlay = false;
  s.players[3].inPlay = false;
  s.turnSeat = 0;
  const r = otApplyRotate(s, 0, "outer", 1);
  assert.equal(r.ok, true);
  assert.equal(r.state.turnSeat, 2);
  const r2 = otApplyRotate(r.state, 2, "outer", 1);
  assert.equal(r2.ok, true);
  assert.equal(r2.state.turnSeat, 0);
});

test("bump: defender pushed +1 CW when push cell empty (no stun on successful bump)", () => {
  const s = createInitialOtState();
  s.players[1].ring = "outer";
  s.players[1].slot = 1;
  s.players[0].ring = "outer";
  s.players[0].slot = 0;
  s.turnSeat = 0;
  s.startedTurnOnInner = false;
  const r = otApplyMove(s, 0, "outer", 1);
  assert.equal(r.ok, true);
  assert.equal(r.state.players[1].slot, 2);
  assert.equal(r.state.players[1].stunActive, false);
  assert.equal(r.state.players[0].ring, "outer");
  assert.equal(r.state.players[0].slot, 1);
});

test("bump: push blocked — defender stays, stunned, attacker unmoved, turn advances", () => {
  const s = createInitialOtState();
  s.players[1].ring = "outer";
  s.players[1].slot = 1;
  s.players[1].orbsHeld = 1;
  s.players[2].ring = "outer";
  s.players[2].slot = 2;
  s.players[0].ring = "outer";
  s.players[0].slot = 0;
  s.turnSeat = 0;
  const legal = otListLegalMoveDestinations(s, 0);
  assert.ok(legal.some(d => d.ring === "outer" && d.slot === 1));
  const r = otApplyMove(s, 0, "outer", 1);
  assert.equal(r.ok, true);
  assert.equal(r.state.players[0].slot, 0);
  assert.equal(r.state.players[1].slot, 1);
  assert.equal(r.state.players[1].stunActive, true);
  assert.equal(r.state.players[1].orbsHeld, 0);
  assert.ok(r.state.looseOrbs.some(o => o.ring === "outer" && o.slot === 1));
  assert.equal(r.state.turnSeat, 1);
});

test("orb pickup: loose before fixed on same cell", () => {
  const s = createInitialOtState();
  s.players[2].ring = "mid";
  s.players[2].slot = 0;
  s.players[0].ring = "outer";
  s.players[0].slot = 4;
  s.players[0].orbsHeld = 0;
  s.looseOrbs.push({ ring: "outer", slot: 5 });
  const kFixed = ov2OrbitTrapCellKey("outer", 5);
  assert.equal(s.fixedOrbKeys.has(kFixed), true);
  s.turnSeat = 0;
  s.startedTurnOnInner = false;
  const r = otApplyMove(s, 0, "outer", 5);
  assert.equal(r.ok, true);
  assert.equal(r.state.players[0].orbsHeld, 2);
  assert.equal(r.state.fixedOrbKeys.has(kFixed), false);
  assert.equal(r.state.looseOrbs.some(o => o.ring === "outer" && o.slot === 5), false);
});

test("trap overrides boost pending next turn: move budget 1", () => {
  const s = createInitialOtState();
  s.players[0].boostPending = true;
  s.players[0].trapSlowPending = true;
  s.turnSeat = 0;
  assert.equal(otGetMoveBudget(s, 0), 1);
});

test("trap landing clears boost and sets trap slow", () => {
  const s = createInitialOtState();
  s.players[1].ring = "mid";
  s.players[1].slot = 3;
  s.players[0].ring = "outer";
  s.players[0].slot = 2;
  s.turnSeat = 0;
  s.startedTurnOnInner = false;
  s.players[0].boostPending = true;
  const r = otApplyMove(s, 0, "outer", 3);
  assert.equal(r.ok, true);
  assert.equal(r.state.turnSeat, 1);
  assert.equal(r.state.players[0].trapSlowPending, true);
  assert.equal(r.state.players[0].boostPending, false);
});

test("stunned player cannot apply lock", () => {
  const s = createInitialOtState();
  s.players[0].stunActive = true;
  s.players[0].lockToken = true;
  s.turnSeat = 0;
  assert.equal(otCanApplyLock(s, 0), false);
  const r = otApplyLock(s, 0, "mid");
  assert.equal(r.ok, false);
});

test("core entry rejected without 2 orbs (full path gate)", () => {
  const s = createInitialOtState();
  s.players[0].ring = "inner";
  s.players[0].slot = 0;
  s.players[0].orbsHeld = 1;
  s.turnSeat = 0;
  s.startedTurnOnInner = true;
  const dests = otListLegalMoveDestinations(s, 0);
  assert.equal(dests.some(d => d.ring === "core"), false);
  const r = otApplyMove(s, 0, "core", 0);
  assert.equal(r.ok, false);
});

test("win: inner start, 2 orbs, step into core", () => {
  const s = createInitialOtState();
  s.players[0].ring = "inner";
  s.players[0].slot = 0;
  s.players[0].orbsHeld = 2;
  s.turnSeat = 0;
  s.startedTurnOnInner = true;
  const r = otApplyMove(s, 0, "core", 0);
  assert.equal(r.ok, true);
  assert.equal(r.state.phase, "finished");
  assert.equal(r.state.winnerSeat, 0);
});

test("rotate advances turn and shifts outer contents", () => {
  const s = createInitialOtState();
  s.turnSeat = 0;
  const r = otApplyRotate(s, 0, "outer", 1);
  assert.equal(r.ok, true);
  assert.equal(r.state.players[0].slot, 1);
  assert.equal(r.state.turnSeat, 1);
  assert.equal(r.state.revision, 1);
});

test("lock consumes token and sets ring lock", () => {
  const s = createInitialOtState();
  s.players[0].lockToken = true;
  s.turnSeat = 0;
  const r = otApplyLock(s, 0, "mid");
  assert.equal(r.ok, true);
  assert.equal(r.state.players[0].lockToken, false);
  assert.deepEqual(r.state.ringLock, { ring: "mid", ownerSeat: 0 });
});
