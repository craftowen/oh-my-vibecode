import { drizzle } from "drizzle-orm/d1";
import { sql } from "drizzle-orm";
import { rateLimit } from "../db/schema";

/**
 * Fixed-window rate limiting backed by D1.
 *
 * Why this exists alongside Better Auth's own limiter: this kit signs users in
 * from route actions that call `auth.api.*` directly, which never touches
 * Better Auth's HTTP handler — and therefore never touches its rate limiter.
 * Without this, `/login` would be an unlimited password-guessing endpoint.
 *
 * The counters live in the same `rateLimit` table Better Auth uses, so there is
 * one place to inspect and one migration to run.
 *
 * A single upsert consumes each attempt atomically, including the first request
 * and a window reset. Concurrent requests cannot overwrite each other's count.
 */
export interface RateLimitRule {
  /** Window length in seconds. */
  window: number;
  /** Requests allowed per window. */
  max: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window resets. Only meaningful when `allowed` is false. */
  retryAfter: number;
}

/** Best-effort client address. Cloudflare sets CF-Connecting-IP at the edge. */
export function clientIp(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export async function consumeRateLimit(
  env: Env,
  key: string,
  rule: RateLimitRule,
): Promise<RateLimitResult> {
  const db = drizzle(env.DB);
  const now = Date.now();
  const windowMs = rule.window * 1000;

  try {
    const expired = sql`${rateLimit.lastRequest} <= ${now - windowMs}`;
    const [counter] = await db
      .insert(rateLimit)
      .values({ id: crypto.randomUUID(), key, count: 1, lastRequest: now })
      .onConflictDoUpdate({
        target: rateLimit.key,
        set: {
          count: sql`CASE WHEN ${expired} THEN 1 ELSE min(${rateLimit.count} + 1, ${rule.max + 1}) END`,
          lastRequest: sql`CASE WHEN ${expired} THEN ${now} ELSE ${rateLimit.lastRequest} END`,
        },
      })
      .returning({ count: rateLimit.count, lastRequest: rateLimit.lastRequest });

    const allowed = counter.count <= rule.max;
    return {
      allowed,
      retryAfter: allowed
        ? 0
        : Math.max(1, Math.ceil((counter.lastRequest + windowMs - now) / 1000)),
    };
  } catch (error) {
    // Never lock people out of signing in because the counter table misbehaved.
    console.error("[rate-limit] check failed, allowing request:", error);
    return { allowed: true, retryAfter: 0 };
  }
}

/**
 * Convenience wrapper for auth actions: limits per route + client IP and
 * returns a ready-made message when the caller should stop.
 */
export async function limitAuthAttempt(
  env: Env,
  request: Request,
  route: string,
  rule: RateLimitRule,
): Promise<{ blocked: false } | { blocked: true; message: string }> {
  const result = await consumeRateLimit(env, `${route}:${clientIp(request)}`, rule);
  if (result.allowed) return { blocked: false };
  return {
    blocked: true,
    message: `Too many attempts. Try again in ${result.retryAfter} seconds.`,
  };
}
