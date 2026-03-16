import { getArcadeDevice } from "../../../../lib/server/arcadeDeviceCookie";
import { checkArcadeRateLimit } from "../../../../lib/server/arcadeRateLimit";
import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { checkIpRateLimit } from "../../../../lib/server/ipRateLimit";
import { validateCsrfToken } from "../../../../lib/server/csrf";
import { logCsrfFailure, logIpRateLimitExceeded } from "../../../../lib/server/securityLogger";

const MAINTENANCE_COST = { GOLD: 60, SCRAP: 35, DATA: 10 };
const STABILITY_GAIN = 18;
const XP_GAIN = 20;

function canAfford(resources, cost) {
  for (const [key, value] of Object.entries(cost)) {
    if ((resources[key] || 0) < value) return false;
  }
  return true;
}

function pay(resources, cost) {
  const next = { ...resources };
  for (const [key, value] of Object.entries(cost)) {
    next[key] = Math.max(0, (next[key] || 0) - value);
  }
  return next;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
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
      "base-action-maintenance",
      deviceId,
      20,
      60_000
    );
    if (!rateLimit.allowed) {
      return res.status(429).json({
        success: false,
        code: "RATE_LIMIT_DEVICE",
        message: "Too many maintenance requests",
      });
    }

    const supabase = getSupabaseAdmin();

    await supabase.rpc("base_reconcile_state", { p_device_id: deviceId });

    const { data: state, error: freshStateError } = await supabase
      .from("base_device_state")
      .select("*")
      .eq("device_id", deviceId)
      .single();

    if (freshStateError || !state) {
      return res.status(400).json({
        success: false,
        code: "BASE_STATE_LOAD_FAILED",
        message: "Failed to reload latest base state",
      });
    }

    const resources = state.resources || {};
    const stability = Number(state.stability || 100);

    if (!canAfford(resources, MAINTENANCE_COST)) {
      return res.status(400).json({
        success: false,
        code: "BASE_INSUFFICIENT_RESOURCES",
        message: "Need GOLD, SCRAP and DATA for maintenance",
      });
    }

    const newResources = pay(resources, MAINTENANCE_COST);
    const newStability = clamp(stability + STABILITY_GAIN, 55, 100);
    const commanderXp = Number(state.commander_xp || 0) + XP_GAIN;
    const newStats = {
      ...(state.stats || {}),
      maintenanceToday: Number(state.stats?.maintenanceToday || 0) + 1,
    };

    const { error: updateError } = await supabase
      .from("base_device_state")
      .update({
        resources: newResources,
        stability: newStability,
        stats: newStats,
        commander_xp: commanderXp,
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

    const row = Array.isArray(finalState) ? finalState[0] : finalState;

    return res.status(200).json({
      success: true,
      state: row,
      stability_gain: STABILITY_GAIN,
      new_stability: newStability,
    });
  } catch (error) {
    console.error("base/action/maintenance failed", error);
    return res.status(500).json({
      success: false,
      code: "BASE_MAINTENANCE_INTERNAL_ERROR",
      message: "Maintenance action failed",
    });
  }
}
