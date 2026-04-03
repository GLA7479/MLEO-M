import { getSupabaseAdmin } from "../../../lib/server/supabaseAdmin";
import { getArcadeDevice } from "../../../lib/server/arcadeDeviceCookie";
import { upsertOv2CcParticipantDevice } from "../../../lib/server/ov2CcParticipantDevice";
import {
  mutateEngine,
  normalizePrivatePayload,
  buildPublicEngineView,
  extractViewerHoleCards,
  validateCcEngineInvariants,
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

function ccOperateLog(entry) {
  try {
    console.log(
      "[ov2-cc-operate]",
      JSON.stringify({
        receivedAt: Date.now(),
        ...entry,
      }),
    );
  } catch {
    /* ignore */
  }
}

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
  const clientOpId = String(body?.clientOpId || "").trim();
  const clientRevisionRaw = body?.clientRevision;
  const clientRevision =
    clientRevisionRaw == null ? null : Math.max(0, Math.floor(Number(clientRevisionRaw) || 0));

  if (!roomId) {
    return res.status(400).json({ ok: false, code: "ROOM_REQUIRED" });
  }
  if (!op) {
    return res.status(400).json({ ok: false, code: "OP_REQUIRED" });
  }

  const reqT0 = Date.now();
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

    const maxAttempts = 6;
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
      const prevRevision = Math.max(0, Math.floor(Number(liveRow.revision) || 0));
      const matchSeqBefore = Math.max(0, Math.floor(Number(liveRow.match_seq) || 0));

      if (clientOpId && op !== "tick" && engine?.lastClientOpId === clientOpId) {
        const publicEngine = buildPublicEngineView(engine, privatePayload);
        const viewerHoleCards = extractViewerHoleCards(privatePayload, engine, participantKey);
        const actorSeat =
          participantKey && Array.isArray(engine?.seats)
            ? engine.seats.findIndex(s => s && s.participantKey === participantKey)
            : null;
        ccOperateLog({
          tableId: roomId,
          op,
          clientOpId,
          clientRevision,
          serverRevision: prevRevision,
          actorSeat: actorSeat >= 0 ? actorSeat : null,
          actionDeadline: engine?.actionDeadline ?? null,
          duplicateAbsorbed: true,
          autoRetry: false,
        });
        return res.status(200).json({
          ok: true,
          duplicateAbsorbed: true,
          engine: publicEngine,
          viewerHoleCards,
          revision: prevRevision,
          matchSeq: matchSeqBefore,
          vaultEffects: [],
          localVaultRefreshHint: false,
          vaultTouchedForCaller: false,
        });
      }

      const beforeEngine = JSON.parse(JSON.stringify(engine));

      const result = mutateEngine(engine, privatePayload, {
        op,
        participantKey,
        payload,
        now: Date.now(),
        config,
      });

      if (result.leaveNotSeatedNoop) {
        const publicEngine = buildPublicEngineView(result.engine, result.privatePayload);
        const viewerHoleCards = extractViewerHoleCards(result.privatePayload, result.engine, participantKey);
        ccOperateLog({
          tableId: roomId,
          op,
          leaveNotSeatedNoop: true,
          serverRevision: prevRevision,
        });
        return res.status(200).json({
          ok: true,
          leaveNotSeatedNoop: true,
          engine: publicEngine,
          viewerHoleCards,
          revision: prevRevision,
          matchSeq: matchSeqBefore,
          vaultEffects: [],
          localVaultRefreshHint: false,
          vaultTouchedForCaller: false,
        });
      }

      if (result.error) {
        const errEng = result.engine;
        const errPriv = result.privatePayload;
        const publicEngine = buildPublicEngineView(errEng, errPriv);
        const viewerHoleCardsErr = extractViewerHoleCards(errPriv, errEng, participantKey);
        const actorSeat =
          participantKey && Array.isArray(errEng?.seats)
            ? errEng.seats.findIndex(s => s && s.participantKey === participantKey)
            : null;
        const logEntry = {
          tableId: roomId,
          op,
          clientOpId: clientOpId || null,
          clientRevision,
          serverRevision: prevRevision,
          actorSeat: actorSeat >= 0 ? actorSeat : null,
          actionDeadline: errEng?.actionDeadline ?? null,
          mutateError: result.error,
        };
        if (op === "tick") {
          const live = (errEng?.seats || []).filter(s => s && s.inCurrentHand && !s.folded);
          Object.assign(logEntry, {
            tickMutateFailed: true,
            handSeq: errEng?.handSeq,
            phase: errEng?.phase,
            street: errEng?.street,
            boardLen: (errEng?.communityCards || []).length,
            board: errEng?.communityCards,
            pot: errEng?.pot,
            deckRemaining: Array.isArray(errPriv?.deck) ? errPriv.deck.length : null,
            liveSeatCount: live.length,
            liveSeats: live.map(s => ({
              seatIndex: s.seatIndex,
              allIn: !!s.allIn,
            })),
          });
        }
        ccOperateLog(logEntry);
        return res.status(400).json({
          ok: false,
          code: result.error,
          engine: publicEngine,
          viewerHoleCards: viewerHoleCardsErr,
          revision: prevRevision,
        });
      }

      const nextEngine = result.engine;
      const nextPrivate = result.privatePayload;
      const economyOps = result.economyOps || [];
      const roundForEconomy = Math.max(matchSeqBefore, Math.floor(Number(nextEngine.handSeq) || 0));

      const invErr = validateCcEngineInvariants(nextEngine);
      if (invErr) {
        return res.status(500).json({ ok: false, code: invErr });
      }

      if (
        op === "tick" &&
        economyOps.length === 0 &&
        JSON.stringify(beforeEngine) === JSON.stringify(nextEngine) &&
        prevPrivateStr === JSON.stringify(nextPrivate)
      ) {
        const publicEngine = buildPublicEngineView(engine, privatePayload);
        const viewerHoleCards = extractViewerHoleCards(privatePayload, engine, participantKey);
        ccOperateLog({
          tableId: roomId,
          op: "tick",
          tickNoop: true,
          serverRevision: prevRevision,
        });
        return res.status(200).json({
          ok: true,
          tickNoop: true,
          engine: publicEngine,
          viewerHoleCards,
          revision: prevRevision,
          matchSeq: matchSeqBefore,
          vaultEffects: [],
          localVaultRefreshHint: false,
          vaultTouchedForCaller: false,
        });
      }

      if (clientOpId && op !== "tick") {
        nextEngine.lastClientOpId = clientOpId;
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
        return res.status(500).json({ ok: false, code: "PERSIST_FAILED", message: upErr.message });
      }

      if (!updated) {
        lastConflict = true;
        const actorSeat =
          participantKey && Array.isArray(engine?.seats)
            ? engine.seats.findIndex(s => s && s.participantKey === participantKey)
            : null;
        ccOperateLog({
          tableId: roomId,
          op,
          attempt,
          clientOpId: clientOpId || null,
          clientRevision,
          serverRevision: prevRevision,
          actorSeat: actorSeat >= 0 ? actorSeat : null,
          actionDeadline: engine?.actionDeadline ?? null,
          revisionConflict: true,
        });
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

      const actorSeatOk =
        participantKey && Array.isArray(nextEngine?.seats)
          ? nextEngine.seats.findIndex(s => s && s.participantKey === participantKey)
          : null;
      ccOperateLog({
        tableId: roomId,
        op,
        clientOpId: clientOpId || null,
        clientRevision,
        serverRevision: updated.revision,
        actorSeat: actorSeatOk >= 0 ? actorSeatOk : null,
        actionDeadline: nextEngine?.actionDeadline ?? null,
        persisted: true,
        attempt,
        serverLoopRetry: attempt > 0,
        requestDurationMs: Date.now() - reqT0,
      });

      return res.status(200).json({
        ok: true,
        engine: publicEngine,
        viewerHoleCards,
        revision: updated.revision,
        matchSeq: updated.match_seq,
        vaultEffects,
        localVaultRefreshHint,
        vaultTouchedForCaller,
        serverLoopRetry: attempt > 0,
      });
    }

    let conflictBody = { ok: false, code: "REVISION_CONFLICT", retried: lastConflict };
    try {
      const { data: snapLive, error: snapErr } = await admin
        .from("ov2_community_cards_live_state")
        .select("engine, match_seq, revision")
        .eq("room_id", roomId)
        .maybeSingle();
      if (!snapErr && snapLive?.engine && typeof snapLive.engine === "object") {
        const { data: snapPriv } = await admin
          .from("ov2_community_cards_private")
          .select("payload")
          .eq("room_id", roomId)
          .maybeSingle();
        const privSnap = normalizePrivatePayload(snapPriv?.payload);
        conflictBody.engine = buildPublicEngineView(snapLive.engine, privSnap);
        conflictBody.viewerHoleCards = extractViewerHoleCards(privSnap, snapLive.engine, participantKey);
        conflictBody.revision = Math.max(0, Math.floor(Number(snapLive.revision) || 0));
        conflictBody.matchSeq = Math.max(0, Math.floor(Number(snapLive.match_seq) || 0));
      }
    } catch {
      /* keep minimal 409 body */
    }

    ccOperateLog({
      tableId: roomId,
      op,
      clientOpId: clientOpId || null,
      exhaustedAttempts: true,
      requestDurationMs: Date.now() - reqT0,
      conflictSnapshot: Boolean(conflictBody.engine),
    });
    return res.status(409).json(conflictBody);
  } catch (e) {
    const msg = e?.message || String(e);
    return res.status(500).json({ ok: false, code: "SERVER_ERROR", message: msg });
  }
}
