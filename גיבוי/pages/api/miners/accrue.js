import { getArcadeDevice } from "../../../lib/server/arcadeDeviceCookie";
import { checkArcadeRateLimit } from "../../../lib/server/arcadeRateLimit";
import { getSupabaseAdmin } from "../../../lib/server/supabaseAdmin";
import { validateCsrfToken } from "../../../lib/server/csrf";
import { logSuspiciousActivity, logValidationFailure, logRateLimitExceeded, logCsrfFailure, logIpRateLimitExceeded } from "../../../lib/server/securityLogger";
import { checkIpRateLimit } from "../../../lib/server/ipRateLimit";

function extractRow(data) {
  return Array.isArray(data) ? data[0] : data;
}

function normalizeStageCounts(raw) {
  const MIN_STAGE = 1;
  const MAX_STAGE = 10;
  const src = raw && typeof raw === "object" ? raw : {};
  const out = {};
  let total = 0;
  for (const [k, v] of Object.entries(src)) {
    const parsedStage = Math.floor(Number(k) || 0);
    if (parsedStage < MIN_STAGE || parsedStage > MAX_STAGE) continue;
    const stage = parsedStage;
    const count = Math.max(0, Math.floor(Number(v) || 0));
    if (!count) continue;
    out[String(stage)] = (out[String(stage)] || 0) + count;
    total += count;
  }
  return { stageCounts: out, total };
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

    // IP-based rate limiting (stricter)
    const ipRate = await checkIpRateLimit(req, 200, 60_000);
    if (!ipRate.allowed) {
      logIpRateLimitExceeded(req, 200);
      return res.status(429).json({ success: false, message: "Too many requests from this IP" });
    }

    const supabase = getSupabaseAdmin();
    const deviceId = getArcadeDevice(req);
    if (!deviceId) {
      return res.status(401).json({ success: false, message: "Device not initialized" });
    }
    const rate = await checkArcadeRateLimit("miners-accrue", deviceId, 120, 60_000);
    if (!rate.allowed) {
      logRateLimitExceeded(req, "miners-accrue", 120);
      return res.status(429).json({ success: false, message: "Too many miners accrue requests" });
    }

    const { stageCounts: rawStageCounts, offline = false } = req.body || {};
    const { stageCounts, total } = normalizeStageCounts(rawStageCounts);

    if (!total) {
      logValidationFailure(req, "Missing stageCounts", { rawStageCounts });
      return res.status(400).json({ 
        success: false, 
        message: "Missing stageCounts",
        debug: { rawStageCounts, normalized: stageCounts, total }
      });
    }
    if (total > 120) {
      logSuspiciousActivity(req, `Too many breaks in batch: ${total}`);
      return res.status(400).json({ success: false, message: "Too many breaks in one batch" });
    }

    const { data, error } = await supabase.rpc("miners_apply_breaks", {
      p_device_id: deviceId,
      p_stage_counts: stageCounts,
      p_offline: Boolean(offline),
    });

    if (error) {
      console.error("miners_apply_breaks RPC error:", error);
      return res.status(400).json({ 
        success: false, 
        message: error.message || "Failed to apply miners accrual",
        errorCode: error.code,
        errorDetails: error.details
      });
    }

    const row = extractRow(data);
    return res.status(200).json({
      success: true,
      added: Number(row?.added || 0),
      balance: Number(row?.balance || 0),
      minedToday: Number(row?.mined_today || 0),
      dailyCap: Number(row?.daily_cap || 0),
      softcutFactor: Number(row?.softcut_factor || 1),
    });
  } catch (error) {
    console.error("miners/accrue failed", error);
    return res.status(500).json({ 
      success: false, 
      message: "Miners accrue API failed",
      error: error.message
    });
  }
}
