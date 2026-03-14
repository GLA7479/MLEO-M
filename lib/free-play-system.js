// ============================================================================
// Free Play Token System - Supabase Backend
// Players earn 1 free play token every hour, up to a maximum of 5 tokens
// Uses Supabase MP auth.uid() for user identification
// ============================================================================

import { supabaseMP as supabase } from "./supabaseClients";
import { playAsGuest } from "./authGuest";

/**
 * Ensure user is authenticated (guest or regular)
 */
export async function ensureFreePlayAuth() {
  const { data: { user } = {} } = await supabase.auth.getUser();
  if (user) return user;
  const result = await playAsGuest();
  return result?.user || null;
}

/**
 * Get current free play status from server
 * Returns time until next token for stable countdown
 */
export async function getFreePlayStatus() {
  await ensureFreePlayAuth();

  const { data, error } = await supabase.rpc("arcade_freeplay_refresh");
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  const tokens = Number(row?.tokens || 0);
  const maxTokens = Number(row?.max_tokens || 5);
  const amount = Number(row?.free_play_amount || 100);
  const regenMs = Number(row?.regen_ms || 3600000);

  let timeUntilNext = 0;

  if (tokens < maxTokens && row?.last_update) {
    const lastUpdateMs = new Date(row.last_update).getTime();
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
  await ensureFreePlayAuth();

  const { data, error } = await supabase.rpc("arcade_freeplay_start", {
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
    sessionId: row.session_id,
    remainingTokens: Number(row.tokens_remaining || 0),
    amount: Number(row.free_play_amount || 100),
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
  
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
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
    valueUsed: status.totalUsed * status.freePlayAmount
  };
}

// Export constants for backward compatibility
export const MAX_TOKENS = 5;
export const TOKEN_REGEN_TIME = 3600000; // 1 hour in milliseconds
export const FREE_PLAY_AMOUNT = 100;
