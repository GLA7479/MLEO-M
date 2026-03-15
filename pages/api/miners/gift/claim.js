import { getArcadeDevice } from "../../../../lib/server/arcadeDeviceCookie";
import { checkArcadeRateLimit } from "../../../../lib/server/arcadeRateLimit";
import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { validateCsrfToken } from "../../../../lib/server/csrf";
import { logRateLimitExceeded, logCsrfFailure, logIpRateLimitExceeded } from "../../../../lib/server/securityLogger";
import { checkIpRateLimit } from "../../../../lib/server/ipRateLimit";

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
    const rate = await checkArcadeRateLimit("miners-gift-claim", deviceId, 20, 60_000);
    if (!rate.allowed) {
      logRateLimitExceeded(req, "miners-gift-claim", 20);
      return res.status(429).json({ success: false, code: "RATE_LIMIT_DEVICE", message: "Too many gift claim requests" });
    }

    const { data, error } = await supabase.rpc("miners_claim_hourly_gift", {
      p_device_id: deviceId,
    });

    if (error) {
      const notReady = String(error.message || "").toLowerCase().includes("not ready");
      return res.status(notReady ? 409 : 400).json({
        success: false,
        code: notReady ? "MINERS_GIFT_NOT_READY" : "MINERS_GIFT_CLAIM_FAILED",
        message: error.message || "Failed to claim hourly gift",
      });
    }

    const row = extractRow(data);
    return res.status(200).json({
      success: true,
      rewardKey: row?.reward_key || null,
      coinsPct: Number(row?.coins_pct || 0),
      dpsMultiplier: Number(row?.dps_multiplier || 1),
      goldMultiplier: Number(row?.gold_multiplier || 1),
      diamonds: Number(row?.diamonds || 0),
      mleoBonus: Number(row?.mleo_bonus || 0),
      nextClaimAt: row?.next_claim_at || null,
      balance: Number(row?.balance || 0),
      minedToday: Number(row?.mined_today || 0),
    });
  } catch (error) {
    console.error("miners/gift/claim failed", error);
    return res.status(500).json({ success: false, code: "MINERS_GIFT_INTERNAL_ERROR", message: "Miners gift claim API failed" });
  }
}
