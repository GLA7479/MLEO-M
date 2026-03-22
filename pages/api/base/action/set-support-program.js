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
      "base-action-set-support-program",
      deviceId,
      60,
      60_000
    );
    if (!rateLimit.allowed) {
      return res.status(429).json({
        success: false,
        code: "RATE_LIMIT_DEVICE",
        message: "Too many support program set requests",
      });
    }

    const { building_key, program_key } = req.body || {};
    const buildingKey = String(building_key || "").trim();
    if (!buildingKey) {
      return res.status(400).json({
        success: false,
        code: "BASE_SUPPORT_PROGRAM_INVALID",
        message: "Missing building_key",
      });
    }

    const rawProgram = req.body?.program_key;
    const programKey =
      rawProgram === null || rawProgram === undefined
        ? "none"
        : String(rawProgram).trim();

    const supabase = getSupabaseAdmin();

    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "base_set_support_program",
      {
        p_device_id: deviceId,
        p_building_key: buildingKey,
        p_program_key: programKey === "" ? "none" : programKey,
      }
    );

    if (rpcError) {
      const errorMessage = rpcError.message || "Set program failed";

      if (errorMessage.includes("not unlocked")) {
        return res.status(400).json({
          success: false,
          code: "BASE_SUPPORT_PROGRAM_NOT_UNLOCKED",
          message: errorMessage,
        });
      }

      if (errorMessage.includes("invalid")) {
        return res.status(400).json({
          success: false,
          code: "BASE_SUPPORT_PROGRAM_INVALID",
          message: errorMessage,
        });
      }

      return res.status(400).json({
        success: false,
        code: "BASE_SUPPORT_PROGRAM_INVALID",
        message: errorMessage,
      });
    }

    const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    if (!result) {
      return res.status(400).json({
        success: false,
        code: "BASE_SUPPORT_PROGRAM_INVALID",
        message: "RPC returned no data",
      });
    }

    return res.status(200).json({
      success: true,
      state: result.state,
      building_key: result.building_key,
      program_key: result.program_key ?? null,
      support_program_active: result.support_program_active || null,
    });
  } catch (error) {
    console.error("base/action/set-support-program failed", error);
    return res.status(500).json({
      success: false,
      code: "BASE_SUPPORT_PROGRAM_INTERNAL_ERROR",
      message: "Set support program failed",
    });
  }
}
