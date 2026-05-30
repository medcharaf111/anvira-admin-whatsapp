// ----------------------------------------------------------------------------
// PLATFORM_ADMIN_PLAN.md §4 "Rate limiting" — Upstash sliding-window
// helper for the /api/platform-admin/* surface.
//
// Spec quote:
//   "Per-actor Upstash sliding-window:
//      pa:read:{uid}        60/min,
//      pa:write:{uid}       10/min,
//      pa:write:burst:{uid} 3/10s.
//    Exceeding write limit → 429 + audit-row ratelimit.tripped."
//
// Phase 1 ships the import surface ONLY — no /api/platform-admin/*
// endpoints exist yet, so this helper has no callers. The in-memory
// fallback gives Phase 2 a single drop-in: replace `_mem` with an
// Upstash @upstash/ratelimit client once endpoints land. The
// SlidingWindow class shape is intentionally aligned with
// @upstash/ratelimit's API so the migration is one constructor swap.
// ----------------------------------------------------------------------------

export interface RateLimitBucket {
  /** Bucket name template, e.g. 'pa:write:{uid}'. */
  name: string;
  /** Number of requests allowed per window. */
  limit: number;
  /** Window in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Requests remaining before the limit trips. */
  remaining: number;
  /** Unix-ms timestamp when the oldest tracked request falls out of the window. */
  resetAt: number;
  /** Bucket name (for log + audit-row 'ratelimit.tripped' shape). */
  bucket: string;
}

/** Canonical bucket definitions per §4. */
export const PA_RATE_LIMITS = {
  read: { name: 'pa:read', limit: 60, windowMs: 60_000 } as RateLimitBucket,
  write: { name: 'pa:write', limit: 10, windowMs: 60_000 } as RateLimitBucket,
  writeBurst: {
    name: 'pa:write:burst',
    limit: 3,
    windowMs: 10_000,
  } as RateLimitBucket,
} as const;

// In-memory sliding window. Map: `${bucket.name}:${actorId}` → timestamps[].
const _mem = new Map<string, number[]>();

function bucketKey(bucket: RateLimitBucket, actorId: string): string {
  return `${bucket.name}:${actorId}`;
}

/**
 * Sliding-window rate-limit check. Atomic in-process (Map operations
 * are synchronous); Phase 2 swap to Upstash retains atomicity via
 * Redis Lua scripts.
 *
 * Returns `allowed: false` when the limit is exceeded. The caller is
 * responsible for emitting the 429 response and (for write buckets)
 * the platform_admin_audit `ratelimit.tripped` row.
 */
export async function checkRateLimit(
  bucket: RateLimitBucket,
  actorId: string
): Promise<RateLimitResult> {
  const now = Date.now();
  const k = bucketKey(bucket, actorId);
  const windowStart = now - bucket.windowMs;
  const stored = _mem.get(k) ?? [];
  // Drop everything outside the window.
  const kept = stored.filter((t) => t > windowStart);
  if (kept.length >= bucket.limit) {
    // Compute reset relative to the oldest still-in-window request.
    const resetAt = kept[0] + bucket.windowMs;
    _mem.set(k, kept);
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      bucket: bucket.name,
    };
  }
  kept.push(now);
  _mem.set(k, kept);
  return {
    allowed: true,
    remaining: bucket.limit - kept.length,
    resetAt: now + bucket.windowMs,
    bucket: bucket.name,
  };
}

/**
 * Test-only — clear the in-memory store. Will be unused once Upstash
 * lands. Exposed so Phase 2 tests can reset between cases.
 */
export function __resetRateLimitStoreForTests(): void {
  _mem.clear();
}
