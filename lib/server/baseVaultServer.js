import crypto from "crypto";
import { getSupabaseAdmin } from "./supabaseAdmin";

function extractRow(data) {
  return Array.isArray(data) ? data[0] : data;
}

export async function applyBaseVaultDeltaServer(deviceId, delta, reason) {
  const supabase = getSupabaseAdmin();
  const wholeDelta = Math.trunc(Number(delta) || 0);

  if (!deviceId) {
    throw new Error("Missing deviceId");
  }
  if (!wholeDelta) {
    return { ok: true, skipped: true, balance: null };
  }

  const { data, error } = await supabase.rpc("sync_vault_delta", {
    p_game_id: String(reason || "mleo-base"),
    p_delta: wholeDelta,
    p_device_id: deviceId,
    p_prev_nonce: null,
    p_next_nonce: crypto.randomUUID(),
  });

  if (error) {
    throw new Error(error.message || "Failed to apply vault delta");
  }

  const row = extractRow(data);
  return {
    ok: true,
    balance: Math.max(0, Number(row?.new_balance ?? row ?? 0)),
  };
}
