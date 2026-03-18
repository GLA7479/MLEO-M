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

    const rateLimit = await checkArcadeRateLimit("base-action-ship", deviceId, 30, 60_000);
    if (!rateLimit.allowed) {
      return res.status(429).json({ success: false, code: "RATE_LIMIT_DEVICE", message: "Too many ship requests" });
    }
    const suspiciousRapidShip =
      typeof rateLimit.remaining === "number" && rateLimit.remaining < 5;

    const supabase = getSupabaseAdmin();

    // Use atomic RPC function
    const { data: rpcData, error: rpcError } = await supabase.rpc("base_ship_to_vault", {
      p_device_id: deviceId,
    });

    if (rpcError) {
      const errorMessage = rpcError.message || "Failed to ship to vault";
      
      // Map SQL exceptions to error codes
      if (errorMessage.includes("Nothing ready to ship")) {
        return res.status(400).json({ success: false, code: "BASE_NOTHING_TO_SHIP", message: errorMessage });
      }
      if (errorMessage.includes("shipping cap is already full")) {
        return res.status(400).json({ success: false, code: "BASE_SHIP_CAP_REACHED", message: errorMessage });
      }
      if (errorMessage.includes("too small after softcut")) {
        return res.status(400).json({ success: false, code: "BASE_SHIP_TOO_SMALL", message: errorMessage });
      }
      if (errorMessage.includes("Insufficient vault balance") || errorMessage.includes("vault")) {
        return res.status(400).json({ success: false, code: "BASE_VAULT_SYNC_FAILED", message: errorMessage });
      }
      
      return res.status(400).json({ success: false, code: "BASE_SHIP_FAILED", message: errorMessage });
    }

    const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    if (!result) {
      return res.status(400).json({ success: false, code: "BASE_SHIP_FAILED", message: "RPC returned no data" });
    }

    return res.status(200).json({
      success: true,
      state: result.state,
      shipped: Number(result.shipped || 0),
      consumed: Number(result.consumed || 0),
      vault_balance: Number(result.vault_balance || 0),
      suspicious_rapid_ship: suspiciousRapidShip,
    });
  } catch (error) {
    console.error("base/action/ship failed", error);
    logError(error, { event: EVENTS.BASE_SHIP_FAIL, deviceId });
    return res.status(500).json({ success: false, code: "BASE_SHIP_INTERNAL_ERROR", message: "Ship action failed" });
  }
}
