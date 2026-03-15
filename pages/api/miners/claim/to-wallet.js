import { getArcadeDevice } from "../../../../lib/server/arcadeDeviceCookie";
import { checkArcadeRateLimit } from "../../../../lib/server/arcadeRateLimit";
import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { validateCsrfToken } from "../../../../lib/server/csrf";
import { logRateLimitExceeded, logCsrfFailure, logValidationFailure, logIpRateLimitExceeded, logSuspiciousActivity } from "../../../../lib/server/securityLogger";
import { checkIpRateLimit } from "../../../../lib/server/ipRateLimit";

function extractRow(data) {
  return Array.isArray(data) ? data[0] : data;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    // CSRF validation
    if (!validateCsrfToken(req)) {
      logCsrfFailure(req);
      return res.status(403).json({ success: false, message: "Invalid CSRF token" });
    }

    // IP-based rate limiting (stricter for wallet claims)
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
    const rate = await checkArcadeRateLimit("miners-claim-wallet", deviceId, 15, 60_000);
    if (!rate.allowed) {
      logRateLimitExceeded(req, "miners-claim-wallet", 15);
      return res.status(429).json({ success: false, message: "Too many wallet claim requests" });
    }

    const wholeAmount = Math.max(0, Math.floor(Number(req.body?.amount) || 0));
    if (wholeAmount <= 0) {
      logValidationFailure(req, "Invalid amount", { amount: req.body?.amount });
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }
    
    // Additional validation: check for suspiciously large amounts
    if (wholeAmount > 1_000_000_000) {
      logSuspiciousActivity(req, `Suspiciously large wallet claim: ${wholeAmount}`);
      return res.status(400).json({ success: false, message: "Amount exceeds maximum" });
    }

    const { data, error } = await supabase.rpc("miners_claim_to_wallet", {
      p_device_id: deviceId,
      p_amount: wholeAmount,
    });

    if (error) {
      return res.status(400).json({ success: false, message: error.message || "Failed to claim miners vault to wallet" });
    }

    const row = extractRow(data);
    return res.status(200).json({
      success: true,
      claimed: Number(row?.claimed || 0),
      vault: Number(row?.vault || 0),
      claimedToWallet: Number(row?.claimed_to_wallet || 0),
      sharedVaultBalance: Number(row?.shared_vault_balance || 0),
    });
  } catch (error) {
    console.error("miners/claim/to-wallet failed", error);
    return res.status(500).json({ success: false, message: "Miners claim-to-wallet API failed" });
  }
}
