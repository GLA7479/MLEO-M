import { getArcadeDevice } from "../../../../lib/server/arcadeDeviceCookie";
import { checkArcadeRateLimit } from "../../../../lib/server/arcadeRateLimit";
import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { checkIpRateLimit } from "../../../../lib/server/ipRateLimit";
import { validateCsrfToken } from "../../../../lib/server/csrf";
import { logCsrfFailure, logIpRateLimitExceeded } from "../../../../lib/server/securityLogger";

const MODULES = {
  servoDrill: { GOLD: 320, SCRAP: 50 },
  vaultCompressor: { GOLD: 420, ORE: 120, SCRAP: 70 },
  arcadeRelay: { GOLD: 520, ORE: 160, SCRAP: 90 },
  minerLink: { GOLD: 700, ORE: 260, SCRAP: 110 },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      success: false,
      code: "METHOD_NOT_ALLOWED",
      message: "Method not allowed",
    });
  }

  try {
    if (!validateCsrfToken(req)) {
      logCsrfFailure(req);
      return res.status(403).json({
        success: false,
        code: "CSRF_INVALID",
        message: "Invalid CSRF token",
      });
    }

    const ipRate = await checkIpRateLimit(req, 60, 60_000);
    if (!ipRate.allowed) {
      logIpRateLimitExceeded(req, 60);
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
      "base-action-module",
      deviceId,
      20,
      60_000
    );
    if (!rateLimit.allowed) {
      return res.status(429).json({
        success: false,
        code: "RATE_LIMIT_DEVICE",
        message: "Too many module requests",
      });
    }

    const { module_key } = req.body || {};
    if (!module_key || typeof module_key !== "string") {
      return res.status(400).json({
        success: false,
        code: "BASE_INVALID_MODULE_KEY",
        message: "Missing or invalid module_key",
      });
    }

    const def = MODULES[module_key];
    if (!def) {
      return res.status(400).json({
        success: false,
        code: "BASE_MODULE_NOT_FOUND",
        message: "Invalid module key",
      });
    }

    const supabase = getSupabaseAdmin();

    await supabase.rpc("base_reconcile_state", { p_device_id: deviceId });

    const { data: row, error } = await supabase
      .from("base_device_state")
      .select("*")
      .eq("device_id", deviceId)
      .single();

    if (error || !row) {
      return res.status(400).json({
        success: false,
        code: "BASE_STATE_LOAD_FAILED",
        message: error?.message || "Failed to load state",
      });
    }

    const modules = row.modules || {};
    const resources = row.resources || {};

    if (modules[module_key]) {
      return res.status(400).json({
        success: false,
        code: "BASE_MODULE_ALREADY_INSTALLED",
        message: "Module already installed",
      });
    }

    for (const [key, value] of Object.entries(def)) {
      if (Number(resources[key] || 0) < value) {
        return res.status(400).json({
          success: false,
          code: "BASE_INSUFFICIENT_RESOURCES",
          message: `Not enough ${key}`,
        });
      }
    }

    const nextResources = { ...resources };
    for (const [key, value] of Object.entries(def)) {
      nextResources[key] = Math.max(
        0,
        Number(nextResources[key] || 0) - Number(value || 0)
      );
    }

    const nextModules = { ...modules, [module_key]: true };

    const { error: updateError } = await supabase
      .from("base_device_state")
      .update({
        resources: nextResources,
        modules: nextModules,
        updated_at: new Date().toISOString(),
      })
      .eq("device_id", deviceId);

    if (updateError) {
      return res.status(400).json({
        success: false,
        code: "BASE_STATE_UPDATE_FAILED",
        message: updateError.message || "Failed to update state",
      });
    }

    const { data: finalState, error: finalError } = await supabase.rpc(
      "base_reconcile_state",
      { p_device_id: deviceId }
    );

    if (finalError) {
      return res.status(400).json({
        success: false,
        code: "BASE_RECONCILE_FAILED",
        message: finalError.message || "Failed to reconcile final state",
      });
    }

    const state = Array.isArray(finalState) ? finalState[0] : finalState;

    return res.status(200).json({
      success: true,
      state,
      module_key,
    });
  } catch (error) {
    console.error("base/action/module failed", error);
    return res.status(500).json({
      success: false,
      code: "BASE_MODULE_INTERNAL_ERROR",
      message: "Module action failed",
    });
  }
}
