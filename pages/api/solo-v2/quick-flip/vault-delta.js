import crypto from "crypto";
import { getArcadeDevice } from "../../../../lib/server/arcadeDeviceCookie";
import { checkArcadeRateLimit } from "../../../../lib/server/arcadeRateLimit";
import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { validateCsrfToken } from "../../../../lib/server/csrf";
import { sanitizeGameId } from "../../../../lib/server/inputValidation";

function extractRow(data) {
  return Array.isArray(data) ? data[0] : data;
}

function parseInteger(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (!Number.isInteger(num)) return null;
  return num;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  try {
    if (!validateCsrfToken(req)) {
      return res.status(403).json({ ok: false, message: "Invalid CSRF token" });
    }

    const deviceId = getArcadeDevice(req);
    if (!deviceId) {
      return res.status(401).json({ ok: false, message: "Device not initialized" });
    }

    const rateLimit = await checkArcadeRateLimit("solo-v2-quick-flip-vault-delta", deviceId, 30, 60_000);
    if (!rateLimit.allowed) {
      return res.status(429).json({ ok: false, message: "Too many vault update requests" });
    }

    const rawDelta = parseInteger(req.body?.delta);
    if (rawDelta === null || rawDelta === 0) {
      return res.status(400).json({ ok: false, message: "Invalid delta" });
    }

    const rawGameId = String(req.body?.gameId || "solo-v2-quick-flip-settlement");
    const gameId = sanitizeGameId(rawGameId) || "solo-v2-quick-flip-settlement";

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("sync_vault_delta", {
      p_game_id: gameId,
      p_delta: rawDelta,
      p_device_id: deviceId,
      p_prev_nonce: null,
      p_next_nonce: crypto.randomUUID(),
    });

    if (error) {
      const message = error.message || "Failed to update vault";
      return res.status(400).json({ ok: false, message });
    }

    const row = extractRow(data);
    return res.status(200).json({
      ok: true,
      balance: Number(row?.new_balance ?? row ?? 0),
    });
  } catch (error) {
    console.error("solo-v2/quick-flip/vault-delta failed", error);
    return res.status(500).json({ ok: false, message: "Vault update API failed" });
  }
}

