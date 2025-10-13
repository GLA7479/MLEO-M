// ============================================================================
// Free Play Token System
// Players earn 1 free play token every hour, up to a maximum of 5 tokens
// ============================================================================

const FREE_PLAY_KEY = "mleo_free_play_v1";
const MAX_TOKENS = 5;
const TOKEN_REGEN_TIME = 3600000; // 1 hour in milliseconds (60 * 60 * 1000)
const FREE_PLAY_AMOUNT = 1000; // Each free play is worth 1000 MLEO

// ============================================================================
// Storage Functions
// ============================================================================

function safeRead(key, fallback = {}) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function safeWrite(key, val) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}

// ============================================================================
// Free Play Token Management
// ============================================================================

/**
 * Initialize free play data if it doesn't exist
 */
export function initFreePlay() {
  const data = safeRead(FREE_PLAY_KEY, null);
  
  if (!data) {
    const initialData = {
      tokens: 0,
      lastUpdate: Date.now(),
      totalUsed: 0,
      lastUsed: null
    };
    safeWrite(FREE_PLAY_KEY, initialData);
    return initialData;
  }
  
  return data;
}

/**
 * Calculate current number of tokens based on time passed
 */
export function calculateTokens() {
  const data = initFreePlay();
  const now = Date.now();
  const timePassed = now - data.lastUpdate;
  
  // Calculate how many tokens should have regenerated
  const tokensGenerated = Math.floor(timePassed / TOKEN_REGEN_TIME);
  
  if (tokensGenerated > 0) {
    // Update tokens (cap at MAX_TOKENS)
    const newTokens = Math.min(data.tokens + tokensGenerated, MAX_TOKENS);
    
    // Update last update time to the last full hour that passed
    const newLastUpdate = data.lastUpdate + (tokensGenerated * TOKEN_REGEN_TIME);
    
    const updatedData = {
      ...data,
      tokens: newTokens,
      lastUpdate: newLastUpdate
    };
    
    safeWrite(FREE_PLAY_KEY, updatedData);
    return updatedData;
  }
  
  return data;
}

/**
 * Get current token count and time until next token
 */
export function getFreePlayStatus() {
  const data = calculateTokens();
  const now = Date.now();
  const timeSinceLastUpdate = now - data.lastUpdate;
  const timeUntilNext = TOKEN_REGEN_TIME - timeSinceLastUpdate;
  
  return {
    tokens: data.tokens,
    maxTokens: MAX_TOKENS,
    timeUntilNext: data.tokens < MAX_TOKENS ? timeUntilNext : 0,
    hasTokens: data.tokens > 0,
    isFull: data.tokens >= MAX_TOKENS,
    totalUsed: data.totalUsed,
    lastUsed: data.lastUsed
  };
}

/**
 * Use a free play token
 * Returns true if successful, false if no tokens available
 */
export function useFreePlayToken() {
  const data = calculateTokens();
  
  if (data.tokens <= 0) {
    return { success: false, message: "No free play tokens available" };
  }
  
  const updatedData = {
    ...data,
    tokens: data.tokens - 1,
    totalUsed: data.totalUsed + 1,
    lastUsed: Date.now()
  };
  
  safeWrite(FREE_PLAY_KEY, updatedData);
  
  return { 
    success: true, 
    tokensRemaining: updatedData.tokens,
    amount: FREE_PLAY_AMOUNT
  };
}

/**
 * Format time remaining until next token
 */
export function formatTimeRemaining(milliseconds) {
  if (milliseconds <= 0) return "Ready!";
  
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Get free play statistics
 */
export function getFreePlayStats() {
  const data = calculateTokens();
  
  return {
    totalUsed: data.totalUsed,
    currentTokens: data.tokens,
    maxTokens: MAX_TOKENS,
    lastUsed: data.lastUsed ? new Date(data.lastUsed).toLocaleString() : "Never",
    valueUsed: data.totalUsed * FREE_PLAY_AMOUNT
  };
}

/**
 * Reset free play system (for testing/admin purposes)
 */
export function resetFreePlay() {
  const resetData = {
    tokens: MAX_TOKENS,
    lastUpdate: Date.now(),
    totalUsed: 0,
    lastUsed: null
  };
  safeWrite(FREE_PLAY_KEY, resetData);
  return resetData;
}

/**
 * Add tokens for debugging (gives max tokens immediately)
 */
export function debugAddTokens() {
  const data = safeRead(FREE_PLAY_KEY, {
    tokens: 0,
    lastUpdate: Date.now(),
    totalUsed: 0,
    lastUsed: null
  });
  
  const updatedData = {
    ...data,
    tokens: MAX_TOKENS,
    lastUpdate: Date.now()
  };
  
  safeWrite(FREE_PLAY_KEY, updatedData);
  return updatedData;
}

// Export constants
export { MAX_TOKENS, TOKEN_REGEN_TIME, FREE_PLAY_AMOUNT };

