import { Redis } from "@upstash/redis";

let redis = null;

function getRedisClient() {
  if (redis) return redis;
  
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  
  if (!url || !token) {
    return null; // Redis not configured, will fallback to in-memory
  }
  
  try {
    redis = new Redis({
      url,
      token,
    });
    return redis;
  } catch (error) {
    console.error("Failed to initialize Redis:", error);
    return null;
  }
}

export async function checkRedisRateLimit(scope, subject, limit, windowMs) {
  const client = getRedisClient();
  if (!client) {
    return null; // Signal to fallback to in-memory
  }
  
  const key = `rate:${scope}:${subject || "anonymous"}`;
  const windowSec = Math.ceil(windowMs / 1000);
  
  try {
    // Get current count
    const currentCount = await client.get(key);
    const count = Number(currentCount || 0);
    
    if (count >= limit) {
      // Get TTL to calculate retry after
      const ttl = await client.ttl(key);
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: ttl * 1000,
      };
    }
    
    // Increment count
    const newCount = await client.incr(key);
    
    // Set expiry if this is the first increment
    if (newCount === 1) {
      await client.expire(key, windowSec);
    }
    
    return {
      allowed: true,
      remaining: Math.max(0, limit - newCount),
    };
  } catch (error) {
    console.error("Redis rate limit error:", error);
    return null; // Signal to fallback to in-memory
  }
}
