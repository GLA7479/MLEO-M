import crypto from "crypto";
import { getArcadeDevice } from "../../../../lib/server/arcadeDeviceCookie";
import { checkArcadeRateLimit } from "../../../../lib/server/arcadeRateLimit";
import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { checkIpRateLimit } from "../../../../lib/server/ipRateLimit";
import { validateCsrfToken } from "../../../../lib/server/csrf";
import { logIpRateLimitExceeded, logSuspiciousActivity, logCsrfFailure } from "../../../../lib/server/securityLogger";

const MAX_BASE_DELTA = 5_000_000;
const ALLOWED_REASONS = new Set([
  "mleo-base-ship",
  "mleo-base-spend",
]);

function extractRow(data) {
  return Array.isArray(data) ? data[0] : data;
}

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

    // IP-based rate limiting
    const ipRate = await checkIpRateLimit(req, 60, 60_000);
    if (!ipRate.allowed) {
      logIpRateLimitExceeded(req, 60);
      return res.status(429).json({ success: false, message: "Too many requests from this IP" });
    }

    const supabase = getSupabaseAdmin();
    const deviceId = getArcadeDevice(req);
    if (!deviceId) {
      return res.status(401).json({ success: false, message: "Device not initialized" });
    }
    const rateLimit = await checkArcadeRateLimit("base-vault-apply", deviceId, 40, 60_000);
    if (!rateLimit.allowed) {
      return res.status(429).json({ success: false, message: "Too many base vault requests" });
    }

    const { delta, reason = "mleo-base" } = req.body || {};
    const reasonKey = String(reason || "mleo-base").trim().toLowerCase();
    const wholeDelta = Math.trunc(Number(delta) || 0);

    if (!wholeDelta) {
      return res.status(400).json({ success: false, message: "Invalid delta" });
    }

    if (!ALLOWED_REASONS.has(reasonKey)) {
      return res.status(400).json({ success: false, message: "Invalid reason" });
    }

    if (Math.abs(wholeDelta) > MAX_BASE_DELTA) {
      logSuspiciousActivity(req, `Delta exceeds limit: ${wholeDelta}`);
      return res.status(400).json({ success: false, message: "Delta exceeds limit" });
    }

    if (reasonKey.endsWith("-ship") && wholeDelta < 0) {
      return res.status(400).json({ success: false, message: "Invalid delta sign for ship action" });
    }

    if (reasonKey.endsWith("-spend") && wholeDelta > 0) {
      return res.status(400).json({ success: false, message: "Invalid delta sign for spend action" });
    }

    const { data, error } = await supabase.rpc("sync_vault_delta", {
      p_game_id: reasonKey,
      p_delta: wholeDelta,
      p_device_id: deviceId,
      p_prev_nonce: null,
      p_next_nonce: crypto.randomUUID(),
    });

    if (error) {
      const message = error.message?.includes("Insufficient")
        ? "Insufficient vault balance"
        : (error.message || "Failed to apply vault delta");
      return res.status(400).json({ success: false, message });
    }

    const row = extractRow(data);
    return res.status(200).json({
      success: true,
      balance: Number(row?.new_balance ?? row ?? 0),
    });
  } catch (error) {
    console.error("base/vault/apply failed", error);
    return res.status(500).json({ success: false, message: "Base vault apply API failed" });
  }
}
