import { checkRedisRateLimit } from "./redisRateLimit";

if (process.env.NODE_ENV === "production" && !process.env.UPSTASH_REDIS_REST_URL) {
  console.error("[RATE_LIMIT] Redis is not configured in production");
}

const ipBuckets = new Map();

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const realIp = req.headers["x-real-ip"];
  const remoteAddress = req.socket?.remoteAddress;
  
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded : forwarded.split(",");
    return ips[0]?.trim() || "unknown";
  }
  
  return realIp || remoteAddress || "unknown";
}

function checkInMemoryIpRateLimit(ip, limit, windowMs) {
  const now = Date.now();
  const key = `ip:${ip}`;
  const current = ipBuckets.get(key);

  if (!current || current.resetAt <= now) {
    ipBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }

  if (current.count >= limit) {
    return { allowed: false, remaining: 0, retryAfterMs: current.resetAt - now };
  }

  current.count += 1;
  return { allowed: true, remaining: Math.max(0, limit - current.count) };
}

export async function checkIpRateLimit(req, limit, windowMs) {
  const ip = getClientIp(req);
  if (ip === "unknown") {
    // If we can't get IP, allow but log
    return { allowed: true, remaining: limit };
  }

  // Try Redis first
  const redisResult = await checkRedisRateLimit("ip", ip, limit, windowMs);
  if (redisResult !== null) {
    return redisResult;
  }

  // Fallback to in-memory
  return checkInMemoryIpRateLimit(ip, limit, windowMs);
}

export { getClientIp };
