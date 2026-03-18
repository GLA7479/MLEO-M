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
      "base-action-module",
      deviceId,
      20,
      60_000
    );
    if (!rateLimit.allowed) {
      return res.status(429).json({
        success: false,
        code: "RATE_LIMIT_DEVICE",
        message: "Too many module requests",
      });
    }

    const { module_key } = req.body || {};
    const moduleKey = String(module_key || "").trim();
    if (!moduleKey) {
      return res.status(400).json({
        success: false,
        code: "BASE_INVALID_MODULE_KEY",
        message: "Missing or invalid module_key",
      });
    }

    const supabase = getSupabaseAdmin();

    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "base_install_module",
      {
        p_device_id: deviceId,
        p_module_key: moduleKey,
      }
    );

    if (rpcError) {
      const errorMessage = rpcError.message || "Module action failed";

      if (errorMessage.includes("Invalid module key")) {
        return res.status(400).json({
          success: false,
          code: "BASE_MODULE_NOT_FOUND",
          message: errorMessage,
        });
      }

      if (errorMessage.includes("already installed")) {
        return res.status(400).json({
          success: false,
          code: "BASE_MODULE_ALREADY_INSTALLED",
          message: errorMessage,
        });
      }

      if (errorMessage.includes("Insufficient resources")) {
        return res.status(400).json({
          success: false,
          code: "BASE_INSUFFICIENT_RESOURCES",
          message: "Not enough resources",
        });
      }

      return res.status(400).json({
        success: false,
        code: "BASE_MODULE_FAILED",
        message: errorMessage,
      });
    }

    const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    if (!result) {
      return res.status(400).json({
        success: false,
        code: "BASE_MODULE_FAILED",
        message: "RPC returned no data",
      });
    }

    return res.status(200).json({
      success: true,
      state: result.state,
      module_key: result.module_key || moduleKey,
      cost: result.cost || null,
    });
  } catch (error) {
    console.error("base/action/module failed", error);
    return res.status(500).json({
      success: false,
      code: "BASE_MODULE_INTERNAL_ERROR",
      message: "Module action failed",
    });
  }
}
