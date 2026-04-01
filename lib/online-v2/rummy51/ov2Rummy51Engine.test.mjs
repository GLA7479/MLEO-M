import assert from "node:assert/strict";
import test from "node:test";
import {
  RUMMY51_ELIMINATION_SCORE,
  RUMMY51_HAND_SIZE,
  RUMMY51_JOKER_HAND_PENALTY,
  RUMMY51_NEVER_OPENED_FULL_HAND_PENALTY,
  RUMMY51_OPEN_TARGET,
  applyCardToMeld,
  buildRummy51Deck,
  classifyMeld,
  computeEliminations,
  computeHandPenalty,
  computeRoundScoreDelta,
  deserializeCard,
  getCardPointValue,
  getRemainingActiveParticipants,
  isLegalInitialOpen,
  isLegalRun,
  isLegalSet,
  openingContainsRequiredRun,
  scoreOpeningMelds,
  serializeCard,
  shuffleRummy51Deck,
  validateCloseAction,
  validateDiscardAction,
  validateFullTurnSubmission,
} from "./ov2Rummy51Engine.js";

function pick(deck, d, suit, rank) {
  const c = deck.find(x => !x.isJoker && x.deckIndex === d && x.suit === suit && x.rank === rank);
  assert.ok(c, `missing ${d} ${suit} ${rank}`);
  return c;
}

test("joker may extend ace-high run (Q-K-A + joker as J)", () => {
  const deck = buildRummy51Deck();
  const q = pick(deck, 0, "S", 12);
  const k = pick(deck, 0, "S", 13);
  const ace = pick(deck, 0, "S", 1);
  const joker = deck.find(c => c.isJoker);
  assert.ok(joker);
  const base = [q, k, ace];
  assert.equal(classifyMeld(base), "run");
  const extended = [...base, joker];
  assert.equal(classifyMeld(extended), "run");
  assert.ok(applyCardToMeld(joker, base));
});

test("joker may extend closed run as high rank (5-6-7-8 + joker as 9)", () => {
  const deck = buildRummy51Deck();
  const run = [5, 6, 7, 8].map(r => pick(deck, 0, "H", r));
  const joker = deck.find(c => c.isJoker);
  assert.ok(joker);
  assert.equal(classifyMeld(run), "run");
  assert.equal(classifyMeld([...run, joker]), "run");
  assert.ok(applyCardToMeld(joker, run));
});

test("buildRummy51Deck: size 106 and exactly 2 jokers", () => {
  const d = buildRummy51Deck();
  assert.equal(d.length, 106);
  assert.equal(d.filter(c => c.isJoker).length, 2);
  assert.equal(d.filter(c => !c.isJoker).length, 104);
});

test("shuffleRummy51Deck is deterministic by seed", () => {
  const a = shuffleRummy51Deck("seed-x");
  const b = shuffleRummy51Deck("seed-x");
  assert.deepEqual(
    a.map(c => c.id),
    b.map(c => c.id),
  );
  const c = shuffleRummy51Deck("seed-y");
  assert.notDeepEqual(
    a.map(x => x.id),
    c.map(x => x.id),
  );
});

test("serializeCard / deserializeCard round-trip", () => {
  const deck = buildRummy51Deck();
  for (const c of deck) {
    const b = deserializeCard(serializeCard(c));
    assert.equal(b.id, c.id);
    assert.equal(b.rank, c.rank);
    assert.equal(b.suit, c.suit);
    assert.equal(b.isJoker, c.isJoker);
    assert.equal(b.deckIndex, c.deckIndex);
  }
});

test("legal set: same rank, distinct suits", () => {
  const deck = buildRummy51Deck();
  const m = [pick(deck, 0, "S", 9), pick(deck, 0, "H", 9), pick(deck, 0, "D", 9)];
  assert.equal(classifyMeld(m), "set");
  assert.equal(isLegalSet(m), true);
});

test("illegal set: duplicate suit same rank (two decks)", () => {
  const deck = buildRummy51Deck();
  const m = [pick(deck, 0, "C", 5), pick(deck, 1, "C", 5), pick(deck, 0, "H", 5)];
  assert.equal(isLegalSet(m), false);
  assert.equal(classifyMeld(m), "invalid");
});

test("legal ace-low run A-2-3", () => {
  const deck = buildRummy51Deck();
  const m = [pick(deck, 0, "S", 1), pick(deck, 0, "S", 2), pick(deck, 0, "S", 3)];
  assert.equal(isLegalRun(m), true);
  assert.equal(classifyMeld(m), "run");
});

test("legal ace-high run Q-K-A", () => {
  const deck = buildRummy51Deck();
  const m = [pick(deck, 0, "H", 12), pick(deck, 0, "H", 13), pick(deck, 0, "H", 1)];
  assert.equal(isLegalRun(m), true);
});

test("illegal wraparound K-A-2", () => {
  const deck = buildRummy51Deck();
  const m = [pick(deck, 0, "D", 13), pick(deck, 0, "D", 1), pick(deck, 0, "D", 2)];
  assert.equal(isLegalRun(m), false);
  assert.equal(classifyMeld(m), "invalid");
});

test("opening below 51 rejected (even with runs)", () => {
  const deck = buildRummy51Deck();
  const r1 = [pick(deck, 0, "S", 2), pick(deck, 0, "S", 3), pick(deck, 0, "S", 4)];
  const r2 = [pick(deck, 0, "H", 5), pick(deck, 0, "H", 6), pick(deck, 0, "H", 7)];
  const melds = [r1, r2];
  assert.equal(openingContainsRequiredRun(melds), true);
  assert.ok(scoreOpeningMelds(melds) < RUMMY51_OPEN_TARGET);
  assert.equal(isLegalInitialOpen(melds), false);
});

test("opening without any run rejected (sets only)", () => {
  const deck = buildRummy51Deck();
  const setK = [pick(deck, 0, "S", 13), pick(deck, 0, "H", 13), pick(deck, 0, "D", 13)];
  const setQ = [pick(deck, 0, "S", 12), pick(deck, 0, "H", 12), pick(deck, 0, "D", 12)];
  const setJ = [pick(deck, 0, "S", 11), pick(deck, 0, "H", 11), pick(deck, 0, "D", 11)];
  const melds = [setK, setQ, setJ];
  assert.equal(openingContainsRequiredRun(melds), false);
  assert.ok(scoreOpeningMelds(melds) >= RUMMY51_OPEN_TARGET);
  assert.equal(isLegalInitialOpen(melds), false);
});

test("opening >= 51 with at least one run", () => {
  const deck = buildRummy51Deck();
  const run1 = [pick(deck, 0, "S", 1), pick(deck, 0, "S", 2), pick(deck, 0, "S", 3)];
  const run2 = [pick(deck, 0, "H", 9), pick(deck, 0, "H", 10), pick(deck, 0, "H", 11)];
  const set1 = [pick(deck, 0, "D", 12), pick(deck, 0, "C", 12), pick(deck, 1, "H", 12)];
  const melds = [run1, run2, set1];
  assert.equal(openingContainsRequiredRun(melds), true);
  const pts = scoreOpeningMelds(melds);
  assert.ok(pts >= RUMMY51_OPEN_TARGET, `points ${pts}`);
  assert.equal(isLegalInitialOpen(melds), true);
});

test("discard taken before open must be used in a table action", () => {
  const deck = buildRummy51Deck();
  const picked = pick(deck, 0, "C", 8);
  /** Opening melds ≥51 with a run; picked 8♣ is NOT among them (8♠ comes from second deck). */
  const runSpades = [
    pick(deck, 0, "S", 5),
    pick(deck, 0, "S", 6),
    pick(deck, 0, "S", 7),
    pick(deck, 1, "S", 8),
    pick(deck, 0, "S", 9),
  ];
  const runHearts = [pick(deck, 0, "H", 10), pick(deck, 0, "H", 11), pick(deck, 0, "H", 12), pick(deck, 0, "H", 13)];
  assert.ok(scoreOpeningMelds([runSpades, runHearts]) >= RUMMY51_OPEN_TARGET);
  const usedBad = new Set([...runSpades, ...runHearts, picked].map(c => c.id));
  const fillerBad = deck
    .filter(c => !c.isJoker && !usedBad.has(c.id))
    .slice(0, RUMMY51_HAND_SIZE + 1 - runSpades.length - runHearts.length - 1);
  const handBeforeBad = sortIds([...runSpades, ...runHearts, picked, ...fillerBad]);
  assert.equal(handBeforeBad.length, RUMMY51_HAND_SIZE + 1);

  const discardBad = fillerBad[0];
  const playedBad = [...runSpades, ...runHearts];
  const afterMeldsBad = handBeforeBad.filter(c => !playedBad.some(p => p.id === c.id));

  const bad = validateFullTurnSubmission({
    turn: { hasDrawn: false, hasDiscarded: false, hasOpenedBefore: false },
    draw: { source: "discard", pickedCardId: picked.id },
    initialOpen: { newMeldsFromHand: [runSpades, runHearts], hadOpenedBefore: false },
    tableAdds: [],
    newMeldsAfterOpen: [],
    discard: { card: discardBad },
    handBeforeTurn: handBeforeBad,
    handAfterMeldsBeforeDiscard: afterMeldsBad,
    stockEmpty: false,
    discardEmpty: false,
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.code, "PICKED_DISCARD_UNUSED");

  /** Opening includes picked in a club run + a spade run for points. */
  const runClubs = [pick(deck, 0, "C", 6), pick(deck, 0, "C", 7), picked, pick(deck, 0, "C", 9), pick(deck, 0, "C", 10)];
  const runSpadesHigh = [pick(deck, 0, "S", 10), pick(deck, 0, "S", 11), pick(deck, 0, "S", 12), pick(deck, 0, "S", 13)];
  const meldsGood = [runClubs, runSpadesHigh];
  assert.ok(scoreOpeningMelds(meldsGood) >= RUMMY51_OPEN_TARGET);
  assert.equal(openingContainsRequiredRun(meldsGood), true);

  const usedGood = new Set(meldsGood.flatMap(m => m.map(c => c.id)));
  const fillerGood = deck
    .filter(c => !c.isJoker && !usedGood.has(c.id))
    .slice(0, RUMMY51_HAND_SIZE + 1 - usedGood.size);
  const handBeforeGood = sortIds([...meldsGood.flat(), ...fillerGood]);
  assert.equal(handBeforeGood.length, RUMMY51_HAND_SIZE + 1);

  const playedGood = meldsGood.flat();
  const discardGood = fillerGood[0];
  const afterMeldsGood = handBeforeGood.filter(c => !playedGood.some(p => p.id === c.id));

  const good = validateFullTurnSubmission({
    turn: { hasDrawn: false, hasDiscarded: false, hasOpenedBefore: false },
    draw: { source: "discard", pickedCardId: picked.id },
    initialOpen: { newMeldsFromHand: meldsGood, hadOpenedBefore: false },
    tableAdds: [],
    newMeldsAfterOpen: [],
    discard: { card: discardGood },
    handBeforeTurn: handBeforeGood,
    handAfterMeldsBeforeDiscard: afterMeldsGood,
    stockEmpty: false,
    discardEmpty: false,
  });
  assert.equal(good.ok, true);
});

function sortIds(cards) {
  const s = new Set(cards.map(c => c.id));
  assert.equal(s.size, cards.length, "duplicate card in hand build");
  return cards;
}

test("hand penalty: joker in hand after having opened", () => {
  const deck = buildRummy51Deck();
  const j = deck.find(c => c.isJoker);
  assert.equal(getCardPointValue(j), RUMMY51_JOKER_HAND_PENALTY);
  assert.equal(computeHandPenalty([j], { hasEverOpened: true }), RUMMY51_JOKER_HAND_PENALTY);
});

test("never-opened flat hand penalty = 100", () => {
  const deck = buildRummy51Deck();
  const hand = deck.filter(c => !c.isJoker).slice(0, 10);
  assert.equal(computeHandPenalty(hand, { hasEverOpened: false }), RUMMY51_NEVER_OPENED_FULL_HAND_PENALTY);
});

test("elimination at 251+ and remaining participants", () => {
  const board = { a: 250, b: 251, c: 0 };
  assert.deepEqual(computeEliminations(board).sort(), ["b"]);
  assert.deepEqual(getRemainingActiveParticipants(board).sort(), ["a", "c"]);

  const board2 = { x: 251, y: 251 };
  assert.deepEqual(computeEliminations(board2).sort(), ["x", "y"]);
  assert.deepEqual(getRemainingActiveParticipants(board2), []);
});

test("computeRoundScoreDelta: winner 0, losers penalties", () => {
  const deck = buildRummy51Deck();
  const j = deck.find(c => c.isJoker);
  const delta = computeRoundScoreDelta({
    winnerParticipantKey: "w",
    players: [
      { participantKey: "w", cards: [], hasEverOpened: true },
      { participantKey: "l1", cards: [j], hasEverOpened: true },
      { participantKey: "l2", cards: [pick(deck, 0, "S", 5)], hasEverOpened: false },
    ],
  });
  assert.equal(delta.w, 0);
  assert.equal(delta.l1, RUMMY51_JOKER_HAND_PENALTY);
  assert.equal(delta.l2, RUMMY51_NEVER_OPENED_FULL_HAND_PENALTY);
});

test("discard required after draw (card must remain in hand until discard)", () => {
  const deck = buildRummy51Deck();
  const d = pick(deck, 0, "C", 4);
  const other = pick(deck, 0, "C", 5);
  const afterMelds = [other];
  const res = validateDiscardAction({
    discardCard: d,
    handAfterMelds: afterMelds,
    turn: { hasDrawn: true, hasDiscarded: false, hasOpenedBefore: true },
  });
  assert.equal(res.ok, false);
  assert.equal(res.code, "DISCARD_NOT_IN_HAND");
});

test("closing requires exactly one card in hand before final discard", () => {
  const deck = buildRummy51Deck();
  const a = pick(deck, 0, "S", 1);
  const b = pick(deck, 0, "S", 2);
  assert.equal(validateCloseAction({ discardCard: a, handBeforeDiscard: [a] }).ok, true);
  assert.equal(validateCloseAction({ discardCard: a, handBeforeDiscard: [a, b] }).ok, false);
});

test("constants exported", () => {
  assert.equal(RUMMY51_HAND_SIZE, 14);
  assert.equal(RUMMY51_ELIMINATION_SCORE, 251);
});
