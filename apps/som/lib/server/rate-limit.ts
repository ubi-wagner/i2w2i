// In-memory fixed-window limiter. Good enough for a single Railway container;
// move to Postgres if we ever run more than one replica.
const hits = new Map<string, { count: number; resetAt: number }>();

function entry(key: string, windowMs: number) {
  const now = Date.now();
  let e = hits.get(key);
  if (!e || e.resetAt <= now) {
    e = { count: 0, resetAt: now + windowMs };
    hits.set(key, e);
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }
  return e;
}

/** Counts this call and says whether it's within the limit (for things every call should count). */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const e = entry(key, windowMs);
  e.count += 1;
  return e.count <= limit;
}

/**
 * For guessing protection (passwords, codes): only failures count, so a
 * venue full of guests on one Wi-Fi, or someone signing in often, is never
 * blocked by their own successes.
 */
export function tooManyFailures(key: string, limit: number, windowMs: number): boolean {
  return entry(key, windowMs).count >= limit;
}

export function recordFailure(key: string, windowMs: number): void {
  entry(key, windowMs).count += 1;
}
