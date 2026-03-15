import crypto from "crypto";
import { getArcadeDevice } from "../../../../lib/server/arcadeDeviceCookie";
import { checkArcadeRateLimit } from "../../../../lib/server/arcadeRateLimit";
import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { checkIpRateLimit } from "../../../../lib/server/ipRateLimit";
import { logIpRateLimitExceeded, logValidationFailure } from "../../../../lib/server/securityLogger";
import { validatePositiveInteger, sanitizeGameId } from "../../../../lib/server/inputValidation";

function extractRow(data) {
  return Array.isArray(data) ? data[0] : data;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    // IP-based rate limiting
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
    const rateLimit = checkArcadeRateLimit("arcade-vault-claim", deviceId, 10, 60_000);
    if (!rateLimit.allowed) {
      return res.status(429).json({ success: false, message: "Too many vault claim requests" });
    }
    const { amount, gameId = "arcade-claim" } = req.body || {};
    
    // Validate amount
    const wholeAmount = validatePositiveInteger(amount, 10_000_000);
    if (!wholeAmount) {
      logValidationFailure(req, "Invalid amount", { amount });
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    // Validate gameId
    const sanitizedGameId = sanitizeGameId(gameId) || "arcade-claim";

    const { data, error } = await supabase.rpc("sync_vault_delta", {
      p_game_id: sanitizedGameId,
      p_delta: -wholeAmount,
      p_device_id: deviceId,
      p_prev_nonce: null,
      p_next_nonce: crypto.randomUUID(),
    });

    if (error) {
      const message = error.message?.includes("Insufficient")
        ? "Insufficient vault balance"
        : error.message || "Failed to debit vault";
      return res.status(400).json({ success: false, message });
    }

    const row = extractRow(data);
    return res.status(200).json({
      success: true,
      balance: Number(row?.new_balance ?? row ?? 0),
    });
  } catch (error) {
    console.error("arcade/vault/claim failed", error);
    return res.status(500).json({ success: false, message: "Arcade vault claim API failed" });
  }
}
