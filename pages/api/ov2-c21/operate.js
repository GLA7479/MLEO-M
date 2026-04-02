import { getSupabaseAdmin } from "../../../lib/server/supabaseAdmin";
import { normalizeEngine, mutateEngine } from "../../../lib/online-v2/c21/ov2C21MultiEngine";
import { OV2_C21_PRODUCT_GAME_ID } from "../../../lib/online-v2/c21/ov2C21TableIds";

function buildIdemCommit(roomId, matchSeq, suffix) {
  return `ov2:c21:commit:${roomId}:${matchSeq}:${suffix}`;
}

function buildIdemSettle(roomId, matchSeq, suffix) {
  return `ov2:c21:settle:${roomId}:${matchSeq}:${suffix}`;
}

async function persistEconomyOps(admin, roomId, matchSeq, economyOps) {
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
        payload: { product: OV2_C21_PRODUCT_GAME_ID, suffix: op.suffix },
      });
      const dup =
        error &&
        (error.code === "23505" || String(error.message || "").toLowerCase().includes("duplicate"));
      if (error && !dup) {
        throw new Error(error.message || "economy_commit_failed");
      }
      if (!error) {
        vaultEffects.push({
          kind: "debit",
          amount: Math.max(0, Math.floor(Number(op.amount) || 0)),
          gameId: OV2_C21_PRODUCT_GAME_ID,
          idempotencyKey: idem,
        });
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
        meta: { product: OV2_C21_PRODUCT_GAME_ID, suffix: op.suffix },
      });
      const dup =
        error &&
        (error.code === "23505" || String(error.message || "").toLowerCase().includes("duplicate"));
      if (error && !dup) {
        throw new Error(error.message || "settlement_insert_failed");
      }
      if (!error) {
        vaultEffects.push({
          kind: "credit",
          amount: amt,
          gameId: OV2_C21_PRODUCT_GAME_ID,
          idempotencyKey: idem,
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
    if (String(roomRow.product_game_id) !== OV2_C21_PRODUCT_GAME_ID) {
      return res.status(400).json({ ok: false, code: "NOT_C21_TABLE" });
    }

    const tableStake = Math.max(100, Math.floor(Number(roomRow.stake_per_seat) || 100));

    const maxAttempts = 4;
    let lastConflict = false;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const { data: liveRow, error: liveErr } = await admin
        .from("ov2_c21_live_state")
        .select("room_id, match_seq, revision, engine")
        .eq("room_id", roomId)
        .maybeSingle();

      if (liveErr || !liveRow) {
        return res.status(500).json({ ok: false, code: "LIVE_STATE_MISSING" });
      }

      const engine = normalizeEngine(liveRow.engine, tableStake);
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
        return res.status(500).json({ ok: false, code: "PERSIST_FAILED", message: upErr.message });
      }

      if (!updated) {
        lastConflict = true;
        continue;
      }

      let vaultEffects = [];
      if (economyOps.length) {
        try {
          vaultEffects = await persistEconomyOps(admin, roomId, roundForEconomy, economyOps);
        } catch (e) {
          return res.status(500).json({
            ok: false,
            code: "ECONOMY_PERSIST_FAILED",
            message: e?.message || String(e),
            engine: nextEngine,
            revision: updated.revision,
          });
        }
      }

      return res.status(200).json({
        ok: true,
        engine: nextEngine,
        revision: updated.revision,
        matchSeq: updated.match_seq,
        vaultEffects,
      });
    }

    return res.status(409).json({ ok: false, code: "REVISION_CONFLICT", retried: lastConflict });
  } catch (e) {
    const msg = e?.message || String(e);
    return res.status(500).json({ ok: false, code: "SERVER_ERROR", message: msg });
  }
}
