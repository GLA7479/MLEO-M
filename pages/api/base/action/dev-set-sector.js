import { getArcadeDevice } from "../../../../lib/server/arcadeDeviceCookie";
import { checkArcadeRateLimit } from "../../../../lib/server/arcadeRateLimit";
import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { checkIpRateLimit } from "../../../../lib/server/ipRateLimit";
import { validateCsrfToken } from "../../../../lib/server/csrf";
import {
  logCsrfFailure,
  logIpRateLimitExceeded,
} from "../../../../lib/server/securityLogger";
import { isBaseDevToolsEnabled } from "../../../../lib/server/baseDevTools";

export default async function handler(req, res) {
  if (!isBaseDevToolsEnabled()) {
    return res.status(404).json({ success: false, message: "Not found" });
  }

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

    const ipRate = await checkIpRateLimit(req, 40, 60_000);
    if (!ipRate.allowed) {
      logIpRateLimitExceeded(req, 40);
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
      "base-action-dev-set-sector",
      deviceId,
      40,
      60_000
    );
    if (!rateLimit.allowed) {
      return res.status(429).json({
        success: false,
        code: "RATE_LIMIT_DEVICE",
        message: "Too many dev sector requests",
      });
    }

    const raw =
      req.body?.target_world ??
      req.body?.targetWorld ??
      req.body?.sector_world ??
      req.body?.sectorWorld;
    const targetWorld = Math.floor(Number(raw));

    if (!Number.isFinite(targetWorld) || targetWorld < 1 || targetWorld > 6) {
      return res.status(400).json({
        success: false,
        code: "BASE_DEV_INVALID_SECTOR",
        message: "target_world must be an integer from 1 to 6",
      });
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase.rpc("base_dev_set_sector_world", {
      p_device_id: deviceId,
      p_world: targetWorld,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        code: "BASE_DEV_SET_SECTOR_FAILED",
        message: error.message || "Dev sector update failed",
      });
    }

    const state = data ?? null;
    if (!state || typeof state !== "object") {
      return res.status(400).json({
        success: false,
        code: "BASE_DEV_SET_SECTOR_FAILED",
        message: "RPC returned no state",
      });
    }

    return res.status(200).json({
      success: true,
      state,
      sector_world: Number(state.sector_world ?? targetWorld),
    });
  } catch (error) {
    console.error("base/action/dev-set-sector failed", error);
    return res.status(500).json({
      success: false,
      code: "BASE_DEV_SET_SECTOR_INTERNAL",
      message: "Dev sector action failed",
    });
  }
}
