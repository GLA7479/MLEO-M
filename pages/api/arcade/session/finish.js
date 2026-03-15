import { getArcadeDevice } from "../../../../lib/server/arcadeDeviceCookie";
import { checkArcadeRateLimit } from "../../../../lib/server/arcadeRateLimit";
import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { checkIpRateLimit } from "../../../../lib/server/ipRateLimit";
import { validateCsrfToken } from "../../../../lib/server/csrf";
import { logIpRateLimitExceeded, logValidationFailure, logCsrfFailure } from "../../../../lib/server/securityLogger";
import { validateUuid, validateObject } from "../../../../lib/server/inputValidation";

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
    const ipRate = await checkIpRateLimit(req, 80, 60_000);
    if (!ipRate.allowed) {
      logIpRateLimitExceeded(req, 80);
      return res.status(429).json({ success: false, message: "Too many requests from this IP" });
    }

    const supabase = getSupabaseAdmin();
    const deviceId = getArcadeDevice(req);
    if (!deviceId) {
      return res.status(401).json({ success: false, message: "Device not initialized" });
    }
    const rateLimit = await checkArcadeRateLimit("arcade-finish", deviceId, 60, 60_000);
    if (!rateLimit.allowed) {
      return res.status(429).json({ success: false, message: "Too many finish requests" });
    }
    const { sessionId, payload = {} } = req.body || {};

    // Validate sessionId (UUID)
    if (!sessionId || !validateUuid(sessionId)) {
      logValidationFailure(req, "Invalid sessionId", { sessionId });
      return res.status(400).json({ success: false, message: "Invalid sessionId" });
    }

    // Validate payload (object, max 50 keys)
    const validatedPayload = validateObject(payload, 50);
    if (!validatedPayload) {
      logValidationFailure(req, "Invalid payload", { payload });
      return res.status(400).json({ success: false, message: "Invalid payload" });
    }

    const { data: sessionRow, error: sessionError } = await supabase
      .from("arcade_device_sessions")
      .select("id, device_id")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionError) {
      throw sessionError;
    }

    if (!sessionRow) {
      return res.status(404).json({ success: false, message: "Session not found" });
    }

    if (sessionRow.device_id !== deviceId) {
      return res.status(403).json({ success: false, message: "Session does not belong to this device" });
    }

    const { data, error } = await supabase.rpc("finish_arcade_session", {
      p_session_id: sessionId,
      p_payload: validatedPayload,
    });

    if (error) {
      return res.status(400).json({ success: false, message: error.message || "Failed to finish session" });
    }

    const row = extractRow(data);
    return res.status(200).json({
      success: true,
      sessionId: row?.session_id || sessionId,
      approvedReward: Number(row?.approved_reward || 0),
      balanceAfter: Number(row?.balance_after || 0),
      status: row?.status || "finished",
      serverPayload: row?.server_payload || {},
    });
  } catch (error) {
    console.error("arcade/session/finish failed", error);
    return res.status(500).json({ success: false, message: "Arcade finish API failed" });
  }
}
