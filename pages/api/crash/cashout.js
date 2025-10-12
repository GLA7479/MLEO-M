// ============================================================================
// API Route: Cash out
// POST /api/crash/cashout
// Body: { userId }
// ============================================================================

import { CrashGameEngine } from '../../../lib/crash-engine';
import getRedis from '../../../lib/redis';

const GAME_STATE_KEY = 'mleo:crash:game';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    const redis = getRedis();
    
    // Get current game state
    let gameData = await redis.get(GAME_STATE_KEY);
    if (!gameData) {
      return res.status(400).json({ error: 'No active game' });
    }
    
    const engine = CrashGameEngine.fromJSON(gameData);
    
    // Update multiplier first
    if (engine.state.phase === 'running') {
      engine.tick();
    }
    
    // Cash out
    const result = engine.cashOut(userId);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    // Save updated state
    await redis.set(GAME_STATE_KEY, JSON.stringify(engine.toJSON()));
    
    res.status(200).json(result);
  } catch (error) {
    console.error('Error in crash/cashout:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

