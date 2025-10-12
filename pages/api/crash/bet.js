// ============================================================================
// API Route: Place a bet
// POST /api/crash/bet
// Body: { userId, amount, autoCashOut? }
// ============================================================================

import { CrashGameEngine } from '../../../lib/crash-engine';
import getRedis from '../../../lib/redis';

const GAME_STATE_KEY = 'mleo:crash:game';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, amount, autoCashOut } = req.body;
    
    if (!userId || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid bet parameters' });
    }

    const redis = getRedis();
    
    // Get current game state
    let gameData = await redis.get(GAME_STATE_KEY);
    if (!gameData) {
      return res.status(400).json({ error: 'No active game' });
    }
    
    const engine = CrashGameEngine.fromJSON(gameData);
    
    // Place bet
    const result = engine.placeBet(userId, amount, autoCashOut);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    // Save updated state
    await redis.set(GAME_STATE_KEY, JSON.stringify(engine.toJSON()));
    
    res.status(200).json({
      success: true,
      bet: {
        amount,
        autoCashOut,
        roundId: engine.state.roundId,
      },
    });
  } catch (error) {
    console.error('Error in crash/bet:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

