import { ensureArcadeDevice } from "../../../../lib/server/arcadeDeviceCookie";
import { checkArcadeRateLimit } from "../../../../lib/server/arcadeRateLimit";
import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";

function extractRow(data) {
  return Array.isArray(data) ? data[0] : data;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    const supabase = getSupabaseAdmin();
    const deviceId = ensureArcadeDevice(req, res);
    const rateLimit = checkArcadeRateLimit("arcade-freeplay-status", deviceId, 60, 60_000);
    if (!rateLimit.allowed) {
      return res.status(429).json({ success: false, message: "Too many free play requests" });
    }

    const { data, error } = await supabase.rpc("freeplay_device_refresh", {
      p_device_id: deviceId,
    });

    if (error) {
      return res.status(400).json({ success: false, message: error.message || "Failed to read free play status" });
    }

    const row = extractRow(data);
    return res.status(200).json({
      success: true,
      tokens: Number(row?.tokens || 0),
      maxTokens: Number(row?.max_tokens || 5),
      freePlayAmount: Number(row?.free_play_amount || 100),
      regenMs: Number(row?.regen_ms || 3600000),
      totalUsed: Number(row?.total_used || 0),
      lastUsed: row?.last_used || null,
      lastUpdate: row?.last_update || null,
    });
  } catch (error) {
    console.error("arcade/freeplay/status failed", error);
    return res.status(500).json({ success: false, message: "Arcade free play API failed" });
  }
}
