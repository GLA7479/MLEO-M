import { getArcadeDevice } from "../../../../lib/server/arcadeDeviceCookie";
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
    const deviceId = getArcadeDevice(req);
    if (!deviceId) {
      return res.status(401).json({ success: false, message: "Device not initialized" });
    }
    const rateLimit = checkArcadeRateLimit("arcade-vault-balance", deviceId, 60, 60_000);
    if (!rateLimit.allowed) {
      return res.status(429).json({ success: false, message: "Too many vault balance requests" });
    }

    const { data, error } = await supabase.rpc("get_vault_balance", {
      p_device_id: deviceId,
    });

    if (error) {
      return res.status(400).json({ success: false, message: error.message || "Failed to read vault balance" });
    }

    const row = extractRow(data);
    return res.status(200).json({
      success: true,
      balance: Number(row?.vault_balance ?? row?.balance ?? row ?? 0),
    });
  } catch (error) {
    console.error("arcade/vault/balance failed", error);
    return res.status(500).json({ success: false, message: "Arcade vault balance API failed" });
  }
}
