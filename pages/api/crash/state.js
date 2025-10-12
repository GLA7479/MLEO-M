// ============================================================================
// API Route: Get current game state
// GET /api/crash/state
// ============================================================================

import { CrashGameEngine } from '../../../lib/crash-engine';
import getRedis from '../../../lib/redis';

const GAME_STATE_KEY = 'mleo:crash:game';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const redis = getRedis();
    
    // Get or create game state
    let gameData = await redis.get(GAME_STATE_KEY);
    let engine;
    
    if (!gameData) {
      // Initialize new game
      engine = new CrashGameEngine();
      await engine.initRound();
      await redis.set(GAME_STATE_KEY, JSON.stringify(engine.toJSON()));
    } else {
      engine = CrashGameEngine.fromJSON(gameData);
    }

    // Check if we need to transition phases
    const now = Date.now();
    
    if (engine.state.phase === 'betting' && now >= engine.state.bettingEndTime) {
      // Start running even if no bets
      await engine.startRunning();
      await redis.set(GAME_STATE_KEY, JSON.stringify(engine.toJSON()));
    } else if (engine.state.phase === 'betting' && Object.keys(engine.state.bets).length === 0 && now >= engine.state.bettingEndTime + 2000) {
      // If no bets after 2 extra seconds, start anyway
      await engine.startRunning();
      await redis.set(GAME_STATE_KEY, JSON.stringify(engine.toJSON()));
    } else if (engine.state.phase === 'running') {
      // Update multiplier
      engine.tick();
      
      // Save if crashed or auto cash outs happened
      if (engine.state.phase === 'crashed' || Object.values(engine.state.bets).some(b => b.cashedOutAt)) {
        await redis.set(GAME_STATE_KEY, JSON.stringify(engine.toJSON()));
      }
    } else if (engine.state.phase === 'crashed') {
      // Check if we should start a new round
      const crashTime = engine.state.crashTime || engine.state.runningStartTime;
      if (now >= crashTime + 3000) { // 3 seconds after crash
        await engine.initRound();
        await redis.set(GAME_STATE_KEY, JSON.stringify(engine.toJSON()));
      }
    }
    
    // Force start new round if stuck in any phase too long
    const lastUpdate = engine.state.lastUpdate || engine.state.bettingEndTime || now;
    if (now - lastUpdate > 30000) { // 30 seconds max
      await engine.initRound();
      await redis.set(GAME_STATE_KEY, JSON.stringify(engine.toJSON()));
    }

    // Get user-specific state if userId provided
    const userId = req.query.userId || req.headers['x-user-id'];
    const playerState = userId ? engine.getPlayerState(userId) : {};

    res.status(200).json({
      ...engine.getPublicState(),
      player: playerState,
    });
  } catch (error) {
    console.error('Error in crash/state:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

