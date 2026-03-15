import { getArcadeDevice } from "../../../../lib/server/arcadeDeviceCookie";
import { checkArcadeRateLimit } from "../../../../lib/server/arcadeRateLimit";
import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { checkIpRateLimit } from "../../../../lib/server/ipRateLimit";
import { validateCsrfToken } from "../../../../lib/server/csrf";
import { logCsrfFailure, logIpRateLimitExceeded } from "../../../../lib/server/securityLogger";
import { logError, EVENTS } from "../../../../lib/server/monitoring";

const ALLOWED_SPEND_TYPES = new Set(["blueprint", "overclock", "refill"]);

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

    const rateLimit = await checkArcadeRateLimit("base-action-spend", deviceId, 30, 60_000);
    if (!rateLimit.allowed) {
      return res.status(429).json({ success: false, code: "RATE_LIMIT_DEVICE", message: "Too many spend requests" });
    }

    const { spend_type, energy_cap } = req.body || {};
    if (!spend_type || !ALLOWED_SPEND_TYPES.has(spend_type)) {
      return res.status(400).json({ success: false, code: "BASE_INVALID_SPEND_TYPE", message: "Invalid or missing spend_type" });
    }

    const supabase = getSupabaseAdmin();

    // Use atomic RPC function
    const { data: rpcData, error: rpcError } = await supabase.rpc("base_spend_shared_vault", {
      p_device_id: deviceId,
      p_spend_type: spend_type,
      p_energy_cap: energy_cap || null,
    });

    if (rpcError) {
      const errorMessage = rpcError.message || "Failed to spend from vault";
      
      // Map SQL exceptions to error codes
      if (errorMessage.includes("Invalid spend_type")) {
        return res.status(400).json({ success: false, code: "BASE_INVALID_SPEND_TYPE", message: errorMessage });
      }
      if (errorMessage.includes("Need") && errorMessage.includes("DATA")) {
        return res.status(400).json({ success: false, code: "BASE_INSUFFICIENT_DATA", message: errorMessage });
      }
      if (errorMessage.includes("Energy is already near full")) {
        return res.status(400).json({ success: false, code: "BASE_ENERGY_ALREADY_FULL", message: errorMessage });
      }
      if (errorMessage.includes("Insufficient vault balance") || errorMessage.includes("vault")) {
        return res.status(400).json({ success: false, code: "BASE_VAULT_LOW", message: errorMessage });
      }
      if (errorMessage.includes("Invalid spend type configuration")) {
        return res.status(400).json({ success: false, code: "BASE_INVALID_SPEND_CONFIG", message: errorMessage });
      }
      
      return res.status(400).json({ success: false, code: "BASE_SPEND_FAILED", message: errorMessage });
    }

    const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    if (!result) {
      return res.status(400).json({ success: false, code: "BASE_SPEND_FAILED", message: "RPC returned no data" });
    }

    return res.status(200).json({
      success: true,
      state: result.state,
      spend_type,
      cost: Number(result.cost || 0),
      vault_balance: Number(result.vault_balance || 0),
    });
  } catch (error) {
    console.error("base/action/spend failed", error);
    logError(error, { event: EVENTS.BASE_SPEND_FAIL, deviceId });
    return res.status(500).json({ success: false, code: "BASE_SPEND_INTERNAL_ERROR", message: "Spend action failed" });
  }
}
