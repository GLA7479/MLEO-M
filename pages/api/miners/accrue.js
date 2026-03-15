import { getArcadeDevice } from "../../../lib/server/arcadeDeviceCookie";
import { checkArcadeRateLimit } from "../../../lib/server/arcadeRateLimit";
import { getSupabaseAdmin } from "../../../lib/server/supabaseAdmin";
import { validateCsrfToken } from "../../../lib/server/csrf";
import { logSuspiciousActivity, logValidationFailure, logRateLimitExceeded, logCsrfFailure, logIpRateLimitExceeded } from "../../../lib/server/securityLogger";
import { checkIpRateLimit } from "../../../lib/server/ipRateLimit";
import { logEvent, logError, EVENTS } from "../../../lib/server/monitoring";

function extractRow(data) {
  return Array.isArray(data) ? data[0] : data;
}

function normalizeStageCounts(raw) {
  const MIN_STAGE = 1;
  const MAX_STAGE = 100000; // הסרת מגבלה - רק sanity check נגד abuse
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

const isDev = process.env.NODE_ENV !== "production";

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

    // IP-based rate limiting (stricter)
    const ipRate = await checkIpRateLimit(req, 200, 60_000);
    if (!ipRate.allowed) {
      logIpRateLimitExceeded(req, 200);
      return res.status(429).json({ success: false, code: "RATE_LIMIT_IP", message: "Too many requests from this IP" });
    }

    const supabase = getSupabaseAdmin();
    const deviceId = getArcadeDevice(req);
    if (!deviceId) {
      return res.status(401).json({ success: false, code: "DEVICE_NOT_INITIALIZED", message: "Device not initialized" });
    }
    const rate = await checkArcadeRateLimit("miners-accrue", deviceId, 120, 60_000);
    if (!rate.allowed) {
      logRateLimitExceeded(req, "miners-accrue", 120);
      return res.status(429).json({ success: false, code: "RATE_LIMIT_DEVICE", message: "Too many miners accrue requests" });
    }

    const { stageCounts: rawStageCounts, offline = false } = req.body || {};
    const { stageCounts, total } = normalizeStageCounts(rawStageCounts);

    if (!total) {
      logValidationFailure(req, "Missing stageCounts", { rawStageCounts });
      return res.status(400).json(
        isDev
          ? {
              success: false,
              code: "MINERS_EMPTY_BALANCE",
              message: "Missing stageCounts",
              debug: { rawStageCounts, normalized: stageCounts, total },
            }
          : {
              success: false,
              code: "MINERS_EMPTY_BALANCE",
              message: "Missing stageCounts",
            }
      );
    }
    if (total > 120) {
      logSuspiciousActivity(req, `Too many breaks in batch: ${total}`);
      return res.status(400).json({ success: false, code: "MINERS_BATCH_TOO_LARGE", message: "Too many breaks in one batch" });
    }

    const { data, error } = await supabase.rpc("miners_apply_breaks", {
      p_device_id: deviceId,
      p_stage_counts: stageCounts,
      p_offline: Boolean(offline),
    });

    if (error) {
      console.error("miners_apply_breaks RPC error:", error);
      logEvent(EVENTS.MINERS_ACCRUE_FAIL, { deviceId, error: error.message, stageCounts });
      return res.status(400).json(
        isDev
          ? {
              success: false,
              code: "MINERS_ACCRUE_FAILED",
              message: error.message || "Failed to apply miners accrual",
              errorCode: error.code,
              errorDetails: error.details,
            }
          : {
              success: false,
              code: "MINERS_ACCRUE_FAILED",
              message: "Failed to apply miners accrual",
            }
      );
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
    logError(error, { event: EVENTS.MINERS_ACCRUE_FAIL, deviceId });
    return res.status(500).json(
      isDev
        ? {
            success: false,
            code: "MINERS_ACCRUE_INTERNAL_ERROR",
            message: "Miners accrue API failed",
            error: error.message,
          }
        : {
            success: false,
            code: "MINERS_ACCRUE_INTERNAL_ERROR",
            message: "Miners accrue API failed",
          }
    );
  }
}
