import { NextResponse } from "next/server";

type Window = {
  count: number;
  resetAt: number; // ms epoch
};

// Module-level state: persists for the lifetime of the Node process.
// Suitable for single-container deployments (which is our spec).
// If we ever scale to multiple replicas, swap this for a shared store
// (Postgres or Redis) — keep the same `rateLimit()` signature.
const buckets = new Map<string, Window>();

const CLEANUP_INTERVAL_MS = 60_000;
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, win] of buckets) {
    if (win.resetAt <= now) buckets.delete(key);
  }
}, CLEANUP_INTERVAL_MS);
cleanupTimer.unref?.();

export type RateLimitOptions = {
  max: number;
  windowMs: number;
};

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0];
    if (first) return first.trim();
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

/**
 * Fixed-window in-memory rate limiter, keyed by `${scope}:${identifier}`.
 *
 * Returns a 429 NextResponse if the bucket is over the limit, or null to let
 * the caller proceed. Sets standard rate-limit headers on the 429 response.
 */
export function rateLimit(
  req: Request,
  scope: string,
  opts: RateLimitOptions,
  identifier?: string,
): NextResponse | null {
  const id = identifier ?? getClientIp(req);
  const key = `${scope}:${id}`;
  const now = Date.now();

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return null;
  }

  if (existing.count >= opts.max) {
    const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(opts.max),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(existing.resetAt / 1000)),
        },
      },
    );
  }

  existing.count++;
  return null;
}
