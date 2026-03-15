import { Redis } from "@upstash/redis";

let redis = null;

let redisWarningLogged = false;

function getRedisClient() {
  if (redis) return redis;
  
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  
  if (!url || !token) {
    // Warning in production if Redis is not configured
    if (process.env.NODE_ENV === "production" && !redisWarningLogged) {
      redisWarningLogged = true;
      console.warn(
        "⚠️ [RATE_LIMIT] Redis not configured - rate limiting running in memory only. " +
        "This may cause issues in multi-instance deployments. " +
        "Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to enable Redis-based rate limiting."
      );
    }
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
    if (process.env.NODE_ENV === "production" && !redisWarningLogged) {
      redisWarningLogged = true;
      console.warn(
        "⚠️ [RATE_LIMIT] Redis initialization failed - rate limiting running in memory only. " +
        "Check Redis configuration."
      );
    }
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
