import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { parseSessionId, resolvePlayerRef } from "../../../../lib/solo-v2/server/contracts";
import { SOLO_V2_SESSION_STATUS } from "../../../../lib/solo-v2/server/sessionTypes";
import {
  shadowTellDecide,
  shadowTellTerminalPayloadFromRow,
} from "../../../../lib/solo-v2/server/shadowTellResolveActions";

function isMissingTable(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return (
    code === "42P01" ||
    code === "42883" ||
    message.includes("relation") ||
    message.includes("does not exist") ||
    message.includes("function") ||
    message.includes("rpc")
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, category: "validation_error", status: "method_not_allowed" });
  }

  const sessionId = parseSessionId(req.body?.sessionId);
  if (!sessionId) {
    return res.status(400).json({ ok: false, category: "validation_error", status: "invalid_request", message: "Invalid sessionId" });
  }

  const playerRef = resolvePlayerRef(req);

  try {
    const supabase = getSupabaseAdmin();

    const sessionRead = await supabase.rpc("solo_v2_get_session", {
      p_session_id: sessionId,
      p_player_ref: playerRef,
    });

    if (sessionRead.error) {
      if (isMissingTable(sessionRead.error)) {
        return res.status(503).json({
          ok: false,
          category: "pending_migration",
          status: "pending_migration",
          message: "Solo V2 Shadow Tell is not migrated yet.",
        });
      }
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Shadow Tell resolve is temporarily unavailable.",
      });
    }

    const sessionRow0 = Array.isArray(sessionRead.data) ? sessionRead.data[0] : sessionRead.data;
    if (!sessionRow0) {
      return res.status(404).json({ ok: false, category: "validation_error", status: "not_found", message: "Session not found" });
    }

    if (sessionRow0.game_key !== "shadow_tell") {
      return res.status(400).json({
        ok: false,
        category: "validation_error",
        status: "invalid_game",
        message: "Session game must be shadow_tell",
      });
    }

    let sessionRow = sessionRow0;

    if (sessionRow.session_status === SOLO_V2_SESSION_STATUS.RESOLVED) {
      return res.status(200).json({
        ok: true,
        category: "success",
        status: "resolved",
        idempotent: true,
        result: shadowTellTerminalPayloadFromRow(sessionRow),
        authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
      });
    }

    if (![SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS].includes(sessionRow.session_status)) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "invalid_session_state",
        message: `Session state ${sessionRow.session_status} cannot resolve.`,
      });
    }

    const actionRaw = String(req.body?.action || "").trim().toLowerCase();
    if (actionRaw !== "decide") {
      return res.status(400).json({
        ok: false,
        category: "validation_error",
        status: "invalid_request",
        message: "action must be decide",
      });
    }

    const out = await shadowTellDecide(supabase, sessionRow, playerRef, req.body?.choice);
    if (!out.ok) {
      const st = out.status || "failed";
      const code = st === "invalid_request" ? 400 : st === "invalid_state" ? 409 : 503;
      return res.status(code).json({
        ok: false,
        category: st === "invalid_request" ? "validation_error" : st === "conflict" ? "conflict" : "unavailable",
        status: st,
        message: out.message || "Decide failed.",
      });
    }

    if (out.idempotent && out.row) {
      return res.status(200).json({
        ok: true,
        category: "success",
        status: "resolved",
        idempotent: true,
        result: shadowTellTerminalPayloadFromRow(out.row),
        authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
      });
    }

    return res.status(200).json({
      ok: true,
      category: "success",
      status: "resolved",
      idempotent: false,
      result: shadowTellTerminalPayloadFromRow(out.row),
      authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
    });
  } catch (error) {
    console.error("solo-v2/shadow-tell/resolve failed", error);
    return res.status(500).json({
      ok: false,
      category: "unexpected_error",
      status: "server_error",
      message: "Shadow Tell resolve failed",
    });
  }
}
