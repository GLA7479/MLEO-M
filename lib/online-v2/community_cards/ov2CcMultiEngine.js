/**
 * OV2 Community Cards — persistent live table engine (server-only).
 * Public `engine` has no hole cards or deck; secrets live in `privatePayload` (DB sibling row).
 */

import { randomInt } from "crypto";
import { bestHandScoreFrom7 } from "./ov2CcPokerEval.js";

export const OV2_CC_ACTION_MS = 15_000;
export const OV2_CC_BETWEEN_HANDS_MS = 4_000;
export const OV2_CC_SHOWDOWN_STEP_MS = 650;

function clone(x) {
  return JSON.parse(JSON.stringify(x));
}

/** @param {import("./ov2CcTableIds").resolveOv2CcTableConfigFromRoomRow extends Function ? any : any} config */
function emptySeat(i, config) {
  const n = Math.max(5, Math.min(9, Math.floor(config?.maxSeats || 9)));
  return {
    seatIndex: i,
    participantKey: null,
    displayName: null,
    stack: 0,
    waitBb: false,
    sitOut: false,
    consecutiveTimeoutHands: 0,
    sitOutHands: 0,
    pendingLeaveAfterHand: false,
    pendingSitOutAfterHand: false,
    inCurrentHand: false,
    folded: false,
    allIn: false,
    streetContrib: 0,
    totalContrib: 0,
    actedThisStreet: false,
    voluntaryActedThisHand: false,
    consecutiveAutoOnlyHands: 0,
    /** True once this seat becomes the action seat during the current hand (avoids BB auto-win counting as a "miss"). */
    hadActionOpportunityThisHand: false,
  };
}

export function buildFreshEngine(config) {
  const n = Math.max(5, Math.min(9, Math.floor(config?.maxSeats || 9)));
  return {
    v: 1,
    completedHands: 0,
    handSeq: 0,
    phase: "idle",
    phaseEndsAt: null,
    actionDeadline: null,
    buttonSeat: 0,
    sbSeat: null,
    bbSeat: null,
    communityCards: [],
    pot: 0,
    sidePots: [],
    street: null,
    currentBet: 0,
    minRaise: 0,
    lastAggressorSeat: null,
    actionSeat: null,
    actingOrder: [],
    actionCursor: 0,
    winnersDisplay: null,
    showdownRevealIdx: 0,
    lastShowdownAdvanceAt: 0,
    tableNotice: null,
    tablePrice: config.tablePrice,
    maxSeats: n,
    sb: config.sb,
    bb: config.bb,
    maxBuyin: config.maxBuyin,
    seats: Array.from({ length: n }, (_, i) => emptySeat(i, config)),
  };
}

export function normalizeEngine(raw, config) {
  const fresh = buildFreshEngine(config);
  if (!raw || typeof raw !== "object" || Object.keys(raw).length === 0) {
    return fresh;
  }
  const e = clone(raw);
  const n = fresh.maxSeats;
  e.v = 1;
  e.tablePrice = config.tablePrice;
  e.maxSeats = n;
  e.sb = config.sb;
  e.bb = config.bb;
  e.maxBuyin = config.maxBuyin;
  if (!Array.isArray(e.seats) || e.seats.length !== n) {
    e.seats = fresh.seats;
  } else {
    e.seats = e.seats.map((s, i) => ({
      ...emptySeat(i, config),
      ...s,
      seatIndex: i,
    }));
  }
  if (!Array.isArray(e.communityCards)) e.communityCards = [];
  if (!Array.isArray(e.sidePots)) e.sidePots = [];
  if (!Array.isArray(e.actingOrder)) e.actingOrder = [];
  if (e.tableNotice === undefined) e.tableNotice = null;
  return e;
}

export function normalizePrivatePayload(raw) {
  const base = { handSeq: 0, holes: {}, deck: [], revealed: {} };
  if (!raw || typeof raw !== "object") return base;
  return {
    handSeq: Math.max(0, Math.floor(Number(raw.handSeq) || 0)),
    holes: raw.holes && typeof raw.holes === "object" ? { ...raw.holes } : {},
    deck: Array.isArray(raw.deck) ? [...raw.deck] : [],
    revealed: raw.revealed && typeof raw.revealed === "object" ? { ...raw.revealed } : {},
  };
}

function buildShuffledDeck() {
  const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
  const suits = ["c", "d", "h", "s"];
  const d = [];
  for (const r of ranks) for (const s of suits) d.push(`${r}${s}`);
  const a = [...d];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

function occupiedSeatIndexes(engine) {
  return engine.seats.map((s, i) => (s.participantKey ? i : -1)).filter(i => i >= 0);
}

function nextOccupiedFrom(engine, fromIdx) {
  const occ = occupiedSeatIndexes(engine).sort((a, b) => a - b);
  if (!occ.length) return null;
  for (const i of occ) {
    if (i > fromIdx) return i;
  }
  return occ[0];
}

function seatByPk(engine, pk) {
  const t = String(pk || "").trim();
  return engine.seats.find(s => s.participantKey === t) || null;
}

function resetStreet(engine) {
  for (const s of engine.seats) {
    s.streetContrib = 0;
    s.actedThisStreet = false;
  }
  engine.currentBet = 0;
  engine.minRaise = engine.bb;
  engine.lastAggressorSeat = null;
}

function activeInHand(engine) {
  return engine.seats.filter(s => s.inCurrentHand && !s.folded);
}

/** True during live betting streets (engine keeps `phase: "preflop"` until showdown). */
function isHandBettingActive(engine) {
  return engine.phase === "preflop" && Math.floor(Number(engine.handSeq) || 0) > 0;
}

/** All non-folded players still in the pot are all-in — run out remaining board streets without action. */
function shouldAutoRunout(engine) {
  const live = activeInHand(engine).filter(s => !s.folded);
  if (live.length <= 1) return false;
  return live.every(s => s.allIn);
}

function autoRunoutAllInWhilePossible(engine, privatePayload, now) {
  const t = Math.max(0, Number(now) || Date.now());
  let guard = 0;
  while (guard++ < 8 && engine.phase === "preflop" && shouldAutoRunout(engine)) {
    if (engine.street === "river") {
      advanceStreet(engine, privatePayload, t);
      break;
    }
    advanceStreet(engine, privatePayload, t);
  }
}

function everyoneMatchedOrFolded(engine) {
  const live = activeInHand(engine);
  if (live.length <= 1) return true;
  if (live.every(s => s.allIn)) return true;
  const target = Math.max(...live.map(s => s.streetContrib));
  if (target === 0) {
    return live.every(s => s.allIn || s.actedThisStreet);
  }
  for (const s of live) {
    if (s.allIn) continue;
    if (s.streetContrib < target) return false;
    if (!s.actedThisStreet && target > 0) return false;
  }
  return true;
}

function firstPreflopActor(engine) {
  const liveIdx = activeInHand(engine)
    .filter(s => !s.folded)
    .map(s => s.seatIndex);
  if (liveIdx.length < 2) return null;
  const order = circularOccupiedOrder(engine, liveIdx);
  if (!order.length) return null;
  const bi = order.indexOf(engine.bbSeat);
  if (bi < 0) return order[0];
  return order[(bi + 1) % order.length];
}

function advanceActionSeat(engine) {
  const liveIdx = activeInHand(engine)
    .filter(s => !s.allIn && !s.folded)
    .map(s => s.seatIndex);
  if (!liveIdx.length) {
    engine.actionSeat = null;
    return;
  }
  const order = circularOccupiedOrder(engine, liveIdx);
  if (!order.length) {
    engine.actionSeat = null;
    return;
  }
  const cur = engine.actionSeat;
  if (cur == null) {
    engine.actionSeat = order[0];
    if (engine.seats[order[0]]) engine.seats[order[0]].hadActionOpportunityThisHand = true;
    return;
  }
  const pos = order.indexOf(cur);
  const start = pos < 0 ? 0 : pos;
  for (let step = 1; step <= order.length; step++) {
    const nxt = order[(start + step) % order.length];
    const s = engine.seats[nxt];
    if (!s.allIn && s.streetContrib < engine.currentBet) {
      engine.actionSeat = nxt;
      engine.seats[nxt].hadActionOpportunityThisHand = true;
      return;
    }
    if (!s.allIn && !s.actedThisStreet) {
      engine.actionSeat = nxt;
      engine.seats[nxt].hadActionOpportunityThisHand = true;
      return;
    }
  }
  engine.actionSeat = null;
}

/** Circular order of `seatIndexes` starting at first occupied seat strictly after the button. */
function circularOccupiedOrder(engine, seatIndexes) {
  const max = engine.maxSeats;
  const sorted = [...seatIndexes].sort((a, b) => a - b);
  const out = [];
  for (let step = 1; step <= max * 2 && out.length < sorted.length; step++) {
    const idx = (engine.buttonSeat + step) % max;
    if (sorted.includes(idx)) out.push(idx);
  }
  return out;
}

function hypotheticalBigBlindSeat(engine, baseOccupied) {
  const ord = circularOccupiedOrder(engine, baseOccupied);
  if (ord.length < 2) return null;
  if (ord.length === 2 && ord.includes(engine.buttonSeat)) {
    return ord.find(x => x !== engine.buttonSeat) ?? null;
  }
  return ord[1];
}

function blindPositionsFromPlayable(engine, playable) {
  const ord = circularOccupiedOrder(engine, playable);
  if (ord.length < 2) return { sb: null, bb: null };
  if (ord.length === 2) {
    const btn = engine.buttonSeat;
    if (ord.includes(btn)) {
      return { sb: btn, bb: ord.find(x => x !== btn) ?? ord[1] };
    }
  }
  return { sb: ord[0], bb: ord[1] };
}

/** Eligible stacks for next hand (occupied, chips, not sitting out). */
function baseEligibleSeatIndexes(engine) {
  return occupiedSeatIndexes(engine).filter(i => {
    const s = engine.seats[i];
    return s.stack > 0 && !s.sitOut;
  });
}

/** Per-seat flags that only apply during a live hand — safe to reset when table is inactive. */
function repairInactiveSeatHandFlags(engine) {
  for (const s of engine.seats) {
    if (!s) continue;
    s.inCurrentHand = false;
    s.folded = false;
    s.allIn = false;
    s.streetContrib = 0;
    s.totalContrib = 0;
    s.actedThisStreet = false;
    s.voluntaryActedThisHand = false;
    s.hadActionOpportunityThisHand = false;
  }
}

/** Engine-level fields that must not leak across inactive / dirty snapshots. */
function repairInactiveTableFields(engine, privatePayload) {
  engine.communityCards = [];
  engine.pot = 0;
  engine.sidePots = [];
  engine.actionSeat = null;
  engine.actionDeadline = null;
  engine.street = null;
  engine.currentBet = 0;
  engine.minRaise = engine.bb;
  engine.lastAggressorSeat = null;
  engine.showdownRevealIdx = 0;
  engine.lastShowdownAdvanceAt = 0;
  privatePayload.holes = {};
  privatePayload.deck = [];
  privatePayload.revealed = {};
  repairInactiveSeatHandFlags(engine);
}

function repairWaitBbDeadlock(engine, baseIdx) {
  if (baseIdx.length < 2) return;
  const isFirstEver = engine.completedHands === 0;
  let playable = baseIdx;
  if (!isFirstEver) {
    const bbWait = hypotheticalBigBlindSeat(engine, baseIdx);
    playable = baseIdx.filter(i => {
      const s = engine.seats[i];
      return !s.waitBb || (bbWait != null && i === bbWait);
    });
  }
  if (playable.length < 2) {
    for (const i of baseIdx) {
      if (engine.seats[i]) engine.seats[i].waitBb = false;
    }
  }
}

/**
 * Pending leave/sit-out only make sense while a hand is resolving. On idle/between_hands,
 * flush them so reused tables are not half-stuck.
 */
function repairInactivePendingFlags(engine, economyOps) {
  processPendingLeaves(engine, economyOps);
  for (const s of engine.seats) {
    if (!s?.participantKey) continue;
    if (!s.pendingSitOutAfterHand) continue;
    if (s.inCurrentHand) continue;
    s.pendingSitOutAfterHand = false;
    s.sitOut = true;
    s.sitOutHands = 0;
  }
}

/**
 * When phase is idle/between_hands, repair persisted inconsistencies, waitBb deadlocks,
 * and stale pending-after-hand flags. Does not run during live betting/showdown.
 * @param {Array} economyOps — credits for stale pending leaves (same as settle path)
 */
function repairStaleNonBettingTable(engine, privatePayload, economyOps) {
  const ph = engine.phase;
  if (ph !== "idle" && ph !== "between_hands") return;

  const baseIdx = baseEligibleSeatIndexes(engine);

  const pot = Math.max(0, Math.floor(Number(engine.pot) || 0));
  const badPot = pot !== 0;
  const badActor = engine.actionSeat != null || engine.actionDeadline != null;
  const badStreet = engine.street != null && String(engine.street).length > 0;
  const badInHand = engine.seats.some(s => s && s.inCurrentHand);

  const needsHandCleanup =
    ph === "idle" ||
    badPot ||
    badActor ||
    badInHand ||
    (ph === "between_hands" && badStreet);

  if (needsHandCleanup) {
    repairInactiveTableFields(engine, privatePayload);
  }

  if (ph === "idle") {
    engine.winnersDisplay = null;
    engine.tableNotice = null;
  }

  repairWaitBbDeadlock(engine, baseIdx);
  repairInactivePendingFlags(engine, economyOps);
}

function tryStartNewHand(engine, privatePayload, now) {
  const cfgBb = engine.bb;
  const isFirstEver = engine.completedHands === 0;
  const btn = nextOccupiedFrom(engine, engine.buttonSeat - 1);
  if (btn == null) return false;
  engine.buttonSeat = btn;
  engine.tableNotice = null;

  const base = baseEligibleSeatIndexes(engine);
  if (base.length < 2) return false;

  let playable = base;
  if (!isFirstEver) {
    const bbWait = hypotheticalBigBlindSeat(engine, base);
    playable = base.filter(i => {
      const s = engine.seats[i];
      return !s.waitBb || (bbWait != null && i === bbWait);
    });
  }
  if (playable.length < 2 && base.length >= 2) {
    for (const i of base) {
      if (engine.seats[i]) engine.seats[i].waitBb = false;
    }
    playable = [...base];
  }
  if (playable.length < 2) return false;

  const { sb, bb } = blindPositionsFromPlayable(engine, playable);
  if (sb == null || bb == null) return false;
  engine.sbSeat = sb;
  engine.bbSeat = bb;

  for (const i of playable) {
    const s = engine.seats[i];
    s.inCurrentHand = true;
    s.folded = false;
    s.allIn = false;
    s.streetContrib = 0;
    s.totalContrib = 0;
    s.actedThisStreet = false;
    s.voluntaryActedThisHand = false;
    s.hadActionOpportunityThisHand = false;
    if (isFirstEver) s.waitBb = false;
    else if (i === bb && s.waitBb) s.waitBb = false;
  }

  engine.handSeq += 1;
  engine.phase = "post_blinds";
  engine.communityCards = [];
  engine.pot = 0;
  engine.sidePots = [];
  engine.winnersDisplay = null;
  engine.showdownRevealIdx = 0;
  engine.lastShowdownAdvanceAt = now;
  privatePayload.handSeq = engine.handSeq;
  privatePayload.holes = {};
  privatePayload.revealed = {};

  const deck = buildShuffledDeck();
  privatePayload.deck = deck;

  const sbPay = Math.min(engine.seats[sb].stack, engine.sb);
  const bbPay = Math.min(engine.seats[bb].stack, cfgBb);
  engine.seats[sb].stack -= sbPay;
  engine.seats[sb].streetContrib += sbPay;
  engine.seats[sb].totalContrib += sbPay;
  if (engine.seats[sb].stack === 0) engine.seats[sb].allIn = true;

  engine.seats[bb].stack -= bbPay;
  engine.seats[bb].streetContrib += bbPay;
  engine.seats[bb].totalContrib += bbPay;
  if (engine.seats[bb].stack === 0) engine.seats[bb].allIn = true;

  engine.pot = sbPay + bbPay;
  engine.currentBet = Math.max(engine.seats[sb].streetContrib, engine.seats[bb].streetContrib);
  engine.minRaise = engine.bb;
  engine.street = "preflop";

  for (const i of playable) {
    const c1 = privatePayload.deck.pop();
    const c2 = privatePayload.deck.pop();
    privatePayload.holes[String(i)] = [c1, c2];
  }

  engine.phase = "preflop";
  for (const i of playable) {
    engine.seats[i].actedThisStreet = false;
  }
  engine.actionSeat = firstPreflopActor(engine);
  if (engine.actionSeat != null && engine.seats[engine.actionSeat]) {
    engine.seats[engine.actionSeat].hadActionOpportunityThisHand = true;
  }
  engine.actionDeadline = now + OV2_CC_ACTION_MS;
  return true;
}

function advanceStreet(engine, privatePayload, now) {
  const t = Math.max(0, Number(now) || Date.now());
  resetStreet(engine);
  const live = activeInHand(engine).filter(s => !s.folded);
  if (live.length <= 1) {
    engine.phase = "showdown";
    engine.actionSeat = null;
    engine.actionDeadline = null;
    engine.showdownRevealIdx = 0;
    engine.lastShowdownAdvanceAt = t;
    return;
  }
  const st = engine.street;
  const deck = privatePayload.deck;
  if (st === "preflop") {
    if (deck.length) deck.pop();
    for (let k = 0; k < 3; k++) {
      if (deck.length) engine.communityCards.push(deck.pop());
    }
    engine.street = "flop";
  } else if (st === "flop") {
    if (deck.length) deck.pop();
    if (deck.length) engine.communityCards.push(deck.pop());
    engine.street = "turn";
  } else if (st === "turn") {
    if (deck.length) deck.pop();
    if (deck.length) engine.communityCards.push(deck.pop());
    engine.street = "river";
  } else if (st === "river") {
    engine.phase = "showdown";
    engine.actionSeat = null;
    engine.actionDeadline = null;
    engine.showdownRevealIdx = 0;
    engine.lastShowdownAdvanceAt = t;
    return;
  }
  const first = firstPostflopActor(engine);
  engine.actionSeat = first;
  if (first != null && engine.seats[first]) {
    engine.seats[first].hadActionOpportunityThisHand = true;
  }
  engine.actionDeadline = first != null ? t + OV2_CC_ACTION_MS : null;
}

function firstPostflopActor(engine) {
  const liveIdx = activeInHand(engine)
    .filter(s => !s.allIn)
    .map(s => s.seatIndex);
  if (!liveIdx.length) return null;
  const order = circularOccupiedOrder(engine, liveIdx);
  if (!order.length) return null;
  if (order.length === 1) return order[0];
  return order[0];
}

function computeSidePots(engine) {
  const potTotal = Math.max(0, Math.floor(Number(engine.pot) || 0));
  const contribs = engine.seats
    .map((s, i) => ({
      i,
      c: Math.max(0, Math.floor(Number(s.totalContrib) || 0)),
      folded: s.folded || !s.inCurrentHand,
    }))
    .filter(x => x.c > 0);
  if (!contribs.length) {
    return potTotal > 0 ? [{ amount: potTotal, eligible: [] }] : [];
  }
  const levels = [...new Set(contribs.map(x => x.c))].sort((a, b) => a - b);
  let prev = 0;
  const pots = [];
  for (const lvl of levels) {
    const delta = lvl - prev;
    if (delta <= 0) {
      prev = lvl;
      continue;
    }
    const atLevel = contribs.filter(x => x.c >= lvl);
    const eligible = atLevel.filter(x => !x.folded).map(x => x.i);
    const count = atLevel.length;
    const amt = delta * count;
    if (amt > 0) pots.push({ amount: amt, eligible });
    prev = lvl;
  }
  let sum = pots.reduce((a, p) => a + p.amount, 0);
  if (sum < potTotal) {
    pots.push({
      amount: potTotal - sum,
      eligible: contribs.filter(x => !x.folded).map(x => x.i),
    });
    sum = potTotal;
  }
  if (sum !== potTotal) {
    return null;
  }
  return pots;
}

/**
 * @returns {{ stackAdds: Record<number, number>, error: string | null }}
 */
function distributeSidePotsToWinners(engine, privatePayload) {
  const potTotal = Math.max(0, Math.floor(Number(engine.pot) || 0));
  const board = engine.communityCards || [];
  const stackAdds = {};
  const contenders = engine.seats.filter(s => s.inCurrentHand && !s.folded);
  if (!contenders.length) {
    return { stackAdds: {}, error: "settle_no_contenders" };
  }
  if (contenders.length === 1) {
    const w = contenders[0].seatIndex;
    stackAdds[w] = potTotal;
    return { stackAdds, error: null };
  }
  const pots = computeSidePots(engine);
  if (!pots) {
    return { stackAdds: {}, error: "sidepot_math_error" };
  }
  let distributed = 0;
  for (const pot of pots) {
    const pool = Math.max(0, Math.floor(Number(pot.amount) || 0));
    if (!pool) continue;
    const elig = Array.isArray(pot.eligible) && pot.eligible.length ? [...pot.eligible] : contenders.map(s => s.seatIndex);
    const activeElig = elig.filter(i => {
      const s = engine.seats[i];
      return s && s.inCurrentHand && !s.folded;
    });
    if (!activeElig.length) {
      return { stackAdds: {}, error: "sidepot_no_eligible" };
    }
    let best = null;
    let winners = [];
    for (const i of activeElig) {
      const hole = privatePayload.holes[String(i)] || [];
      const sc = bestHandScoreFrom7([...hole, ...board]);
      if (!sc) {
        return { stackAdds: {}, error: "hand_eval_failed" };
      }
      const cmp = best ? compareScores(sc, best) : 1;
      if (!best || cmp > 0) {
        best = sc;
        winners = [i];
      } else if (cmp === 0) {
        winners.push(i);
      }
    }
    if (!winners.length) {
      return { stackAdds: {}, error: "sidepot_no_winner" };
    }
    const share = Math.floor(pool / winners.length);
    let rem = pool - share * winners.length;
    for (const w of [...winners].sort((a, b) => a - b)) {
      const add = share + (rem > 0 ? 1 : 0);
      stackAdds[w] = (stackAdds[w] || 0) + add;
      if (rem > 0) rem -= 1;
    }
    distributed += pool;
  }
  if (distributed !== potTotal) {
    return { stackAdds: {}, error: "pot_total_mismatch", distributed, potTotal };
  }
  return { stackAdds, error: null };
}

/**
 * @returns {string | null} error code or null on success
 */
function settleHand(engine, privatePayload, economyOps, now) {
  const t = Math.max(0, Number(now) || Date.now());
  const dist = distributeSidePotsToWinners(engine, privatePayload);
  if (dist.error) {
    return dist.error;
  }

  for (const s of engine.seats) {
    if (!s.participantKey || !s.inCurrentHand || s.sitOut) continue;
    if (s.hadActionOpportunityThisHand && !s.voluntaryActedThisHand) {
      s.consecutiveAutoOnlyHands = Math.max(0, Math.floor(Number(s.consecutiveAutoOnlyHands) || 0)) + 1;
      if (s.consecutiveAutoOnlyHands >= 2) {
        s.sitOut = true;
        s.sitOutHands = 0;
      }
    } else {
      s.consecutiveAutoOnlyHands = 0;
    }
  }

  const winnerSeats = Object.keys(dist.stackAdds).map(Number);
  for (const [si, amt] of Object.entries(dist.stackAdds)) {
    const idx = Number(si);
    const add = Math.max(0, Math.floor(Number(amt) || 0));
    if (engine.seats[idx]) engine.seats[idx].stack += add;
  }

  engine.pot = 0;
  engine.sidePots = [];
  engine.winnersDisplay = {
    seats: winnerSeats,
    handSeq: engine.handSeq,
    stacksWon: dist.stackAdds,
  };
  engine.phase = "between_hands";
  engine.phaseEndsAt = t + OV2_CC_BETWEEN_HANDS_MS;
  engine.tableNotice = null;
  engine.actionSeat = null;
  engine.actionDeadline = null;
  engine.street = null;
  engine.currentBet = 0;
  engine.minRaise = engine.bb;
  engine.lastAggressorSeat = null;
  engine.completedHands += 1;
  engine.buttonSeat = nextOccupiedFrom(engine, engine.buttonSeat);

  for (const s of engine.seats) {
    s.inCurrentHand = false;
    s.folded = false;
    s.allIn = false;
    s.streetContrib = 0;
    s.totalContrib = 0;
    s.actedThisStreet = false;
    s.voluntaryActedThisHand = false;
    s.hadActionOpportunityThisHand = false;
    if (s.pendingSitOutAfterHand) {
      s.pendingSitOutAfterHand = false;
      s.sitOut = true;
      s.sitOutHands = 0;
    }
  }

  privatePayload.holes = {};
  privatePayload.deck = [];
  privatePayload.revealed = {};

  processPendingLeaves(engine, economyOps);
  bumpTimeoutsAndSitOut(engine, economyOps);
  return null;
}

function compareScores(a, b) {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

function processPendingLeaves(engine, economyOps) {
  const handSeq = Math.max(0, Math.floor(Number(engine.handSeq) || 0));
  const cfg = seatConfigFromEngine(engine);
  for (const s of engine.seats) {
    if (!s.pendingLeaveAfterHand || !s.participantKey) continue;
    if (s.inCurrentHand) continue;
    const stack = Math.max(0, Math.floor(Number(s.stack) || 0));
    const pk = String(s.participantKey).trim();
    if (stack > 0) {
      economyOps.push({
        type: "credit",
        participantKey: pk,
        amount: stack,
        suffix: `leave:${handSeq}:${s.seatIndex}`,
        lineKind: "REFUND",
      });
    }
    Object.assign(s, {
      ...emptySeat(s.seatIndex, cfg),
      seatIndex: s.seatIndex,
    });
  }
}

function seatConfigFromEngine(engine) {
  return {
    maxSeats: engine.maxSeats,
    tablePrice: engine.tablePrice,
    sb: engine.sb,
    bb: engine.bb,
    maxBuyin: engine.maxBuyin,
  };
}

function bumpTimeoutsAndSitOut(engine, economyOps) {
  const handSeq = Math.max(0, Math.floor(Number(engine.handSeq) || 0));
  const cfg = seatConfigFromEngine(engine);
  for (const s of engine.seats) {
    if (!s.participantKey) continue;
    if (s.sitOut) {
      s.sitOutHands = Math.max(0, Math.floor(Number(s.sitOutHands) || 0)) + 1;
      if (s.sitOutHands >= 2) {
        const stack = Math.max(0, Math.floor(Number(s.stack) || 0));
        const pk = String(s.participantKey).trim();
        if (stack > 0) {
          economyOps.push({
            type: "credit",
            participantKey: pk,
            amount: stack,
            suffix: `sitout_unseat:${handSeq}:${s.seatIndex}`,
            lineKind: "REFUND",
          });
        }
        Object.assign(s, {
          ...emptySeat(s.seatIndex, cfg),
          seatIndex: s.seatIndex,
        });
      }
    }
  }
}

function applyAutoFoldOrCheck(engine, privatePayload, seatIdx, now) {
  const t = Math.max(0, Number(now) || Date.now());
  const s = engine.seats[seatIdx];
  if (!s || !s.inCurrentHand || s.folded) return;
  const toCall = Math.max(0, engine.currentBet - s.streetContrib);
  if (toCall === 0) {
    s.actedThisStreet = true;
    engine.tableNotice = `Seat ${seatIdx + 1} auto-checked (time)`;
  } else {
    s.folded = true;
    s.consecutiveTimeoutHands = Math.max(0, Math.floor(Number(s.consecutiveTimeoutHands) || 0)) + 1;
    if (s.consecutiveTimeoutHands >= 2) {
      s.sitOut = true;
      s.sitOutHands = 0;
    }
    engine.tableNotice = `Seat ${seatIdx + 1} auto-folded (time)`;
  }
  advanceAfterAction(engine, privatePayload, t);
}

function advanceAfterAction(engine, privatePayload, now) {
  const t = Math.max(0, Number(now) || Date.now());
  if (everyoneMatchedOrFolded(engine)) {
    const live = activeInHand(engine).filter(s => !s.folded);
    if (live.length <= 1) {
      engine.phase = "showdown";
      engine.actionSeat = null;
      engine.actionDeadline = null;
      return;
    }
    if (engine.street === "river") {
      engine.phase = "showdown";
      engine.actionSeat = null;
      engine.actionDeadline = null;
      return;
    }
    advanceStreet(engine, privatePayload, t);
    autoRunoutAllInWhilePossible(engine, privatePayload, t);
    return;
  }
  advanceActionSeat(engine);
  engine.actionDeadline = t + OV2_CC_ACTION_MS;
}

/** @returns {string | null} settlement error — abort tick without corrupting stacks */
function runTick(engine, privatePayload, now, economyOps) {
  if (engine.phase === "idle" || engine.phase === "between_hands") {
    repairStaleNonBettingTable(engine, privatePayload, economyOps);
  }

  if (engine.phase === "idle") {
    engine.phase = "between_hands";
    engine.phaseEndsAt = now;
  }

  if (engine.phase === "between_hands") {
    if (typeof engine.phaseEndsAt !== "number" || engine.phaseEndsAt <= 0) {
      engine.phaseEndsAt = now + OV2_CC_BETWEEN_HANDS_MS;
    }
    if (now >= (engine.phaseEndsAt || 0)) {
      const started = tryStartNewHand(engine, privatePayload, now);
      if (!started) {
        engine.phase = "idle";
        engine.phaseEndsAt = null;
        repairStaleNonBettingTable(engine, privatePayload, economyOps);
      }
    }
    return null;
  }

  if (engine.phase === "showdown") {
    const revealOrder = activeInHand(engine)
      .filter(s => !s.folded)
      .map(s => s.seatIndex)
      .sort((a, b) => a - b);
    const total = revealOrder.length;
    if (total === 0) {
      return settleHand(engine, privatePayload, economyOps, now);
    }
    if (now - (engine.lastShowdownAdvanceAt || 0) >= OV2_CC_SHOWDOWN_STEP_MS) {
      engine.lastShowdownAdvanceAt = now;
      if (engine.showdownRevealIdx < total) {
        const si = revealOrder[engine.showdownRevealIdx];
        const hole = privatePayload.holes[String(si)] || [];
        privatePayload.revealed[String(si)] = [...hole];
        engine.showdownRevealIdx += 1;
      } else {
        return settleHand(engine, privatePayload, economyOps, now);
      }
    }
    return null;
  }

  if (engine.phase === "preflop" && shouldAutoRunout(engine)) {
    autoRunoutAllInWhilePossible(engine, privatePayload, now);
    return null;
  }

  if (engine.actionDeadline && now > engine.actionDeadline && engine.actionSeat != null) {
    applyAutoFoldOrCheck(engine, privatePayload, engine.actionSeat, now);
  }
  return null;
}

function legalCallAmount(engine, s) {
  const toCall = Math.max(0, engine.currentBet - s.streetContrib);
  return Math.min(s.stack, toCall);
}

function applyPlayerAction(engine, privatePayload, seatIdx, kind, payload, now) {
  const t = Math.max(0, Number(now) || Date.now());
  const s = engine.seats[seatIdx];
  if (!s || !s.inCurrentHand || s.folded || s.allIn) {
    return { error: "not_active" };
  }
  engine.tableNotice = null;
  const toCall = Math.max(0, engine.currentBet - s.streetContrib);

  if (kind === "fold") {
    s.folded = true;
    s.consecutiveTimeoutHands = 0;
    s.voluntaryActedThisHand = true;
    advanceAfterAction(engine, privatePayload, t);
    return {};
  }

  if (kind === "check") {
    if (toCall > 0) return { error: "illegal_check" };
    s.actedThisStreet = true;
    s.voluntaryActedThisHand = true;
    advanceAfterAction(engine, privatePayload, t);
    return {};
  }

  if (kind === "call") {
    const pay = legalCallAmount(engine, s);
    s.stack -= pay;
    s.streetContrib += pay;
    s.totalContrib += pay;
    engine.pot += pay;
    if (s.stack === 0) s.allIn = true;
    s.actedThisStreet = true;
    s.consecutiveTimeoutHands = 0;
    s.voluntaryActedThisHand = true;
    advanceAfterAction(engine, privatePayload, t);
    return {};
  }

  if (kind === "bet" || kind === "raise" || kind === "all_in") {
    let target = 0;
    if (kind === "all_in") {
      target = s.streetContrib + s.stack;
    } else {
      const add = Math.max(0, Math.floor(Number(payload?.amount) || 0));
      target = s.streetContrib + add;
    }
    if (target <= s.streetContrib) return { error: "raise_too_small" };
    const minTotal = engine.currentBet + (toCall > 0 ? engine.minRaise : engine.bb);
    if (kind !== "all_in" && target < minTotal && target < s.streetContrib + s.stack) {
      return { error: "raise_below_min" };
    }
    const pay = Math.min(s.stack, target - s.streetContrib);
    const newLevel = s.streetContrib + pay;
    if (newLevel > engine.currentBet) {
      engine.minRaise = Math.max(engine.bb, newLevel - engine.currentBet);
      engine.currentBet = newLevel;
      engine.lastAggressorSeat = seatIdx;
      for (const o of engine.seats) {
        if (o.inCurrentHand && !o.folded && o.seatIndex !== seatIdx) o.actedThisStreet = false;
      }
    }
    s.stack -= pay;
    s.streetContrib += pay;
    s.totalContrib += pay;
    engine.pot += pay;
    if (s.stack === 0) s.allIn = true;
    s.actedThisStreet = true;
    s.consecutiveTimeoutHands = 0;
    s.voluntaryActedThisHand = true;
    advanceAfterAction(engine, privatePayload, t);
    return {};
  }

  return { error: "unknown_action" };
}

/**
 * @param {*} engine
 * @param {*} privatePayload
 * @param {{ op: string; participantKey: string; payload: object; now: number; config: object }} ctx
 */
export function mutateEngine(engine, privatePayload, ctx) {
  const economyOps = [];
  const config = ctx.config;
  let e = normalizeEngine(engine, config);
  let priv = normalizePrivatePayload(privatePayload);
  const op = String(ctx.op || "").trim();
  const pk = String(ctx.participantKey || "").trim();
  const now = Math.max(0, Number(ctx.now) || Date.now());
  const payload = ctx.payload && typeof ctx.payload === "object" ? ctx.payload : {};
  if (e.phase === "idle" || e.phase === "between_hands") {
    repairStaleNonBettingTable(e, priv, economyOps);
  }

  if (op === "tick") {
    const tickErr = runTick(e, priv, now, economyOps);
    if (tickErr) {
      return { engine: e, privatePayload: priv, economyOps: [], error: tickErr };
    }
    return { engine: e, privatePayload: priv, economyOps, error: null };
  }

  if (op === "sit") {
    if (!pk) return { engine: e, privatePayload: priv, economyOps, error: "participant_required" };
    if (seatByPk(e, pk)) return { engine: e, privatePayload: priv, economyOps, error: "already_seated" };
    const seatIndex = Math.max(0, Math.floor(Number(payload.seatIndex) || 0));
    if (seatIndex < 0 || seatIndex >= e.maxSeats) return { engine: e, privatePayload: priv, economyOps, error: "bad_seat" };
    const target = e.seats[seatIndex];
    if (target.participantKey) return { engine: e, privatePayload: priv, economyOps, error: "seat_taken" };
    const buyIn = Math.max(0, Math.floor(Number(payload.buyIn) || 0));
    if (buyIn < config.tablePrice || buyIn > config.maxBuyin) {
      return { engine: e, privatePayload: priv, economyOps, error: "buyin_out_of_range" };
    }
    economyOps.push({
      type: "commit",
      participantKey: pk,
      amount: buyIn,
      suffix: `sit:${seatIndex}:${now}`,
    });
    target.participantKey = pk;
    target.displayName = String(payload.displayName || "").trim().slice(0, 32) || null;
    target.stack = buyIn;
    target.waitBb = true;
    target.sitOut = false;
    target.pendingSitOutAfterHand = false;
    target.consecutiveTimeoutHands = 0;
    target.sitOutHands = 0;
    target.consecutiveAutoOnlyHands = 0;
    return { engine: e, privatePayload: priv, economyOps, error: null };
  }

  if (op === "sit_out") {
    if (!pk) return { engine: e, privatePayload: priv, economyOps, error: "participant_required" };
    const s = seatByPk(e, pk);
    if (!s) return { engine: e, privatePayload: priv, economyOps, error: "not_seated" };
    const inLivePot = s.inCurrentHand && (isHandBettingActive(e) || e.phase === "showdown");
    if (inLivePot) {
      s.pendingSitOutAfterHand = true;
    } else {
      s.sitOut = true;
      s.sitOutHands = 0;
    }
    return { engine: e, privatePayload: priv, economyOps, error: null };
  }

  if (op === "sit_in") {
    if (!pk) return { engine: e, privatePayload: priv, economyOps, error: "participant_required" };
    const s = seatByPk(e, pk);
    if (!s) return { engine: e, privatePayload: priv, economyOps, error: "not_seated" };
    if (!s.sitOut && !s.pendingSitOutAfterHand) {
      return { engine: e, privatePayload: priv, economyOps, error: "not_sitting_out" };
    }
    s.sitOut = false;
    s.pendingSitOutAfterHand = false;
    s.sitOutHands = 0;
    s.consecutiveAutoOnlyHands = 0;
    s.waitBb = e.completedHands > 0;
    return { engine: e, privatePayload: priv, economyOps, error: null };
  }

  if (op === "top_up") {
    if (!pk) return { engine: e, privatePayload: priv, economyOps, error: "participant_required" };
    const s = seatByPk(e, pk);
    if (!s) return { engine: e, privatePayload: priv, economyOps, error: "not_seated" };
    if (s.inCurrentHand) {
      return { engine: e, privatePayload: priv, economyOps, error: "topup_not_during_hand" };
    }
    if (e.phase !== "idle" && e.phase !== "between_hands") {
      return { engine: e, privatePayload: priv, economyOps, error: "topup_between_hands_only" };
    }
    const add = Math.max(0, Math.floor(Number(payload.amount) || 0));
    if (add <= 0) return { engine: e, privatePayload: priv, economyOps, error: "bad_amount" };
    const cap = config.maxBuyin - s.stack;
    if (add > cap) return { engine: e, privatePayload: priv, economyOps, error: "topup_exceeds_cap" };
    economyOps.push({
      type: "commit",
      participantKey: pk,
      amount: add,
      suffix: `topup:${now}`,
    });
    s.stack += add;
    return { engine: e, privatePayload: priv, economyOps, error: null };
  }

  if (op === "leave_seat" || op === "leave_table") {
    if (!pk) return { engine: e, privatePayload: priv, economyOps, error: "participant_required" };
    const s = seatByPk(e, pk);
    if (!s) return { engine: e, privatePayload: priv, economyOps, error: "not_seated" };
    if (e.phase === "showdown" && s.inCurrentHand) {
      s.pendingLeaveAfterHand = true;
      return { engine: e, privatePayload: priv, economyOps, error: null };
    }
    const activeBetting = isHandBettingActive(e);
    const inHand = s.inCurrentHand && activeBetting;
    if (inHand) {
      s.pendingLeaveAfterHand = true;
      if (e.actionSeat === s.seatIndex) {
        applyAutoFoldOrCheck(e, priv, s.seatIndex, now);
      } else {
        s.folded = true;
        s.voluntaryActedThisHand = true;
        advanceAfterAction(e, priv, now);
      }
      return { engine: e, privatePayload: priv, economyOps, error: null };
    }
    const stack = Math.max(0, Math.floor(Number(s.stack) || 0));
    if (stack > 0) {
      economyOps.push({
        type: "credit",
        participantKey: pk,
        amount: stack,
        suffix: `leave:${e.handSeq}:${s.seatIndex}`,
        lineKind: "REFUND",
      });
    }
    Object.assign(s, { ...emptySeat(s.seatIndex, config), seatIndex: s.seatIndex });
    return { engine: e, privatePayload: priv, economyOps, error: null };
  }

  if (["fold", "check", "call", "bet", "raise", "all_in"].includes(op)) {
    if (!pk) return { engine: e, privatePayload: priv, economyOps, error: "participant_required" };
    const s = seatByPk(e, pk);
    if (!s) return { engine: e, privatePayload: priv, economyOps, error: "not_seated" };
    if (e.actionSeat !== s.seatIndex) return { engine: e, privatePayload: priv, economyOps, error: "not_your_turn" };
    const r = applyPlayerAction(e, priv, s.seatIndex, op === "all_in" ? "all_in" : op, payload, now);
    if (r.error) return { engine: e, privatePayload: priv, economyOps, error: r.error };
    return { engine: e, privatePayload: priv, economyOps, error: null };
  }

  return { engine: e, privatePayload: priv, economyOps, error: "unknown_op" };
}

export function extractViewerHoleCards(privatePayload, engine, participantKey) {
  const pk = String(participantKey || "").trim();
  const idx = engine.seats.findIndex(s => s.participantKey === pk);
  if (idx < 0) return [];
  const h = privatePayload?.holes?.[String(idx)];
  return Array.isArray(h) ? [...h] : [];
}

export function buildPublicEngineView(engine, privatePayload) {
  const e = clone(engine);
  const rev = privatePayload?.revealed || {};
  e.seats = e.seats.map((s, i) => {
    const holePublic = rev[String(i)] || null;
    return {
      ...s,
      holeCards: holePublic,
    };
  });
  return e;
}

/** Lightweight post-mutate checks before DB write. Returns error code or null. */
export function validateCcEngineInvariants(engine) {
  if (!engine || typeof engine !== "object" || !Array.isArray(engine.seats)) {
    return "cc_inv_bad_engine";
  }
  const pot = Math.floor(Number(engine.pot) || 0);
  if (pot < 0) return "cc_inv_pot_negative";
  for (const s of engine.seats) {
    if (!s) continue;
    if (Math.floor(Number(s.stack) || 0) < 0) return "cc_inv_stack_negative";
    if (s.folded && engine.actionSeat === s.seatIndex) return "cc_inv_folded_actor";
  }
  if (engine.phase === "between_hands") {
    if (pot !== 0) return "cc_inv_between_pot";
    if (engine.actionSeat != null) return "cc_inv_between_actor";
  }
  if (engine.phase === "showdown" && engine.actionSeat != null) {
    return "cc_inv_showdown_actor";
  }
  if (isHandBettingActive(engine) && engine.street) {
    const live = engine.seats.filter(x => x.inCurrentHand && !x.folded);
    if (live.length >= 2 && !live.every(x => x.allIn)) {
      if (engine.actionSeat != null) {
        const actor = engine.seats[engine.actionSeat];
        if (!actor || !actor.inCurrentHand || actor.folded || actor.allIn) {
          return "cc_inv_bad_actor";
        }
      }
    }
  }
  return null;
}
