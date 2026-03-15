import { getArcadeDevice } from "../../../../lib/server/arcadeDeviceCookie";
import { checkArcadeRateLimit } from "../../../../lib/server/arcadeRateLimit";
import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { validateCsrfToken } from "../../../../lib/server/csrf";
import { logRateLimitExceeded, logCsrfFailure, logValidationFailure, logIpRateLimitExceeded } from "../../../../lib/server/securityLogger";
import { checkIpRateLimit } from "../../../../lib/server/ipRateLimit";
import { logEvent, logError, EVENTS } from "../../../../lib/server/monitoring";

function extractRow(data) {
  return Array.isArray(data) ? data[0] : data;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, code: "METHOD_NOT_ALLOWED", message: "Method not allowed" });
  }

  try {
    // CSRF validation
    if (!validateCsrfToken(req)) {
      logCsrfFailure(req);
      return res.status(403).json({ success: false, code: "CSRF_INVALID", message: "Invalid CSRF token" });
    }

    // IP-based rate limiting
    const ipRate = await checkIpRateLimit(req, 30, 60_000);
    if (!ipRate.allowed) {
      logIpRateLimitExceeded(req, 30);
      return res.status(429).json({ success: false, code: "RATE_LIMIT_IP", message: "Too many requests from this IP" });
    }

    const supabase = getSupabaseAdmin();
    const deviceId = getArcadeDevice(req);
    if (!deviceId) {
      return res.status(401).json({ success: false, code: "DEVICE_NOT_INITIALIZED", message: "Device not initialized" });
    }
    const rate = await checkArcadeRateLimit("miners-claim-vault", deviceId, 20, 60_000);
    if (!rate.allowed) {
      logRateLimitExceeded(req, "miners-claim-vault", 20);
      return res.status(429).json({ success: false, code: "RATE_LIMIT_DEVICE", message: "Too many claim-to-vault requests" });
    }

    const wholeAmount = Math.max(0, Math.floor(Number(req.body?.amount) || 0));
    const amountParam = wholeAmount > 0 ? wholeAmount : null;

    const { data, error } = await supabase.rpc("miners_move_balance_to_vault", {
      p_device_id: deviceId,
      p_amount: amountParam,
    });

    if (error) {
      logEvent(EVENTS.MINERS_CLAIM_TO_VAULT_FAIL, { deviceId, amount: wholeAmount, error: error.message });
      return res.status(400).json({ success: false, code: "MINERS_CLAIM_TO_VAULT_FAILED", message: error.message || "Failed to move miners balance to vault" });
    }

    const row = extractRow(data);
    return res.status(200).json({
      success: true,
      moved: Number(row?.moved || 0),
      balance: Number(row?.balance || 0),
      vault: Number(row?.vault || 0),
      claimedTotal: Number(row?.claimed_total || 0),
      sharedVaultBalance: Number(row?.shared_vault_balance || 0),
    });
  } catch (error) {
    console.error("miners/claim/to-vault failed", error);
    logError(error, { event: EVENTS.MINERS_CLAIM_TO_VAULT_FAIL, deviceId });
    return res.status(500).json({ success: false, code: "MINERS_CLAIM_TO_VAULT_INTERNAL_ERROR", message: "Miners claim-to-vault API failed" });
  }
}
