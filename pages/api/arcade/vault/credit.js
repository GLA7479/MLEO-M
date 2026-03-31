import crypto from "crypto";
import { getArcadeDevice } from "../../../../lib/server/arcadeDeviceCookie";
import { checkArcadeRateLimit } from "../../../../lib/server/arcadeRateLimit";
import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { checkIpRateLimit } from "../../../../lib/server/ipRateLimit";
import { validateCsrfToken } from "../../../../lib/server/csrf";
import { logIpRateLimitExceeded, logValidationFailure, logCsrfFailure } from "../../../../lib/server/securityLogger";
import { validatePositiveInteger, sanitizeGameId } from "../../../../lib/server/inputValidation";

function extractRow(data) {
  return Array.isArray(data) ? data[0] : data;
}

/**
 * Server-authoritative vault credit (positive delta).
 * Browser cannot call `sync_vault_delta` for credits; settlement payouts use this route.
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    if (!validateCsrfToken(req)) {
      logCsrfFailure(req);
      return res.status(403).json({ success: false, message: "Invalid CSRF token" });
    }

    const ipRate = await checkIpRateLimit(req, 20, 60_000);
    if (!ipRate.allowed) {
      logIpRateLimitExceeded(req, 20);
      return res.status(429).json({ success: false, message: "Too many requests from this IP" });
    }

    const supabase = getSupabaseAdmin();
    const deviceId = getArcadeDevice(req);
    if (!deviceId) {
      return res.status(401).json({ success: false, message: "Device not initialized" });
    }
    const rateLimit = await checkArcadeRateLimit("arcade-vault-credit", deviceId, 30, 60_000);
    if (!rateLimit.allowed) {
      return res.status(429).json({ success: false, message: "Too many vault credit requests" });
    }

    const { amount, gameId = "arcade-credit" } = req.body || {};
    const wholeAmount = validatePositiveInteger(amount, 10_000_000);
    if (!wholeAmount) {
      logValidationFailure(req, "Invalid amount", { amount });
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    const sanitizedGameId = sanitizeGameId(gameId) || "arcade-credit";

    const { data, error } = await supabase.rpc("sync_vault_delta", {
      p_game_id: sanitizedGameId,
      p_delta: wholeAmount,
      p_device_id: deviceId,
      p_prev_nonce: null,
      p_next_nonce: crypto.randomUUID(),
    });

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || "Failed to credit vault",
      });
    }

    const row = extractRow(data);
    return res.status(200).json({
      success: true,
      balance: Number(row?.new_balance ?? row ?? 0),
    });
  } catch (error) {
    console.error("arcade/vault/credit failed", error);
    return res.status(500).json({ success: false, message: "Arcade vault credit API failed" });
  }
}
