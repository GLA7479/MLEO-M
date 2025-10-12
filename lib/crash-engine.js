// ============================================================================
// Crash Game Engine - Server-side game logic
// Manages rounds, bets, and crash calculations
// ============================================================================

// Game configuration
const ROUND_CONFIG = {
  bettingSeconds: 30,
  intermissionMs: 4000,
  minCrash: 1.1,
  maxCrash: 10.0,
  growthRate: 0.25,
  decimals: 2,
};

// Hash helpers (provably fair)
async function sha256Hex(str) {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    // Node.js environment
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(str).digest('hex');
  }
  // Browser environment
  const enc = new TextEncoder();
  const data = enc.encode(str);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hashToUnitFloat(hex) {
  const slice = hex.slice(0, 13);
  const int = parseInt(slice, 16);
  const max = Math.pow(16, slice.length);
  return int / max;
}

function hashToCrash(hex, minCrash, maxCrash) {
  const u = hashToUnitFloat(hex);
  
  // Balanced distribution with house edge
  let v;
  if (u < 0.3) { // 30% chance of very early crash
    v = minCrash + (2 - minCrash) * (u / 0.3); // 1.1 to 2.0
  } else if (u < 0.6) { // 30% chance of early-mid crash
    v = 2 + 1.5 * ((u - 0.3) / 0.3); // 2.0 to 3.5
  } else if (u < 0.85) { // 25% chance of mid crash
    v = 3.5 + 2 * ((u - 0.6) / 0.25); // 3.5 to 5.5
  } else { // 15% chance of high crash
    v = 5.5 + (maxCrash - 5.5) * ((u - 0.85) / 0.15); // 5.5 to 10.0
  }
  
  return Math.max(minCrash, Math.min(maxCrash, Math.round(v * 100) / 100));
}

// Growth function
function calculateMultiplier(elapsedMs) {
  const t = elapsedMs / 1000;
  const m = Math.exp(ROUND_CONFIG.growthRate * t * 0.5);
  return Math.max(1, Math.floor(m * Math.pow(10, ROUND_CONFIG.decimals)) / Math.pow(10, ROUND_CONFIG.decimals));
}

// ============================================================================
// Game Engine Class
// ============================================================================
class CrashGameEngine {
  constructor() {
    this.state = {
      phase: 'betting', // betting | running | crashed | intermission
      roundId: 0,
      bettingEndTime: Date.now() + ROUND_CONFIG.bettingSeconds * 1000,
      runningStartTime: null,
      crashPoint: null,
      currentMultiplier: 1.0,
      serverSeed: null,
      serverSeedHash: null,
      clientSeed: Math.random().toString(36).slice(2),
      nonce: 0,
      bets: {}, // { userId: { amount, autoCashOut, cashedOutAt } }
      history: [], // last 10 crash points
    };
  }

  // Initialize new round
  async initRound() {
    const serverSeed = Array.from(crypto.getRandomValues(new Uint32Array(8))).join("-");
    const hash = await sha256Hex(serverSeed);
    
    this.state = {
      ...this.state,
      phase: 'betting',
      roundId: this.state.roundId + 1,
      bettingEndTime: Date.now() + ROUND_CONFIG.bettingSeconds * 1000,
      runningStartTime: null,
      crashPoint: null,
      currentMultiplier: 1.0,
      serverSeed,
      serverSeedHash: hash,
      clientSeed: Math.random().toString(36).slice(2),
      nonce: this.state.nonce + 1,
      bets: {},
    };
  }

  // Start running phase
  async startRunning() {
    // Calculate crash point
    const combinedSeed = `${this.state.serverSeed}|${this.state.clientSeed}|${this.state.nonce}`;
    const hash = await sha256Hex(combinedSeed);
    const crashPoint = hashToCrash(hash, ROUND_CONFIG.minCrash, ROUND_CONFIG.maxCrash);
    
    this.state.phase = 'running';
    this.state.runningStartTime = Date.now();
    this.state.crashPoint = crashPoint;
    this.state.currentMultiplier = 1.0;
  }

  // Update multiplier (called every tick)
  tick() {
    if (this.state.phase !== 'running') return;
    
    const elapsed = Date.now() - this.state.runningStartTime;
    const multiplier = calculateMultiplier(elapsed);
    this.state.currentMultiplier = multiplier;

    // Check auto cash outs
    Object.entries(this.state.bets).forEach(([userId, bet]) => {
      if (!bet.cashedOutAt && bet.autoCashOut && multiplier >= bet.autoCashOut) {
        bet.cashedOutAt = multiplier;
      }
    });

    // Check if crashed
    if (multiplier >= this.state.crashPoint) {
      this.crash();
    }
  }

  // Crash the round
  crash() {
    this.state.phase = 'crashed';
    this.state.currentMultiplier = this.state.crashPoint;
    
    // Add to history
    this.state.history.push({
      mult: this.state.crashPoint,
      timestamp: Date.now(),
    });
    if (this.state.history.length > 10) {
      this.state.history.shift();
    }

    // Schedule next round
    setTimeout(() => {
      this.state.phase = 'intermission';
      setTimeout(() => {
        this.initRound();
      }, ROUND_CONFIG.intermissionMs);
    }, 1000);
  }

  // Place a bet
  placeBet(userId, amount, autoCashOut = null) {
    if (this.state.phase !== 'betting') {
      return { success: false, error: 'Betting phase ended' };
    }
    
    this.state.bets[userId] = {
      amount,
      autoCashOut: autoCashOut || null,
      cashedOutAt: null,
    };
    
    return { success: true };
  }

  // Cash out
  cashOut(userId) {
    if (this.state.phase !== 'running') {
      return { success: false, error: 'Round not running' };
    }
    
    const bet = this.state.bets[userId];
    if (!bet) {
      return { success: false, error: 'No bet placed' };
    }
    
    if (bet.cashedOutAt) {
      return { success: false, error: 'Already cashed out' };
    }
    
    bet.cashedOutAt = this.state.currentMultiplier;
    const winAmount = Math.round(bet.amount * this.state.currentMultiplier * 100) / 100;
    
    return { 
      success: true, 
      winAmount,
      multiplier: this.state.currentMultiplier,
    };
  }

  // Get public state (safe to send to clients)
  getPublicState() {
    const timeLeft = this.state.phase === 'betting' 
      ? Math.max(0, Math.ceil((this.state.bettingEndTime - Date.now()) / 1000))
      : 0;

    return {
      phase: this.state.phase,
      roundId: this.state.roundId,
      multiplier: this.state.currentMultiplier,
      crashPoint: this.state.phase === 'crashed' ? this.state.crashPoint : null,
      serverSeedHash: this.state.serverSeedHash,
      serverSeed: this.state.phase === 'crashed' || this.state.phase === 'intermission' ? this.state.serverSeed : null,
      timeLeft,
      history: this.state.history,
      totalBets: Object.keys(this.state.bets).length,
    };
  }

  // Get player-specific state
  getPlayerState(userId) {
    const bet = this.state.bets[userId];
    return {
      bet: bet ? {
        amount: bet.amount,
        autoCashOut: bet.autoCashOut,
        cashedOutAt: bet.cashedOutAt,
      } : null,
    };
  }

  // Serialize to JSON
  toJSON() {
    return this.state;
  }

  // Deserialize from JSON
  static fromJSON(json) {
    const engine = new CrashGameEngine();
    engine.state = json;
    return engine;
  }
}

// ============================================================================
// Singleton instance manager (for serverless compatibility)
// ============================================================================
let engineInstance = null;

export function getEngine() {
  if (!engineInstance) {
    engineInstance = new CrashGameEngine();
  }
  return engineInstance;
}

export function setEngine(engine) {
  engineInstance = engine;
}

export { CrashGameEngine, ROUND_CONFIG };

