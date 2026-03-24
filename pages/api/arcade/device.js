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
    console.error("[api/arcade/device]", err?.message || err);
    return res.status(500).json({
      success: false,
      message: err?.message || "Arcade device initialization failed",
    });
  }
}
