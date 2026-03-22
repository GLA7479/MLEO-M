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

    const ipRate = await checkIpRateLimit(req, 30, 60_000);
    if (!ipRate.allowed) {
      logIpRateLimitExceeded(req, 30);
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
      "base-action-sector-deploy",
      deviceId,
      12,
      60_000
    );
    if (!rateLimit.allowed) {
      return res.status(429).json({
        success: false,
        code: "RATE_LIMIT_DEVICE",
        message: "Too many sector deploy requests",
      });
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase.rpc("base_deploy_next_sector", {
      p_device_id: deviceId,
    });

    if (error) {
      const msg = error.message || "Sector deploy failed";
      if (msg.includes("Already at final sector")) {
        return res.status(400).json({
          success: false,
          code: "BASE_SECTOR_MAX",
          message: msg,
        });
      }
      if (msg.includes("Sector deploy requirements not met")) {
        return res.status(400).json({
          success: false,
          code: "BASE_SECTOR_NOT_READY",
          message: msg,
        });
      }
      return res.status(400).json({
        success: false,
        code: "BASE_SECTOR_DEPLOY_FAILED",
        message: msg,
      });
    }

    const row = Array.isArray(data) ? data[0] : data;
    const state = row?.state ?? row ?? null;
    const newSectorWorld = row?.new_sector_world != null ? Number(row.new_sector_world) : null;

    if (!state) {
      return res.status(400).json({
        success: false,
        code: "BASE_SECTOR_DEPLOY_FAILED",
        message: "RPC returned no data",
      });
    }

    return res.status(200).json({
      success: true,
      state,
      new_sector_world: newSectorWorld,
    });
  } catch (error) {
    console.error("base/action/sector-deploy failed", error);
    return res.status(500).json({
      success: false,
      code: "BASE_SECTOR_INTERNAL_ERROR",
      message: "Sector deploy action failed",
    });
  }
}
