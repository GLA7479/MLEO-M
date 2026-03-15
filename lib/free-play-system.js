// ============================================================================
// Free Play Token System - Device-Based (like vault)
// Players earn 1 free play token every hour, up to a maximum of 5 tokens
// Uses vault_device_id from localStorage (same as vault system)
// ============================================================================

import { supabaseMP as supabase } from "./supabaseClients";
import { ensureArcadeDeviceCookie } from "./arcadeDeviceClient";

export const MAX_TOKENS = 5;
export const TOKEN_REGEN_TIME = 3600000;
export const FREE_PLAY_AMOUNT = 100;

function randomId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getDeviceId() {
  if (typeof window === "undefined") return null;

  let deviceId = window.localStorage.getItem("vault_device_id");
  if (!deviceId) {
    deviceId = randomId();
    window.localStorage.setItem("vault_device_id", deviceId);
  }

  return deviceId;
}

/**
 * Get current free play status from server
 * Returns time until next token for stable countdown
 */
export async function getFreePlayStatus() {
  const fallback = {
    tokens: 0,
    maxTokens: 5,
    freePlayAmount: 100,
    hasTokens: false,
    isFull: false,
    totalUsed: 0,
    lastUsed: null,
    timeUntilNext: 0,
  };

  try {
    await ensureArcadeDeviceCookie();
  } catch {
    return fallback;
  }

  const response = await fetch("/api/arcade/freeplay/status", {
    method: "GET",
    credentials: "include",
  });
  if (!response.ok) return fallback;

  const payload = await response.json().catch(() => null);
  if (!payload?.success) return fallback;

  const row = payload;
  const tokens = Number(row?.tokens || 0);
  const maxTokens = Number(row?.maxTokens || row?.max_tokens || 5);
  const amount = Number(row?.freePlayAmount || row?.free_play_amount || 100);
  const regenMs = Number(row?.regenMs || row?.regen_ms || 3600000);

  let timeUntilNext = 0;
  const lastUpdate = row?.lastUpdate || row?.last_update;
  if (tokens < maxTokens && lastUpdate) {
    const lastUpdateMs = new Date(lastUpdate).getTime();
    const nextTokenAtMs = lastUpdateMs + regenMs;
    timeUntilNext = Math.max(0, nextTokenAtMs - Date.now());
  }

  return {
    tokens,
    maxTokens,
    freePlayAmount: amount,
    hasTokens: tokens > 0,
    isFull: tokens >= maxTokens,
    totalUsed: Number(row?.total_used || 0),
    lastUsed: row?.last_used || null,
    timeUntilNext,
  };
}

/**
 * Use a free play token for a specific game
 * @param {string} gameId - The game identifier (e.g., "coin-flip", "blackjack")
 * @returns {Promise<{success: boolean, sessionId?: string, remainingTokens?: number, amount?: number, message?: string}>}
 */
export async function useFreePlayToken(gameId) {
  const deviceId = getDeviceId();
  if (!deviceId) {
    return { success: false, message: "No device id available" };
  }

  const { data, error } = await supabase.rpc("freeplay_device_consume", {
    p_device_id: deviceId,
    p_game_id: gameId,
  });

  if (error) {
    if (error.message?.includes("No free play tokens available")) {
      return { success: false, message: "No free play tokens available" };
    }
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;

  return {
    success: true,
    sessionId: null,
    remainingTokens: Number(row?.tokens_remaining || 0),
    amount: Number(row?.free_play_amount || 100),
  };
}

/**
 * Format time remaining until next token
 */
export function formatTimeRemaining(milliseconds) {
  if (milliseconds <= 0) return "0:00";

  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Get free play statistics
 */
export async function getFreePlayStats() {
  const status = await getFreePlayStatus();

  return {
    totalUsed: status.totalUsed,
    currentTokens: status.tokens,
    maxTokens: status.maxTokens,
    lastUsed: status.lastUsed ? new Date(status.lastUsed).toLocaleString() : "Never",
    valueUsed: status.totalUsed * status.freePlayAmount,
  };
}
