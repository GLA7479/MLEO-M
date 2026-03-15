import { ensureArcadeDevice } from "../../../../lib/server/arcadeDeviceCookie";
import { checkArcadeRateLimit } from "../../../../lib/server/arcadeRateLimit";
import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";

function extractRow(data) {
  return Array.isArray(data) ? data[0] : data;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    const supabase = getSupabaseAdmin();
    const deviceId = ensureArcadeDevice(req, res);
    const rate = checkArcadeRateLimit("miners-gift-claim", deviceId, 20, 60_000);
    if (!rate.allowed) {
      return res.status(429).json({ success: false, message: "Too many gift claim requests" });
    }

    const { data, error } = await supabase.rpc("miners_claim_hourly_gift", {
      p_device_id: deviceId,
    });

    if (error) {
      const notReady = String(error.message || "").toLowerCase().includes("not ready");
      return res.status(notReady ? 409 : 400).json({
        success: false,
        message: error.message || "Failed to claim hourly gift",
      });
    }

    const row = extractRow(data);
    return res.status(200).json({
      success: true,
      rewardKey: row?.reward_key || null,
      coinsPct: Number(row?.coins_pct || 0),
      dpsMultiplier: Number(row?.dps_multiplier || 1),
      goldMultiplier: Number(row?.gold_multiplier || 1),
      diamonds: Number(row?.diamonds || 0),
      mleoBonus: Number(row?.mleo_bonus || 0),
      nextClaimAt: row?.next_claim_at || null,
      balance: Number(row?.balance || 0),
      minedToday: Number(row?.mined_today || 0),
    });
  } catch (error) {
    console.error("miners/gift/claim failed", error);
    return res.status(500).json({ success: false, message: "Miners gift claim API failed" });
  }
}
