import { getArcadeDevice } from "../../../../lib/server/arcadeDeviceCookie";
import { checkArcadeRateLimit } from "../../../../lib/server/arcadeRateLimit";
import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { checkIpRateLimit } from "../../../../lib/server/ipRateLimit";
import { validateCsrfToken } from "../../../../lib/server/csrf";
import { logCsrfFailure, logIpRateLimitExceeded } from "../../../../lib/server/securityLogger";
import { applyBaseVaultDelta } from "../../../../lib/baseVaultClient";

const ALLOWED_SPEND_TYPES = new Set(["blueprint", "overclock", "refill"]);

const CONFIG = {
  blueprintBaseCost: 2_500,
  blueprintGrowth: 1.85,
  overclockCost: 900,
  overclockDurationMs: 8 * 60 * 1000,
  refillCost: 300,
};

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

    const rateLimit = await checkArcadeRateLimit("base-action-spend", deviceId, 30, 60_000);
    if (!rateLimit.allowed) {
      return res.status(429).json({ success: false, message: "Too many spend requests" });
    }

    const { spend_type, energy_cap } = req.body || {};
    if (!spend_type || !ALLOWED_SPEND_TYPES.has(spend_type)) {
      return res.status(400).json({ success: false, message: "Invalid or missing spend_type" });
    }

    const supabase = getSupabaseAdmin();

    const { data: stateData, error: stateError } = await supabase.rpc("base_get_or_create_state", {
      p_device_id: deviceId,
    });

    if (stateError) {
      return res.status(400).json({ success: false, message: stateError.message || "Failed to load state" });
    }

    const state = Array.isArray(stateData) ? stateData[0] : stateData;
    const resources = state.resources || {};
    const now = new Date();

    let cost = 0;
    let update = {};
    let errorMessage = null;

    if (spend_type === "blueprint") {
      const blueprintLevel = Number(state.blueprint_level || 0);
      const dataCost = 20 + blueprintLevel * 6;
      if ((resources.DATA || 0) < dataCost) {
        return res.status(400).json({ success: false, message: `Need ${dataCost} DATA` });
      }
      cost = Math.floor(CONFIG.blueprintBaseCost * Math.pow(CONFIG.blueprintGrowth, blueprintLevel));
      update = {
        blueprint_level: blueprintLevel + 1,
        resources: {
          ...resources,
          DATA: Math.max(0, (resources.DATA || 0) - dataCost),
        },
      };
    } else if (spend_type === "overclock") {
      if ((resources.DATA || 0) < 12) {
        return res.status(400).json({ success: false, message: "Need 12 DATA" });
      }
      cost = CONFIG.overclockCost;
      const overclockUntil = new Date(now.getTime() + CONFIG.overclockDurationMs);
      update = {
        overclock_until: overclockUntil.toISOString(),
        resources: {
          ...resources,
          DATA: Math.max(0, (resources.DATA || 0) - 12),
        },
      };
    } else if (spend_type === "refill") {
      const cap = Number(energy_cap || 120);
      if ((resources.ENERGY || 0) >= cap - 1) {
        return res.status(400).json({ success: false, message: "Energy is already near full" });
      }
      if ((resources.DATA || 0) < 5) {
        return res.status(400).json({ success: false, message: "Need 5 DATA" });
      }
      cost = CONFIG.refillCost;
      update = {
        resources: {
          ...resources,
          ENERGY: cap,
          DATA: Math.max(0, (resources.DATA || 0) - 5),
        },
      };
    }

    if (cost <= 0) {
      return res.status(400).json({ success: false, message: "Invalid spend type configuration" });
    }

    // Spend from vault
    const vaultRes = await applyBaseVaultDelta(-cost, "mleo-base-spend");
    if (!vaultRes?.ok) {
      return res.status(400).json({ success: false, message: "Shared vault balance is too low" });
    }

    const commanderXp = Number(state.commander_xp || 0) + Math.max(5, Math.floor(cost / 40));
    const newTotalSharedSpent = Number(state.total_shared_spent || 0) + cost;
    const newStats = {
      ...(state.stats || {}),
      vaultSpentToday: (Number(state.stats?.vaultSpentToday || 0) + cost),
    };

    const { data: updateData, error: updateError } = await supabase
      .from("base_device_state")
      .update({
        ...update,
        commander_xp: commanderXp,
        total_shared_spent: newTotalSharedSpent,
        stats: newStats,
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
      spend_type,
      cost,
      vault_balance: vaultRes?.balance || null,
    });
  } catch (error) {
    console.error("base/action/spend failed", error);
    return res.status(500).json({ success: false, message: "Spend action failed" });
  }
}
