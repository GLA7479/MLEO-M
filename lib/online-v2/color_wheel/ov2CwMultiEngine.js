/**
 * OV2 Color Wheel — multi-seat table engine (server-only; Next API).
 */

import { randomInt } from "crypto";
import {
  OV2_CW_PLACING_MS,
  OV2_CW_RESULT_MS,
  OV2_CW_SPINNING_MS,
  OV2_CW_WHEEL_NUMBERS,
  ov2CwColorForNumber,
  ov2CwIndexToCenterAngle,
  ov2CwPlayWins,
  ov2CwPayoutMultiplier,
} from "./ov2CwConstants";
import { OV2_CW_MAX_SEATS } from "./ov2CwTableIds";

function clone(x) {
  return JSON.parse(JSON.stringify(x));
}

function emptySeat(i) {
  return {
    seatIndex: i,
    participantKey: null,
    displayName: null,
  };
}

function normalizeCwTableStakeUnits(tableStakeUnits) {
  const n = Math.floor(Number(tableStakeUnits) || 0);
  return n >= 1 ? n : 1;
}

function maxPlayForTable(tableStakeUnits) {
  const min = normalizeCwTableStakeUnits(tableStakeUnits);
  return Math.min(min * 200, 10_000_000);
}

function seatedCount(engine) {
  if (!Array.isArray(engine.seats)) return 0;
  return engine.seats.filter(s => s && String(s.participantKey || "").trim()).length;
}

function getOv2CwRoundLeaderPk(engine) {
  if (!Array.isArray(engine.seats)) return null;
  for (let i = 0; i < engine.seats.length; i++) {
    const pk = String(engine.seats[i]?.participantKey || "").trim();
    if (pk) return pk;
  }
  return null;
}

function validatePlaySpec(playType, playValue) {
  const t = String(playType || "").trim();
  const allowed = new Set([
    "number",
    "red",
    "black",
    "even",
    "odd",
    "low",
    "high",
    "dozen",
    "column",
  ]);
  if (!allowed.has(t)) return { ok: false, error: "invalid_play_type" };
  if (t === "number") {
    const n = Math.floor(Number(playValue));
    if (!Number.isFinite(n) || n < 0 || n > 36) return { ok: false, error: "invalid_play_value" };
    return { ok: true, playType: t, playValue: n };
  }
  if (t === "dozen" || t === "column") {
    const n = Math.floor(Number(playValue));
    if (n < 1 || n > 3) return { ok: false, error: "invalid_play_value" };
    return { ok: true, playType: t, playValue: n };
  }
  return { ok: true, playType: t, playValue: null };
}

function pushHistory(engine, t) {
  const rs = Math.max(1, Math.floor(Number(engine.roundSeq) || 0));
  const rn = Math.floor(Number(engine.resultNumber) || 0);
  const rc = String(engine.resultColor || ov2CwColorForNumber(rn));
  const row = { roundSeq: rs, resultNumber: rn, resultColor: rc, at: t };
  const h = Array.isArray(engine.history) ? engine.history.slice() : [];
  h.unshift(row);
  engine.history = h.slice(0, 24);
}

function refundAllPlays(engine, economyOps) {
  const rid = Math.max(1, Math.floor(Number(engine.roundSeq) || 0));
  const plays = Array.isArray(engine.plays) ? engine.plays : [];
  for (const p of plays) {
    if (Math.floor(Number(p.roundSeq) || 0) !== rid) continue;
    const pk = String(p.participantKey || "").trim();
    const amt = Math.max(0, Math.floor(Number(p.amount) || 0));
    if (pk && amt > 0) {
      economyOps.push({
        type: "credit",
        participantKey: pk,
        amount: amt,
        suffix: `cw_refund_abort_r${rid}_${p.playId}`,
        lineKind: "REFUND",
      });
    }
  }
  engine.plays = [];
}

function refundPlaysForParticipant(engine, pk, economyOps) {
  const plays = Array.isArray(engine.plays) ? engine.plays : [];
  const keep = [];
  const rid = Math.max(1, Math.floor(Number(engine.roundSeq) || 0));
  for (const p of plays) {
    if (String(p.participantKey || "").trim() !== pk) {
      keep.push(p);
      continue;
    }
    if (Math.floor(Number(p.roundSeq) || 0) !== rid) {
      keep.push(p);
      continue;
    }
    const amt = Math.max(0, Math.floor(Number(p.amount) || 0));
    if (amt > 0) {
      economyOps.push({
        type: "credit",
        participantKey: pk,
        amount: amt,
        suffix: `cw_refund_leave_r${rid}_${p.playId}`,
        lineKind: "REFUND",
      });
    }
  }
  engine.plays = keep;
}

function settlePlays(engine, economyOps) {
  const result = Math.floor(Number(engine.resultNumber) || 0);
  const rid = Math.max(1, Math.floor(Number(engine.roundSeq) || 0));
  const plays = Array.isArray(engine.plays) ? engine.plays : [];
  for (const p of plays) {
    if (Math.floor(Number(p.roundSeq) || 0) !== rid) continue;
    const pk = String(p.participantKey || "").trim();
    if (!pk) continue;
    const amt = Math.max(0, Math.floor(Number(p.amount) || 0));
    if (amt <= 0) continue;
    const won = ov2CwPlayWins(p.playType, p.playValue, result);
    if (!won) continue;
    const mult = ov2CwPayoutMultiplier(p.playType);
    const pay = Math.floor(amt * (1 + mult));
    if (pay > 0) {
      economyOps.push({
        type: "credit",
        participantKey: pk,
        amount: pay,
        suffix: `cw_win_r${rid}_${p.playId}`,
        lineKind: "MATCH_PAYOUT",
      });
    }
  }
}

function clearRoundVisual(engine) {
  engine.pendingResultNumber = null;
  engine.pendingResultColor = null;
  engine.spinTargetAngle = null;
}

export function buildFreshEngine(tableStakeUnits) {
  const stake = normalizeCwTableStakeUnits(tableStakeUnits);
  return {
    v: 1,
    tableStakeUnits: stake,
    phase: "lobby",
    phaseEndsAt: null,
    roundSeq: 0,
    playSeq: 0,
    resultNumber: null,
    resultColor: null,
    pendingResultNumber: null,
    pendingResultColor: null,
    spinTargetAngle: null,
    seats: Array.from({ length: OV2_CW_MAX_SEATS }, (_, i) => emptySeat(i)),
    plays: [],
    history: [],
  };
}

export function normalizeEngine(raw, tableStakeUnits) {
  const stake = normalizeCwTableStakeUnits(tableStakeUnits);
  if (!raw || typeof raw !== "object" || Object.keys(raw).length === 0) {
    return buildFreshEngine(stake);
  }
  const e = clone(raw);
  e.v = 1;
  e.tableStakeUnits = stake;
  if (!Array.isArray(e.seats) || e.seats.length !== OV2_CW_MAX_SEATS) {
    e.seats = Array.from({ length: OV2_CW_MAX_SEATS }, (_, i) => emptySeat(i));
  } else {
    e.seats = e.seats.map((s, i) => ({
      ...emptySeat(i),
      ...s,
      seatIndex: i,
    }));
  }
  if (!Array.isArray(e.plays)) e.plays = [];
  if (!Array.isArray(e.history)) e.history = [];
  else if (e.history.length > 24) e.history = e.history.slice(0, 24);
  e.playSeq = Math.max(0, Math.floor(Number(e.playSeq) || 0));
  e.roundSeq = Math.max(0, Math.floor(Number(e.roundSeq) || 0));
  if (typeof e.phase !== "string") e.phase = "lobby";
  return e;
}

/**
 * @returns {{ engine: object, economyOps: any[], error?: string }}
 */
export function mutateEngine(prev, { op, participantKey, payload, now }) {
  const economyOps = [];
  let engine = clone(prev);
  const pk = String(participantKey || "").trim();
  const t = typeof now === "number" ? now : Date.now();

  if (op === "tick") {
    if (engine.phase === "placing" && engine.phaseEndsAt != null && t >= Number(engine.phaseEndsAt)) {
      if (seatedCount(engine) === 0) {
        engine.phase = "lobby";
        engine.phaseEndsAt = null;
        engine.roundSeq = 0;
        engine.plays = [];
        clearRoundVisual(engine);
        engine.resultNumber = null;
        engine.resultColor = null;
        return { engine, economyOps };
      }
      const idx = randomInt(0, OV2_CW_WHEEL_NUMBERS.length);
      const picked = OV2_CW_WHEEL_NUMBERS[idx];
      const resultNum = Math.floor(Number(picked.num));
      engine.pendingResultNumber = resultNum;
      engine.pendingResultColor = picked.color;
      engine.spinTargetAngle = ov2CwIndexToCenterAngle(idx);
      engine.phase = "spinning";
      engine.phaseEndsAt = t + OV2_CW_SPINNING_MS;
      return { engine, economyOps };
    }

    if (engine.phase === "spinning" && engine.phaseEndsAt != null && t >= Number(engine.phaseEndsAt)) {
      engine.resultNumber = Math.floor(Number(engine.pendingResultNumber) || 0);
      engine.resultColor = String(engine.pendingResultColor || ov2CwColorForNumber(engine.resultNumber));
      settlePlays(engine, economyOps);
      pushHistory(engine, t);
      engine.phase = "result";
      engine.phaseEndsAt = t + OV2_CW_RESULT_MS;
      return { engine, economyOps };
    }

    if (engine.phase === "result" && engine.phaseEndsAt != null && t >= Number(engine.phaseEndsAt)) {
      if (seatedCount(engine) === 0) {
        engine.phase = "lobby";
        engine.phaseEndsAt = null;
        engine.roundSeq = 0;
        engine.plays = [];
        engine.resultNumber = null;
        engine.resultColor = null;
        clearRoundVisual(engine);
        return { engine, economyOps };
      }
      engine.plays = [];
      engine.roundSeq = Math.max(1, Math.floor(Number(engine.roundSeq) || 0)) + 1;
      engine.resultNumber = null;
      engine.resultColor = null;
      clearRoundVisual(engine);
      engine.phase = "placing";
      engine.phaseEndsAt = t + OV2_CW_PLACING_MS;
      return { engine, economyOps };
    }

    return { engine, economyOps };
  }

  if (op === "sit") {
    const seatIndex = Math.max(0, Math.min(OV2_CW_MAX_SEATS - 1, Math.floor(Number(payload?.seatIndex))));
    const name = String(payload?.displayName || "").trim() || "Guest";
    if (!pk) return { engine: prev, economyOps, error: "participant_required" };
    const target = engine.seats[seatIndex];
    if (target.participantKey && target.participantKey !== pk) {
      return { engine: prev, economyOps, error: "seat_taken" };
    }
    for (const s of engine.seats) {
      if (s.participantKey === pk && s.seatIndex !== seatIndex) {
        if (engine.phase === "placing") {
          refundPlaysForParticipant(engine, pk, economyOps);
        }
        s.participantKey = null;
        s.displayName = null;
      }
    }
    target.participantKey = pk;
    target.displayName = name;
    return { engine, economyOps };
  }

  if (op === "leave_seat") {
    if (!pk) return { engine: prev, economyOps, error: "participant_required" };
    let idx = -1;
    for (let i = 0; i < OV2_CW_MAX_SEATS; i++) {
      if (engine.seats[i].participantKey === pk) idx = i;
    }
    if (idx < 0) return { engine: prev, economyOps, error: "not_seated" };
    if (engine.phase === "placing") {
      refundPlaysForParticipant(engine, pk, economyOps);
    }
    engine.seats[idx].participantKey = null;
    engine.seats[idx].displayName = null;
    if (seatedCount(engine) === 0 && (engine.phase === "placing" || engine.phase === "spinning" || engine.phase === "result")) {
      if (engine.phase === "spinning") {
        refundAllPlays(engine, economyOps);
      } else {
        engine.plays = [];
      }
      engine.phase = "lobby";
      engine.phaseEndsAt = null;
      engine.roundSeq = 0;
      engine.resultNumber = null;
      engine.resultColor = null;
      clearRoundVisual(engine);
    }
    return { engine, economyOps };
  }

  if (op === "start_round") {
    if (!pk) return { engine: prev, economyOps, error: "participant_required" };
    if (engine.phase !== "lobby") {
      return { engine: prev, economyOps, error: "not_in_lobby" };
    }
    const leader = getOv2CwRoundLeaderPk(engine);
    if (!leader || leader !== pk) {
      return { engine: prev, economyOps, error: "not_round_controller" };
    }
    if (seatedCount(engine) < 1) {
      return { engine: prev, economyOps, error: "no_seated_players" };
    }
    engine.roundSeq = 1;
    engine.playSeq = 0;
    engine.plays = [];
    engine.resultNumber = null;
    engine.resultColor = null;
    clearRoundVisual(engine);
    engine.phase = "placing";
    engine.phaseEndsAt = t + OV2_CW_PLACING_MS;
    return { engine, economyOps };
  }

  if (op === "place_play") {
    if (!pk) return { engine: prev, economyOps, error: "participant_required" };
    if (engine.phase !== "placing") {
      return { engine: prev, economyOps, error: "placing_closed" };
    }
    const end = Number(engine.phaseEndsAt);
    if (!Number.isFinite(end) || t >= end) {
      return { engine: prev, economyOps, error: "placing_closed" };
    }
    const seat = engine.seats.find(s => s.participantKey === pk);
    if (!seat) return { engine: prev, economyOps, error: "not_seated" };
    const v = validatePlaySpec(payload?.playType, payload?.playValue);
    if (!v.ok) return { engine: prev, economyOps, error: v.error };
    const minStake = engine.tableStakeUnits;
    const maxStake = maxPlayForTable(minStake);
    const amt = Math.floor(Number(payload?.amount) || 0);
    if (amt < minStake || amt > maxStake) {
      return { engine: prev, economyOps, error: "invalid_amount" };
    }
    const myRound = Math.max(1, Math.floor(Number(engine.roundSeq) || 0));
    const myPlays = engine.plays.filter(
      p => String(p.participantKey || "").trim() === pk && Math.floor(Number(p.roundSeq) || 0) === myRound,
    );
    if (myPlays.length >= 12) {
      return { engine: prev, economyOps, error: "play_limit" };
    }
    engine.playSeq = Math.max(0, Math.floor(Number(engine.playSeq) || 0)) + 1;
    const playId = `r${myRound}_p${engine.playSeq}`;
    engine.plays.push({
      playId,
      participantKey: pk,
      seatIndex: seat.seatIndex,
      playType: v.playType,
      playValue: v.playValue,
      amount: amt,
      roundSeq: myRound,
    });
    economyOps.push({
      type: "commit",
      participantKey: pk,
      amount: amt,
      suffix: `cw_play_${playId}_${pk.slice(0, 8)}`,
    });
    return { engine, economyOps };
  }

  if (op === "place_plays") {
    if (!pk) return { engine: prev, economyOps, error: "participant_required" };
    if (engine.phase !== "placing") {
      return { engine: prev, economyOps, error: "placing_closed" };
    }
    const end = Number(engine.phaseEndsAt);
    if (!Number.isFinite(end) || t >= end) {
      return { engine: prev, economyOps, error: "placing_closed" };
    }
    const seat = engine.seats.find(s => s.participantKey === pk);
    if (!seat) return { engine: prev, economyOps, error: "not_seated" };

    const rawItems = Array.isArray(payload?.items) ? payload.items : [];
    if (rawItems.length === 0) {
      return { engine: prev, economyOps, error: "no_plays" };
    }

    const minStake = engine.tableStakeUnits;
    const maxStake = maxPlayForTable(minStake);
    const amt = Math.floor(Number(payload?.amount) || 0);
    if (amt < minStake || amt > maxStake) {
      return { engine: prev, economyOps, error: "invalid_amount" };
    }

    const myRound = Math.max(1, Math.floor(Number(engine.roundSeq) || 0));
    const myPlays = engine.plays.filter(
      p => String(p.participantKey || "").trim() === pk && Math.floor(Number(p.roundSeq) || 0) === myRound,
    );

    const seen = new Set();
    const validated = [];
    for (const it of rawItems) {
      const v = validatePlaySpec(it?.playType, it?.playValue);
      if (!v.ok) return { engine: prev, economyOps, error: v.error };
      const dedupeKey = `${v.playType}\0${v.playValue == null ? "" : String(v.playValue)}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      validated.push(v);
    }
    if (validated.length === 0) {
      return { engine: prev, economyOps, error: "no_plays" };
    }
    if (myPlays.length + validated.length > 12) {
      return { engine: prev, economyOps, error: "play_limit" };
    }

    for (const v of validated) {
      engine.playSeq = Math.max(0, Math.floor(Number(engine.playSeq) || 0)) + 1;
      const playId = `r${myRound}_p${engine.playSeq}`;
      engine.plays.push({
        playId,
        participantKey: pk,
        seatIndex: seat.seatIndex,
        playType: v.playType,
        playValue: v.playValue,
        amount: amt,
        roundSeq: myRound,
      });
      economyOps.push({
        type: "commit",
        participantKey: pk,
        amount: amt,
        suffix: `cw_play_${playId}_${pk.slice(0, 8)}`,
      });
    }
    return { engine, economyOps };
  }

  return { engine: prev, economyOps, error: "unknown_op" };
}
