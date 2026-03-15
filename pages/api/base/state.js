import { getArcadeDevice } from "../../../lib/server/arcadeDeviceCookie";
import { checkArcadeRateLimit } from "../../../lib/server/arcadeRateLimit";
import { getSupabaseAdmin } from "../../../lib/server/supabaseAdmin";
import { checkIpRateLimit } from "../../../lib/server/ipRateLimit";
import { validateCsrfToken } from "../../../lib/server/csrf";
import { logCsrfFailure, logIpRateLimitExceeded } from "../../../lib/server/securityLogger";

const ALLOWED_KEYS = new Set([
  "version",
  "banked_mleo",
  "sent_today",
  "total_banked",
  "total_shared_spent",
  "commander_level",
  "commander_xp",
  "blueprint_level",
  "crew",
  "overclock_until",
  "expedition_ready_at",
  "maintenance_due",
  "stability",
  "resources",
  "buildings",
  "modules",
  "research",
  "stats",
  "mission_state",
  "log",
]);

export default async function handler(req, res) {
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
      const { data, error } = await supabase.rpc("base_get_or_create_state", {
        p_device_id: deviceId,
      });

      if (error) {
        return res.status(400).json({ success: false, message: error.message || "Failed to load base state" });
      }

      const row = Array.isArray(data) ? data[0] : data;
      return res.status(200).json({ success: true, state: row || null });
    }

    if (req.method === "POST") {
      if (!validateCsrfToken(req)) {
        logCsrfFailure(req);
        return res.status(403).json({ success: false, message: "Invalid CSRF token" });
      }

      const patch = req.body || {};
      const update = {};

      for (const [key, value] of Object.entries(patch)) {
        if (!ALLOWED_KEYS.has(key)) continue;
        update[key] = value;
      }

      await supabase.rpc("base_get_or_create_state", {
        p_device_id: deviceId,
      });

      const { data, error } = await supabase
        .from("base_device_state")
        .update(update)
        .eq("device_id", deviceId)
        .select("*")
        .single();

      if (error) {
        return res.status(400).json({ success: false, message: error.message || "Failed to save base state" });
      }

      return res.status(200).json({ success: true, state: data });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ success: false, message: "Method not allowed" });
  } catch (error) {
    console.error("base/state failed", error);
    return res.status(500).json({ success: false, message: "Base state API failed" });
  }
}
