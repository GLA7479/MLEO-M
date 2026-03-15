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
    const rate = checkArcadeRateLimit("miners-claim-vault", deviceId, 20, 60_000);
    if (!rate.allowed) {
      return res.status(429).json({ success: false, message: "Too many claim-to-vault requests" });
    }

    const wholeAmount = Math.max(0, Math.floor(Number(req.body?.amount) || 0));
    const amountParam = wholeAmount > 0 ? wholeAmount : null;

    const { data, error } = await supabase.rpc("miners_move_balance_to_vault", {
      p_device_id: deviceId,
      p_amount: amountParam,
    });

    if (error) {
      return res.status(400).json({ success: false, message: error.message || "Failed to move miners balance to vault" });
    }

    const row = extractRow(data);
    return res.status(200).json({
      success: true,
      moved: Number(row?.moved || 0),
      balance: Number(row?.balance || 0),
      vault: Number(row?.vault || 0),
      claimedTotal: Number(row?.claimed_total || 0),
      sharedVaultBalance: Number(row?.shared_vault_balance || 0),
    });
  } catch (error) {
    console.error("miners/claim/to-vault failed", error);
    return res.status(500).json({ success: false, message: "Miners claim-to-vault API failed" });
  }
}
