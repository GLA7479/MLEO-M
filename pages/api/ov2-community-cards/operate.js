import { getSupabaseAdmin } from "../../../lib/server/supabaseAdmin";
import { getArcadeDevice } from "../../../lib/server/arcadeDeviceCookie";
import { upsertOv2CcParticipantDevice } from "../../../lib/server/ov2CcParticipantDevice";
import {
  mutateEngine,
  normalizePrivatePayload,
  buildPublicEngineView,
  extractViewerHoleCards,
} from "../../../lib/online-v2/community_cards/ov2CcMultiEngine";
import {
  OV2_CC_PRODUCT_GAME_ID,
  resolveOv2CcTableConfigFromRoomRow,
} from "../../../lib/online-v2/community_cards/ov2CcTableIds";
import { buildIdemCommit, buildIdemSettle } from "../../../lib/online-v2/community_cards/ov2CcEconomyIds";
import {
  applyCcEconomyOpsToVault,
  getArcadeVaultBalanceForRequest,
  reverseCcEconomyOps,
} from "../../../lib/server/ov2CcVaultAuthority";

async function persistEconomyOps(admin, roomId, matchSeq, economyOps, callerParticipantKey) {
  const callerPk = String(callerParticipantKey || "").trim();
  const vaultEffects = [];
  for (const op of economyOps) {
    if (op.type === "commit") {
      const idem = buildIdemCommit(roomId, matchSeq, op.suffix);
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
      const idem = buildIdemSettle(roomId, matchSeq, op.suffix);
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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ ok: false, code: "INVALID_JSON" });
    }
  }

  const roomId = String(body?.roomId || "").trim();
  const op = String(body?.op || "").trim();
  const participantKey = String(body?.participantKey || "").trim();
  const payload = body?.payload && typeof body.payload === "object" ? body.payload : {};

  if (!roomId) {
    return res.status(400).json({ ok: false, code: "ROOM_REQUIRED" });
  }
  if (!op) {
    return res.status(400).json({ ok: false, code: "OP_REQUIRED" });
  }

  try {
    const admin = getSupabaseAdmin();

    const { data: roomRow, error: roomErr } = await admin
      .from("ov2_rooms")
      .select("id, product_game_id, stake_per_seat, meta")
      .eq("id", roomId)
      .maybeSingle();

    if (roomErr || !roomRow) {
      return res.status(404).json({ ok: false, code: "ROOM_NOT_FOUND" });
    }
    if (String(roomRow.product_game_id) !== OV2_CC_PRODUCT_GAME_ID) {
      return res.status(400).json({ ok: false, code: "NOT_CC_TABLE" });
    }

    const config = resolveOv2CcTableConfigFromRoomRow(roomRow);
    if (!config) {
      return res.status(500).json({ ok: false, code: "TABLE_CONFIG_MISSING" });
    }

    if (op === "sit") {
      if (!participantKey) {
        return res.status(400).json({ ok: false, code: "participant_required" });
      }
      const buyIn = Math.max(0, Math.floor(Number(payload.buyIn) || 0));
      if (buyIn < config.tablePrice || buyIn > config.maxBuyin) {
        return res.status(400).json({ ok: false, code: "buyin_out_of_range" });
      }
      const bal = await getArcadeVaultBalanceForRequest(req);
      if (bal.code === "device_required") {
        return res.status(401).json({ ok: false, code: "DEVICE_REQUIRED" });
      }
      if (!bal.ok) {
        return res.status(400).json({ ok: false, code: bal.code || "VAULT_READ_FAILED" });
      }
      if (bal.balance < buyIn) {
        return res.status(400).json({ ok: false, code: "insufficient_vault_for_buyin" });
      }
    }

    if (op === "top_up") {
      if (!participantKey) {
        return res.status(400).json({ ok: false, code: "participant_required" });
      }
      const add = Math.max(0, Math.floor(Number(payload.amount) || 0));
      if (add <= 0) {
        return res.status(400).json({ ok: false, code: "bad_amount" });
      }
      const bal = await getArcadeVaultBalanceForRequest(req);
      if (bal.code === "device_required") {
        return res.status(401).json({ ok: false, code: "DEVICE_REQUIRED" });
      }
      if (!bal.ok) {
        return res.status(400).json({ ok: false, code: bal.code || "VAULT_READ_FAILED" });
      }
      if (bal.balance < add) {
        return res.status(400).json({ ok: false, code: "insufficient_vault_for_topup" });
      }
    }

    const callerDeviceId = getArcadeDevice(req);
    if (participantKey && callerDeviceId) {
      const bind = await upsertOv2CcParticipantDevice(admin, roomId, participantKey, callerDeviceId);
      if (!bind.ok) {
        return res.status(500).json({
          ok: false,
          code: "CC_DEVICE_BINDING_FAILED",
          message: bind.message || "Failed to persist participant device binding",
        });
      }
    }

    const maxAttempts = 4;
    let lastConflict = false;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const { data: liveRow, error: liveErr } = await admin
        .from("ov2_community_cards_live_state")
        .select("room_id, match_seq, revision, engine")
        .eq("room_id", roomId)
        .maybeSingle();

      if (liveErr || !liveRow) {
        return res.status(500).json({ ok: false, code: "LIVE_STATE_MISSING" });
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

      const result = mutateEngine(engine, privatePayload, {
        op,
        participantKey,
        payload,
        now: Date.now(),
        config,
      });

      if (result.error) {
        return res.status(400).json({ ok: false, code: result.error });
      }

      const nextEngine = result.engine;
      const nextPrivate = result.privatePayload;
      const economyOps = result.economyOps || [];
      const roundForEconomy = Math.max(matchSeqBefore, Math.floor(Number(nextEngine.handSeq) || 0));

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
        return res.status(500).json({ ok: false, code: "PERSIST_FAILED", message: upErr.message });
      }

      if (!updated) {
        lastConflict = true;
        continue;
      }

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
        return res.status(500).json({ ok: false, code: "PRIVATE_PERSIST_FAILED", message: privUpErr.message });
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
          return res.status(400).json({
            ok: false,
            code: vaultRes.code || "vault_failed",
            message: vaultRes.message,
          });
        }
      }

      let vaultEffects = [];
      if (economyOps.length) {
        try {
          vaultEffects = await persistEconomyOps(admin, roomId, roundForEconomy, economyOps, participantKey);
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
          if (e?.message) {
            return res.status(500).json({
              ok: false,
              code: "ECONOMY_PERSIST_FAILED",
              message: e.message,
            });
          }
          return res.status(500).json({
            ok: false,
            code: "ECONOMY_PERSIST_FAILED",
            message: String(e),
          });
        }
      }

      const localVaultRefreshHint = economyOps.some(
        o => o && o.type === "credit" && String(o.participantKey || "").trim() !== participantKey,
      );

      const pkTrim = String(participantKey || "").trim();
      const vaultTouchedForCaller =
        Boolean(pkTrim) &&
        (economyOps || []).some(
          o =>
            o &&
            (o.type === "commit" || o.type === "credit") &&
            String(o.participantKey || "").trim() === pkTrim,
        );

      const publicEngine = buildPublicEngineView(nextEngine, nextPrivate);
      const viewerHoleCards = extractViewerHoleCards(nextPrivate, nextEngine, participantKey);

      return res.status(200).json({
        ok: true,
        engine: publicEngine,
        viewerHoleCards,
        revision: updated.revision,
        matchSeq: updated.match_seq,
        vaultEffects,
        localVaultRefreshHint,
        vaultTouchedForCaller,
      });
    }

    return res.status(409).json({ ok: false, code: "REVISION_CONFLICT", retried: lastConflict });
  } catch (e) {
    const msg = e?.message || String(e);
    return res.status(500).json({ ok: false, code: "SERVER_ERROR", message: msg });
  }
}
