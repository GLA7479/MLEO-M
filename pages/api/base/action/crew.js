import { getArcadeDevice } from "../../../../lib/server/arcadeDeviceCookie";
import { checkArcadeRateLimit } from "../../../../lib/server/arcadeRateLimit";
import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { checkIpRateLimit } from "../../../../lib/server/ipRateLimit";
import { validateCsrfToken } from "../../../../lib/server/csrf";
import { logCsrfFailure, logIpRateLimitExceeded } from "../../../../lib/server/securityLogger";

function crewCost(count) {
  return {
    GOLD: Math.ceil(120 * Math.pow(1.16, count)),
    ORE: Math.ceil(55 * Math.pow(1.14, count)),
    SCRAP: Math.ceil(18 * Math.pow(1.16, count)),
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      success: false,
      code: "METHOD_NOT_ALLOWED",
      message: "Method not allowed",
    });
  }

  try {
    if (!validateCsrfToken(req)) {
      logCsrfFailure(req);
      return res.status(403).json({
        success: false,
        code: "CSRF_INVALID",
        message: "Invalid CSRF token",
      });
    }

    const ipRate = await checkIpRateLimit(req, 60, 60_000);
    if (!ipRate.allowed) {
      logIpRateLimitExceeded(req, 60);
      return res.status(429).json({
        success: false,
        code: "RATE_LIMIT_IP",
        message: "Too many requests from this IP",
      });
    }

    const deviceId = getArcadeDevice(req);
    if (!deviceId) {
      return res.status(401).json({
        success: false,
        code: "DEVICE_NOT_INITIALIZED",
        message: "Device not initialized",
      });
    }

    const rateLimit = await checkArcadeRateLimit(
      "base-action-crew",
      deviceId,
      30,
      60_000
    );
    if (!rateLimit.allowed) {
      return res.status(429).json({
        success: false,
        code: "RATE_LIMIT_DEVICE",
        message: "Too many crew requests",
      });
    }

    const supabase = getSupabaseAdmin();

    await supabase.rpc("base_reconcile_state", { p_device_id: deviceId });

    const { data: row, error } = await supabase
      .from("base_device_state")
      .select("*")
      .eq("device_id", deviceId)
      .single();

    if (error || !row) {
      return res.status(400).json({
        success: false,
        code: "BASE_STATE_LOAD_FAILED",
        message: error?.message || "Failed to load state",
      });
    }

    const resources = row.resources || {};
    const crew = Number(row.crew || 0);
    const cost = crewCost(crew);

    for (const [key, value] of Object.entries(cost)) {
      if (Number(resources[key] || 0) < value) {
        return res.status(400).json({
          success: false,
          code: "BASE_INSUFFICIENT_RESOURCES",
          message: "Crew hiring needs more supplies",
        });
      }
    }

    const nextResources = { ...resources };
    for (const [key, value] of Object.entries(cost)) {
      nextResources[key] = Math.max(
        0,
        Number(nextResources[key] || 0) - Number(value || 0)
      );
    }

    const nextCrew = crew + 1;

    const { error: updateError } = await supabase
      .from("base_device_state")
      .update({
        crew: nextCrew,
        resources: nextResources,
        updated_at: new Date().toISOString(),
      })
      .eq("device_id", deviceId);

    if (updateError) {
      return res.status(400).json({
        success: false,
        code: "BASE_STATE_UPDATE_FAILED",
        message: updateError.message || "Failed to update state",
      });
    }

    const { data: finalState, error: finalError } = await supabase.rpc(
      "base_reconcile_state",
      { p_device_id: deviceId }
    );

    if (finalError) {
      return res.status(400).json({
        success: false,
        code: "BASE_RECONCILE_FAILED",
        message: finalError.message || "Failed to reconcile final state",
      });
    }

    const state = Array.isArray(finalState) ? finalState[0] : finalState;

    return res.status(200).json({
      success: true,
      state,
      new_crew: nextCrew,
    });
  } catch (error) {
    console.error("base/action/crew failed", error);
    return res.status(500).json({
      success: false,
      code: "BASE_CREW_INTERNAL_ERROR",
      message: "Crew action failed",
    });
  }
}
