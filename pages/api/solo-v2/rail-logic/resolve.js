import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { parseSessionId, resolvePlayerRef } from "../../../../lib/solo-v2/server/contracts";
import { SOLO_V2_SESSION_STATUS } from "../../../../lib/solo-v2/server/sessionTypes";
import {
  railLogicForfeit,
  railLogicRotateCell,
  railLogicSubmitRoute,
  railLogicTerminalPayloadFromRow,
} from "../../../../lib/solo-v2/server/railLogicResolveActions";

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

  const actionRaw = String(req.body?.action || "").trim().toLowerCase();
  const isRotate = actionRaw === "rotate";
  const isSubmit = actionRaw === "submit";
  const isForfeit = actionRaw === "forfeit" || actionRaw === "give_up";

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
          message: "Solo V2 Rail Logic is not migrated yet.",
        });
      }
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Rail resolve is temporarily unavailable.",
      });
    }

    const sessionRow0 = Array.isArray(sessionRead.data) ? sessionRead.data[0] : sessionRead.data;
    if (!sessionRow0) {
      return res.status(404).json({ ok: false, category: "validation_error", status: "not_found", message: "Session not found" });
    }

    if (sessionRow0.game_key !== "rail_logic") {
      return res.status(400).json({
        ok: false,
        category: "validation_error",
        status: "invalid_game",
        message: "Session game must be rail_logic",
      });
    }

    let sessionRow = sessionRow0;

    if (sessionRow.session_status === SOLO_V2_SESSION_STATUS.RESOLVED) {
      return res.status(200).json({
        ok: true,
        category: "success",
        status: "resolved",
        idempotent: true,
        result: railLogicTerminalPayloadFromRow(sessionRow),
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

    if (isRotate) {
      const rotated = await railLogicRotateCell(supabase, sessionRow, playerRef, req.body?.cellIndex);
      if (!rotated.ok) {
        const st = rotated.status || "failed";
        const code = st === "no_moves" ? 409 : st === "invalid_request" ? 400 : 409;
        return res.status(code).json({
          ok: false,
          category: st === "invalid_request" ? "validation_error" : "conflict",
          status: st,
          message: rotated.message || "Rotate failed.",
        });
      }
      return res.status(200).json({
        ok: true,
        category: "success",
        status: "rotated",
        authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
      });
    }

    if (isSubmit) {
      const out = await railLogicSubmitRoute(supabase, sessionRow, playerRef);
      if (!out.ok) {
        return res.status(503).json({
          ok: false,
          category: "unavailable",
          status: out.status || "submit_failed",
          message: out.message || "Submit failed.",
        });
      }
      if (out.outcome === "not_solved") {
        return res.status(200).json({
          ok: true,
          category: "success",
          status: "not_solved",
          authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
        });
      }
      return res.status(200).json({
        ok: true,
        category: "success",
        status: "resolved",
        idempotent: false,
        result: railLogicTerminalPayloadFromRow(out.row),
        authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
      });
    }

    if (isForfeit) {
      const out = await railLogicForfeit(supabase, sessionRow, playerRef);
      if (!out.ok) {
        return res.status(503).json({
          ok: false,
          category: "unavailable",
          status: out.status || "forfeit_failed",
          message: out.message || "Forfeit failed.",
        });
      }
      return res.status(200).json({
        ok: true,
        category: "success",
        status: "resolved",
        idempotent: false,
        result: railLogicTerminalPayloadFromRow(out.row),
        authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
      });
    }

    return res.status(400).json({
      ok: false,
      category: "validation_error",
      status: "invalid_request",
      message: "action must be rotate, submit, or forfeit",
    });
  } catch (error) {
    console.error("solo-v2/rail-logic/resolve failed", error);
    return res.status(500).json({
      ok: false,
      category: "unexpected_error",
      status: "server_error",
      message: "Rail resolve failed",
    });
  }
}
