import { getArcadeDevice } from "../../../../lib/server/arcadeDeviceCookie";
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
    const deviceId = getArcadeDevice(req);
    if (!deviceId) {
      return res.status(401).json({ success: false, message: "Device not initialized" });
    }
    const rateLimit = checkArcadeRateLimit("arcade-start", deviceId, 20, 60_000);
    if (!rateLimit.allowed) {
      return res.status(429).json({ success: false, message: "Too many start requests" });
    }
    const { gameId, stake, freeplay = false } = req.body || {};

    if (!gameId) {
      return res.status(400).json({ success: false, message: "Missing gameId" });
    }

    if (freeplay) {
      const { data, error } = await supabase.rpc("start_freeplay_session", {
        p_device_id: deviceId,
        p_game_id: String(gameId),
      });
      if (error) {
        const message = error.message?.includes("No free play tokens available")
          ? "No free play tokens available"
          : error.message || "Failed to start free play session";
        return res.status(400).json({ success: false, message });
      }

      const row = extractRow(data);
      return res.status(200).json({
        success: true,
        sessionId: row?.session_id || null,
        remainingTokens: Number(row?.tokens_remaining || 0),
        amount: Number(row?.stake || 0),
        gameId: row?.game_id || gameId,
        mode: row?.mode || "freeplay",
        status: row?.status || "started",
      });
    }

    const wholeStake = Math.max(0, Math.floor(Number(stake) || 0));
    if (wholeStake <= 0) {
      return res.status(400).json({ success: false, message: "Invalid stake" });
    }

    const { data, error } = await supabase.rpc("start_paid_session", {
      p_device_id: deviceId,
      p_game_id: String(gameId),
      p_stake: wholeStake,
    });

    if (error) {
      const message = error.message?.includes("Insufficient vault balance")
        ? "Insufficient MLEO in vault"
        : error.message || "Failed to start paid session";
      return res.status(400).json({ success: false, message });
    }

    const row = extractRow(data);
    return res.status(200).json({
      success: true,
      sessionId: row?.session_id || null,
      balanceAfter: Number(row?.balance_after || 0),
      stake: Number(row?.stake || wholeStake),
      gameId: row?.game_id || gameId,
      mode: row?.mode || "paid",
      status: row?.status || "started",
    });
  } catch (error) {
    console.error("arcade/session/start failed", error);
    return res.status(500).json({ success: false, message: "Arcade start API failed" });
  }
}
