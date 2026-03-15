import { getArcadeDevice } from "../../../../lib/server/arcadeDeviceCookie";
import { checkArcadeRateLimit } from "../../../../lib/server/arcadeRateLimit";
import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { checkIpRateLimit } from "../../../../lib/server/ipRateLimit";
import { validateCsrfToken } from "../../../../lib/server/csrf";
import { logCsrfFailure, logIpRateLimitExceeded } from "../../../../lib/server/securityLogger";

const MODULES = [
  { key: "servoDrill", cost: { GOLD: 320, SCRAP: 50 } },
  { key: "vaultCompressor", cost: { GOLD: 420, ORE: 120, SCRAP: 70 } },
  { key: "arcadeRelay", cost: { GOLD: 520, ORE: 160, SCRAP: 90 } },
  { key: "minerLink", cost: { GOLD: 700, ORE: 260, SCRAP: 110 } },
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

    const rateLimit = await checkArcadeRateLimit("base-action-module", deviceId, 20, 60_000);
    if (!rateLimit.allowed) {
      return res.status(429).json({ success: false, message: "Too many module requests" });
    }

    const { module_key } = req.body || {};
    if (!module_key || typeof module_key !== "string") {
      return res.status(400).json({ success: false, message: "Missing or invalid module_key" });
    }

    const def = MODULES.find((m) => m.key === module_key);
    if (!def) {
      return res.status(400).json({ success: false, message: "Invalid module key" });
    }

    const supabase = getSupabaseAdmin();

    const { data: stateData, error: stateError } = await supabase.rpc("base_get_or_create_state", {
      p_device_id: deviceId,
    });

    if (stateError) {
      return res.status(400).json({ success: false, message: stateError.message || "Failed to load state" });
    }

    const state = Array.isArray(stateData) ? stateData[0] : stateData;
    const modules = state.modules || {};
    const resources = state.resources || {};

    if (modules[module_key]) {
      return res.status(400).json({ success: false, message: "Module already installed" });
    }

    if (!canAfford(resources, def.cost)) {
      return res.status(400).json({ success: false, message: "Insufficient resources" });
    }

    const newResources = pay(resources, def.cost);
    const newModules = { ...modules, [module_key]: true };
    const commanderXp = Number(state.commander_xp || 0) + 15;

    const { data: updateData, error: updateError } = await supabase
      .from("base_device_state")
      .update({
        resources: newResources,
        modules: newModules,
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
      module_key,
    });
  } catch (error) {
    console.error("base/action/module failed", error);
    return res.status(500).json({ success: false, message: "Module action failed" });
  }
}
