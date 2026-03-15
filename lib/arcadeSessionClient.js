import { supabaseMP as supabase } from "./supabaseClients";
import { readSharedVault } from "./sharedVault";

function randomId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getVaultDeviceId() {
  if (typeof window === "undefined") return null;

  let deviceId = window.localStorage.getItem("vault_device_id");
  if (!deviceId) {
    deviceId = randomId();
    window.localStorage.setItem("vault_device_id", deviceId);
  }

  return deviceId;
}

function extractRow(data) {
  return Array.isArray(data) ? data[0] : data;
}

async function refreshVaultSnapshot() {
  try {
    const snapshot = await readSharedVault({ fresh: true });
    return Number(snapshot?.balance || 0);
  } catch {
    return null;
  }
}

export async function startPaidArcadeSession(gameId, stake) {
  const deviceId = getVaultDeviceId();
  if (!deviceId) {
    return { success: false, message: "No device id available" };
  }

  const wholeStake = Math.max(0, Math.floor(Number(stake) || 0));
  if (wholeStake <= 0) {
    return { success: false, message: "Invalid stake" };
  }

  const { data, error } = await supabase.rpc("start_paid_session", {
    p_device_id: deviceId,
    p_game_id: gameId,
    p_stake: wholeStake,
  });

  if (error) {
    if (error.message?.includes("Insufficient vault balance")) {
      return { success: false, message: "Insufficient MLEO in vault" };
    }
    throw error;
  }

  const row = extractRow(data);
  const balanceAfter = await refreshVaultSnapshot();

  return {
    success: true,
    sessionId: row?.session_id || null,
    balanceAfter: balanceAfter ?? Number(row?.balance_after || 0),
    stake: Number(row?.stake || wholeStake),
    gameId: row?.game_id || gameId,
    mode: row?.mode || "paid",
    status: row?.status || "started",
  };
}

export async function startFreeplayArcadeSession(gameId) {
  const deviceId = getVaultDeviceId();
  if (!deviceId) {
    return { success: false, message: "No device id available" };
  }

  const { data, error } = await supabase.rpc("start_freeplay_session", {
    p_device_id: deviceId,
    p_game_id: gameId,
  });

  if (error) {
    if (error.message?.includes("No free play tokens available")) {
      return { success: false, message: "No free play tokens available" };
    }
    throw error;
  }

  const row = extractRow(data);

  return {
    success: true,
    sessionId: row?.session_id || null,
    remainingTokens: Number(row?.tokens_remaining || 0),
    amount: Number(row?.stake || 0),
    gameId: row?.game_id || gameId,
    mode: row?.mode || "freeplay",
    status: row?.status || "started",
  };
}

export async function finishArcadeSession(sessionId, payload = {}) {
  if (!sessionId) {
    return { success: false, message: "Missing session id" };
  }

  const { data, error } = await supabase.rpc("finish_arcade_session", {
    p_session_id: sessionId,
    p_payload: payload,
  });

  if (error) throw error;

  const row = extractRow(data);
  const balanceAfter = await refreshVaultSnapshot();

  return {
    success: true,
    sessionId: row?.session_id || sessionId,
    approvedReward: Number(row?.approved_reward || 0),
    balanceAfter: balanceAfter ?? Number(row?.balance_after || 0),
    status: row?.status || "finished",
    serverPayload: row?.server_payload || {},
  };
}
