import { getArcadeDevice } from "../../../../lib/server/arcadeDeviceCookie";
import { checkArcadeRateLimit } from "../../../../lib/server/arcadeRateLimit";
import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { checkIpRateLimit } from "../../../../lib/server/ipRateLimit";
import { validateCsrfToken } from "../../../../lib/server/csrf";
import {
  logCsrfFailure,
  logIpRateLimitExceeded,
} from "../../../../lib/server/securityLogger";

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
      "base-action-toggle-building",
      deviceId,
      40,
      60_000
    );
    if (!rateLimit.allowed) {
      return res.status(429).json({
        success: false,
        code: "RATE_LIMIT_DEVICE",
        message: "Too many toggle requests",
      });
    }

    const { building_key, paused, power_mode } = req.body || {};
    const buildingKey = String(building_key || "").trim();

    // Support both:
    // - legacy: { paused: boolean }  -> power_mode 0/100
    // - new:    { power_mode: 0|25|50|75|100 }
    let powerMode;
    if (typeof power_mode !== "undefined") {
      powerMode = Number(power_mode);
    } else if (typeof paused === "boolean") {
      powerMode = paused ? 0 : 100;
    }

    if (!buildingKey) {
      return res.status(400).json({
        success: false,
        code: "BASE_INVALID_BUILDING_KEY",
        message: "Missing or invalid building_key",
      });
    }

    if (typeof powerMode !== "number" || !Number.isFinite(powerMode)) {
      return res.status(400).json({
        success: false,
        code: "BASE_INVALID_POWER_MODE",
        message: "power_mode must be one of 0, 25, 50, 75, 100 (or paused boolean for legacy)",
      });
    }

    if (![0, 25, 50, 75, 100].includes(powerMode)) {
      return res.status(400).json({
        success: false,
        code: "BASE_INVALID_POWER_MODE",
        message: "power_mode must be one of 0, 25, 50, 75, 100",
      });
    }

    const supabase = getSupabaseAdmin();

    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "base_set_building_power_mode",
      {
        p_device_id: deviceId,
        p_building_key: buildingKey,
        p_power_mode: powerMode,
      }
    );

    if (rpcError) {
      const errorMessage = rpcError.message || "Toggle failed";

      return res.status(400).json({
        success: false,
        code: "BASE_TOGGLE_FAILED",
        message: errorMessage,
      });
    }

    const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    if (!result) {
      return res.status(400).json({
        success: false,
        code: "BASE_POWER_MODE_FAILED",
        message: "RPC returned no data",
      });
    }

    return res.status(200).json({
      success: true,
      power_mode: Number(result.power_mode ?? powerMode ?? 100),
      building_power_modes: result.building_power_modes || {},
      state: result.state,
    });
  } catch (error) {
    console.error("base/action/toggle-building failed", error);
    return res.status(500).json({
      success: false,
      code: "BASE_TOGGLE_INTERNAL_ERROR",
      message: "Toggle action failed",
    });
  }
}

