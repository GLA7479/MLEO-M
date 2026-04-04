import { ensureArcadeDevice } from "../../../lib/server/arcadeDeviceCookie";
import { validateCsrfToken } from "../../../lib/server/csrf";
import { logCsrfFailure } from "../../../lib/server/securityLogger";

export default function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    if (req.method === "POST") {
      if (!validateCsrfToken(req)) {
        logCsrfFailure(req);
        return res.status(403).json({ success: false, message: "Invalid CSRF token" });
      }
    }

    const deviceId = ensureArcadeDevice(req, res);
    return res.status(200).json({ success: true, hasDevice: Boolean(deviceId) });
  } catch (err) {
    const msg = String(err?.message || err || "");
    console.error("[api/arcade/device]", msg);
    const config =
      /missing signing secret/i.test(msg) ||
      /missing csrf_secret/i.test(msg) ||
      /missing csrf secret/i.test(msg);
    if (config) {
      return res.status(503).json({
        success: false,
        code: "ARCADE_SIGNING_SECRET_REQUIRED",
        message:
          "Server signing secret is not configured. Set CSRF_SECRET or NEXTAUTH_SECRET (or SESSION_COOKIE_SECRET / ARCADE_DEVICE_COOKIE_SECRET). For local `next start` without .env, you may set MLEO_ALLOW_INSECURE_SIGNING_PLACEHOLDER=true (not for real production).",
      });
    }
    return res.status(500).json({
      success: false,
      code: "ARCADE_DEVICE_ERROR",
      message: msg || "Arcade device initialization failed",
    });
  }
}
