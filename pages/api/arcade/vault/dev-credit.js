import crypto from "crypto";
import { getArcadeDevice } from "../../../../lib/server/arcadeDeviceCookie";
import { checkArcadeRateLimit } from "../../../../lib/server/arcadeRateLimit";
import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { validateCsrfToken } from "../../../../lib/server/csrf";
import { logCsrfFailure } from "../../../../lib/server/securityLogger";

function extractRow(data) {
  return Array.isArray(data) ? data[0] : data;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  const isProd = process.env.NODE_ENV === "production";
  const allowOnProd = process.env.MLEO_ALLOW_DEV_VAULT_CREDIT === "true";
  if (isProd && !allowOnProd) {
    return res.status(403).json({ success: false, message: "Dev credit disabled in production" });
  }

  try {
    if (!validateCsrfToken(req)) {
      logCsrfFailure(req);
      return res.status(403).json({ success: false, message: "Invalid CSRF token" });
    }

    const supabase = getSupabaseAdmin();
    const deviceId = getArcadeDevice(req);
    if (!deviceId) {
      return res.status(401).json({ success: false, message: "Device not initialized" });
    }
    const rateLimit = await checkArcadeRateLimit("arcade-dev-credit", deviceId, 5, 60_000);
    if (!rateLimit.allowed) {
      return res.status(429).json({ success: false, message: "Too many dev credit requests" });
    }

    const { password, amount = 10000 } = req.body || {};
    const wholeAmount = Math.max(0, Math.floor(Number(amount) || 0));

    const envPw = process.env.MLEO_DEV_VAULT_CREDIT_PASSWORD;
    const expectedPassword =
      typeof envPw === "string" && envPw.length > 0 ? envPw : "7479";
    if (isProd && allowOnProd && !(typeof envPw === "string" && envPw.length > 0)) {
      console.warn(
        "[mleo] dev-credit: MLEO_DEV_VAULT_CREDIT_PASSWORD is not set; using default password. Set MLEO_DEV_VAULT_CREDIT_PASSWORD on the host for a private staging secret."
      );
    }

    if (password !== expectedPassword) {
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
