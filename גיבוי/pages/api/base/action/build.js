import { getArcadeDevice } from "../../../../lib/server/arcadeDeviceCookie";
import { checkArcadeRateLimit } from "../../../../lib/server/arcadeRateLimit";
import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { checkIpRateLimit } from "../../../../lib/server/ipRateLimit";
import { validateCsrfToken } from "../../../../lib/server/csrf";
import { logCsrfFailure, logIpRateLimitExceeded } from "../../../../lib/server/securityLogger";

// Building definitions (must match client)
const BUILDINGS = [
  { key: "hq", baseCost: { GOLD: 80, ORE: 40 }, growth: 1.18 },
  { key: "quarry", baseCost: { GOLD: 60 }, growth: 1.18 },
  { key: "tradeHub", baseCost: { GOLD: 100, ORE: 30 }, growth: 1.2 },
  { key: "salvage", baseCost: { GOLD: 150, ORE: 90 }, growth: 1.22 },
  { key: "refinery", baseCost: { GOLD: 280, ORE: 180, SCRAP: 35 }, growth: 1.25 },
  { key: "powerCell", baseCost: { GOLD: 240, SCRAP: 45 }, growth: 1.24 },
  { key: "minerControl", baseCost: { GOLD: 320, ORE: 120, SCRAP: 40 }, growth: 1.22 },
  { key: "arcadeHub", baseCost: { GOLD: 360, ORE: 90, SCRAP: 50 }, growth: 1.24 },
  { key: "expeditionBay", baseCost: { GOLD: 500, ORE: 180, SCRAP: 85 }, growth: 1.26 },
  { key: "logisticsCenter", baseCost: { ORE: 220, GOLD: 180, SCRAP: 90 }, growth: 1.7, maxLevel: 15 },
  { key: "researchLab", baseCost: { ORE: 180, GOLD: 240, SCRAP: 110 }, growth: 1.75, maxLevel: 15 },
  { key: "repairBay", baseCost: { ORE: 160, GOLD: 160, SCRAP: 140 }, growth: 1.7, maxLevel: 15 },
];

function buildingCost(def, level) {
  const cost = {};
  for (const [res, base] of Object.entries(def.baseCost)) {
    cost[res] = Math.floor(base * Math.pow(def.growth, level));
  }
  return cost;
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
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    if (!validateCsrfToken(req)) {
      logCsrfFailure(req);
      return res.status(403).json({ success: false, message: "Invalid CSRF token" });
    }

    const ipRate = await checkIpRateLimit(req, 60, 60_000);
    if (!ipRate.allowed) {
      logIpRateLimitExceeded(req, 60);
      return res.status(429).json({ success: false, message: "Too many requests from this IP" });
    }

    const deviceId = getArcadeDevice(req);
    if (!deviceId) {
      return res.status(401).json({ success: false, message: "Device not initialized" });
    }

    const rateLimit = await checkArcadeRateLimit("base-action-build", deviceId, 30, 60_000);
    if (!rateLimit.allowed) {
      return res.status(429).json({ success: false, message: "Too many build requests" });
    }

    const { building_key } = req.body || {};
    if (!building_key || typeof building_key !== "string") {
      return res.status(400).json({ success: false, message: "Missing or invalid building_key" });
    }

    const def = BUILDINGS.find((b) => b.key === building_key);
    if (!def) {
      return res.status(400).json({ success: false, message: "Invalid building key" });
    }

    const supabase = getSupabaseAdmin();

    // Get fresh state with lock
    const { data: freshStateData, error: freshStateError } = await supabase
      .from("base_device_state")
      .select("*")
      .eq("device_id", deviceId)
      .single();

    if (freshStateError || !freshStateData) {
      return res.status(400).json({ success: false, message: "Failed to reload latest base state" });
    }

    const state = freshStateData;
    const buildings = state.buildings || {};
    const resources = state.resources || {};
    const level = Number(buildings[building_key] || 0);

    // Check max level
    if (def.maxLevel && level >= def.maxLevel) {
      return res.status(400).json({ success: false, message: "Building is at max level" });
    }

    // Calculate cost
    const cost = buildingCost(def, level);
    if (!canAfford(resources, cost)) {
      return res.status(400).json({ success: false, message: "Insufficient resources" });
    }

    // Apply upgrade
    const newResources = pay(resources, cost);
    const newBuildings = { ...buildings, [building_key]: level + 1 };
    const newStats = {
      ...(state.stats || {}),
      upgradesToday: (Number(state.stats?.upgradesToday || 0) + 1),
    };
    const commanderXp = Number(state.commander_xp || 0) + 18;

    const { data: updateData, error: updateError } = await supabase
      .from("base_device_state")
      .update({
        resources: newResources,
        buildings: newBuildings,
        stats: newStats,
        commander_xp: commanderXp,
        updated_at: new Date().toISOString(),
      })
      .eq("device_id", deviceId)
      .select("*")
      .single();

    if (updateError) {
      return res.status(400).json({ success: false, message: updateError.message || "Failed to update state" });
    }

    return res.status(200).json({
      success: true,
      state: updateData,
      building_key,
      new_level: level + 1,
    });
  } catch (error) {
    console.error("base/action/build failed", error);
    return res.status(500).json({ success: false, message: "Build action failed" });
  }
}
