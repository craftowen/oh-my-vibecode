import { drizzle } from "drizzle-orm/d1";
import { sql } from "drizzle-orm";
import { rateLimit } from "@repo/db";

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

/**
 * Best-effort client address from Cloudflare's edge header (`CF-Connecting-IP`).
 *
 * We intentionally ignore `X-Forwarded-For` because clients can forge it.
 * Ports, bracket notation, and zone IDs are stripped; IPv4-mapped IPv6
 * addresses (`::ffff:192.0.2.1` and `::ffff:c000:0201`) normalize to IPv4, and
 * real IPv6 addresses are cut to their `/64` prefix so rotating within a single
 * allocation cannot bypass rate limits.
 */
export function clientIp(request: Request): string {
  const raw = request.headers.get("CF-Connecting-IP")?.trim();
  if (!raw) return "unknown";

  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(raw);
  let ip = bracketed ? bracketed[1] : raw;
  const zoneIdx = ip.indexOf("%");
  if (zoneIdx !== -1) ip = ip.slice(0, zoneIdx);
  if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(ip)) {
    ip = ip.slice(0, ip.lastIndexOf(":"));
  }

  if (!ip.includes(":")) return ip;
  // IPv4-mapped (::ffff:192.0.2.1) is one IPv4 client, not a /64.
  if (ip.includes(".")) return ip.slice(ip.lastIndexOf(":") + 1);

  const [head, tail = ""] = ip.toLowerCase().split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = ip.includes("::")
    ? [
        ...left,
        ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"),
        ...right,
      ]
    : left;
  const normalized = groups
    .slice(0, 8)
    .map((group) => group.replace(/^0+(?=.)/, "") || "0");

  // URL/network stacks may encode IPv4-mapped IPv6 as ::ffff:c000:0201.
  if (
    normalized.length === 8 &&
    normalized[0] === "0" &&
    normalized[1] === "0" &&
    normalized[2] === "0" &&
    normalized[3] === "0" &&
    normalized[4] === "0" &&
    normalized[5] === "ffff"
  ) {
    const hi = Number.parseInt(normalized[6], 16);
    const lo = Number.parseInt(normalized[7], 16);
    if (!Number.isNaN(hi) && !Number.isNaN(lo)) {
      return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    }
  }

  return `${normalized.slice(0, 4).join(":")}::/64`;
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
