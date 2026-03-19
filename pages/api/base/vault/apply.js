import { getArcadeDevice } from "../../../../lib/server/arcadeDeviceCookie";
import { checkArcadeRateLimit } from "../../../../lib/server/arcadeRateLimit";
import { checkIpRateLimit } from "../../../../lib/server/ipRateLimit";
import { validateCsrfToken } from "../../../../lib/server/csrf";
import {
  logIpRateLimitExceeded,
  logSuspiciousActivity,
  logCsrfFailure,
} from "../../../../lib/server/securityLogger";

const BLOCKED_REASONS = new Set([
  "mleo-base",
  "mleo-base-ship",
  "mleo-base-spend",
  "mleo-base-logistics-bonus",
]);

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

    const ipRate = await checkIpRateLimit(req, 30, 60_000);
    if (!ipRate.allowed) {
      logIpRateLimitExceeded(req, 30);
      return res.status(429).json({ success: false, message: "Too many requests from this IP" });
    }

    const deviceId = getArcadeDevice(req);
    if (!deviceId) {
      return res.status(401).json({ success: false, message: "Device not initialized" });
    }
    const rateLimit = await checkArcadeRateLimit("base-vault-apply", deviceId, 20, 60_000);
    if (!rateLimit.allowed) {
      return res.status(429).json({ success: false, message: "Too many base vault requests" });
    }

    const { delta, reason = "mleo-base" } = req.body || {};
    const reasonKey = String(reason || "mleo-base").trim().toLowerCase();
    const wholeDelta = Math.trunc(Number(delta) || 0);

    logSuspiciousActivity("BASE_VAULT_APPLY_BLOCKED", {
      deviceId,
      reason: reasonKey,
      delta: wholeDelta,
      ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown",
      ua: req.headers["user-agent"] || "unknown",
    });

    if (BLOCKED_REASONS.has(reasonKey)) {
      return res.status(403).json({
        success: false,
        message: "BASE vault delta API is disabled. Use atomic BASE action endpoints only.",
      });
    }

    return res.status(403).json({
      success: false,
      message: "Unsupported BASE vault reason",
    });
  } catch (error) {
    console.error("base/vault/apply failed", error);
    return res.status(500).json({ success: false, message: "Base vault apply API failed" });
  }
}
