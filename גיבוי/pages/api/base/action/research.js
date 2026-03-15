import { getArcadeDevice } from "../../../../lib/server/arcadeDeviceCookie";
import { checkArcadeRateLimit } from "../../../../lib/server/arcadeRateLimit";
import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { checkIpRateLimit } from "../../../../lib/server/ipRateLimit";
import { validateCsrfToken } from "../../../../lib/server/csrf";
import { logCsrfFailure, logIpRateLimitExceeded } from "../../../../lib/server/securityLogger";

const RESEARCH = [
  { key: "coolant", cost: { ORE: 240, SCRAP: 70 } },
  { key: "routing", cost: { ORE: 400, GOLD: 260, SCRAP: 120 }, requires: ["coolant"] },
  { key: "fieldOps", cost: { ORE: 650, GOLD: 420, SCRAP: 180 }, requires: ["routing"] },
  { key: "minerSync", cost: { ORE: 520, GOLD: 300, SCRAP: 130, DATA: 20 }, requires: ["routing"] },
  { key: "arcadeOps", cost: { ORE: 600, GOLD: 420, SCRAP: 180, DATA: 30 }, requires: ["fieldOps"] },
  { key: "logistics", cost: { ORE: 700, GOLD: 460, SCRAP: 220, DATA: 40 }, requires: ["routing"] },
  { key: "predictiveMaintenance", cost: { ORE: 620, GOLD: 420, SCRAP: 260, DATA: 36 }, requires: ["fieldOps"] },
  { key: "deepScan", cost: { ORE: 760, GOLD: 520, SCRAP: 240, DATA: 48 }, requires: ["arcadeOps"] },
  { key: "tokenDiscipline", cost: { ORE: 820, GOLD: 580, SCRAP: 280, DATA: 52 }, requires: ["logistics", "deepScan"] },
];

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

    const rateLimit = await checkArcadeRateLimit("base-action-research", deviceId, 20, 60_000);
    if (!rateLimit.allowed) {
      return res.status(429).json({ success: false, message: "Too many research requests" });
    }

    const { research_key } = req.body || {};
    if (!research_key || typeof research_key !== "string") {
      return res.status(400).json({ success: false, message: "Missing or invalid research_key" });
    }

    const def = RESEARCH.find((r) => r.key === research_key);
    if (!def) {
      return res.status(400).json({ success: false, message: "Invalid research key" });
    }

    const supabase = getSupabaseAdmin();

    const { data: stateData, error: stateError } = await supabase.rpc("base_get_or_create_state", {
      p_device_id: deviceId,
    });

    if (stateError) {
      return res.status(400).json({ success: false, message: stateError.message || "Failed to load state" });
    }

    const state = Array.isArray(stateData) ? stateData[0] : stateData;
    const research = state.research || {};
    const resources = state.resources || {};

    if (research[research_key]) {
      return res.status(400).json({ success: false, message: "Research already completed" });
    }

    if (def.requires?.some((req) => !research[req])) {
      return res.status(400).json({ success: false, message: "Prerequisites not met" });
    }

    if (!canAfford(resources, def.cost)) {
      return res.status(400).json({ success: false, message: "Insufficient resources" });
    }

    const newResources = pay(resources, def.cost);
    const newResearch = { ...research, [research_key]: true };
    const commanderXp = Number(state.commander_xp || 0) + 28;

    const { data: updateData, error: updateError } = await supabase
      .from("base_device_state")
      .update({
        resources: newResources,
        research: newResearch,
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
      research_key,
    });
  } catch (error) {
    console.error("base/action/research failed", error);
    return res.status(500).json({ success: false, message: "Research action failed" });
  }
}
