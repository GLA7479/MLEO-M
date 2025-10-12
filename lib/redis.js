// ============================================================================
// Redis Client for Upstash
// ============================================================================

import { Redis } from '@upstash/redis';

// Initialize Redis client
// You need to set these environment variables in .env.local:
// UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
// UPSTASH_REDIS_REST_TOKEN=your-token

let redis;

export function getRedis() {
  if (!redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    
    if (!url || !token) {
      console.warn('⚠️ Redis not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN');
      // Return mock redis for development
      return {
        get: async () => null,
        set: async () => 'OK',
        del: async () => 1,
      };
    }
    
    redis = new Redis({
      url,
      token,
    });
  }
  
  return redis;
}

export default getRedis;

