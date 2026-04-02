import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFreshEngine,
  mutateEngine,
  normalizePrivatePayload,
  validateCcEngineInvariants,
} from "./ov2CcMultiEngine.js";

const cfg9 = { maxSeats: 9, tablePrice: 100, maxBuyin: 1000, sb: 5, bb: 10 };

function apply(engineRef, privRef, args) {
  const r = mutateEngine(engineRef.e, privRef.p, { ...args, config: cfg9 });
  if (r.error) return r;
  engineRef.e = r.engine;
  privRef.p = r.privatePayload;
  return r;
}

test("validateCcEngineInvariants rejects negative pot", () => {
  const e = buildFreshEngine(cfg9);
  e.pot = -1;
  assert.equal(validateCcEngineInvariants(e), "cc_inv_pot_negative");
});

test("heads-up: button posts SB, other posts BB; preflop action starts on button", () => {
  const er = { e: buildFreshEngine(cfg9) };
  const pr = { p: normalizePrivatePayload({}) };
  let t = 1_000;
  assert.ok(
    !apply(er, pr, {
      op: "sit",
      participantKey: "p0",
      payload: { seatIndex: 0, buyIn: 500, displayName: "A" },
      now: t++,
    }).error,
  );
  assert.ok(
    !apply(er, pr, {
      op: "sit",
      participantKey: "p1",
      payload: { seatIndex: 1, buyIn: 500, displayName: "B" },
      now: t++,
    }).error,
  );
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  const e = er.e;
  assert.equal(e.phase, "preflop");
  assert.equal(e.sbSeat, e.buttonSeat);
  assert.notEqual(e.bbSeat, e.buttonSeat);
  assert.equal(new Set([e.sbSeat, e.bbSeat]).size, 2);
  const firstPk = e.seats[e.actionSeat].participantKey;
  assert.equal(firstPk, e.seats[e.buttonSeat].participantKey);
});

test("heads-up: button rotates after a completed hand", () => {
  const er = { e: buildFreshEngine(cfg9) };
  const pr = { p: normalizePrivatePayload({}) };
  let t = 2_000;
  apply(er, pr, {
    op: "sit",
    participantKey: "p0",
    payload: { seatIndex: 0, buyIn: 500, displayName: "A" },
    now: t++,
  });
  apply(er, pr, {
    op: "sit",
    participantKey: "p1",
    payload: { seatIndex: 1, buyIn: 500, displayName: "B" },
    now: t++,
  });
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  let e = er.e;
  const btnHand1 = e.buttonSeat;
  const actorPk = e.seats[e.actionSeat].participantKey;
  assert.ok(!apply(er, pr, { op: "fold", participantKey: actorPk, payload: {}, now: t++ }).error);
  e = er.e;
  assert.equal(e.phase, "showdown");
  while (e.phase === "showdown" && t < 500_000) {
    apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t });
    t += 800;
    e = er.e;
  }
  assert.equal(e.phase, "between_hands");
  assert.ok(e.completedHands >= 1);
  const btnAfterSettle = e.buttonSeat;
  assert.notEqual(btnAfterSettle, btnHand1);
  while (e.phase !== "preflop" && t < 600_000) {
    if (e.phase === "between_hands" && typeof e.phaseEndsAt === "number") {
      t = Math.max(t, e.phaseEndsAt + 1);
    }
    apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
    e = er.e;
  }
  assert.equal(e.phase, "preflop");
  assert.equal(e.sbSeat, e.buttonSeat);
  assert.equal(e.buttonSeat, btnAfterSettle);
});

test("preflop all-in runout reaches showdown with full board", () => {
  const er = { e: buildFreshEngine(cfg9) };
  const pr = { p: normalizePrivatePayload({}) };
  let t = 10_000;
  apply(er, pr, {
    op: "sit",
    participantKey: "p0",
    payload: { seatIndex: 0, buyIn: 500, displayName: "A" },
    now: t++,
  });
  apply(er, pr, {
    op: "sit",
    participantKey: "p1",
    payload: { seatIndex: 1, buyIn: 500, displayName: "B" },
    now: t++,
  });
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  let e = er.e;
  let guard = 0;
  while (e.phase === "preflop" && e.actionSeat != null && guard++ < 20) {
    const pk = e.seats[e.actionSeat].participantKey;
    assert.ok(!apply(er, pr, { op: "all_in", participantKey: pk, payload: {}, now: t++ }).error);
    e = er.e;
  }
  assert.equal(e.phase, "showdown");
  assert.equal(e.communityCards.length, 5);
  assert.equal(validateCcEngineInvariants(e), null);
});

test("check-check when able advances street (HU postflop)", () => {
  const er = { e: buildFreshEngine(cfg9) };
  const pr = { p: normalizePrivatePayload({}) };
  let t = 20_000;
  apply(er, pr, {
    op: "sit",
    participantKey: "p0",
    payload: { seatIndex: 0, buyIn: 500, displayName: "A" },
    now: t++,
  });
  apply(er, pr, {
    op: "sit",
    participantKey: "p1",
    payload: { seatIndex: 1, buyIn: 500, displayName: "B" },
    now: t++,
  });
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  let e = er.e;
  let g = 0;
  while (e.street === "preflop" && e.actionSeat != null && g++ < 30) {
    const pk = e.seats[e.actionSeat].participantKey;
    assert.ok(!apply(er, pr, { op: "call", participantKey: pk, payload: {}, now: t++ }).error);
    e = er.e;
  }
  assert.equal(e.street, "flop");
  const pkA = e.seats[e.actionSeat].participantKey;
  assert.ok(!apply(er, pr, { op: "check", participantKey: pkA, payload: {}, now: t++ }).error);
  e = er.e;
  const pkB = e.seats[e.actionSeat].participantKey;
  assert.ok(!apply(er, pr, { op: "check", participantKey: pkB, payload: {}, now: t++ }).error);
  e = er.e;
  assert.equal(e.street, "turn");
});
