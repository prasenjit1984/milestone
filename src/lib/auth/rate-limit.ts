import "server-only";

/**
 * Minimal in-memory fixed-window rate limiter for auth-adjacent endpoints
 * (login, PIN entry). This is a "budget" defense: it stops naive scripted
 * brute-forcing from a single serverless instance, but it is NOT durable —
 * each cold start / instance has its own counters, so a determined attacker
 * distributing requests across instances isn't fully stopped by this alone.
 * If this app ever needs a stronger guarantee, swap this module for a
 * shared store (e.g. Upstash Redis) behind the same checkRateLimit() shape.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

// Prevent unbounded growth if this instance stays warm a long time.
const MAX_TRACKED_KEYS = 5000;

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
}

export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    if (buckets.size >= MAX_TRACKED_KEYS) {
      // Cheap eviction: drop expired entries first, then bail on tracking
      // this attempt if we're still over budget rather than growing further.
      for (const [k, v] of buckets) {
        if (v.resetAt <= now) buckets.delete(k);
      }
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterMs: 0 };
  }

  if (existing.count >= limit) {
    return { ok: false, remaining: 0, retryAfterMs: existing.resetAt - now };
  }

  existing.count += 1;
  return { ok: true, remaining: limit - existing.count, retryAfterMs: 0 };
}
