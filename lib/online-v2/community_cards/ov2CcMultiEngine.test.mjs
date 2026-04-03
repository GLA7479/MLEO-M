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

test("sit_out during showdown defers to pendingSitOutAfterHand", () => {
  const er = { e: buildFreshEngine(cfg9) };
  const pr = { p: normalizePrivatePayload({}) };
  let t = 30_000;
  apply(er, pr, { op: "sit", participantKey: "p0", payload: { seatIndex: 0, buyIn: 500, displayName: "A" }, now: t++ });
  apply(er, pr, { op: "sit", participantKey: "p1", payload: { seatIndex: 1, buyIn: 500, displayName: "B" }, now: t++ });
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  let e = er.e;
  assert.ok(!apply(er, pr, { op: "fold", participantKey: e.seats[e.actionSeat].participantKey, payload: {}, now: t++ }).error);
  e = er.e;
  assert.equal(e.phase, "showdown");
  const winnerPk = e.seats.find(s => s.inCurrentHand && !s.folded).participantKey;
  assert.ok(!apply(er, pr, { op: "sit_out", participantKey: winnerPk, payload: {}, now: t++ }).error);
  e = er.e;
  const w = e.seats.find(s => s.participantKey === winnerPk);
  assert.equal(w.pendingSitOutAfterHand, true);
  assert.equal(w.sitOut, false);
});

test("leave_seat during showdown sets pendingLeaveAfterHand (no mid-showdown unseat)", () => {
  const er = { e: buildFreshEngine(cfg9) };
  const pr = { p: normalizePrivatePayload({}) };
  let t = 40_000;
  apply(er, pr, { op: "sit", participantKey: "p0", payload: { seatIndex: 0, buyIn: 500, displayName: "A" }, now: t++ });
  apply(er, pr, { op: "sit", participantKey: "p1", payload: { seatIndex: 1, buyIn: 500, displayName: "B" }, now: t++ });
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  let e = er.e;
  assert.ok(!apply(er, pr, { op: "fold", participantKey: e.seats[e.actionSeat].participantKey, payload: {}, now: t++ }).error);
  e = er.e;
  const winnerPk = e.seats.find(s => s.inCurrentHand && !s.folded).participantKey;
  assert.ok(!apply(er, pr, { op: "leave_seat", participantKey: winnerPk, payload: {}, now: t++ }).error);
  e = er.e;
  const w = e.seats.find(s => s.participantKey === winnerPk);
  assert.equal(w.pendingLeaveAfterHand, true);
  assert.ok(w.participantKey);
});

test("between_hands missing phaseEndsAt is repaired on tick", () => {
  const er = { e: buildFreshEngine(cfg9) };
  const pr = { p: normalizePrivatePayload({}) };
  let t = 50_000;
  apply(er, pr, { op: "sit", participantKey: "p0", payload: { seatIndex: 0, buyIn: 500, displayName: "A" }, now: t++ });
  apply(er, pr, { op: "sit", participantKey: "p1", payload: { seatIndex: 1, buyIn: 500, displayName: "B" }, now: t++ });
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  let e = er.e;
  assert.ok(!apply(er, pr, { op: "fold", participantKey: e.seats[e.actionSeat].participantKey, payload: {}, now: t++ }).error);
  e = er.e;
  while (e.phase === "showdown" && t < 60_000) {
    apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t });
    t += 800;
    e = er.e;
  }
  assert.equal(e.phase, "between_hands");
  e.phaseEndsAt = null;
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t });
  e = er.e;
  assert.ok(typeof e.phaseEndsAt === "number" && e.phaseEndsAt > t);
});

test("action timeout sets tableNotice and advances", () => {
  const er = { e: buildFreshEngine(cfg9) };
  const pr = { p: normalizePrivatePayload({}) };
  let t = 60_000;
  apply(er, pr, { op: "sit", participantKey: "p0", payload: { seatIndex: 0, buyIn: 500, displayName: "A" }, now: t++ });
  apply(er, pr, { op: "sit", participantKey: "p1", payload: { seatIndex: 1, buyIn: 500, displayName: "B" }, now: t++ });
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  let e = er.e;
  const dl = e.actionDeadline;
  assert.ok(typeof dl === "number");
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: dl + 2000 });
  e = er.e;
  assert.ok(e.tableNotice && String(e.tableNotice).includes("auto-"));
});

test("two consecutive fold-win hands both start without stall", () => {
  const er = { e: buildFreshEngine(cfg9) };
  const pr = { p: normalizePrivatePayload({}) };
  let t = 70_000;
  apply(er, pr, { op: "sit", participantKey: "p0", payload: { seatIndex: 0, buyIn: 500, displayName: "A" }, now: t++ });
  apply(er, pr, { op: "sit", participantKey: "p1", payload: { seatIndex: 1, buyIn: 500, displayName: "B" }, now: t++ });
  for (let round = 0; round < 2; round++) {
    apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
    apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
    let e = er.e;
    assert.equal(e.phase, "preflop");
    const h1 = e.handSeq;
    assert.ok(!apply(er, pr, { op: "fold", participantKey: e.seats[e.actionSeat].participantKey, payload: {}, now: t++ }).error);
    e = er.e;
    assert.equal(e.phase, "showdown");
    while (e.phase === "showdown" && t < 200_000) {
      apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t });
      t += 800;
      e = er.e;
    }
    assert.equal(e.phase, "between_hands");
    while (e.phase !== "preflop" && t < 250_000) {
      if (e.phase === "between_hands" && typeof e.phaseEndsAt === "number") {
        t = Math.max(t, e.phaseEndsAt + 1);
      }
      apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
      e = er.e;
    }
    assert.equal(e.phase, "preflop");
    assert.ok(er.e.handSeq > h1);
  }
});

test("sit_in after sit_out sets waitBb when not first table hand", () => {
  const er = { e: buildFreshEngine(cfg9) };
  const pr = { p: normalizePrivatePayload({}) };
  let t = 80_000;
  apply(er, pr, { op: "sit", participantKey: "p0", payload: { seatIndex: 0, buyIn: 500, displayName: "A" }, now: t++ });
  apply(er, pr, { op: "sit", participantKey: "p1", payload: { seatIndex: 1, buyIn: 500, displayName: "B" }, now: t++ });
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  let e = er.e;
  assert.ok(!apply(er, pr, { op: "fold", participantKey: e.seats[e.actionSeat].participantKey, payload: {}, now: t++ }).error);
  e = er.e;
  while (e.phase === "showdown" && t < 90_000) {
    apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t });
    t += 800;
    e = er.e;
  }
  assert.equal(e.phase, "between_hands");
  apply(er, pr, { op: "sit_out", participantKey: "p0", payload: {}, now: t++ });
  e = er.e;
  assert.equal(e.seats[0].sitOut, true);
  assert.ok(!apply(er, pr, { op: "sit_in", participantKey: "p0", payload: {}, now: t++ }).error);
  e = er.e;
  assert.equal(e.seats[0].sitOut, false);
  assert.equal(e.seats[0].waitBb, true);
});

test("heads-up dual waitBb clears deadlock and deals next hand", () => {
  const er = { e: buildFreshEngine(cfg9) };
  const pr = { p: normalizePrivatePayload({}) };
  let t = 120_000;
  apply(er, pr, { op: "sit", participantKey: "p0", payload: { seatIndex: 0, buyIn: 500, displayName: "A" }, now: t++ });
  apply(er, pr, { op: "sit", participantKey: "p1", payload: { seatIndex: 1, buyIn: 500, displayName: "B" }, now: t++ });
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  let e = er.e;
  assert.ok(!apply(er, pr, { op: "fold", participantKey: e.seats[e.actionSeat].participantKey, payload: {}, now: t++ }).error);
  e = er.e;
  while (e.phase === "showdown" && t < 130_000) {
    apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t });
    t += 800;
    e = er.e;
  }
  assert.equal(e.phase, "between_hands");
  e.seats[0].waitBb = true;
  e.seats[1].waitBb = true;
  const hs = e.handSeq;
  while (e.phase !== "preflop" && t < 200_000) {
    if (e.phase === "between_hands" && typeof e.phaseEndsAt === "number") {
      t = Math.max(t, e.phaseEndsAt + 1);
    }
    apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
    e = er.e;
  }
  assert.equal(e.phase, "preflop");
  assert.ok(e.handSeq > hs);
  assert.equal(e.seats[0].waitBb, false);
  assert.equal(e.seats[1].waitBb, false);
  assert.equal(validateCcEngineInvariants(e), null);
});

test("idle dirty persisted table repairs junk and starts hand", () => {
  const er = { e: buildFreshEngine(cfg9) };
  const pr = { p: normalizePrivatePayload({}) };
  let t = 300_000;
  assert.ok(
    !apply(er, pr, { op: "sit", participantKey: "p0", payload: { seatIndex: 0, buyIn: 500, displayName: "A" }, now: t++ }).error,
  );
  assert.ok(
    !apply(er, pr, { op: "sit", participantKey: "p1", payload: { seatIndex: 1, buyIn: 500, displayName: "B" }, now: t++ }).error,
  );
  const e0 = er.e;
  e0.phase = "idle";
  e0.phaseEndsAt = null;
  e0.completedHands = 2;
  e0.handSeq = 4;
  e0.communityCards = ["As", "Ks", "Qs", "Js", "Ts"];
  e0.pot = 120;
  e0.sidePots = [{ amount: 120, eligible: [0, 1] }];
  e0.actionSeat = 0;
  e0.actionDeadline = t + 5000;
  e0.street = "river";
  e0.currentBet = 50;
  e0.winnersDisplay = { seats: [0], handSeq: 3, stacksWon: { "0": 120 } };
  e0.seats[0].inCurrentHand = true;
  e0.seats[0].streetContrib = 50;
  pr.p.holes = { "0": ["2c", "3c"] };
  pr.p.deck = ["4c"];

  assert.ok(!apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ }).error);
  const e = er.e;
  assert.equal(e.phase, "preflop");
  assert.equal(e.street, "preflop");
  assert.notEqual(e.pot, 120);
  assert.equal(e.pot, e.sb + e.bb);
  assert.equal(e.communityCards.length, 0);
  assert.equal(e.winnersDisplay, null);
  assert.equal(e.seats[0].inCurrentHand, true);
  assert.ok(e.actionSeat != null);
  assert.equal(Object.keys(pr.p.holes).length, 2);
  assert.equal(validateCcEngineInvariants(e), null);
});
