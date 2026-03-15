import { checkRedisRateLimit } from "./redisRateLimit";

if (process.env.NODE_ENV === "production" && !process.env.UPSTASH_REDIS_REST_URL) {
  console.error("[RATE_LIMIT] Redis is not configured in production");
}

const buckets = new Map();

function makeKey(scope, subject) {
  return `${scope}:${subject || "anonymous"}`;
}

function checkInMemoryRateLimit(scope, subject, limit, windowMs) {
  const now = Date.now();
  const key = makeKey(scope, subject);
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }

  if (current.count >= limit) {
    return { allowed: false, remaining: 0, retryAfterMs: current.resetAt - now };
  }

  current.count += 1;
  return { allowed: true, remaining: Math.max(0, limit - current.count) };
}

export async function checkArcadeRateLimit(scope, subject, limit, windowMs) {
  // Try Redis first, fallback to in-memory
  const redisResult = await checkRedisRateLimit(scope, subject, limit, windowMs);
  if (redisResult !== null) {
    return redisResult;
  }
  
  // Fallback to in-memory
  return checkInMemoryRateLimit(scope, subject, limit, windowMs);
}
