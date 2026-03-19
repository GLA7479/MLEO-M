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
      "base-action-contract-claim",
      deviceId,
      20,
      60_000
    );
    if (!rateLimit.allowed) {
      return res.status(429).json({
        success: false,
        code: "RATE_LIMIT_DEVICE",
        message: "Too many contract claim requests",
      });
    }

    const contractKey = String(req.body?.contract_key || "").trim();
    if (!contractKey) {
      return res.status(400).json({
        success: false,
        code: "BASE_INVALID_CONTRACT_KEY",
        message: "Missing or invalid contract_key",
      });
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase.rpc("base_claim_contract", {
      p_device_id: deviceId,
      p_contract_key: contractKey,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        code: "BASE_CONTRACT_CLAIM_FAILED",
        message: error.message || "Failed to claim contract reward",
      });
    }

    const row = Array.isArray(data) ? data[0] : data;
    const state = row?.state || row || null;

    if (!state) {
      return res.status(400).json({
        success: false,
        code: "BASE_CONTRACT_CLAIM_FAILED",
        message: "RPC returned no data",
      });
    }

    return res.status(200).json({
      success: true,
      state,
      contract_key: contractKey,
    });
  } catch (error) {
    console.error("base/action/contract-claim failed", error);
    return res.status(500).json({
      success: false,
      code: "BASE_CONTRACT_CLAIM_INTERNAL_ERROR",
      message: "Contract claim failed",
    });
  }
}
