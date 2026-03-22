import { getArcadeDevice } from "../../../../lib/server/arcadeDeviceCookie";
import { checkArcadeRateLimit } from "../../../../lib/server/arcadeRateLimit";
import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { checkIpRateLimit } from "../../../../lib/server/ipRateLimit";
import { validateCsrfToken } from "../../../../lib/server/csrf";
import {
  logCsrfFailure,
  logIpRateLimitExceeded,
} from "../../../../lib/server/securityLogger";
import { isBaseDevToolsEnabled } from "../../../../lib/server/baseDevTools";

function includeDevErrorDetail() {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_BASE_DEV_TOOLS === "true"
  );
}

function shouldUseRpcFallback(rpcError) {
  if (!rpcError) return false;
  const code = String(rpcError.code || "");
  const msg = String(rpcError.message || rpcError.details || "");
  if (code === "PGRST202" || code === "42883") return true;
  if (/could not find the function/i.test(msg)) return true;
  if (/function public\.base_dev_set_sector_world/i.test(msg) && /exist/i.test(msg)) return true;
  if (/schema cache/i.test(msg) && /base_dev_set_sector_world/i.test(msg)) return true;
  return false;
}

function normalizeRpcState(data) {
  if (data == null) return null;
  if (Array.isArray(data) && data.length > 0) {
    return normalizeRpcState(data[0]);
  }
  if (typeof data === "object" && !Array.isArray(data)) return data;
  if (typeof data === "string") {
    try {
      const o = JSON.parse(data);
      return typeof o === "object" && o !== null ? o : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * DEV ONLY: direct table update + reconcile when RPC is not deployed or returns unusable payload.
 */
async function devSetSectorWorldFallback(supabase, deviceId, targetWorld) {
  const w = Math.max(1, Math.min(6, Math.floor(Number(targetWorld))));

  const { error: preRecErr } = await supabase.rpc("base_reconcile_state", {
    p_device_id: deviceId,
  });
  if (preRecErr && includeDevErrorDetail()) {
    console.warn("[dev-set-sector] fallback: pre-reconcile", preRecErr.message || preRecErr);
  }

  const { data: row, error: uErr } = await supabase
    .from("base_device_state")
    .update({ sector_world: w, updated_at: new Date().toISOString() })
    .eq("device_id", deviceId)
    .select()
    .maybeSingle();

  if (uErr) {
    throw new Error(uErr.message || "UPDATE base_device_state failed");
  }
  if (!row) {
    throw new Error(
      "No base_device_state row for this device after pre-reconcile (device may be invalid)"
    );
  }

  try {
    await supabase.from("base_action_audit").insert({
      device_id: deviceId,
      action_type: "dev_set_sector_world",
      action_detail: { sector_world: w, path: "api_fallback" },
      suspicion_score: 0,
      suspicion_flags: [],
    });
  } catch (auditErr) {
    console.warn("[dev-set-sector] audit insert skipped", auditErr);
  }

  const { error: postRecErr } = await supabase.rpc("base_reconcile_state", {
    p_device_id: deviceId,
  });
  if (postRecErr && includeDevErrorDetail()) {
    console.warn("[dev-set-sector] fallback: post-reconcile", postRecErr.message || postRecErr);
  }

  const { data: finalRow, error: selErr } = await supabase
    .from("base_device_state")
    .select("*")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (selErr) {
    console.warn("[dev-set-sector] fallback: final select", selErr.message || selErr);
    return row;
  }
  return finalRow || row;
}

export default async function handler(req, res) {
  if (!isBaseDevToolsEnabled()) {
    return res.status(404).json({ success: false, message: "Not found" });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      success: false,
      code: "METHOD_NOT_ALLOWED",
      message: "Method not allowed",
    });
  }

  const devDetail = includeDevErrorDetail();

  try {
    if (!validateCsrfToken(req)) {
      logCsrfFailure(req);
      return res.status(403).json({
        success: false,
        code: "CSRF_INVALID",
        message: "Invalid CSRF token",
      });
    }

    const ipRate = await checkIpRateLimit(req, 40, 60_000);
    if (!ipRate.allowed) {
      logIpRateLimitExceeded(req, 40);
      return res.status(429).json({
        success: false,
        code: "RATE_LIMIT_IP",
        message: "Too many requests from this IP",
      });
    }

    const deviceId = getArcadeDevice(req);
    if (!deviceId) {
      return res.status(401).json({
        success: false,
        code: "DEVICE_NOT_INITIALIZED",
        message: "Device not initialized",
      });
    }

    const rateLimit = await checkArcadeRateLimit(
      "base-action-dev-set-sector",
      deviceId,
      40,
      60_000
    );
    if (!rateLimit.allowed) {
      return res.status(429).json({
        success: false,
        code: "RATE_LIMIT_DEVICE",
        message: "Too many dev sector requests",
      });
    }

    const body = typeof req.body === "object" && req.body !== null ? req.body : {};
    const raw =
      body.target_world ??
      body.targetWorld ??
      body.sector_world ??
      body.sectorWorld;
    const targetWorld = Math.floor(Number(raw));

    if (!Number.isFinite(targetWorld) || targetWorld < 1 || targetWorld > 6) {
      return res.status(400).json({
        success: false,
        code: "BASE_DEV_INVALID_SECTOR",
        message: "target_world must be an integer from 1 to 6",
      });
    }

    let supabase;
    try {
      supabase = getSupabaseAdmin();
    } catch (configErr) {
      console.error("[dev-set-sector] Supabase admin init failed", configErr);
      return res.status(503).json({
        success: false,
        code: "SUPABASE_CONFIG",
        message: devDetail
          ? String(configErr.message || configErr)
          : "Server storage is not configured",
      });
    }

    const { data: rpcData, error: rpcError } = await supabase.rpc("base_dev_set_sector_world", {
      p_device_id: deviceId,
      p_world: targetWorld,
    });

    if (!rpcError) {
      const state = normalizeRpcState(rpcData);
      if (state && typeof state === "object") {
        return res.status(200).json({
          success: true,
          state,
          sector_world: Number(state.sector_world ?? targetWorld),
        });
      }
      console.warn(
        "[dev-set-sector] RPC returned no usable JSON state; trying fallback",
        rpcData
      );
      try {
        const state = await devSetSectorWorldFallback(supabase, deviceId, targetWorld);
        return res.status(200).json({
          success: true,
          state,
          sector_world: Number(state.sector_world ?? targetWorld),
        });
      } catch (fbErr) {
        console.error("[dev-set-sector] fallback after empty RPC failed", fbErr);
        return res.status(500).json({
          success: false,
          code: "BASE_DEV_SET_SECTOR_EMPTY_RPC",
          message: devDetail
            ? `RPC returned empty state; fallback failed: ${fbErr.message || fbErr}`
            : "Dev sector update failed",
        });
      }
    }

    console.error("[dev-set-sector] base_dev_set_sector_world RPC error", rpcError);

    if (shouldUseRpcFallback(rpcError)) {
      try {
        const state = await devSetSectorWorldFallback(supabase, deviceId, targetWorld);
        return res.status(200).json({
          success: true,
          state,
          sector_world: Number(state.sector_world ?? targetWorld),
        });
      } catch (fallbackErr) {
        console.error("[dev-set-sector] fallback path failed", fallbackErr);
        return res.status(500).json({
          success: false,
          code: "BASE_DEV_SET_SECTOR_FALLBACK_FAILED",
          message: devDetail
            ? `${fallbackErr.message || fallbackErr} (RPC: ${rpcError.message || rpcError.code})`
            : "Dev sector update failed",
          rpcCode: devDetail ? rpcError.code : undefined,
          rpcMessage: devDetail ? rpcError.message : undefined,
        });
      }
    }

    return res.status(400).json({
      success: false,
      code: "BASE_DEV_SET_SECTOR_FAILED",
      message: rpcError.message || "Dev sector RPC failed",
      hint: devDetail ? rpcError.hint : undefined,
      details: devDetail ? rpcError.details : undefined,
      rpcCode: devDetail ? rpcError.code : undefined,
    });
  } catch (error) {
    console.error("[dev-set-sector] unhandled exception", error);
    return res.status(500).json({
      success: false,
      code: "BASE_DEV_SET_SECTOR_INTERNAL",
      message: devDetail
        ? String(error?.message || error)
        : "Dev sector action failed",
      stack: devDetail ? String(error?.stack || "") : undefined,
    });
  }
}
