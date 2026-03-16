import { getArcadeDevice } from "../../../../lib/server/arcadeDeviceCookie";
import { checkArcadeRateLimit } from "../../../../lib/server/arcadeRateLimit";
import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { checkIpRateLimit } from "../../../../lib/server/ipRateLimit";
import { validateCsrfToken } from "../../../../lib/server/csrf";
import { logCsrfFailure, logIpRateLimitExceeded } from "../../../../lib/server/securityLogger";

const BUILDINGS = {
  hq: { GOLD: 80, ORE: 40, growth: 1.18 },
  quarry: { GOLD: 60, growth: 1.18 },
  tradeHub: { GOLD: 75, ORE: 20, growth: 1.18 },
  salvage: { GOLD: 110, ORE: 55, growth: 1.2 },
  refinery: { GOLD: 180, ORE: 110, SCRAP: 20, growth: 1.25 },
  powerCell: { GOLD: 140, SCRAP: 24, growth: 1.22 },
  minerControl: { GOLD: 320, ORE: 120, SCRAP: 40, growth: 1.22 },
  arcadeHub: { GOLD: 360, ORE: 90, SCRAP: 50, growth: 1.24 },
  expeditionBay: { GOLD: 500, ORE: 180, SCRAP: 85, growth: 1.26 },
  logisticsCenter: { ORE: 220, GOLD: 180, SCRAP: 90, growth: 1.7 },
  researchLab: { ORE: 180, GOLD: 240, SCRAP: 110, growth: 1.75 },
  repairBay: { ORE: 160, GOLD: 160, SCRAP: 140, growth: 1.7 },
};

function buildingCost(def, level) {
  const factor = Math.pow(def.growth || 1, level);
  const out = {};
  for (const [k, v] of Object.entries(def)) {
    if (k === "growth") continue;
    out[k] = Math.ceil(v * factor);
  }
  return out;
}

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
      "base-action-build",
      deviceId,
      30,
      60_000
    );
    if (!rateLimit.allowed) {
      return res.status(429).json({
        success: false,
        code: "RATE_LIMIT_DEVICE",
        message: "Too many build requests",
      });
    }

    const { building_key } = req.body || {};
    if (!building_key || typeof building_key !== "string") {
      return res.status(400).json({
        success: false,
        code: "BASE_INVALID_BUILDING_KEY",
        message: "Missing or invalid building_key",
      });
    }

    const def = BUILDINGS[building_key];
    if (!def) {
      return res.status(400).json({
        success: false,
        code: "BASE_BUILDING_NOT_FOUND",
        message: "Invalid building key",
      });
    }

    const supabase = getSupabaseAdmin();

    await supabase.rpc("base_reconcile_state", { p_device_id: deviceId });

    const { data: row, error: readError } = await supabase
      .from("base_device_state")
      .select("*")
      .eq("device_id", deviceId)
      .single();

    if (readError || !row) {
      return res.status(400).json({
        success: false,
        code: "BASE_STATE_LOAD_FAILED",
        message: readError?.message || "Failed to load state",
      });
    }

    const buildings = row.buildings || {};
    const resources = row.resources || {};
    const stats = row.stats || {};

    const currentLevel = Number(buildings[building_key] || 0);
    const cost = buildingCost(def, currentLevel);

    for (const [key, value] of Object.entries(cost)) {
      if (Number(resources[key] || 0) < value) {
        return res.status(400).json({
          success: false,
          code: "BASE_INSUFFICIENT_RESOURCES",
          message: `Not enough ${key}`,
        });
      }
    }

    const nextResources = { ...resources };
    for (const [key, value] of Object.entries(cost)) {
      nextResources[key] = Math.max(
        0,
        Number(nextResources[key] || 0) - Number(value || 0)
      );
    }

    const nextBuildings = {
      ...buildings,
      [building_key]: currentLevel + 1,
    };

    const nextStats = {
      ...stats,
      upgradesToday: Number(stats.upgradesToday || 0) + 1,
    };

    const { error: updateError } = await supabase
      .from("base_device_state")
      .update({
        resources: nextResources,
        buildings: nextBuildings,
        stats: nextStats,
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
      building_key,
      new_level: currentLevel + 1,
    });
  } catch (error) {
    console.error("base/action/build failed", error);
    return res.status(500).json({
      success: false,
      code: "BASE_BUILD_INTERNAL_ERROR",
      message: "Build action failed",
    });
  }
}
