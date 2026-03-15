import { getArcadeDevice } from "../../../lib/server/arcadeDeviceCookie";
import { checkArcadeRateLimit } from "../../../lib/server/arcadeRateLimit";
import { getSupabaseAdmin } from "../../../lib/server/supabaseAdmin";

function extractRow(data) {
  return Array.isArray(data) ? data[0] : data;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ success: false, code: "METHOD_NOT_ALLOWED", message: "Method not allowed" });
  }

  try {
    const supabase = getSupabaseAdmin();
    const deviceId = getArcadeDevice(req);
    if (!deviceId) {
      return res.status(401).json({ success: false, code: "DEVICE_NOT_INITIALIZED", message: "Device not initialized" });
    }
    const rate = await checkArcadeRateLimit("miners-state", deviceId, 80, 60_000);
    if (!rate.allowed) {
      return res.status(429).json({ success: false, code: "RATE_LIMIT_DEVICE", message: "Too many miners state requests" });
    }

    const [stateResp, configResp, sharedVaultResp] = await Promise.all([
      supabase.rpc("miners_get_state", { p_device_id: deviceId }),
      supabase.rpc("miners_get_config"),
      supabase.rpc("get_vault_balance", { p_device_id: deviceId }),
    ]);

    if (stateResp.error) {
      return res.status(400).json({ success: false, code: "MINERS_STATE_LOAD_FAILED", message: stateResp.error.message || "Failed to read miners state" });
    }
    if (configResp.error) {
      return res.status(400).json({ success: false, code: "MINERS_CONFIG_LOAD_FAILED", message: configResp.error.message || "Failed to read miners config" });
    }
    if (sharedVaultResp.error) {
      return res.status(400).json({ success: false, code: "MINERS_VAULT_LOAD_FAILED", message: sharedVaultResp.error.message || "Failed to read shared vault balance" });
    }

    const state = extractRow(stateResp.data) || {};
    const config = extractRow(configResp.data) || {};
    const sharedVault = extractRow(sharedVaultResp.data);

    return res.status(200).json({
      success: true,
      state: {
        balance: Number(state.balance || 0),
        minedToday: Number(state.mined_today || 0),
        scoreToday: Number(state.score_today || 0),
        lastDay: state.last_day || null,
        vault: Number(sharedVault?.vault_balance ?? sharedVault?.balance ?? sharedVault ?? state.vault ?? 0),
        minersVault: Number(state.vault || 0),
        sharedVaultBalance: Number(sharedVault?.vault_balance ?? sharedVault?.balance ?? sharedVault ?? state.vault ?? 0),
        claimedTotal: Number(state.claimed_total || 0),
        claimedToWallet: Number(state.claimed_to_wallet || 0),
        giftNextClaimAt: state.gift_next_claim_at || null,
        giftLastClaimAt: state.last_gift_claim_at || null,
        giftClaimCount: Number(state.gift_claim_count || 0),
        dailyCap: Number(state.daily_cap || config.daily_cap || 0),
        softcutFactor: Number(state.softcut_factor || 1),
      },
      config: {
        baseStageV1: Number(config.base_stage_v1 || 0.5),
        dailyCap: Number(config.daily_cap || 0),
        offlineFactor: Number(config.offline_factor || 0.5),
        giftCooldownSeconds: Number(config.gift_cooldown_seconds || 3600),
        softcut: config.softcut_json || [],
      },
    });
  } catch (error) {
    console.error("miners/state failed", error);
    return res.status(500).json({ success: false, code: "MINERS_STATE_INTERNAL_ERROR", message: "Miners state API failed" });
  }
}
