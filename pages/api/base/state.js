import { getArcadeDevice } from "../../../lib/server/arcadeDeviceCookie";
import { checkArcadeRateLimit } from "../../../lib/server/arcadeRateLimit";
import { getSupabaseAdmin } from "../../../lib/server/supabaseAdmin";
import { checkIpRateLimit } from "../../../lib/server/ipRateLimit";
import { logIpRateLimitExceeded } from "../../../lib/server/securityLogger";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  try {
    const ipRate = await checkIpRateLimit(req, 100, 60_000);
    if (!ipRate.allowed) {
      logIpRateLimitExceeded(req, 100);
      return res.status(429).json({ success: false, message: "Too many requests from this IP" });
    }

    const deviceId = getArcadeDevice(req);
    if (!deviceId) {
      return res.status(401).json({ success: false, message: "Device not initialized" });
    }

    const rateLimit = await checkArcadeRateLimit("base-state", deviceId, 120, 60_000);
    if (!rateLimit.allowed) {
      return res.status(429).json({ success: false, message: "Too many base state requests" });
    }

    const supabase = getSupabaseAdmin();

    if (req.method === "GET") {
      const { data, error } = await supabase.rpc("base_reconcile_state", {
        p_device_id: deviceId,
      });

      if (error) {
        return res.status(400).json({ success: false, message: error.message || "Failed to load base state" });
      }

      const row = Array.isArray(data) ? data[0] : data;
      return res.status(200).json({ success: true, state: row || null });
    }

    res.setHeader("Allow", "GET");
    return res.status(405).json({ success: false, message: "Method not allowed" });
  } catch (error) {
    console.error("base/state failed", error);
    return res.status(500).json({ success: false, message: "Base state API failed" });
  }
}
