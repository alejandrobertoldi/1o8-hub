/**
 * Simple in-memory rate limiter for API routes.
 * Works per-serverless-instance on Vercel (not globally shared),
 * but provides per-request protection against rapid abuse.
 * Upgrade to @upstash/ratelimit + Redis for distributed rate limiting.
 */

const rateMap = new Map<string, { count: number; resetAt: number }>();

// Clean up stale entries every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, val] of rateMap) {
      if (val.resetAt < now) rateMap.delete(key);
    }
  }, 5 * 60 * 1000);
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Check rate limit for a given identifier.
 * @param identifier - Unique key (e.g., user email or IP)
 * @param limit - Max requests in the window
 * @param windowMs - Time window in milliseconds (default 60s)
 */
export function checkRateLimit(
  identifier: string,
  limit: number,
  windowMs: number = 60_000
): RateLimitResult {
  const now = Date.now();
  const entry = rateMap.get(identifier);

  if (!entry || entry.resetAt < now) {
    rateMap.set(identifier, { count: 1, resetAt: now + windowMs });
    return { success: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  entry.count++;
  if (entry.count > limit) {
    return { success: false, remaining: 0, resetAt: entry.resetAt };
  }

  return { success: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}
