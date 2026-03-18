import { getArcadeDevice } from "../../../../lib/server/arcadeDeviceCookie";
import { checkArcadeRateLimit } from "../../../../lib/server/arcadeRateLimit";
import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { checkIpRateLimit } from "../../../../lib/server/ipRateLimit";
import { validateCsrfToken } from "../../../../lib/server/csrf";
import { logCsrfFailure, logIpRateLimitExceeded } from "../../../../lib/server/securityLogger";
import { logError, EVENTS } from "../../../../lib/server/monitoring";

export default async function handler(req, res) {
  let deviceId = null;

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, code: "METHOD_NOT_ALLOWED", message: "Method not allowed" });
  }

  try {
    if (!validateCsrfToken(req)) {
      logCsrfFailure(req);
      return res.status(403).json({ success: false, code: "CSRF_INVALID", message: "Invalid CSRF token" });
    }

    const ipRate = await checkIpRateLimit(req, 60, 60_000);
    if (!ipRate.allowed) {
      logIpRateLimitExceeded(req, 60);
      return res.status(429).json({ success: false, code: "RATE_LIMIT_IP", message: "Too many requests from this IP" });
    }

    deviceId = getArcadeDevice(req);
    if (!deviceId) {
      return res.status(401).json({ success: false, code: "DEVICE_NOT_INITIALIZED", message: "Device not initialized" });
    }

    const rateLimit = await checkArcadeRateLimit("base-action-expedition", deviceId, 20, 60_000);
    if (!rateLimit.allowed) {
      return res.status(429).json({ success: false, code: "RATE_LIMIT_DEVICE", message: "Too many expedition requests" });
    }
    const suspiciousRapidExpedition =
      typeof rateLimit.remaining === "number" && rateLimit.remaining < 3;

    const supabase = getSupabaseAdmin();

    // Use atomic RPC function
    const { data: rpcData, error: rpcError } = await supabase.rpc("base_launch_expedition", {
      p_device_id: deviceId,
    });

    if (rpcError) {
      const errorMessage = rpcError.message || "Failed to launch expedition";
      
      // Map SQL exceptions to error codes
      if (errorMessage.includes("still out in the field")) {
        return res.status(400).json({ success: false, code: "BASE_EXPEDITION_ON_COOLDOWN", message: errorMessage });
      }
      if (errorMessage.includes("Not enough energy")) {
        return res.status(400).json({ success: false, code: "BASE_INSUFFICIENT_ENERGY", message: errorMessage });
      }
      if (errorMessage.includes("Need 4 DATA")) {
        return res.status(400).json({ success: false, code: "BASE_INSUFFICIENT_DATA", message: errorMessage });
      }
      
      return res.status(400).json({ success: false, code: "BASE_EXPEDITION_FAILED", message: errorMessage });
    }

    const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    const state = result?.state || result || null;

    if (!state) {
      return res.status(400).json({
        success: false,
        code: "BASE_EXPEDITION_FAILED",
        message: "RPC returned no data",
      });
    }

    return res.status(200).json({
      success: true,
      state,
      loot: result?.loot || null,
      xp_gain: Number(result?.xp_gain || 0),
      suspicious_rapid_expedition: suspiciousRapidExpedition,
    });
  } catch (error) {
    console.error("base/action/expedition failed", error);
    logError(error, { event: EVENTS.BASE_EXPEDITION_FAIL, deviceId });
    return res.status(500).json({ success: false, code: "BASE_EXPEDITION_INTERNAL_ERROR", message: "Expedition action failed" });
  }
}
