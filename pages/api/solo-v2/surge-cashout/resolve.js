import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { parseSessionId, resolvePlayerRef } from "../../../../lib/solo-v2/server/contracts";
import { SOLO_V2_SESSION_STATUS } from "../../../../lib/solo-v2/server/sessionTypes";
import {
  surgeCashoutCashOut,
  surgeCashoutLaunchRound,
  surgeCashoutTerminalPayloadFromRow,
  surgeCashoutTryAutoCrash,
} from "../../../../lib/solo-v2/server/surgeCashoutResolveActions";

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
  const isLaunch = actionRaw === "launch";
  const isCashOut = actionRaw === "cashout";

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
          message: "Solo V2 Surge Cashout is not migrated yet.",
        });
      }
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Surge resolve is temporarily unavailable.",
      });
    }

    let sessionRow = Array.isArray(sessionRead.data) ? sessionRead.data[0] : sessionRead.data;
    if (!sessionRow) {
      return res.status(404).json({ ok: false, category: "validation_error", status: "not_found", message: "Session not found" });
    }

    if (sessionRow.game_key !== "surge_cashout") {
      return res.status(400).json({
        ok: false,
        category: "validation_error",
        status: "invalid_game",
        message: "Session game must be surge_cashout",
      });
    }

    const auto = await surgeCashoutTryAutoCrash(supabase, sessionRow, playerRef);
    if (auto.updatedRow) {
      sessionRow = auto.updatedRow;
    }

    if (sessionRow.session_status === SOLO_V2_SESSION_STATUS.RESOLVED) {
      return res.status(200).json({
        ok: true,
        category: "success",
        status: "resolved",
        idempotent: true,
        result: surgeCashoutTerminalPayloadFromRow(sessionRow),
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

    if (isLaunch) {
      const launched = await surgeCashoutLaunchRound(supabase, sessionRow, playerRef);
      if (!launched.ok) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: launched.status || "launch_failed",
          message: launched.message || "Launch failed.",
        });
      }
      return res.status(200).json({
        ok: true,
        category: "success",
        status: "launched",
        authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
      });
    }

    if (isCashOut) {
      const out = await surgeCashoutCashOut(supabase, sessionRow, playerRef);
      if (!out.ok) {
        if (out.status === "too_late") {
          const auto2 = await surgeCashoutTryAutoCrash(supabase, sessionRow, playerRef);
          if (auto2.updatedRow) {
            return res.status(200).json({
              ok: true,
              category: "success",
              status: "resolved",
              idempotent: false,
              result: surgeCashoutTerminalPayloadFromRow(auto2.updatedRow),
              authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
            });
          }
        }
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: out.status || "cashout_failed",
          message: out.message || "Cash out failed.",
        });
      }

      return res.status(200).json({
        ok: true,
        category: "success",
        status: "resolved",
        idempotent: Boolean(out.idempotent),
        result: surgeCashoutTerminalPayloadFromRow(out.row),
        authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
      });
    }

    return res.status(400).json({
      ok: false,
      category: "validation_error",
      status: "invalid_request",
      message: "action must be launch or cashout",
    });
  } catch (error) {
    console.error("solo-v2/surge-cashout/resolve failed", error);
    return res.status(500).json({
      ok: false,
      category: "unexpected_error",
      status: "server_error",
      message: "Surge resolve failed",
    });
  }
}
