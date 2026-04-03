import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFreshEngine,
  computeSidePots,
  distributeSidePotsToWinners,
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

test("idle stale pendingLeaveAfterHand unseats and emits credit op", () => {
  const e = buildFreshEngine(cfg9);
  const priv = normalizePrivatePayload({});
  const t = 500_000;
  Object.assign(e.seats[0], {
    participantKey: "p0",
    displayName: "A",
    stack: 400,
    waitBb: false,
    sitOut: false,
    pendingLeaveAfterHand: true,
    inCurrentHand: false,
  });
  e.phase = "idle";
  e.phaseEndsAt = null;
  const r = mutateEngine(e, priv, { op: "tick", participantKey: "", payload: {}, now: t, config: cfg9 });
  assert.equal(r.error, null);
  const credit = r.economyOps.find(o => o.type === "credit" && o.participantKey === "p0");
  assert.ok(credit);
  assert.equal(credit.amount, 400);
  assert.equal(r.engine.seats[0].participantKey, null);
  assert.equal(r.engine.seats[0].pendingLeaveAfterHand, false);
});

test("idle stale pendingSitOutAfterHand flushes to sitOut without pending", () => {
  const e = buildFreshEngine(cfg9);
  const priv = normalizePrivatePayload({});
  const t = 510_000;
  Object.assign(e.seats[0], {
    participantKey: "p0",
    displayName: "A",
    stack: 400,
    waitBb: false,
    sitOut: false,
    pendingSitOutAfterHand: true,
    inCurrentHand: false,
  });
  e.phase = "idle";
  e.phaseEndsAt = null;
  const r = mutateEngine(e, priv, { op: "tick", participantKey: "", payload: {}, now: t, config: cfg9 });
  assert.equal(r.error, null);
  const s0 = r.engine.seats[0];
  assert.equal(s0.pendingSitOutAfterHand, false);
  assert.equal(s0.sitOut, true);
  assert.equal(s0.participantKey, "p0");
});

test("idle dirty pot board winners plus stale pendingSitOut clears leftovers", () => {
  const er = { e: buildFreshEngine(cfg9) };
  const pr = { p: normalizePrivatePayload({}) };
  let t = 520_000;
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
  e0.communityCards = ["As", "Ks", "Qs"];
  e0.pot = 80;
  e0.winnersDisplay = { seats: [0], handSeq: 1, stacksWon: { "0": 80 } };
  e0.seats[0].pendingSitOutAfterHand = true;
  e0.seats[0].inCurrentHand = false;
  e0.seats[1].pendingSitOutAfterHand = true;
  e0.seats[1].inCurrentHand = false;

  assert.ok(!apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ }).error);
  const e = er.e;
  assert.equal(e.communityCards.length, 0);
  assert.equal(e.winnersDisplay, null);
  assert.equal(e.pot, 0);
  assert.equal(e.seats[0].pendingSitOutAfterHand, false);
  assert.equal(e.seats[1].pendingSitOutAfterHand, false);
  assert.equal(e.seats[0].sitOut, true);
  assert.equal(e.seats[1].sitOut, true);
  assert.equal(validateCcEngineInvariants(e), null);
});

test("two seated stale waitBb on both still becomes startable after repair", () => {
  const er = { e: buildFreshEngine(cfg9) };
  const pr = { p: normalizePrivatePayload({}) };
  let t = 530_000;
  assert.ok(
    !apply(er, pr, { op: "sit", participantKey: "p0", payload: { seatIndex: 0, buyIn: 500, displayName: "A" }, now: t++ }).error,
  );
  assert.ok(
    !apply(er, pr, { op: "sit", participantKey: "p1", payload: { seatIndex: 1, buyIn: 500, displayName: "B" }, now: t++ }).error,
  );
  const e0 = er.e;
  e0.phase = "idle";
  e0.completedHands = 3;
  e0.seats[0].waitBb = true;
  e0.seats[1].waitBb = true;
  e0.seats[0].inCurrentHand = false;
  e0.seats[1].inCurrentHand = false;

  assert.ok(!apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ }).error);
  const e = er.e;
  assert.equal(e.phase, "preflop");
  assert.equal(e.seats[0].waitBb, false);
  assert.equal(e.seats[1].waitBb, false);
  assert.equal(validateCcEngineInvariants(e), null);
});

test("three-handed preflop first actor is SB not button", () => {
  const er = { e: buildFreshEngine(cfg9) };
  const pr = { p: normalizePrivatePayload({}) };
  let t = 540_000;
  assert.ok(
    !apply(er, pr, { op: "sit", participantKey: "p0", payload: { seatIndex: 0, buyIn: 500, displayName: "A" }, now: t++ }).error,
  );
  assert.ok(
    !apply(er, pr, { op: "sit", participantKey: "p1", payload: { seatIndex: 1, buyIn: 500, displayName: "B" }, now: t++ }).error,
  );
  assert.ok(
    !apply(er, pr, { op: "sit", participantKey: "p2", payload: { seatIndex: 2, buyIn: 500, displayName: "C" }, now: t++ }).error,
  );
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  const e = er.e;
  assert.equal(e.phase, "preflop");
  assert.equal(e.actionSeat, e.sbSeat);
  assert.notEqual(e.sbSeat, e.buttonSeat);
});

test("four-handed preflop first actor is UTG (seat after BB)", () => {
  const er = { e: buildFreshEngine(cfg9) };
  const pr = { p: normalizePrivatePayload({}) };
  let t = 550_000;
  for (let i = 0; i < 4; i++) {
    assert.ok(
      !apply(er, pr, {
        op: "sit",
        participantKey: `p${i}`,
        payload: { seatIndex: i, buyIn: 500, displayName: `P${i}` },
        now: t++,
      }).error,
    );
  }
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  const e = er.e;
  assert.equal(e.phase, "preflop");
  assert.equal(e.buttonSeat, 0);
  assert.equal(e.sbSeat, 1);
  assert.equal(e.bbSeat, 2);
  assert.equal(e.actionSeat, 3);
});

test("three-handed SB all-in from blind action skips to BB", () => {
  const er = { e: buildFreshEngine(cfg9) };
  const pr = { p: normalizePrivatePayload({}) };
  let t = 560_000;
  assert.ok(
    !apply(er, pr, { op: "sit", participantKey: "p0", payload: { seatIndex: 0, buyIn: 500, displayName: "A" }, now: t++ }).error,
  );
  assert.ok(
    !apply(er, pr, { op: "sit", participantKey: "p1", payload: { seatIndex: 1, buyIn: 500, displayName: "B" }, now: t++ }).error,
  );
  assert.ok(
    !apply(er, pr, { op: "sit", participantKey: "p2", payload: { seatIndex: 2, buyIn: 500, displayName: "C" }, now: t++ }).error,
  );
  er.e.seats[1].stack = 5;
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  const e = er.e;
  assert.equal(e.phase, "preflop");
  assert.equal(e.seats[1].allIn, true);
  assert.equal(e.actionSeat, e.bbSeat);
});

test("computeSidePots three contribution tiers sum to main pot", () => {
  const e = buildFreshEngine(cfg9);
  e.pot = 180;
  for (const s of e.seats) {
    s.participantKey = null;
    s.totalContrib = 0;
    s.folded = false;
    s.inCurrentHand = false;
  }
  for (const [i, c] of [
    [0, 30],
    [1, 50],
    [2, 100],
  ]) {
    e.seats[i].participantKey = `p${i}`;
    e.seats[i].totalContrib = c;
    e.seats[i].inCurrentHand = true;
  }
  const pots = computeSidePots(e);
  assert.ok(pots);
  assert.equal(pots.reduce((a, p) => a + p.amount, 0), 180);
  assert.equal(pots.length, 3);
});

test("three-handed SB and BB fold BTN wins hand settles to between_hands", () => {
  const er = { e: buildFreshEngine(cfg9) };
  const pr = { p: normalizePrivatePayload({}) };
  let t = 570_000;
  for (let i = 0; i < 3; i++) {
    assert.ok(
      !apply(er, pr, {
        op: "sit",
        participantKey: `p${i}`,
        payload: { seatIndex: i, buyIn: 500, displayName: `P${i}` },
        now: t++,
      }).error,
    );
  }
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  let e = er.e;
  assert.equal(e.phase, "preflop");
  const pkSb = e.seats[e.sbSeat].participantKey;
  const pkBb = e.seats[e.bbSeat].participantKey;
  assert.ok(!apply(er, pr, { op: "fold", participantKey: pkSb, payload: {}, now: t++ }).error);
  e = er.e;
  assert.ok(!apply(er, pr, { op: "fold", participantKey: pkBb, payload: {}, now: t++ }).error);
  e = er.e;
  assert.equal(e.phase, "showdown");
  while (e.phase === "showdown" && t < 580_000) {
    apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t });
    t += 800;
    e = er.e;
  }
  assert.equal(e.phase, "between_hands");
  assert.equal(e.pot, 0);
  assert.equal(validateCcEngineInvariants(e), null);
});

test("four-handed UTG fold assigns next actor clockwise (BTN)", () => {
  const er = { e: buildFreshEngine(cfg9) };
  const pr = { p: normalizePrivatePayload({}) };
  let t = 580_000;
  for (let i = 0; i < 4; i++) {
    assert.ok(
      !apply(er, pr, {
        op: "sit",
        participantKey: `p${i}`,
        payload: { seatIndex: i, buyIn: 500, displayName: `P${i}` },
        now: t++,
      }).error,
    );
  }
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  let e = er.e;
  assert.equal(e.actionSeat, 3);
  const pkU = e.seats[3].participantKey;
  assert.ok(!apply(er, pr, { op: "fold", participantKey: pkU, payload: {}, now: t++ }).error);
  e = er.e;
  assert.equal(e.actionSeat, 0);
  assert.equal(e.phase, "preflop");
});

test("four-handed SB re-raise gives BB next action before UTG", () => {
  const er = { e: buildFreshEngine(cfg9) };
  const pr = { p: normalizePrivatePayload({}) };
  let t = 590_000;
  for (let i = 0; i < 4; i++) {
    assert.ok(
      !apply(er, pr, {
        op: "sit",
        participantKey: `p${i}`,
        payload: { seatIndex: i, buyIn: 500, displayName: `P${i}` },
        now: t++,
      }).error,
    );
  }
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  let e = er.e;
  const pkU = e.seats[3].participantKey;
  const pk0 = e.seats[0].participantKey;
  const pk1 = e.seats[1].participantKey;
  assert.ok(!apply(er, pr, { op: "raise", participantKey: pkU, payload: { amount: 20 }, now: t++ }).error);
  e = er.e;
  assert.ok(!apply(er, pr, { op: "call", participantKey: pk0, payload: {}, now: t++ }).error);
  e = er.e;
  assert.ok(!apply(er, pr, { op: "raise", participantKey: pk1, payload: { amount: 40 }, now: t++ }).error);
  e = er.e;
  assert.equal(e.actionSeat, 2);
  assert.equal(e.currentBet, 45);
});

test("four-handed leave_seat while facing bet folds and continues", () => {
  const er = { e: buildFreshEngine(cfg9) };
  const pr = { p: normalizePrivatePayload({}) };
  let t = 600_000;
  for (let i = 0; i < 4; i++) {
    assert.ok(
      !apply(er, pr, {
        op: "sit",
        participantKey: `p${i}`,
        payload: { seatIndex: i, buyIn: 500, displayName: `P${i}` },
        now: t++,
      }).error,
    );
  }
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  let e = er.e;
  const pkU = e.seats[3].participantKey;
  const pk0 = e.seats[0].participantKey;
  assert.ok(!apply(er, pr, { op: "raise", participantKey: pkU, payload: { amount: 20 }, now: t++ }).error);
  e = er.e;
  assert.equal(e.actionSeat, 0);
  assert.ok(!apply(er, pr, { op: "leave_seat", participantKey: pk0, payload: {}, now: t++ }).error);
  e = er.e;
  assert.equal(e.seats[0].folded, true);
  assert.ok(e.actionSeat != null);
  assert.equal(e.phase, "preflop");
});

test("distributeSidePotsToWinners three-way all-in splits tiers by eligibility", () => {
  const e = buildFreshEngine(cfg9);
  e.pot = 180;
  e.communityCards = ["2s", "3h", "4d", "9c", "Jd"];
  e.street = "river";
  e.handSeq = 1;
  for (const s of e.seats) {
    s.participantKey = null;
    s.inCurrentHand = false;
    s.folded = false;
    s.totalContrib = 0;
  }
  for (const i of [0, 1, 2]) {
    e.seats[i].participantKey = `p${i}`;
    e.seats[i].inCurrentHand = true;
    e.seats[i].folded = false;
  }
  e.seats[0].totalContrib = 30;
  e.seats[1].totalContrib = 50;
  e.seats[2].totalContrib = 100;
  const priv = normalizePrivatePayload({});
  priv.holes = {
    "0": ["As", "Ah"],
    "1": ["Ks", "Kh"],
    "2": ["Qs", "Qh"],
  };
  const d = distributeSidePotsToWinners(e, priv);
  assert.equal(d.error, null);
  const sum = Object.values(d.stackAdds).reduce((a, x) => a + x, 0);
  assert.equal(sum, 180);
  assert.equal(d.stackAdds[0], 90);
  assert.equal(d.stackAdds[1], 40);
  assert.equal(d.stackAdds[2], 50);
});

test("multi-way hand completes second hand after between_hands", () => {
  const er = { e: buildFreshEngine(cfg9) };
  const pr = { p: normalizePrivatePayload({}) };
  let t = 610_000;
  for (let i = 0; i < 3; i++) {
    assert.ok(
      !apply(er, pr, {
        op: "sit",
        participantKey: `p${i}`,
        payload: { seatIndex: i, buyIn: 500, displayName: `P${i}` },
        now: t++,
      }).error,
    );
  }
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  let e = er.e;
  const pkSb = e.seats[e.sbSeat].participantKey;
  const pkBb = e.seats[e.bbSeat].participantKey;
  assert.ok(!apply(er, pr, { op: "fold", participantKey: pkSb, payload: {}, now: t++ }).error);
  assert.ok(!apply(er, pr, { op: "fold", participantKey: pkBb, payload: {}, now: t++ }).error);
  e = er.e;
  while (e.phase === "showdown" && t < 620_000) {
    apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t });
    t += 800;
    e = er.e;
  }
  assert.equal(e.phase, "between_hands");
  const h1 = e.handSeq;
  while (e.phase !== "preflop" && t < 630_000) {
    if (e.phase === "between_hands" && typeof e.phaseEndsAt === "number") {
      t = Math.max(t, e.phaseEndsAt + 1);
    }
    apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
    e = er.e;
  }
  assert.equal(e.phase, "preflop");
  assert.ok(e.handSeq > h1);
});

test("distributeSidePotsToWinners chops when board plays for two winners", () => {
  const e = buildFreshEngine(cfg9);
  e.pot = 200;
  e.communityCards = ["Ac", "Kc", "Qc", "Jc", "2d"];
  e.street = "river";
  e.handSeq = 1;
  for (const s of e.seats) {
    s.participantKey = null;
    s.inCurrentHand = false;
    s.folded = false;
    s.totalContrib = 0;
  }
  for (const i of [0, 1]) {
    e.seats[i].participantKey = `p${i}`;
    e.seats[i].inCurrentHand = true;
    e.seats[i].totalContrib = 100;
  }
  const priv = normalizePrivatePayload({});
  priv.holes = {
    "0": ["Ad", "3h"],
    "1": ["Ah", "4s"],
  };
  const d = distributeSidePotsToWinners(e, priv);
  assert.equal(d.error, null);
  assert.equal(d.stackAdds[0] + d.stackAdds[1], 200);
  assert.equal(d.stackAdds[0], 100);
  assert.equal(d.stackAdds[1], 100);
});

test("four-handed SB re-raise puts UTG next after BB", () => {
  const er = { e: buildFreshEngine(cfg9) };
  const pr = { p: normalizePrivatePayload({}) };
  let t = 660_000;
  for (let i = 0; i < 4; i++) {
    assert.ok(
      !apply(er, pr, {
        op: "sit",
        participantKey: `p${i}`,
        payload: { seatIndex: i, buyIn: 500, displayName: `P${i}` },
        now: t++,
      }).error,
    );
  }
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  let e = er.e;
  const pkU = e.seats[3].participantKey;
  const pk0 = e.seats[0].participantKey;
  const pk1 = e.seats[1].participantKey;
  const pk2 = e.seats[2].participantKey;
  assert.ok(!apply(er, pr, { op: "raise", participantKey: pkU, payload: { amount: 20 }, now: t++ }).error);
  e = er.e;
  assert.ok(!apply(er, pr, { op: "call", participantKey: pk0, payload: {}, now: t++ }).error);
  e = er.e;
  assert.ok(!apply(er, pr, { op: "raise", participantKey: pk1, payload: { amount: 40 }, now: t++ }).error);
  e = er.e;
  assert.ok(!apply(er, pr, { op: "call", participantKey: pk2, payload: {}, now: t++ }).error);
  e = er.e;
  assert.equal(e.actionSeat, 3);
  assert.equal(e.phase, "preflop");
});

test("tick repairs illegal actionSeat on folded seat", () => {
  const er = { e: buildFreshEngine(cfg9) };
  const pr = { p: normalizePrivatePayload({}) };
  let t = 670_000;
  for (let i = 0; i < 3; i++) {
    assert.ok(
      !apply(er, pr, {
        op: "sit",
        participantKey: `p${i}`,
        payload: { seatIndex: i, buyIn: 500, displayName: `P${i}` },
        now: t++,
      }).error,
    );
  }
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  let e = er.e;
  const pkSb = e.seats[e.sbSeat].participantKey;
  assert.ok(!apply(er, pr, { op: "fold", participantKey: pkSb, payload: {}, now: t++ }).error);
  e = er.e;
  const foldedSb = e.sbSeat;
  e.actionSeat = foldedSb;
  e.actionDeadline = t + 60_000;
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  e = er.e;
  assert.notEqual(e.actionSeat, foldedSb);
  assert.ok(e.actionSeat != null || e.phase !== "preflop");
});

test("four-handed one sit_out between hands next hand still deals", () => {
  const er = { e: buildFreshEngine(cfg9) };
  const pr = { p: normalizePrivatePayload({}) };
  let t = 680_000;
  for (let i = 0; i < 4; i++) {
    assert.ok(
      !apply(er, pr, {
        op: "sit",
        participantKey: `p${i}`,
        payload: { seatIndex: i, buyIn: 500, displayName: `P${i}` },
        now: t++,
      }).error,
    );
  }
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
  let e = er.e;
  let guard = 0;
  while (e.phase === "preflop" && guard++ < 24) {
    const as = e.actionSeat;
    if (as == null) break;
    const pk = e.seats[as].participantKey;
    assert.ok(!apply(er, pr, { op: "fold", participantKey: pk, payload: {}, now: t++ }).error);
    e = er.e;
  }
  while (e.phase === "showdown" && t < 690_000) {
    apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t });
    t += 800;
    e = er.e;
  }
  assert.equal(e.phase, "between_hands");
  let richest = 0;
  for (let i = 1; i < 4; i++) {
    if (e.seats[i].stack > e.seats[richest].stack) richest = i;
  }
  const pkRich = e.seats[richest].participantKey;
  assert.ok(!apply(er, pr, { op: "sit_out", participantKey: pkRich, payload: {}, now: t++ }).error);
  e = er.e;
  assert.equal(e.seats[richest].sitOut, true);
  while (e.phase !== "preflop" && t < 700_000) {
    if (e.phase === "between_hands" && typeof e.phaseEndsAt === "number") {
      t = Math.max(t, e.phaseEndsAt + 1);
    }
    apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
    e = er.e;
  }
  assert.equal(e.phase, "preflop");
  assert.equal(validateCcEngineInvariants(e), null);
});

function tickToPreflop(er, pr, tRef) {
  let e = er.e;
  let t = tRef.v;
  while (e.phase !== "preflop" && t < tRef.limit) {
    if (e.phase === "between_hands" && typeof e.phaseEndsAt === "number") {
      t = Math.max(t, e.phaseEndsAt + 1);
    }
    const r = apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: t++ });
    assert.ok(!r.error, r.error || "");
    e = er.e;
  }
  tRef.v = t;
  return e;
}

test("five-handed: two consecutive hands reach preflop with clean invariants", () => {
  const er = { e: buildFreshEngine(cfg9) };
  const pr = { p: normalizePrivatePayload({}) };
  const tRef = { v: 710_000, limit: 780_000 };
  for (let i = 0; i < 5; i++) {
    assert.ok(
      !apply(er, pr, {
        op: "sit",
        participantKey: `p${i}`,
        payload: { seatIndex: i, buyIn: 500, displayName: `P${i}` },
        now: tRef.v++,
      }).error,
    );
  }
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: tRef.v++ });
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: tRef.v++ });
  let e = er.e;
  assert.equal(e.phase, "preflop");
  const h0 = e.handSeq;
  let guard = 0;
  while (e.phase === "preflop" && e.actionSeat != null && guard++ < 40) {
    const pk = e.seats[e.actionSeat].participantKey;
    assert.ok(!apply(er, pr, { op: "fold", participantKey: pk, payload: {}, now: tRef.v++ }).error);
    e = er.e;
  }
  while (e.phase === "showdown" && tRef.v < tRef.limit) {
    apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: tRef.v });
    tRef.v += 800;
    e = er.e;
  }
  assert.equal(e.phase, "between_hands");
  e = tickToPreflop(er, pr, tRef);
  assert.equal(e.phase, "preflop");
  assert.ok(e.handSeq > h0);
  const dealt = Object.keys(pr.p.holes || {}).length;
  assert.equal(dealt, 5);
  assert.equal(validateCcEngineInvariants(e), null);
  const h1 = e.handSeq;
  guard = 0;
  while (e.phase === "preflop" && e.actionSeat != null && guard++ < 40) {
    const pk = e.seats[e.actionSeat].participantKey;
    assert.ok(!apply(er, pr, { op: "fold", participantKey: pk, payload: {}, now: tRef.v++ }).error);
    e = er.e;
  }
  while (e.phase === "showdown" && tRef.v < tRef.limit) {
    apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: tRef.v });
    tRef.v += 800;
    e = er.e;
  }
  assert.equal(e.phase, "between_hands");
  e = tickToPreflop(er, pr, tRef);
  assert.equal(e.phase, "preflop");
  assert.ok(e.handSeq > h1);
  assert.equal(Object.keys(pr.p.holes || {}).length, 5);
  assert.equal(validateCcEngineInvariants(e), null);
});

test("leave_seat between_hands then next hand: button advances among remaining seats", () => {
  const er = { e: buildFreshEngine(cfg9) };
  const pr = { p: normalizePrivatePayload({}) };
  const tRef = { v: 790_000, limit: 860_000 };
  for (let i = 0; i < 4; i++) {
    assert.ok(
      !apply(er, pr, {
        op: "sit",
        participantKey: `p${i}`,
        payload: { seatIndex: i, buyIn: 500, displayName: `P${i}` },
        now: tRef.v++,
      }).error,
    );
  }
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: tRef.v++ });
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: tRef.v++ });
  let e = er.e;
  let guard = 0;
  while (e.phase === "preflop" && e.actionSeat != null && guard++ < 30) {
    const pk = e.seats[e.actionSeat].participantKey;
    assert.ok(!apply(er, pr, { op: "fold", participantKey: pk, payload: {}, now: tRef.v++ }).error);
    e = er.e;
  }
  while (e.phase === "showdown" && tRef.v < tRef.limit) {
    apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: tRef.v });
    tRef.v += 800;
    e = er.e;
  }
  assert.equal(e.phase, "between_hands");
  const leaverPk = "p2";
  assert.ok(!apply(er, pr, { op: "leave_seat", participantKey: leaverPk, payload: {}, now: tRef.v++ }).error);
  e = er.e;
  assert.equal(e.seats[2].participantKey, null);
  e = tickToPreflop(er, pr, tRef);
  assert.equal(e.phase, "preflop");
  const occ = e.seats.map((s, i) => (s.participantKey ? i : -1)).filter(i => i >= 0);
  assert.equal(occ.length, 3);
  assert.ok(occ.includes(e.buttonSeat));
  assert.ok(occ.includes(e.sbSeat));
  assert.ok(occ.includes(e.bbSeat));
  assert.equal(new Set([e.sbSeat, e.bbSeat, e.buttonSeat]).size, 3);
  assert.equal(validateCcEngineInvariants(e), null);
});

test("sit_out between_hands then sit_in: waitBb then next hand deals without seated player", () => {
  const er = { e: buildFreshEngine(cfg9) };
  const pr = { p: normalizePrivatePayload({}) };
  const tRef = { v: 870_000, limit: 960_000 };
  for (let i = 0; i < 3; i++) {
    assert.ok(
      !apply(er, pr, {
        op: "sit",
        participantKey: `p${i}`,
        payload: { seatIndex: i, buyIn: 500, displayName: `P${i}` },
        now: tRef.v++,
      }).error,
    );
  }
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: tRef.v++ });
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: tRef.v++ });
  let e = er.e;
  let guard = 0;
  while (e.phase === "preflop" && e.actionSeat != null && guard++ < 30) {
    const pk = e.seats[e.actionSeat].participantKey;
    assert.ok(!apply(er, pr, { op: "fold", participantKey: pk, payload: {}, now: tRef.v++ }).error);
    e = er.e;
  }
  while (e.phase === "showdown" && tRef.v < tRef.limit) {
    apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: tRef.v });
    tRef.v += 800;
    e = er.e;
  }
  assert.equal(e.phase, "between_hands");
  assert.ok(!apply(er, pr, { op: "sit_out", participantKey: "p0", payload: {}, now: tRef.v++ }).error);
  e = er.e;
  assert.equal(e.seats[0].sitOut, true);
  e = tickToPreflop(er, pr, tRef);
  assert.equal(e.phase, "preflop");
  assert.equal(e.seats[0].inCurrentHand, false);
  assert.equal(e.seats[1].inCurrentHand, true);
  assert.equal(e.seats[2].inCurrentHand, true);
  assert.equal(Object.keys(pr.p.holes || {}).length, 2);
  guard = 0;
  while (e.phase === "preflop" && e.actionSeat != null && guard++ < 40) {
    const pk = e.seats[e.actionSeat].participantKey;
    assert.ok(!apply(er, pr, { op: "fold", participantKey: pk, payload: {}, now: tRef.v++ }).error);
    e = er.e;
  }
  while (e.phase === "showdown" && tRef.v < tRef.limit) {
    apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: tRef.v });
    tRef.v += 800;
    e = er.e;
  }
  assert.equal(e.phase, "between_hands");
  assert.ok(!apply(er, pr, { op: "sit_in", participantKey: "p0", payload: {}, now: tRef.v++ }).error);
  e = er.e;
  assert.equal(e.seats[0].sitOut, false);
  assert.equal(e.seats[0].waitBb, true);
  e = tickToPreflop(er, pr, tRef);
  assert.equal(e.phase, "preflop");
  assert.equal(e.seats[0].inCurrentHand, false);
  assert.equal(e.seats[1].inCurrentHand, true);
  assert.equal(e.seats[2].inCurrentHand, true);
  assert.equal(Object.keys(pr.p.holes || {}).length, 2);
  assert.equal(validateCcEngineInvariants(e), null);
});

test("computeSidePots: four distinct contribution tiers", () => {
  const e = buildFreshEngine(cfg9);
  e.pot = 135;
  for (const s of e.seats) {
    s.participantKey = null;
    s.inCurrentHand = false;
    s.folded = false;
    s.totalContrib = 0;
  }
  for (let i = 0; i < 4; i++) {
    e.seats[i].participantKey = `p${i}`;
    e.seats[i].inCurrentHand = true;
    e.seats[i].totalContrib = [10, 25, 40, 60][i];
  }
  const pots = computeSidePots(e);
  assert.ok(Array.isArray(pots));
  assert.equal(pots.length, 4);
  assert.equal(pots.reduce((a, p) => a + p.amount, 0), 135);
});

test("distributeSidePotsToWinners: chop first tier only second tier single winner", () => {
  const e = buildFreshEngine(cfg9);
  e.pot = 170;
  e.communityCards = ["Tc", "Ts", "Th", "2d", "3c"];
  e.street = "river";
  e.handSeq = 1;
  for (const s of e.seats) {
    s.participantKey = null;
    s.inCurrentHand = false;
    s.folded = false;
    s.totalContrib = 0;
  }
  e.seats[0].participantKey = "p0";
  e.seats[0].inCurrentHand = true;
  e.seats[0].folded = true;
  e.seats[0].totalContrib = 40;
  for (const i of [1, 2]) {
    e.seats[i].participantKey = `p${i}`;
    e.seats[i].inCurrentHand = true;
    e.seats[i].folded = false;
    e.seats[i].totalContrib = i === 1 ? 40 : 90;
  }
  const priv = normalizePrivatePayload({});
  priv.holes = {
    "0": ["2s", "3h"],
    "1": ["As", "4d"],
    "2": ["Ah", "4c"],
  };
  const d = distributeSidePotsToWinners(e, priv);
  assert.equal(d.error, null);
  assert.equal(d.stackAdds[1] + d.stackAdds[2], 170);
  assert.equal(d.stackAdds[1], 60);
  assert.equal(d.stackAdds[2], 110);
});

test("tick repairs illegal actionSeat pointing at all-in seat on flop", () => {
  const e = buildFreshEngine(cfg9);
  const priv = normalizePrivatePayload({});
  let t = 970_000;
  for (let i = 0; i < 4; i++) {
    e.seats[i].participantKey = `p${i}`;
    e.seats[i].displayName = `P${i}`;
    e.seats[i].stack = 400;
    e.seats[i].sitOut = false;
    e.seats[i].waitBb = false;
  }
  e.buttonSeat = 3;
  e.sbSeat = 0;
  e.bbSeat = 1;
  e.phase = "preflop";
  e.street = "flop";
  e.currentBet = 20;
  e.minRaise = 10;
  e.pot = 80;
  e.communityCards = ["2c", "3d", "4h"];
  e.handSeq = 2;
  e.actionSeat = 0;
  e.actionDeadline = t + 60_000;
  e.seats[0].inCurrentHand = true;
  e.seats[0].folded = false;
  e.seats[0].allIn = true;
  e.seats[0].streetContrib = 20;
  e.seats[0].actedThisStreet = true;
  e.seats[1].inCurrentHand = true;
  e.seats[1].folded = false;
  e.seats[1].allIn = false;
  e.seats[1].streetContrib = 20;
  e.seats[1].actedThisStreet = true;
  e.seats[2].inCurrentHand = true;
  e.seats[2].folded = false;
  e.seats[2].allIn = false;
  e.seats[2].streetContrib = 20;
  e.seats[2].actedThisStreet = false;
  e.seats[3].inCurrentHand = true;
  e.seats[3].folded = false;
  e.seats[3].allIn = false;
  e.seats[3].streetContrib = 5;
  e.seats[3].actedThisStreet = false;
  const r = mutateEngine(e, priv, { op: "tick", participantKey: "", payload: {}, now: t, config: cfg9 });
  assert.equal(r.error, null);
  const e2 = r.engine;
  assert.notEqual(e2.actionSeat, 0);
  assert.equal(e2.actionSeat, 2);
  assert.equal(validateCcEngineInvariants(e2), null);
});

test("next hand with mixed sitOut waitBb and stacks: two playable still starts", () => {
  const e = buildFreshEngine(cfg9);
  const priv = normalizePrivatePayload({});
  let t = 980_000;
  for (let i = 0; i < 5; i++) {
    e.seats[i].participantKey = `p${i}`;
    e.seats[i].displayName = `P${i}`;
    e.seats[i].stack = i === 4 ? 0 : 200;
    e.seats[i].sitOut = i === 1;
    e.seats[i].waitBb = i === 2;
    e.seats[i].inCurrentHand = false;
    e.seats[i].folded = false;
    e.seats[i].allIn = false;
    e.seats[i].streetContrib = 0;
    e.seats[i].totalContrib = 0;
    e.seats[i].actedThisStreet = false;
    e.seats[i].voluntaryActedThisHand = true;
    e.seats[i].hadActionOpportunityThisHand = true;
  }
  e.completedHands = 3;
  e.buttonSeat = 0;
  e.phase = "between_hands";
  e.phaseEndsAt = t;
  e.pot = 0;
  e.actionSeat = null;
  e.handSeq = 10;
  const r = mutateEngine(e, priv, { op: "tick", participantKey: "", payload: {}, now: t + 1, config: cfg9 });
  assert.equal(r.error, null);
  const e2 = r.engine;
  assert.equal(e2.phase, "preflop");
  assert.equal(e2.seats[1].inCurrentHand, false);
  assert.equal(e2.seats[4].inCurrentHand, false);
  assert.equal(e2.seats[2].inCurrentHand, false);
  assert.equal(e2.seats[2].waitBb, true);
  assert.equal(e2.seats[0].inCurrentHand, true);
  assert.equal(e2.seats[3].inCurrentHand, true);
  assert.equal(validateCcEngineInvariants(e2), null);
});

test("continued play after three-tier side settlement: third hand starts", () => {
  const er = { e: buildFreshEngine(cfg9) };
  const pr = { p: normalizePrivatePayload({}) };
  const tRef = { v: 990_000, limit: 1_200_000 };
  for (let i = 0; i < 3; i++) {
    assert.ok(
      !apply(er, pr, {
        op: "sit",
        participantKey: `p${i}`,
        payload: { seatIndex: i, buyIn: 500, displayName: `P${i}` },
        now: tRef.v++,
      }).error,
    );
  }
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: tRef.v++ });
  apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: tRef.v++ });
  let e = er.e;
  let guard = 0;
  while (e.phase === "preflop" && e.actionSeat != null && guard++ < 20) {
    const pk = e.seats[e.actionSeat].participantKey;
    assert.ok(!apply(er, pr, { op: "all_in", participantKey: pk, payload: {}, now: tRef.v++ }).error);
    e = er.e;
  }
  while (e.phase === "showdown" && tRef.v < tRef.limit) {
    apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: tRef.v });
    tRef.v += 800;
    e = er.e;
  }
  assert.equal(e.phase, "between_hands");
  for (let i = 0; i < 3; i++) {
    const s = e.seats[i];
    if (s.participantKey && Math.floor(Number(s.stack) || 0) <= 0) {
      assert.ok(
        !apply(er, pr, {
          op: "top_up",
          participantKey: s.participantKey,
          payload: { amount: 450 },
          now: tRef.v++,
        }).error,
      );
    }
  }
  e = er.e;
  e = tickToPreflop(er, pr, tRef);
  assert.equal(e.phase, "preflop");
  const midSeq = e.handSeq;
  guard = 0;
  while (e.phase === "preflop" && e.actionSeat != null && guard++ < 20) {
    const pk = e.seats[e.actionSeat].participantKey;
    assert.ok(!apply(er, pr, { op: "fold", participantKey: pk, payload: {}, now: tRef.v++ }).error);
    e = er.e;
  }
  while (e.phase === "showdown" && tRef.v < tRef.limit) {
    apply(er, pr, { op: "tick", participantKey: "", payload: {}, now: tRef.v });
    tRef.v += 800;
    e = er.e;
  }
  assert.equal(e.phase, "between_hands");
  e = tickToPreflop(er, pr, tRef);
  assert.equal(e.phase, "preflop");
  assert.ok(e.handSeq > midSeq);
  assert.equal(validateCcEngineInvariants(e), null);
});
