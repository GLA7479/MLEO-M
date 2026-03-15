import { getArcadeDevice } from "../../../../lib/server/arcadeDeviceCookie";
import { checkArcadeRateLimit } from "../../../../lib/server/arcadeRateLimit";
import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { checkIpRateLimit } from "../../../../lib/server/ipRateLimit";
import { validateCsrfToken } from "../../../../lib/server/csrf";
import { logCsrfFailure, logIpRateLimitExceeded } from "../../../../lib/server/securityLogger";

function crewCost(count) {
  return {
    GOLD: Math.ceil(120 * Math.pow(1.16, count)),
    ORE: Math.ceil(55 * Math.pow(1.14, count)),
    SCRAP: Math.ceil(18 * Math.pow(1.16, count)),
  };
}

function canAfford(resources, cost) {
  for (const [key, value] of Object.entries(cost)) {
    if ((resources[key] || 0) < value) return false;
  }
  return true;
}

function pay(resources, cost) {
  const next = { ...resources };
  for (const [key, value] of Object.entries(cost)) {
    next[key] = Math.max(0, (next[key] || 0) - value);
  }
  return next;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, code: "METHOD_NOT_ALLOWED", message: "Method not allowed" });
  }

  try {
    if (!validateCsrfToken(req)) {
      logCsrfFailure(req);
      return res.status(403).json({ success: false, code: "CSRF_INVALID", message: "Invalid CSRF token" });
    }

    const ipRate = await checkIpRateLimit(req, 60, 60_000);
    if (!ipRate.allowed) {
      logIpRateLimitExceeded(req, 60);
      return res.status(429).json({ success: false, code: "RATE_LIMIT_IP", message: "Too many requests from this IP" });
    }

    const deviceId = getArcadeDevice(req);
    if (!deviceId) {
      return res.status(401).json({ success: false, code: "DEVICE_NOT_INITIALIZED", message: "Device not initialized" });
    }

    const rateLimit = await checkArcadeRateLimit("base-action-crew", deviceId, 20, 60_000);
    if (!rateLimit.allowed) {
      return res.status(429).json({ success: false, code: "RATE_LIMIT_DEVICE", message: "Too many crew requests" });
    }

    const supabase = getSupabaseAdmin();

    const { data: freshStateData, error: freshStateError } = await supabase
      .from("base_device_state")
      .select("*")
      .eq("device_id", deviceId)
      .single();

    if (freshStateError || !freshStateData) {
      return res.status(400).json({ success: false, code: "BASE_STATE_LOAD_FAILED", message: "Failed to reload latest base state" });
    }

    const state = freshStateData;
    const crew = Number(state.crew || 0);
    const resources = state.resources || {};

    const cost = crewCost(crew);
    if (!canAfford(resources, cost)) {
      return res.status(400).json({ success: false, code: "BASE_INSUFFICIENT_RESOURCES", message: "Crew hiring needs more supplies" });
    }

    const newResources = pay(resources, cost);
    const newCrew = crew + 1;
    const commanderXp = Number(state.commander_xp || 0) + 10;

    const { data: updateData, error: updateError } = await supabase
      .from("base_device_state")
      .update({
        crew: newCrew,
        resources: newResources,
        commander_xp: commanderXp,
        updated_at: new Date().toISOString(),
      })
      .eq("device_id", deviceId)
      .select("*")
      .single();

    if (updateError) {
      return res.status(400).json({ success: false, code: "BASE_STATE_UPDATE_FAILED", message: updateError.message || "Failed to update state" });
    }

    return res.status(200).json({
      success: true,
      state: updateData,
      new_crew: newCrew,
    });
  } catch (error) {
    console.error("base/action/crew failed", error);
    return res.status(500).json({ success: false, code: "BASE_CREW_INTERNAL_ERROR", message: "Crew action failed" });
  }
}
