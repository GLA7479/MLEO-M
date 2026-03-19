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
      "base-action-profile",
      deviceId,
      30,
      60_000
    );
    if (!rateLimit.allowed) {
      return res.status(429).json({
        success: false,
        code: "RATE_LIMIT_DEVICE",
        message: "Too many profile requests",
      });
    }

    const crewRole =
      req.body?.crew_role == null ? null : String(req.body.crew_role || "").trim();
    const commanderPath =
      req.body?.commander_path == null ? null : String(req.body.commander_path || "").trim();

    if (!crewRole && !commanderPath) {
      return res.status(400).json({
        success: false,
        code: "BASE_INVALID_PROFILE_UPDATE",
        message: "Missing crew_role or commander_path",
      });
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase.rpc("base_set_profile", {
      p_device_id: deviceId,
      p_crew_role: crewRole,
      p_commander_path: commanderPath,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        code: "BASE_PROFILE_UPDATE_FAILED",
        message: error.message || "Failed to update profile",
      });
    }

    const row = Array.isArray(data) ? data[0] : data;
    const state = row?.state || row || null;

    if (!state) {
      return res.status(400).json({
        success: false,
        code: "BASE_PROFILE_UPDATE_FAILED",
        message: "RPC returned no data",
      });
    }

    return res.status(200).json({
      success: true,
      state,
    });
  } catch (error) {
    console.error("base/action/profile failed", error);
    return res.status(500).json({
      success: false,
      code: "BASE_PROFILE_UPDATE_INTERNAL_ERROR",
      message: "Profile update failed",
    });
  }
}
