const buckets = new Map();

function makeKey(scope, subject) {
  return `${scope}:${subject || "anonymous"}`;
}

export function checkArcadeRateLimit(scope, subject, limit, windowMs) {
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
