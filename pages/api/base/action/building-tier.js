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
      "base-action-building-tier",
      deviceId,
      60,
      60_000
    );
    if (!rateLimit.allowed) {
      return res.status(429).json({
        success: false,
        code: "RATE_LIMIT_DEVICE",
        message: "Too many tier advance requests",
      });
    }

    const { building_key } = req.body || {};
    const buildingKey = String(building_key || "").trim();
    if (!buildingKey) {
      return res.status(400).json({
        success: false,
        code: "BASE_INVALID_BUILDING_KEY",
        message: "Missing or invalid building_key",
      });
    }

    const supabase = getSupabaseAdmin();

    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "base_advance_building_tier",
      {
        p_device_id: deviceId,
        p_building_key: buildingKey,
      }
    );

    if (rpcError) {
      const errorMessage = rpcError.message || "Tier advance failed";

      if (errorMessage.includes("Tier advancement is only available")) {
        return res.status(400).json({
          success: false,
          code: "BASE_TIER_BUILDING_INVALID",
          message: errorMessage,
        });
      }

      if (errorMessage.includes("level 15")) {
        return res.status(400).json({
          success: false,
          code: "BASE_TIER_LEVEL_NOT_READY",
          message: errorMessage,
        });
      }

      if (errorMessage.includes("already at maximum")) {
        return res.status(400).json({
          success: false,
          code: "BASE_TIER_MAX",
          message: errorMessage,
        });
      }

      if (errorMessage.includes("Insufficient resources")) {
        return res.status(400).json({
          success: false,
          code: "BASE_INSUFFICIENT_RESOURCES",
          message: errorMessage,
        });
      }

      return res.status(400).json({
        success: false,
        code: "BASE_TIER_ADVANCE_FAILED",
        message: errorMessage,
      });
    }

    const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    if (!result) {
      return res.status(400).json({
        success: false,
        code: "BASE_TIER_ADVANCE_FAILED",
        message: "RPC returned no data",
      });
    }

    return res.status(200).json({
      success: true,
      state: result.state,
      building_key: buildingKey,
      new_tier: Number(result.new_tier || 0),
      new_level: Number(result.new_level || 0),
      cost: result.cost || null,
      new_commander_xp: result.new_commander_xp != null ? Number(result.new_commander_xp) : null,
    });
  } catch (error) {
    console.error("base/action/building-tier failed", error);
    return res.status(500).json({
      success: false,
      code: "BASE_TIER_INTERNAL_ERROR",
      message: "Tier advance action failed",
    });
  }
}
