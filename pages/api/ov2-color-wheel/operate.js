import { getSupabaseAdmin } from "../../../lib/server/supabaseAdmin";
import { getArcadeDevice } from "../../../lib/server/arcadeDeviceCookie";
import { upsertOv2CwParticipantDevice } from "../../../lib/server/ov2CwParticipantDevice";
import { normalizeEngine, mutateEngine } from "../../../lib/online-v2/color_wheel/ov2CwMultiEngine";
import { OV2_CW_PRODUCT_GAME_ID } from "../../../lib/online-v2/color_wheel/ov2CwTableIds";
import { buildIdemCommit, buildIdemSettle } from "../../../lib/online-v2/color_wheel/ov2CwEconomyIds";
import {
  applyCwEconomyOpsToVault,
  getArcadeVaultBalanceForRequest,
  reverseCwEconomyOps,
} from "../../../lib/server/ov2CwVaultAuthority";

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
        payload: { product: OV2_CW_PRODUCT_GAME_ID, suffix: op.suffix },
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
      .select("id, product_game_id, stake_per_seat")
      .eq("id", roomId)
      .maybeSingle();

    if (roomErr || !roomRow) {
      return res.status(404).json({ ok: false, code: "ROOM_NOT_FOUND" });
    }
    if (String(roomRow.product_game_id) !== OV2_CW_PRODUCT_GAME_ID) {
      return res.status(400).json({ ok: false, code: "NOT_COLOR_WHEEL_TABLE" });
    }

    const tableStake = Math.max(1, Math.floor(Number(roomRow.stake_per_seat) || 1));

    if (op === "sit") {
      if (!participantKey) {
        return res.status(400).json({ ok: false, code: "participant_required" });
      }
      const bal = await getArcadeVaultBalanceForRequest(req);
      if (bal.code === "device_required") {
        return res.status(401).json({ ok: false, code: "DEVICE_REQUIRED" });
      }
      if (!bal.ok) {
        return res.status(400).json({ ok: false, code: bal.code || "VAULT_READ_FAILED" });
      }
      if (bal.balance < tableStake) {
        return res.status(400).json({ ok: false, code: "insufficient_vault_for_table" });
      }
    }

    const callerDeviceId = getArcadeDevice(req);
    if (participantKey && callerDeviceId) {
      const bind = await upsertOv2CwParticipantDevice(admin, roomId, participantKey, callerDeviceId);
      if (!bind.ok) {
        return res.status(500).json({
          ok: false,
          code: "CW_DEVICE_BINDING_FAILED",
          message: bind.message || "Failed to persist participant device binding",
        });
      }
    }

    const maxAttempts = 4;
    let lastConflict = false;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const { data: liveRow, error: liveErr } = await admin
        .from("ov2_color_wheel_live_state")
        .select("room_id, match_seq, revision, engine")
        .eq("room_id", roomId)
        .maybeSingle();

      if (liveErr || !liveRow) {
        return res.status(500).json({ ok: false, code: "LIVE_STATE_MISSING" });
      }

      const engine = normalizeEngine(liveRow.engine, tableStake);
      const beforeEngine = JSON.parse(JSON.stringify(engine));
      const prevRevision = Math.max(0, Math.floor(Number(liveRow.revision) || 0));
      const matchSeqBefore = Math.max(0, Math.floor(Number(liveRow.match_seq) || 0));

      const result = mutateEngine(engine, {
        op,
        participantKey,
        payload,
        now: Date.now(),
      });

      if (result.error) {
        return res.status(400).json({ ok: false, code: result.error });
      }

      let nextEngine = result.engine;
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
        return res.status(500).json({ ok: false, code: "PERSIST_FAILED", message: upErr.message });
      }

      if (!updated) {
        lastConflict = true;
        continue;
      }

      if (economyOps.length) {
        const vaultRes = await applyCwEconomyOpsToVault(admin, roomId, roundForEconomy, economyOps);
        if (!vaultRes.ok) {
          const { error: revErr } = await admin
            .from("ov2_color_wheel_live_state")
            .update({
              engine: beforeEngine,
              match_seq: Math.max(0, Math.floor(Number(beforeEngine.roundSeq) || 0)),
              revision: prevRevision + 2,
              updated_at: new Date().toISOString(),
            })
            .eq("room_id", roomId)
            .eq("revision", prevRevision + 1);
          if (revErr) {
            return res.status(500).json({
              ok: false,
              code: "VAULT_AND_REVERT_FAILED",
              message: revErr.message,
            });
          }
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
          await reverseCwEconomyOps(admin, roomId, roundForEconomy, economyOps);
          const { error: revErr } = await admin
            .from("ov2_color_wheel_live_state")
            .update({
              engine: beforeEngine,
              match_seq: Math.max(0, Math.floor(Number(beforeEngine.roundSeq) || 0)),
              revision: prevRevision + 2,
              updated_at: new Date().toISOString(),
            })
            .eq("room_id", roomId)
            .eq("revision", prevRevision + 1);
          if (revErr) {
            return res.status(500).json({
              ok: false,
              code: "ECONOMY_ROLLBACK_FAILED",
              message: revErr.message,
            });
          }
          return res.status(500).json({
            ok: false,
            code: "ECONOMY_PERSIST_FAILED",
            message: e?.message || String(e),
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

      return res.status(200).json({
        ok: true,
        engine: nextEngine,
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
