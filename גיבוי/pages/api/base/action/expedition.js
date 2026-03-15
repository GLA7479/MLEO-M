import { getArcadeDevice } from "../../../../lib/server/arcadeDeviceCookie";
import { checkArcadeRateLimit } from "../../../../lib/server/arcadeRateLimit";
import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { checkIpRateLimit } from "../../../../lib/server/ipRateLimit";
import { validateCsrfToken } from "../../../../lib/server/csrf";
import { logCsrfFailure, logIpRateLimitExceeded } from "../../../../lib/server/securityLogger";

const EXPEDITION_COST = 36; // ENERGY
const EXPEDITION_DATA_COST = 4;
const EXPEDITION_COOLDOWN_MS = 120_000; // 2 minutes

function rollExpeditionLoot(bayLevel, hasArcadeOps, hasDeepScan) {
  const rareBonus = (hasArcadeOps ? 1.12 : 1) * (hasDeepScan ? 1.18 : 1);
  const base = 1 + bayLevel * 0.12;
  const ore = Math.floor((35 + Math.random() * 65) * base);
  const gold = Math.floor((20 + Math.random() * 45) * base);
  const scrap = Math.floor((12 + Math.random() * 28) * base);
  const data = Math.floor((6 + Math.random() * 14) * rareBonus);
  const mleoChance = 0.08 + bayLevel * 0.01 + (hasDeepScan ? 0.02 : 0);
  const bankedMleo = Math.random() < mleoChance ? Math.floor(4 + Math.random() * 8) : 0;
  return { ore, gold, scrap, data, bankedMleo };
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

    const rateLimit = await checkArcadeRateLimit("base-action-expedition", deviceId, 20, 60_000);
    if (!rateLimit.allowed) {
      return res.status(429).json({ success: false, message: "Too many expedition requests" });
    }

    const supabase = getSupabaseAdmin();

    const { data: stateData, error: stateError } = await supabase.rpc("base_get_or_create_state", {
      p_device_id: deviceId,
    });

    if (stateError) {
      return res.status(400).json({ success: false, message: stateError.message || "Failed to load state" });
    }

    const state = Array.isArray(stateData) ? stateData[0] : stateData;
    const now = new Date();
    const expeditionReadyAt = state.expedition_ready_at ? new Date(state.expedition_ready_at) : null;
    const resources = state.resources || {};
    const buildings = state.buildings || {};
    const research = state.research || {};

    if (expeditionReadyAt && expeditionReadyAt.getTime() > now.getTime()) {
      return res.status(400).json({ success: false, message: "Expedition team is still out in the field" });
    }

    if ((resources.ENERGY || 0) < EXPEDITION_COST) {
      return res.status(400).json({ success: false, message: "Not enough energy for an expedition" });
    }

    if ((resources.DATA || 0) < EXPEDITION_DATA_COST) {
      return res.status(400).json({ success: false, message: "Need 4 DATA to launch expedition" });
    }

    // Roll loot server-side
    const bayLevel = Number(buildings.expeditionBay || 0);
    const hasArcadeOps = !!research.arcadeOps;
    const hasDeepScan = !!research.deepScan;
    const loot = rollExpeditionLoot(bayLevel, hasArcadeOps, hasDeepScan);

    const xpGain = hasArcadeOps ? 24 : 20;
    const newExpeditionReadyAt = new Date(now.getTime() + EXPEDITION_COOLDOWN_MS);
    const newResources = {
      ...resources,
      ENERGY: Math.max(0, (resources.ENERGY || 0) - EXPEDITION_COST),
      DATA: Math.max(0, (resources.DATA || 0) - EXPEDITION_DATA_COST) + loot.data,
      ORE: (resources.ORE || 0) + loot.ore,
      GOLD: (resources.GOLD || 0) + loot.gold,
      SCRAP: (resources.SCRAP || 0) + loot.scrap,
    };
    const newBankedMleo = Number(state.banked_mleo || 0) + loot.bankedMleo;
    const newStats = {
      ...(state.stats || {}),
      expeditionsToday: (Number(state.stats?.expeditionsToday || 0) + 1),
    };
    const commanderXp = Number(state.commander_xp || 0) + xpGain;
    const totalExpeditions = (Number(state.totalExpeditions || 0) + 1) || 1;

    const { data: updateData, error: updateError } = await supabase
      .from("base_device_state")
      .update({
        resources: newResources,
        banked_mleo: newBankedMleo,
        expedition_ready_at: newExpeditionReadyAt.toISOString(),
        stats: newStats,
        commander_xp: commanderXp,
        updated_at: now.toISOString(),
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
      loot,
      xp_gain: xpGain,
    });
  } catch (error) {
    console.error("base/action/expedition failed", error);
    return res.status(500).json({ success: false, message: "Expedition action failed" });
  }
}
