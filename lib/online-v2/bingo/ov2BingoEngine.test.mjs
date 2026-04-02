import assert from "node:assert/strict";
import test from "node:test";
import {
  BINGO_FREE_VALUE,
  BINGO_MAX,
  BINGO_MIN,
  BINGO_PRIZE_KEYS,
  BINGO_SIZE,
  buildDeck,
  canClaimPrize,
  computeFullPrizeAmount,
  computeRowPrizeAmount,
  generateCard,
  getAvailablePrizeKeys,
  getCardForSeat,
  getCardSeed,
  getSatisfiedMask,
  getWonRowKeys,
  isFullWonByCalls,
  isNumberCalled,
  isRowWonByCalls,
  normalizeCalledNumbers,
  resolveCallerSeat,
} from "./ov2BingoEngine.js";

test("constants and prize keys", () => {
  assert.equal(BINGO_MIN, 1);
  assert.equal(BINGO_MAX, 75);
  assert.equal(BINGO_SIZE, 5);
  assert.equal(BINGO_FREE_VALUE, 0);
  assert.deepEqual([...BINGO_PRIZE_KEYS], ["row1", "row2", "row3", "row4", "row5", "full"]);
});

test("getCardSeed encodes seat; getCardForSeat is deterministic", () => {
  assert.equal(getCardSeed({ seed: "s", roundId: "r", seatIndex: 0 }), "s::r::0");
  const a = getCardForSeat({ seed: "s", roundId: "r", seatIndex: 0 });
  const b = getCardForSeat({ seed: "s", roundId: "r", seatIndex: 0 });
  assert.deepEqual(a, b);
  assert.equal(a[2][2], BINGO_FREE_VALUE);
  assert.throws(() => getCardSeed({ seed: "s", roundId: "r", seatIndex: 8 }), RangeError);
});

test("generateCard uses column bands and FREE center", () => {
  const card = generateCard("unit-seed-1");
  const ranges = [
    [1, 15],
    [16, 30],
    [31, 45],
    [46, 60],
    [61, 75],
  ];
  for (let c = 0; c < 5; c++) {
    const [lo, hi] = ranges[c];
    for (let r = 0; r < 5; r++) {
      if (r === 2 && c === 2) continue;
      const v = card[r][c];
      assert.ok(v >= lo && v <= hi, `col ${c} row ${r} value ${v}`);
    }
  }
});

test("buildDeck is a permutation of 1..75", () => {
  const d1 = buildDeck("seed-a");
  const d2 = buildDeck("seed-a");
  assert.equal(d1.length, 75);
  assert.deepEqual(d1, d2);
  const sorted = [...d1].sort((a, b) => a - b);
  for (let i = 0; i < 75; i++) assert.equal(sorted[i], i + 1);
});

test("normalizeCalledNumbers dedupes preserving order", () => {
  assert.deepEqual(normalizeCalledNumbers([5, 12, 5, 80, 0]), [5, 12]);
  assert.deepEqual(normalizeCalledNumbers(null), []);
});

test("row / full win by calls", () => {
  const card = [
    [1, 16, 31, 46, 61],
    [2, 17, 32, 47, 62],
    [3, 18, BINGO_FREE_VALUE, 48, 63],
    [4, 19, 34, 49, 64],
    [5, 20, 35, 50, 65],
  ];
  const called = [1, 16, 31, 46, 61];
  assert.ok(isRowWonByCalls(card, called, 0));
  assert.ok(!isFullWonByCalls(card, called));
  const mask = getSatisfiedMask(card, called);
  assert.equal(mask.length, 25);
  assert.ok(mask[0]);
  const all = [];
  for (let n = BINGO_MIN; n <= BINGO_MAX; n++) all.push(n);
  assert.ok(isFullWonByCalls(card, all));
  assert.deepEqual(getWonRowKeys(card, called), ["row1"]);
});

test("canClaimPrize and getAvailablePrizeKeys respect existing claims", () => {
  const card = [
    [1, 16, 31, 46, 61],
    [2, 17, 32, 47, 62],
    [3, 18, BINGO_FREE_VALUE, 48, 63],
    [4, 19, 34, 49, 64],
    [5, 20, 35, 50, 65],
  ];
  const called = [1, 16, 31, 46, 61];
  assert.ok(canClaimPrize({ prizeKey: "row1", card, called, existingClaims: [] }));
  assert.ok(
    !canClaimPrize({
      prizeKey: "row1",
      card,
      called,
      existingClaims: [{ prize_key: "row1", amount: 10 }],
    })
  );
  const avail = getAvailablePrizeKeys({ card, called, existingClaims: [{ prize_key: "row1", amount: 10 }] });
  assert.ok(!avail.includes("row1"));
});

test("prize amounts: row 15%, full 25% of original pot", () => {
  assert.equal(computeRowPrizeAmount(100), 15);
  assert.equal(computeFullPrizeAmount({ potTotal: 100 }), 25);
  assert.equal(computeFullPrizeAmount({ potTotal: 100, existingClaims: [{ prize_key: "row1", amount: 99 }] }), 25);
});

test("resolveCallerSeat picks minimum", () => {
  assert.equal(resolveCallerSeat([3, 1, 7]), 1);
  assert.equal(resolveCallerSeat([]), null);
});

test("isNumberCalled", () => {
  assert.ok(isNumberCalled([5, 7], 5));
  assert.ok(!isNumberCalled([5, 7], 99));
});
