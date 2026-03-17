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

    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "base_perform_maintenance",
      { p_device_id: deviceId }
    );

    if (rpcError) {
      const errorMessage = rpcError.message || "Maintenance action failed";

      if (errorMessage.includes("Insufficient resources")) {
        return res.status(400).json({
          success: false,
          code: "BASE_INSUFFICIENT_RESOURCES",
          message: "Need GOLD, SCRAP and DATA for maintenance",
        });
      }

      return res.status(400).json({
        success: false,
        code: "BASE_MAINTENANCE_FAILED",
        message: errorMessage,
      });
    }

    const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    if (!result) {
      return res.status(400).json({
        success: false,
        code: "BASE_MAINTENANCE_FAILED",
        message: "RPC returned no data",
      });
    }

    return res.status(200).json({
      success: true,
      state: result.state,
      stability_gain: Number(result.stability_gain || 0),
      new_stability: Number(result.new_stability || 0),
      cost: result.cost || null,
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
