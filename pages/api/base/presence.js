import { getArcadeDevice } from "../../../lib/server/arcadeDeviceCookie";
import { validateCsrfToken } from "../../../lib/server/csrf";
import { checkArcadeRateLimit } from "../../../lib/server/arcadeRateLimit";
import { getSupabaseAdmin } from "../../../lib/server/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    if (!validateCsrfToken(req)) {
      return res.status(403).json({ success: false, code: "CSRF_INVALID", message: "Invalid CSRF token" });
    }

    const deviceId = getArcadeDevice(req);
    if (!deviceId) {
      return res.status(401).json({ success: false, code: "DEVICE_NOT_INITIALIZED", message: "Device not initialized" });
    }

    const rateLimit = await checkArcadeRateLimit("base-presence", deviceId, 30, 60_000);
    if (!rateLimit.allowed) {
      return res.status(429).json({ success: false, code: "RATE_LIMIT_DEVICE", message: "Too many presence updates" });
    }

    const {
      visibility_state = "hidden",
      page_name = "base",
      game_action = false,
      interacted = false,
    } = req.body || {};

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase.rpc("base_touch_presence", {
      p_device_id: deviceId,
      p_visibility_state: visibility_state,
      p_page_name: page_name,
      p_game_action: !!game_action,
      p_interacted: !!interacted,
    });

    if (error) {
      console.error("base presence error", error);
      return res.status(500).json({ success: false, message: "Presence update failed" });
    }

    const presence = Array.isArray(data) ? data[0] : data;
    return res.status(200).json({ success: true, presence: presence || null });
  } catch (error) {
    console.error("base presence fatal", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
}

