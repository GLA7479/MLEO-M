import crypto from "crypto";
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

  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ success: false, message: "Dev credit disabled in production" });
  }

  try {
    const supabase = getSupabaseAdmin();
    const deviceId = ensureArcadeDevice(req, res);
    const rateLimit = checkArcadeRateLimit("arcade-dev-credit", deviceId, 5, 60_000);
    if (!rateLimit.allowed) {
      return res.status(429).json({ success: false, message: "Too many dev credit requests" });
    }

    const { password, amount = 10000 } = req.body || {};
    const wholeAmount = Math.max(0, Math.floor(Number(amount) || 0));

    if (password !== "7479") {
      return res.status(403).json({ success: false, message: "Invalid password" });
    }

    if (wholeAmount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    const { data, error } = await supabase.rpc("sync_vault_delta", {
      p_game_id: "dev-test",
      p_delta: wholeAmount,
      p_device_id: deviceId,
      p_prev_nonce: null,
      p_next_nonce: crypto.randomUUID(),
    });

    if (error) {
      return res.status(400).json({ success: false, message: error.message || "Failed to add dev coins" });
    }

    const row = extractRow(data);
    return res.status(200).json({
      success: true,
      balance: Number(row?.new_balance ?? row ?? 0),
    });
  } catch (error) {
    console.error("arcade/vault/dev-credit failed", error);
    return res.status(500).json({ success: false, message: "Arcade dev credit API failed" });
  }
}
