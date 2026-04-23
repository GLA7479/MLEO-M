/**
 * Orbit Trap — pure deterministic rules engine (OV2 Phase 2).
 *
 * Bump (MVP, locked):
 * - Successful: defender moves +1 slot CW on same ring; defender is **not** stunned.
 *   Attacker lands on the contested cell; orb drop / pickup rules apply after the push.
 * - Blocked (no legal CW push): defender **stays**, gains `stunActive`, drops ≤1 orb on that
 *   cell as loose if they held any. Attacker **does not** move and does not resolve tile
 *   pickup on the destination. Turn still advances (move consumed).
 */

import {
  OV2_ORBIT_TRAP_BOOSTS,
  OV2_ORBIT_TRAP_GATES_MID_INNER,
  OV2_ORBIT_TRAP_GATES_OUTER_MID,
  OV2_ORBIT_TRAP_INITIAL_FIXED_ORBS,
  OV2_ORBIT_TRAP_LOCK_SLOTS,
  OV2_ORBIT_TRAP_RING_SLOTS,
  OV2_ORBIT_TRAP_ROTATABLE_RINGS,
  OV2_ORBIT_TRAP_START_OUTER_SLOTS,
  OV2_ORBIT_TRAP_TRAPS,
  ov2OrbitTrapCellKey,
  ov2OrbitTrapCellSet,
} from "./ov2OrbitTrapBoardSpec.js";

/** @typedef {"outer"|"mid"|"inner"|"core"} RingId */

const RING_SET = new Set(["outer", "mid", "inner", "core"]);

/**
 * @param {unknown} r
 * @returns {r is RingId}
 */
function isRing(r) {
  return typeof r === "string" && RING_SET.has(r);
}

/**
 * @param {RingId} ring
 * @param {number} slot
 * @returns {string}
 */
function key(ring, slot) {
  return ov2OrbitTrapCellKey(ring, Math.floor(slot));
}

/**
 * @returns {Map<string, Set<string>>}
 */
function buildAdjacency() {
  /** @type {Map<string, Set<string>>} */
  const m = new Map();
  function addEdge(k1, k2) {
    if (!m.has(k1)) m.set(k1, new Set());
    if (!m.has(k2)) m.set(k2, new Set());
    m.get(k1).add(k2);
    m.get(k2).add(k1);
  }
  function addHalf(from, to) {
    if (!m.has(from)) m.set(from, new Set());
    m.get(from).add(to);
  }
  for (const ring of ["outer", "mid", "inner"]) {
    for (let i = 0; i < OV2_ORBIT_TRAP_RING_SLOTS; i += 1) {
      const a = key(/** @type {RingId} */ (ring), i);
      const b = key(/** @type {RingId} */ (ring), (i + 1) % OV2_ORBIT_TRAP_RING_SLOTS);
      addEdge(a, b);
    }
  }
  for (const [s] of OV2_ORBIT_TRAP_GATES_OUTER_MID) {
    addEdge(key("outer", s), key("mid", s));
  }
  for (const [s] of OV2_ORBIT_TRAP_GATES_MID_INNER) {
    addEdge(key("mid", s), key("inner", s));
  }
  const coreK = key("core", 0);
  for (let i = 0; i < OV2_ORBIT_TRAP_RING_SLOTS; i += 1) {
    addHalf(key("inner", i), coreK);
  }
  if (!m.has(coreK)) m.set(coreK, new Set());
  return m;
}

const ADJ = buildAdjacency();
const TRAP_SET = ov2OrbitTrapCellSet(OV2_ORBIT_TRAP_TRAPS);
const BOOST_SET = ov2OrbitTrapCellSet(OV2_ORBIT_TRAP_BOOSTS);
const LOCK_SLOT_SET = ov2OrbitTrapCellSet(OV2_ORBIT_TRAP_LOCK_SLOTS);

/**
 * @typedef {{
 *   ring: RingId;
 *   slot: number;
 *   orbsHeld: number;
 *   lockToken: boolean;
 *   stunActive: boolean;
 *   trapSlowPending: boolean;
 *   boostPending: boolean;
 * }} OtPlayer

 * @typedef {{ ring: RingId; slot: number }} OtLooseOrb

 * @typedef {{
 *   revision: number;
 *   phase: "playing"|"finished";
 *   turnSeat: number;
 *   winnerSeat: number | null;
 *   players: OtPlayer[];
 *   looseOrbs: OtLooseOrb[];
 *   fixedOrbKeys: Set<string>;
 *   ringLock: null | { ring: RingId; ownerSeat: number };
 *   startedTurnOnInner: boolean;
 * }} OtGameState
 */

/** @type {OtGameState} */
export function createInitialOtState() {
  /** @type {OtPlayer[]} */
  const players = [];
  for (let s = 0; s < 4; s += 1) {
    players.push({
      ring: "outer",
      slot: OV2_ORBIT_TRAP_START_OUTER_SLOTS[s],
      orbsHeld: 0,
      lockToken: false,
      stunActive: false,
      trapSlowPending: false,
      boostPending: false,
    });
  }
  const fixedOrbKeys = new Set(OV2_ORBIT_TRAP_INITIAL_FIXED_ORBS.map(([r, sl]) => key(/** @type {RingId} */ (r), sl)));
  return {
    revision: 0,
    phase: "playing",
    turnSeat: 0,
    winnerSeat: null,
    players,
    looseOrbs: [],
    fixedOrbKeys,
    ringLock: null,
    startedTurnOnInner: players[0].ring === "inner",
  };
}

/**
 * @param {OtGameState} st
 */
function cloneState(st) {
  return {
    revision: st.revision,
    phase: st.phase,
    turnSeat: st.turnSeat,
    winnerSeat: st.winnerSeat,
    players: st.players.map(p => ({ ...p })),
    looseOrbs: st.looseOrbs.map(o => ({ ...o })),
    fixedOrbKeys: new Set(st.fixedOrbKeys),
    ringLock: st.ringLock ? { ...st.ringLock } : null,
    startedTurnOnInner: st.startedTurnOnInner,
  };
}

/**
 * @param {OtGameState} st
 * @param {RingId} ring
 * @param {number} slot
 * @param {number} exceptSeat
 */
function occupantSeat(st, ring, slot, exceptSeat = -1) {
  for (let s = 0; s < 4; s += 1) {
    if (s === exceptSeat) continue;
    const p = st.players[s];
    if (p.ring === ring && p.slot === slot) return s;
  }
  return -1;
}

/**
 * @param {OtGameState} st
 * @param {number} defenderSeat
 */
function bumpPushValid(st, defenderSeat) {
  const def = st.players[defenderSeat];
  if (def.ring === "core") return false;
  const pushSlot = (def.slot + 1) % OV2_ORBIT_TRAP_RING_SLOTS;
  return occupantSeat(st, def.ring, pushSlot, defenderSeat) < 0;
}

/**
 * @param {OtPlayer} p
 */
function effectiveMoveBudget(p) {
  if (p.stunActive) return 1;
  if (p.trapSlowPending && p.boostPending) return 1;
  if (p.trapSlowPending) return 1;
  if (p.boostPending) {
    const heavy = p.orbsHeld >= 2;
    return heavy ? 2 : 3;
  }
  const heavy = p.orbsHeld >= 2;
  return heavy ? 1 : 2;
}

/**
 * @param {OtPlayer} p
 */
function canRotate(p) {
  if (p.stunActive) return false;
  if (p.orbsHeld >= 2) return false;
  return true;
}

/**
 * @param {OtGameState} st
 * @param {RingId} ring
 */
function isRingRotationLocked(st, ring) {
  if (!st.ringLock) return false;
  return st.ringLock.ring === ring;
}

/**
 * @param {string} k
 * @returns {[RingId, number]}
 */
function parseKey(k) {
  const [rs, ss] = k.split(":");
  return [/** @type {RingId} */ (rs), Number(ss)];
}

/**
 * @param {OtGameState} st
 * @param {number} actorSeat
 * @param {number} budget
 * @param {{ orbsAtMoveStart: number; startedOnInner: boolean }} coreCtx
 */
function reachableDestinations(st, actorSeat, budget, coreCtx) {
  const p = st.players[actorSeat];
  const start = key(p.ring, p.slot);
  /** @type {Map<string, number>} */
  const dist = new Map([[start, 0]]);
  /** @type {string[]} */
  const q = [start];
  for (let qi = 0; qi < q.length; qi += 1) {
    const cur = q[qi];
    const d = dist.get(cur) ?? 0;
    if (d >= budget) continue;
    const neigh = ADJ.get(cur);
    if (!neigh) continue;
    for (const nb of neigh) {
      const [nr, ns] = parseKey(nb);
      const nd = d + 1;
      if (nd > budget) continue;

      if (nr === "core") {
        if (coreCtx.orbsAtMoveStart < 2 || !coreCtx.startedOnInner) continue;
      }

      const occ = occupantSeat(st, nr, ns, actorSeat);
      if (occ >= 0) {
        if (!dist.has(nb) || nd < dist.get(nb)) dist.set(nb, nd);
        continue;
      }

      if (!dist.has(nb) || nd < dist.get(nb)) {
        dist.set(nb, nd);
        q.push(nb);
      }
    }
  }
  return dist;
}

/**
 * @param {OtGameState} st
 * @param {number} actorSeat
 * @param {RingId} toRing
 * @param {number} toSlot
 * @param {number} budget
 */
function hasLegalPath(st, actorSeat, toRing, toSlot, budget) {
  const p = st.players[actorSeat];
  const coreCtx = {
    orbsAtMoveStart: p.orbsHeld,
    startedOnInner: st.startedTurnOnInner,
  };
  const dest = key(toRing, toSlot);
  const dist = reachableDestinations(st, actorSeat, budget, coreCtx);
  const steps = dist.get(dest);
  return steps != null && steps >= 1 && steps <= budget;
}

/**
 * @param {OtGameState} st
 * @param {number} seat
 */
export function otGetMoveBudget(st, seat) {
  if (st.phase !== "playing" || seat !== st.turnSeat) return 0;
  return effectiveMoveBudget(st.players[seat]);
}

/**
 * @param {OtGameState} st
 * @param {number} seat
 * @returns {{ ring: RingId; slot: number }[]}
 */
export function otListLegalMoveDestinations(st, seat) {
  if (st.phase !== "playing" || seat !== st.turnSeat) return [];
  const budget = effectiveMoveBudget(st.players[seat]);
  if (budget < 1) return [];
  const p = st.players[seat];
  const coreCtx = {
    orbsAtMoveStart: p.orbsHeld,
    startedOnInner: st.startedTurnOnInner,
  };
  const dist = reachableDestinations(st, seat, budget, coreCtx);
  /** @type {{ ring: RingId; slot: number }[]} */
  const out = [];
  for (const [k, steps] of dist) {
    if (steps < 1 || steps > budget) continue;
    const [r, sl] = parseKey(k);
    if (r === p.ring && sl === p.slot) continue;
    if (r === "core" && (p.orbsHeld < 2 || !st.startedTurnOnInner)) continue;
    out.push({ ring: r, slot: sl });
  }
  return out;
}

/**
 * @param {OtGameState} st
 * @param {number} seat
 * @returns {RingId[]}
 */
export function otListLegalRotateRings(st, seat) {
  if (st.phase !== "playing" || seat !== st.turnSeat) return [];
  const p = st.players[seat];
  if (!canRotate(p)) return [];
  /** @type {RingId[]} */
  const rings = [];
  for (const r of OV2_ORBIT_TRAP_ROTATABLE_RINGS) {
    if (isRingRotationLocked(st, /** @type {RingId} */ (r))) continue;
    rings.push(/** @type {RingId} */ (r));
  }
  return rings;
}

/**
 * @param {OtGameState} st
 * @param {number} seat
 */
export function otCanApplyLock(st, seat) {
  if (st.phase !== "playing" || seat !== st.turnSeat) return false;
  const p = st.players[seat];
  if (p.stunActive) return false;
  if (!p.lockToken) return false;
  return true;
}

/**
 * @param {OtGameState} st
 * @param {number} nextSeat
 */
function clearRingLockForTurnStart(st, nextSeat) {
  if (st.ringLock && st.ringLock.ownerSeat === nextSeat) {
    st.ringLock = null;
  }
}

/**
 * @param {OtGameState} st
 */
function advanceTurn(st) {
  const prev = st.turnSeat;
  if (st.players[prev].stunActive) {
    st.players[prev].stunActive = false;
  }
  st.turnSeat = (st.turnSeat + 1) % 4;
  clearRingLockForTurnStart(st, st.turnSeat);
  const np = st.players[st.turnSeat];
  st.startedTurnOnInner = np.ring === "inner";
}

/**
 * Trap/boost pending survive until the **next** action that player takes
 * (after others may act). Clear only modifiers that were already pending
 * before that action completed.
 * @param {OtGameState} next
 * @param {number} moverSeat
 * @param {boolean} hadTrapBefore
 * @param {boolean} hadBoostBefore
 */
function clearConsumedMoveModifiers(next, moverSeat, hadTrapBefore, hadBoostBefore) {
  const p = next.players[moverSeat];
  if (hadTrapBefore && hadBoostBefore) {
    p.trapSlowPending = false;
    p.boostPending = false;
  } else {
    if (hadTrapBefore) p.trapSlowPending = false;
    if (hadBoostBefore) p.boostPending = false;
  }
}

/**
 * @param {RingId} ring
 * @param {number} dir +1 CW one slot, -1 CCW
 */
function rotateRingSlots(ring, slot, dir) {
  if (ring === "core") return slot;
  return (slot + dir + OV2_ORBIT_TRAP_RING_SLOTS * 8) % OV2_ORBIT_TRAP_RING_SLOTS;
}

/**
 * @param {OtGameState} st
 * @param {RingId} ring
 * @param {number} dir
 */
function applyRingRotationToState(st, ring, dir) {
  for (const pl of st.players) {
    if (pl.ring === ring) {
      pl.slot = rotateRingSlots(ring, pl.slot, dir);
    }
  }
  for (const o of st.looseOrbs) {
    if (o.ring === ring) {
      o.slot = rotateRingSlots(ring, o.slot, dir);
    }
  }
  const nextFixed = new Set();
  for (const fk of st.fixedOrbKeys) {
    const [r, s] = parseKey(fk);
    if (r === ring) {
      nextFixed.add(key(r, rotateRingSlots(ring, s, dir)));
    } else {
      nextFixed.add(fk);
    }
  }
  st.fixedOrbKeys = nextFixed;
}

/**
 * @param {OtGameState} st
 * @param {number} seat
 * @param {RingId} ring
 * @param {number} dir +1 or -1
 * @returns {{ ok: true, state: OtGameState } | { ok: false, code: string }}
 */
export function otApplyRotate(st, seat, ring, dir) {
  if (st.phase !== "playing") return { ok: false, code: "not_playing" };
  if (seat !== st.turnSeat) return { ok: false, code: "not_your_turn" };
  if (ring === "core") return { ok: false, code: "bad_ring" };
  if (dir !== 1 && dir !== -1) return { ok: false, code: "bad_dir" };
  const p = st.players[seat];
  if (!canRotate(p)) return { ok: false, code: "cannot_rotate" };
  if (isRingRotationLocked(st, ring)) return { ok: false, code: "ring_locked" };
  if (!OV2_ORBIT_TRAP_ROTATABLE_RINGS.includes(/** @type {"outer"|"mid"|"inner"} */ (ring))) {
    return { ok: false, code: "bad_ring" };
  }
  const hadTrapBefore = st.players[seat].trapSlowPending;
  const hadBoostBefore = st.players[seat].boostPending;
  const next = cloneState(st);
  applyRingRotationToState(next, ring, dir);
  advanceTurn(next);
  clearConsumedMoveModifiers(next, seat, hadTrapBefore, hadBoostBefore);
  next.revision = st.revision + 1;
  return { ok: true, state: next };
}

/**
 * @param {OtGameState} st
 * @param {number} seat
 * @param {RingId} ring
 * @returns {{ ok: true, state: OtGameState } | { ok: false, code: string }}
 */
export function otApplyLock(st, seat, ring) {
  if (st.phase !== "playing") return { ok: false, code: "not_playing" };
  if (seat !== st.turnSeat) return { ok: false, code: "not_your_turn" };
  if (ring === "core") return { ok: false, code: "bad_ring" };
  if (!OV2_ORBIT_TRAP_ROTATABLE_RINGS.includes(/** @type {"outer"|"mid"|"inner"} */ (ring))) {
    return { ok: false, code: "bad_ring" };
  }
  const p = st.players[seat];
  if (p.stunActive) return { ok: false, code: "stunned_no_lock" };
  if (!p.lockToken) return { ok: false, code: "no_lock_token" };
  const hadTrapBefore = st.players[seat].trapSlowPending;
  const hadBoostBefore = st.players[seat].boostPending;
  const next = cloneState(st);
  next.players[seat].lockToken = false;
  next.ringLock = { ring, ownerSeat: seat };
  advanceTurn(next);
  clearConsumedMoveModifiers(next, seat, hadTrapBefore, hadBoostBefore);
  next.revision = st.revision + 1;
  return { ok: true, state: next };
}

/**
 * @param {OtGameState} st
 * @param {number} seat
 * @param {RingId} toRing
 * @param {number} toSlot
 * @returns {{ ok: true, state: OtGameState } | { ok: false, code: string }}
 */
export function otApplyMove(st, seat, toRing, toSlot) {
  if (st.phase !== "playing") return { ok: false, code: "not_playing" };
  if (seat !== st.turnSeat) return { ok: false, code: "not_your_turn" };
  if (!isRing(toRing)) return { ok: false, code: "bad_ring" };
  const slot = Math.floor(toSlot);
  if (toRing !== "core" && (slot < 0 || slot >= OV2_ORBIT_TRAP_RING_SLOTS)) return { ok: false, code: "bad_slot" };
  if (toRing === "core" && slot !== 0) return { ok: false, code: "bad_core" };

  const budget = effectiveMoveBudget(st.players[seat]);
  const occPre = occupantSeat(st, toRing, slot, seat);
  if (!hasLegalPath(st, seat, toRing, slot, budget)) {
    return { ok: false, code: "no_legal_path" };
  }

  if (toRing === "core") {
    const p0 = st.players[seat];
    if (p0.orbsHeld < 2 || !st.startedTurnOnInner) {
      return { ok: false, code: "core_entry_denied" };
    }
  }

  const hadTrapBefore = st.players[seat].trapSlowPending;
  const hadBoostBefore = st.players[seat].boostPending;

  const next = cloneState(st);
  const p = next.players[seat];

  if (occPre >= 0 && !bumpPushValid(st, occPre)) {
    const def = next.players[occPre];
    if (def.orbsHeld > 0) {
      def.orbsHeld -= 1;
      next.looseOrbs.push({ ring: def.ring, slot: def.slot });
    }
    def.stunActive = true;
    advanceTurn(next);
    clearConsumedMoveModifiers(next, seat, hadTrapBefore, hadBoostBefore);
    next.revision = st.revision + 1;
    return { ok: true, state: next };
  }

  if (occPre >= 0 && bumpPushValid(st, occPre)) {
    const def = next.players[occPre];
    if (def.orbsHeld > 0) {
      def.orbsHeld -= 1;
      next.looseOrbs.push({ ring: def.ring, slot: def.slot });
    }
    def.slot = (def.slot + 1) % OV2_ORBIT_TRAP_RING_SLOTS;
  }

  p.ring = toRing;
  p.slot = slot;

  const k = key(toRing, slot);
  const looseOnCell = next.looseOrbs.filter(o => o.ring === toRing && o.slot === slot);
  next.looseOrbs = next.looseOrbs.filter(o => !(o.ring === toRing && o.slot === slot));
  for (const _ of looseOnCell) {
    if (p.orbsHeld >= 2) break;
    p.orbsHeld += 1;
  }
  if (p.orbsHeld < 2 && next.fixedOrbKeys.has(k)) {
    p.orbsHeld += 1;
    next.fixedOrbKeys.delete(k);
  }

  if (TRAP_SET.has(k)) {
    if (p.orbsHeld > 0) {
      p.orbsHeld -= 1;
      next.looseOrbs.push({ ring: toRing, slot });
    }
    p.trapSlowPending = true;
    p.boostPending = false;
  } else if (BOOST_SET.has(k)) {
    p.boostPending = true;
  }

  if (LOCK_SLOT_SET.has(k) && !st.players[seat].lockToken) {
    p.lockToken = true;
  }

  const won = toRing === "core" && p.orbsHeld >= 2 && st.startedTurnOnInner;
  if (won) {
    next.phase = "finished";
    next.winnerSeat = seat;
  } else {
    advanceTurn(next);
    clearConsumedMoveModifiers(next, seat, hadTrapBefore, hadBoostBefore);
  }

  next.revision = st.revision + 1;
  return { ok: true, state: next };
}
