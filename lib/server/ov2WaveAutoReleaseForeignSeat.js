/**
 * Server-side release of a participant's fixed-table seat at another room/product
 * so sit/join/private flows can proceed without ALREADY_SEATED_ELSEWHERE.
 */

import { normalizeEngine as normalizeCwEngine, mutateEngine as mutateCwEngine } from "../online-v2/color_wheel/ov2CwMultiEngine";
import { OV2_CW_PRODUCT_GAME_ID } from "../online-v2/color_wheel/ov2CwTableIds";
import { buildIdemCommit as buildCwIdemCommit, buildIdemSettle as buildCwIdemSettle } from "../online-v2/color_wheel/ov2CwEconomyIds";
import {
  applyCwEconomyOpsToVault,
  reverseCwEconomyOps,
} from "./ov2CwVaultAuthority";

import { normalizeEngine as normalizeC21Engine, mutateEngine as mutateC21Engine } from "../online-v2/c21/ov2C21MultiEngine";
import { OV2_C21_PRODUCT_GAME_ID } from "../online-v2/c21/ov2C21TableIds";
import { buildIdemCommit as buildC21IdemCommit, buildIdemSettle as buildC21IdemSettle } from "../online-v2/c21/ov2C21EconomyIds";
import {
  applyC21EconomyOpsToVault,
  reverseC21EconomyOps,
} from "./ov2C21VaultAuthority";

import {
  mutateEngine as mutateCcEngine,
  normalizePrivatePayload,
  validateCcEngineInvariants,
} from "../online-v2/community_cards/ov2CcMultiEngine";
import {
  OV2_CC_PRODUCT_GAME_ID,
  resolveOv2CcTableConfigFromRoomRow,
} from "../online-v2/community_cards/ov2CcTableIds";
import { buildIdemCommit as buildCcIdemCommit, buildIdemSettle as buildCcIdemSettle } from "../online-v2/community_cards/ov2CcEconomyIds";
import {
  applyCcEconomyOpsToVault,
  reverseCcEconomyOps,
} from "./ov2CcVaultAuthority";

import { applyWaveSeatRegistryAfterSuccess, ov2WaveFixedTableRoomIdEq } from "./ov2WaveFixedSeatRegistry";

async function deleteWaveSeatRegistryRow(admin, participantKey) {
  const pk = String(participantKey || "").trim();
  if (!pk) return;
  await admin.from("ov2_wave_fixed_active_seat").delete().eq("participant_key", pk);
}

async function persistCwEconomyOps(admin, roomId, matchSeq, economyOps, callerParticipantKey) {
  const callerPk = String(callerParticipantKey || "").trim();
  const vaultEffects = [];
  for (const op of economyOps) {
    if (op.type === "commit") {
      const idem = buildCwIdemCommit(roomId, matchSeq, op.suffix);
      const { error } = await admin.from("ov2_economy_events").insert({
        room_id: roomId,
        participant_key: op.participantKey,
        event_kind: "commit",
        amount: Math.max(0, Math.floor(Number(op.amount) || 0)),
        match_seq: matchSeq,
        idempotency_key: idem,
        payload: { product: OV2_CW_PRODUCT_GAME_ID, suffix: op.suffix },
      });
      const dup =
        error &&
        (error.code === "23505" || String(error.message || "").toLowerCase().includes("duplicate"));
      if (error && !dup) {
        throw new Error(error.message || "economy_commit_failed");
      }
    } else if (op.type === "credit") {
      const idem = buildCwIdemSettle(roomId, matchSeq, op.suffix);
      const lineKind = String(op.lineKind || "MATCH_PAYOUT").trim() || "MATCH_PAYOUT";
      const amt = Math.max(0, Math.floor(Number(op.amount) || 0));
      if (amt <= 0) continue;
      const { error } = await admin.from("ov2_settlement_lines").insert({
        room_id: roomId,
        match_seq: matchSeq,
        recipient_participant_key: op.participantKey,
        line_kind: lineKind,
        amount: amt,
        idempotency_key: idem,
        meta: { product: OV2_CW_PRODUCT_GAME_ID, suffix: op.suffix },
      });
      const dup =
        error &&
        (error.code === "23505" || String(error.message || "").toLowerCase().includes("duplicate"));
      if (error && !dup) {
        throw new Error(error.message || "settlement_insert_failed");
      }
      if (!error && String(op.participantKey || "").trim() !== callerPk) {
        vaultEffects.push({
          kind: "credit",
          amount: amt,
          gameId: OV2_CW_PRODUCT_GAME_ID,
          idempotencyKey: idem,
          participantKey: String(op.participantKey || "").trim(),
        });
      }
    }
  }
  return vaultEffects;
}

async function persistC21EconomyOps(admin, roomId, matchSeq, economyOps, callerParticipantKey) {
  const callerPk = String(callerParticipantKey || "").trim();
  const vaultEffects = [];
  for (const op of economyOps) {
    if (op.type === "commit") {
      const idem = buildC21IdemCommit(roomId, matchSeq, op.suffix);
      const { error } = await admin.from("ov2_economy_events").insert({
        room_id: roomId,
        participant_key: op.participantKey,
        event_kind: "commit",
        amount: Math.max(0, Math.floor(Number(op.amount) || 0)),
        match_seq: matchSeq,
        idempotency_key: idem,
        payload: { product: OV2_C21_PRODUCT_GAME_ID, suffix: op.suffix },
      });
      const dup =
        error &&
        (error.code === "23505" || String(error.message || "").toLowerCase().includes("duplicate"));
      if (error && !dup) {
        throw new Error(error.message || "economy_commit_failed");
      }
    } else if (op.type === "credit") {
      const idem = buildC21IdemSettle(roomId, matchSeq, op.suffix);
      const lineKind = String(op.lineKind || "MATCH_PAYOUT").trim() || "MATCH_PAYOUT";
      const amt = Math.max(0, Math.floor(Number(op.amount) || 0));
      if (amt <= 0) continue;
      const { error } = await admin.from("ov2_settlement_lines").insert({
        room_id: roomId,
        match_seq: matchSeq,
        recipient_participant_key: op.participantKey,
        line_kind: lineKind,
        amount: amt,
        idempotency_key: idem,
        meta: { product: OV2_C21_PRODUCT_GAME_ID, suffix: op.suffix },
      });
      const dup =
        error &&
        (error.code === "23505" || String(error.message || "").toLowerCase().includes("duplicate"));
      if (error && !dup) {
        throw new Error(error.message || "settlement_insert_failed");
      }
      if (!error && String(op.participantKey || "").trim() !== callerPk) {
        vaultEffects.push({
          kind: "credit",
          amount: amt,
          gameId: OV2_C21_PRODUCT_GAME_ID,
          idempotencyKey: idem,
          participantKey: String(op.participantKey || "").trim(),
        });
      }
    }
  }
  return vaultEffects;
}

async function persistCcEconomyOps(admin, roomId, matchSeq, economyOps, callerParticipantKey) {
  const callerPk = String(callerParticipantKey || "").trim();
  const vaultEffects = [];
  for (const op of economyOps) {
    if (op.type === "commit") {
      const idem = buildCcIdemCommit(roomId, matchSeq, op.suffix);
      const { error } = await admin.from("ov2_economy_events").insert({
        room_id: roomId,
        participant_key: op.participantKey,
        event_kind: "commit",
        amount: Math.max(0, Math.floor(Number(op.amount) || 0)),
        match_seq: matchSeq,
        idempotency_key: idem,
        payload: { product: OV2_CC_PRODUCT_GAME_ID, suffix: op.suffix },
      });
      const dup =
        error &&
        (error.code === "23505" || String(error.message || "").toLowerCase().includes("duplicate"));
      if (error && !dup) {
        throw new Error(error.message || "economy_commit_failed");
      }
    } else if (op.type === "credit") {
      const idem = buildCcIdemSettle(roomId, matchSeq, op.suffix);
      const lineKind = String(op.lineKind || "MATCH_PAYOUT").trim() || "MATCH_PAYOUT";
      const amt = Math.max(0, Math.floor(Number(op.amount) || 0));
      if (amt <= 0) continue;
      const { error } = await admin.from("ov2_settlement_lines").insert({
        room_id: roomId,
        match_seq: matchSeq,
        recipient_participant_key: op.participantKey,
        line_kind: lineKind,
        amount: amt,
        idempotency_key: idem,
        meta: { product: OV2_CC_PRODUCT_GAME_ID, suffix: op.suffix },
      });
      const dup =
        error &&
        (error.code === "23505" || String(error.message || "").toLowerCase().includes("duplicate"));
      if (error && !dup) {
        throw new Error(error.message || "settlement_insert_failed");
      }
      if (!error && String(op.participantKey || "").trim() !== callerPk) {
        vaultEffects.push({
          kind: "credit",
          amount: amt,
          gameId: OV2_CC_PRODUCT_GAME_ID,
          idempotencyKey: idem,
          participantKey: String(op.participantKey || "").trim(),
        });
      }
    }
  }
  return vaultEffects;
}

async function releaseCwSeatAtRoom(admin, roomId, participantKey) {
  const pk = String(participantKey || "").trim();
  const { data: roomRow, error: roomErr } = await admin
    .from("ov2_rooms")
    .select("id, product_game_id, stake_per_seat, is_private, meta")
    .eq("id", roomId)
    .maybeSingle();
  if (roomErr || !roomRow || String(roomRow.product_game_id) !== OV2_CW_PRODUCT_GAME_ID) {
    await deleteWaveSeatRegistryRow(admin, pk);
    return { ok: true };
  }
  const tableStake = Math.max(1, Math.floor(Number(roomRow.stake_per_seat) || 1));
  const maxAttempts = 6;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data: liveRow, error: liveErr } = await admin
      .from("ov2_color_wheel_live_state")
      .select("room_id, match_seq, revision, engine")
      .eq("room_id", roomId)
      .maybeSingle();
    if (liveErr || !liveRow) {
      return { ok: false, code: "AUTO_RELEASE_LIVE_MISSING", message: liveErr?.message || "cw_live_missing" };
    }
    const engine = normalizeCwEngine(liveRow.engine, tableStake);
    const beforeEngine = JSON.parse(JSON.stringify(engine));
    const prevRevision = Math.max(0, Math.floor(Number(liveRow.revision) || 0));
    const matchSeqBefore = Math.max(0, Math.floor(Number(liveRow.match_seq) || 0));
    const result = mutateCwEngine(engine, {
      op: "leave_seat",
      participantKey: pk,
      payload: {},
      now: Date.now(),
    });
    if (result.error === "not_seated") {
      await deleteWaveSeatRegistryRow(admin, pk);
      return { ok: true };
    }
    if (result.error) {
      return { ok: false, code: result.error, message: String(result.error) };
    }
    const nextEngine = result.engine;
    const economyOps = result.economyOps || [];
    const roundForEconomy = Math.max(matchSeqBefore, Math.floor(Number(nextEngine.roundSeq) || 0));
    const { data: updated, error: upErr } = await admin
      .from("ov2_color_wheel_live_state")
      .update({
        engine: nextEngine,
        match_seq: Math.floor(Number(nextEngine.roundSeq) || 0),
        revision: prevRevision + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("room_id", roomId)
      .eq("revision", prevRevision)
      .select("room_id, match_seq, revision")
      .maybeSingle();
    if (upErr) {
      return { ok: false, code: "AUTO_RELEASE_PERSIST_FAILED", message: upErr.message };
    }
    if (!updated) continue;
    if (economyOps.length) {
      const vaultRes = await applyCwEconomyOpsToVault(admin, roomId, roundForEconomy, economyOps);
      if (!vaultRes.ok) {
        await admin
          .from("ov2_color_wheel_live_state")
          .update({
            engine: beforeEngine,
            match_seq: Math.max(0, Math.floor(Number(beforeEngine.roundSeq) || 0)),
            revision: prevRevision + 2,
            updated_at: new Date().toISOString(),
          })
          .eq("room_id", roomId)
          .eq("revision", prevRevision + 1);
        return { ok: false, code: vaultRes.code || "vault_failed", message: vaultRes.message };
      }
    }
    if (economyOps.length) {
      try {
        await persistCwEconomyOps(admin, roomId, roundForEconomy, economyOps, pk);
      } catch (e) {
        await reverseCwEconomyOps(admin, roomId, roundForEconomy, economyOps);
        await admin
          .from("ov2_color_wheel_live_state")
          .update({
            engine: beforeEngine,
            match_seq: Math.max(0, Math.floor(Number(beforeEngine.roundSeq) || 0)),
            revision: prevRevision + 2,
            updated_at: new Date().toISOString(),
          })
          .eq("room_id", roomId)
          .eq("revision", prevRevision + 1);
        return { ok: false, code: "AUTO_RELEASE_ECONOMY_FAILED", message: e?.message || String(e) };
      }
    }
    await applyWaveSeatRegistryAfterSuccess(admin, OV2_CW_PRODUCT_GAME_ID, roomId, roomRow, beforeEngine, nextEngine);
    await admin.from("ov2_wave_fixed_active_seat").delete().eq("participant_key", pk).eq("room_id", roomId);
    return { ok: true };
  }
  return { ok: false, code: "AUTO_RELEASE_REVISION_CONFLICT", message: "cw_release_conflict" };
}

async function releaseC21SeatAtRoom(admin, roomId, participantKey) {
  const pk = String(participantKey || "").trim();
  const { data: roomRow, error: roomErr } = await admin
    .from("ov2_rooms")
    .select("id, product_game_id, stake_per_seat, is_private, meta")
    .eq("id", roomId)
    .maybeSingle();
  if (roomErr || !roomRow || String(roomRow.product_game_id) !== OV2_C21_PRODUCT_GAME_ID) {
    await deleteWaveSeatRegistryRow(admin, pk);
    return { ok: true };
  }
  const tableStake = Math.max(10, Math.floor(Number(roomRow.stake_per_seat) || 10));
  const maxAttempts = 6;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data: liveRow, error: liveErr } = await admin
      .from("ov2_c21_live_state")
      .select("room_id, match_seq, revision, engine")
      .eq("room_id", roomId)
      .maybeSingle();
    if (liveErr || !liveRow) {
      return { ok: false, code: "AUTO_RELEASE_LIVE_MISSING", message: liveErr?.message || "c21_live_missing" };
    }
    const engine = normalizeC21Engine(liveRow.engine, tableStake);
    const beforeEngine = JSON.parse(JSON.stringify(engine));
    const prevRevision = Math.max(0, Math.floor(Number(liveRow.revision) || 0));
    const matchSeqBefore = Math.max(0, Math.floor(Number(liveRow.match_seq) || 0));
    const result = mutateC21Engine(engine, {
      op: "leave_seat",
      participantKey: pk,
      payload: {},
      now: Date.now(),
    });
    if (result.error === "not_seated") {
      await deleteWaveSeatRegistryRow(admin, pk);
      return { ok: true };
    }
    if (result.error) {
      return { ok: false, code: result.error, message: String(result.error) };
    }
    const nextEngine = result.engine;
    const economyOps = result.economyOps || [];
    const roundForEconomy = Math.max(matchSeqBefore, Math.floor(Number(nextEngine.roundSeq) || 0));
    const { data: updated, error: upErr } = await admin
      .from("ov2_c21_live_state")
      .update({
        engine: nextEngine,
        match_seq: Math.floor(Number(nextEngine.roundSeq) || 0),
        revision: prevRevision + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("room_id", roomId)
      .eq("revision", prevRevision)
      .select("room_id, match_seq, revision")
      .maybeSingle();
    if (upErr) {
      return { ok: false, code: "AUTO_RELEASE_PERSIST_FAILED", message: upErr.message };
    }
    if (!updated) continue;
    if (economyOps.length) {
      const vaultRes = await applyC21EconomyOpsToVault(admin, roomId, roundForEconomy, economyOps);
      if (!vaultRes.ok) {
        await admin
          .from("ov2_c21_live_state")
          .update({
            engine: beforeEngine,
            match_seq: Math.max(0, Math.floor(Number(beforeEngine.roundSeq) || 0)),
            revision: prevRevision + 2,
            updated_at: new Date().toISOString(),
          })
          .eq("room_id", roomId)
          .eq("revision", prevRevision + 1);
        return { ok: false, code: vaultRes.code || "vault_failed", message: vaultRes.message };
      }
    }
    if (economyOps.length) {
      try {
        await persistC21EconomyOps(admin, roomId, roundForEconomy, economyOps, pk);
      } catch (e) {
        await reverseC21EconomyOps(admin, roomId, roundForEconomy, economyOps);
        await admin
          .from("ov2_c21_live_state")
          .update({
            engine: beforeEngine,
            match_seq: Math.max(0, Math.floor(Number(beforeEngine.roundSeq) || 0)),
            revision: prevRevision + 2,
            updated_at: new Date().toISOString(),
          })
          .eq("room_id", roomId)
          .eq("revision", prevRevision + 1);
        return { ok: false, code: "AUTO_RELEASE_ECONOMY_FAILED", message: e?.message || String(e) };
      }
    }
    await applyWaveSeatRegistryAfterSuccess(admin, OV2_C21_PRODUCT_GAME_ID, roomId, roomRow, beforeEngine, nextEngine);
    await admin.from("ov2_wave_fixed_active_seat").delete().eq("participant_key", pk).eq("room_id", roomId);
    return { ok: true };
  }
  return { ok: false, code: "AUTO_RELEASE_REVISION_CONFLICT", message: "c21_release_conflict" };
}

async function releaseCcSeatAtRoom(admin, roomId, participantKey) {
  const pk = String(participantKey || "").trim();
  const { data: roomRow, error: roomErr } = await admin
    .from("ov2_rooms")
    .select("id, product_game_id, stake_per_seat, meta, is_private")
    .eq("id", roomId)
    .maybeSingle();
  if (roomErr || !roomRow || String(roomRow.product_game_id) !== OV2_CC_PRODUCT_GAME_ID) {
    await deleteWaveSeatRegistryRow(admin, pk);
    return { ok: true };
  }
  const config = resolveOv2CcTableConfigFromRoomRow(roomRow);
  if (!config) {
    await deleteWaveSeatRegistryRow(admin, pk);
    return { ok: true };
  }
  const maxAttempts = 6;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data: liveRow, error: liveErr } = await admin
      .from("ov2_community_cards_live_state")
      .select("room_id, match_seq, revision, engine")
      .eq("room_id", roomId)
      .maybeSingle();
    if (liveErr || !liveRow) {
      return { ok: false, code: "AUTO_RELEASE_LIVE_MISSING", message: liveErr?.message || "cc_live_missing" };
    }
    const { data: privRow } = await admin
      .from("ov2_community_cards_private")
      .select("room_id, revision, payload")
      .eq("room_id", roomId)
      .maybeSingle();
    const privatePayload = normalizePrivatePayload(privRow?.payload);
    const prevPrivateStr = JSON.stringify(privatePayload);
    const engine = liveRow.engine;
    const beforeEngine = JSON.parse(JSON.stringify(engine));
    const prevRevision = Math.max(0, Math.floor(Number(liveRow.revision) || 0));
    const matchSeqBefore = Math.max(0, Math.floor(Number(liveRow.match_seq) || 0));
    const result = mutateCcEngine(engine, privatePayload, {
      op: "leave_seat",
      participantKey: pk,
      payload: {},
      now: Date.now(),
      config,
    });
    if (result.leaveNotSeatedNoop) {
      await deleteWaveSeatRegistryRow(admin, pk);
      return { ok: true };
    }
    if (result.error) {
      return { ok: false, code: result.error, message: String(result.error) };
    }
    const nextEngine = result.engine;
    const nextPrivate = result.privatePayload;
    const economyOps = result.economyOps || [];
    const roundForEconomy = Math.max(matchSeqBefore, Math.floor(Number(nextEngine.handSeq) || 0));
    const invErr = validateCcEngineInvariants(nextEngine);
    if (invErr) {
      return { ok: false, code: invErr, message: String(invErr) };
    }
    const { data: updated, error: upErr } = await admin
      .from("ov2_community_cards_live_state")
      .update({
        engine: nextEngine,
        match_seq: Math.floor(Number(nextEngine.handSeq) || 0),
        revision: prevRevision + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("room_id", roomId)
      .eq("revision", prevRevision)
      .select("room_id, match_seq, revision")
      .maybeSingle();
    if (upErr) {
      return { ok: false, code: "AUTO_RELEASE_PERSIST_FAILED", message: upErr.message };
    }
    if (!updated) continue;
    const { error: privUpErr } = await admin.from("ov2_community_cards_private").upsert(
      {
        room_id: roomId,
        revision: prevRevision + 1,
        payload: nextPrivate,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "room_id" },
    );
    if (privUpErr) {
      await admin
        .from("ov2_community_cards_live_state")
        .update({
          engine: beforeEngine,
          match_seq: Math.max(0, Math.floor(Number(beforeEngine.handSeq) || 0)),
          revision: prevRevision + 2,
          updated_at: new Date().toISOString(),
        })
        .eq("room_id", roomId)
        .eq("revision", prevRevision + 1);
      return { ok: false, code: "AUTO_RELEASE_PRIVATE_FAILED", message: privUpErr.message };
    }
    if (economyOps.length) {
      const vaultRes = await applyCcEconomyOpsToVault(admin, roomId, roundForEconomy, economyOps);
      if (!vaultRes.ok) {
        await admin
          .from("ov2_community_cards_live_state")
          .update({
            engine: beforeEngine,
            match_seq: Math.max(0, Math.floor(Number(beforeEngine.handSeq) || 0)),
            revision: prevRevision + 2,
            updated_at: new Date().toISOString(),
          })
          .eq("room_id", roomId)
          .eq("revision", prevRevision + 1);
        await admin.from("ov2_community_cards_private").upsert({
          room_id: roomId,
          revision: prevRevision + 2,
          payload: JSON.parse(prevPrivateStr),
          updated_at: new Date().toISOString(),
        });
        return { ok: false, code: vaultRes.code || "vault_failed", message: vaultRes.message };
      }
    }
    if (economyOps.length) {
      try {
        await persistCcEconomyOps(admin, roomId, roundForEconomy, economyOps, pk);
      } catch (e) {
        await reverseCcEconomyOps(admin, roomId, roundForEconomy, economyOps);
        await admin
          .from("ov2_community_cards_live_state")
          .update({
            engine: beforeEngine,
            match_seq: Math.max(0, Math.floor(Number(beforeEngine.handSeq) || 0)),
            revision: prevRevision + 2,
            updated_at: new Date().toISOString(),
          })
          .eq("room_id", roomId)
          .eq("revision", prevRevision + 1);
        await admin.from("ov2_community_cards_private").upsert({
          room_id: roomId,
          revision: prevRevision + 2,
          payload: JSON.parse(prevPrivateStr),
          updated_at: new Date().toISOString(),
        });
        return { ok: false, code: "AUTO_RELEASE_ECONOMY_FAILED", message: e?.message || String(e) };
      }
    }
    await applyWaveSeatRegistryAfterSuccess(admin, OV2_CC_PRODUCT_GAME_ID, roomId, roomRow, beforeEngine, nextEngine);
    await admin.from("ov2_wave_fixed_active_seat").delete().eq("participant_key", pk).eq("room_id", roomId);
    return { ok: true };
  }
  return { ok: false, code: "AUTO_RELEASE_REVISION_CONFLICT", message: "cc_release_conflict" };
}

/**
 * If registry lists another room for this participant, run authoritative leave_seat there first.
 * @param {import("@supabase/supabase-js").SupabaseClient} admin
 * @param {string|null|undefined} exceptRoomId - do not release when registry already matches this room (target / same private room)
 */
export async function autoReleaseForeignWaveFixedSeat(admin, participantKey, exceptRoomId) {
  const pk = String(participantKey || "").trim();
  if (!pk) return { ok: true };
  const { data, error } = await admin
    .from("ov2_wave_fixed_active_seat")
    .select("room_id, product_game_id")
    .eq("participant_key", pk)
    .maybeSingle();
  if (error) {
    return { ok: false, code: "SEAT_REGISTRY_READ_FAILED", message: error.message || "seat_registry_read_failed" };
  }
  if (!data) return { ok: true };
  if (exceptRoomId != null && ov2WaveFixedTableRoomIdEq(data.room_id, exceptRoomId)) return { ok: true };
  const rid = String(data.room_id);
  const pid = String(data.product_game_id || "").trim();
  if (pid === OV2_CW_PRODUCT_GAME_ID) return releaseCwSeatAtRoom(admin, rid, pk);
  if (pid === OV2_C21_PRODUCT_GAME_ID) return releaseC21SeatAtRoom(admin, rid, pk);
  if (pid === OV2_CC_PRODUCT_GAME_ID) return releaseCcSeatAtRoom(admin, rid, pk);
  await deleteWaveSeatRegistryRow(admin, pk);
  return { ok: true };
}
