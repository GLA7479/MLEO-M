import { getArcadeDevice } from "../../../../lib/server/arcadeDeviceCookie";
import { checkArcadeRateLimit } from "../../../../lib/server/arcadeRateLimit";
import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { checkIpRateLimit } from "../../../../lib/server/ipRateLimit";
import { validateCsrfToken } from "../../../../lib/server/csrf";
import { logCsrfFailure, logIpRateLimitExceeded } from "../../../../lib/server/securityLogger";

const RESEARCH = {
  coolant: { ORE: 240, SCRAP: 70 },
  routing: { ORE: 400, GOLD: 260, SCRAP: 120 },
  fieldOps: { ORE: 650, GOLD: 420, SCRAP: 180 },
  minerSync: { ORE: 520, GOLD: 300, SCRAP: 130, DATA: 20 },
  arcadeOps: { ORE: 600, GOLD: 420, SCRAP: 180, DATA: 30 },
  logistics: { ORE: 700, GOLD: 460, SCRAP: 220, DATA: 40 },
  predictiveMaintenance: { ORE: 620, GOLD: 420, SCRAP: 260, DATA: 36 },
  deepScan: { ORE: 760, GOLD: 520, SCRAP: 240, DATA: 48 },
  tokenDiscipline: { ORE: 820, GOLD: 580, SCRAP: 280, DATA: 52 },
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
      "base-action-research",
      deviceId,
      30,
      60_000
    );
    if (!rateLimit.allowed) {
      return res.status(429).json({
        success: false,
        code: "RATE_LIMIT_DEVICE",
        message: "Too many research requests",
      });
    }

    const { research_key } = req.body || {};
    if (!research_key || typeof research_key !== "string") {
      return res.status(400).json({
        success: false,
        code: "BASE_INVALID_RESEARCH_KEY",
        message: "Missing or invalid research_key",
      });
    }

    const cost = RESEARCH[research_key];
    if (!cost) {
      return res.status(400).json({
        success: false,
        code: "BASE_RESEARCH_NOT_FOUND",
        message: "Invalid research key",
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

    const research = row.research || {};
    const resources = row.resources || {};

    if (research[research_key]) {
      return res.status(400).json({
        success: false,
        code: "BASE_RESEARCH_ALREADY_COMPLETED",
        message: "Research already completed",
      });
    }

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

    const nextResearch = { ...research, [research_key]: true };

    const { error: updateError } = await supabase
      .from("base_device_state")
      .update({
        resources: nextResources,
        research: nextResearch,
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
      research_key,
    });
  } catch (error) {
    console.error("base/action/research failed", error);
    return res.status(500).json({
      success: false,
      code: "BASE_RESEARCH_INTERNAL_ERROR",
      message: "Research action failed",
    });
  }
}
