import { getArcadeDevice } from "../../../../lib/server/arcadeDeviceCookie";
import { checkArcadeRateLimit } from "../../../../lib/server/arcadeRateLimit";
import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { checkIpRateLimit } from "../../../../lib/server/ipRateLimit";
import { validateCsrfToken } from "../../../../lib/server/csrf";
import { logCsrfFailure, logIpRateLimitExceeded } from "../../../../lib/server/securityLogger";
import { applyBaseVaultDelta } from "../../../../lib/baseVaultClient";

const DAILY_SOFTCUT = [
  { upto: 0.60, factor: 1.00 },
  { upto: 0.85, factor: 0.72 },
  { upto: 1.00, factor: 0.50 },
  { upto: 1.15, factor: 0.30 },
  { upto: 9.99, factor: 0.16 },
];

const DAILY_SHIP_CAP = 12_000;

function softcutFactor(used, cap) {
  if (cap <= 0) return 1;
  const ratio = used / cap;
  for (const step of DAILY_SOFTCUT) {
    if (ratio <= step.upto) return step.factor;
  }
  return 0.16;
}

function calculateBankBonus(blueprintLevel) {
  return 1 + blueprintLevel * 0.08;
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

    const rateLimit = await checkArcadeRateLimit("base-action-ship", deviceId, 30, 60_000);
    if (!rateLimit.allowed) {
      return res.status(429).json({ success: false, message: "Too many ship requests" });
    }

    const supabase = getSupabaseAdmin();

    const { data: freshStateData, error: freshStateError } = await supabase
      .from("base_device_state")
      .select("*")
      .eq("device_id", deviceId)
      .single();

    if (freshStateError || !freshStateData) {
      return res.status(400).json({ success: false, message: "Failed to reload latest base state" });
    }

    const state = freshStateData;
    const bankedMleo = Number(state.banked_mleo || 0);
    const sentToday = Number(state.sent_today || 0);
    const blueprintLevel = Number(state.blueprint_level || 0);

    if (bankedMleo <= 0) {
      return res.status(400).json({ success: false, message: "Nothing ready to ship yet" });
    }

    const shipCap = DAILY_SHIP_CAP + blueprintLevel * 5000;
    const room = Math.max(0, shipCap - sentToday);
    if (room <= 0) {
      return res.status(400).json({ success: false, message: "Today's shipping cap is already full" });
    }

    const factor = softcutFactor(sentToday, shipCap);
    const bankBonus = calculateBankBonus(blueprintLevel);
    const shipped = Math.min(Math.floor(bankedMleo * factor * bankBonus), room);
    if (shipped <= 0) {
      return res.status(400).json({ success: false, message: "Shipment too small after softcut" });
    }

    const consumed = Math.min(bankedMleo, Math.max(1, Math.ceil(shipped / Math.max(0.01, factor * bankBonus))));

    // Add to vault
    const vaultRes = await applyBaseVaultDelta(shipped, "mleo-base-ship");
    if (!vaultRes?.ok && !vaultRes?.skipped) {
      return res.status(400).json({ success: false, message: "Vault sync failed" });
    }

    const newBankedMleo = Math.max(0, bankedMleo - consumed);
    const newSentToday = sentToday + shipped;
    const newTotalBanked = Number(state.total_banked || 0) + shipped;
    const commanderXp = Number(state.commander_xp || 0) + Math.max(10, Math.floor(shipped / 50));
    const newStats = {
      ...(state.stats || {}),
      shippedToday: (Number(state.stats?.shippedToday || 0) + shipped),
    };

    const { data: updateData, error: updateError } = await supabase
      .from("base_device_state")
      .update({
        banked_mleo: newBankedMleo,
        sent_today: newSentToday,
        total_banked: newTotalBanked,
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
      shipped,
      consumed,
      vault_balance: vaultRes?.balance || null,
    });
  } catch (error) {
    console.error("base/action/ship failed", error);
    return res.status(500).json({ success: false, message: "Ship action failed" });
  }
}
