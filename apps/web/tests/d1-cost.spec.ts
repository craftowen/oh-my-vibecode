import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { asc, inArray, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { rateLimit, session } from "@repo/db";

const CUTOFF = 1_000;
const ACTIVE_SQL = 'SELECT count(*) AS value FROM "session" WHERE "expiresAt" > ?';
const PURGE_SQL = 'DELETE FROM "session" WHERE id IN (SELECT id FROM "session" WHERE "expiresAt" < ? ORDER BY "expiresAt" LIMIT 2)';
const ACCOUNT_LOOKUP_SQL = 'SELECT id, "userId" FROM "account" WHERE "issuer" = ? AND "accountId" = ?';
const VERIFICATION_PURGE_SQL = 'DELETE FROM "verification" WHERE id IN (SELECT id FROM "verification" WHERE "expiresAt" < ? ORDER BY "expiresAt" LIMIT 500)';

async function seedCostFixtures() {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
       VALUES ('cost-user', 'Cost fixture', 'cost@example.com', 0, 0, 0)`,
    ),
    env.DB.prepare(`DELETE FROM "session" WHERE id LIKE 'cost-session-%'`),
    env.DB.prepare(`DELETE FROM rateLimit WHERE id LIKE 'cost-limit-%' OR id LIKE 'batch-limit-%'`),
    env.DB.prepare(`DELETE FROM "account" WHERE id LIKE 'cost-account-%'`),
    env.DB.prepare(`DELETE FROM "verification" WHERE id LIKE 'cost-verif-%'`),
    env.DB.prepare(`WITH RECURSIVE n(i) AS (
      SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 515
    ) INSERT INTO "session" (id, token, userId, expiresAt, createdAt, updatedAt)
      SELECT 'cost-session-' || i, 'cost-token-' || i, 'cost-user',
        CASE WHEN i <= 512 THEN 100 ELSE 2000 END, 0, 0 FROM n`),
    env.DB.prepare(`WITH RECURSIVE n(i) AS (
      SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 515
    ) INSERT INTO rateLimit (id, key, count, lastRequest)
      SELECT 'cost-limit-' || i, 'cost-key-' || i, 1,
        CASE WHEN i <= 512 THEN 2000 ELSE 100 END FROM n`),
    env.DB.prepare(`WITH RECURSIVE n(i) AS (
      SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 515
    ) INSERT INTO "account" (id, accountId, providerId, issuer, userId, createdAt, updatedAt)
      SELECT 'cost-account-' || i, 'cost-sub-' || i, 'google', 'https://accounts.google.com',
        'cost-user', 0, 0 FROM n`),
    env.DB.prepare(`WITH RECURSIVE n(i) AS (
      SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 515
    ) INSERT INTO "verification" (id, identifier, value, expiresAt)
      SELECT 'cost-verif-' || i, 'verif:' || i, 'tok-' || i,
        CASE WHEN i <= 512 THEN 2000 ELSE 100 END FROM n`),
  ]);
}

beforeEach(async () => {
  await seedCostFixtures();
});

/** Check the migrated access path as well as the actual D1 work below. */
async function expectIndex(sql: string, index: string, binds: unknown[] = [CUTOFF]) {
  const plan = await env.DB.prepare(`EXPLAIN QUERY PLAN ${sql}`).bind(...binds)
    .all<{ detail: string }>();
  expect(plan.results.some((r) => r.detail.includes(index))).toBe(true);
  expect(plan.results.some((r) => r.detail.includes("TEMP B-TREE"))).toBe(false);
}

describe("D1 recurring query row budgets", () => {
  // A fast streamed COUNT still scanned every expired session without this index.
  it("counts only the active range of a large session table", async () => {
    await expectIndex(ACTIVE_SQL, "session_expiresAt_idx");
    const result = await env.DB.prepare(ACTIVE_SQL).bind(CUTOFF).all<{ value: number }>();
    expect(result.results).toEqual([{ value: 3 }]);
    expect(result.meta.rows_read).toBeLessThanOrEqual(5);
    expect(result.meta.rows_written).toBe(0);

    const empty = await env.DB.prepare(ACTIVE_SQL).bind(3_000).all<{ value: number }>();
    expect(empty.results).toEqual([{ value: 0 }]);
    expect(empty.meta.rows_read).toBeLessThanOrEqual(2);
  });

  it("bounds session cleanup and does no work when nothing has expired", async () => {
    await expectIndex(PURGE_SQL, "session_expiresAt_idx");
    const empty = await env.DB.prepare(PURGE_SQL).bind(0).run();
    expect(empty.meta.changes).toBe(0);
    expect(empty.meta.rows_read).toBeLessThanOrEqual(3);
    expect(empty.meta.rows_written).toBe(0);

    const batch = await env.DB.prepare(PURGE_SQL).bind(CUTOFF).run();
    expect(batch.meta.changes).toBe(2);
    expect(batch.meta.rows_read).toBeLessThanOrEqual(12);
    const active = await env.DB.prepare(ACTIVE_SQL).bind(CUTOFF).first<{ value: number }>();
    expect(active?.value).toBe(3);
  });

  it("finds stale counters without scanning every current rate-limit bucket", async () => {
    const sql = "DELETE FROM rateLimit WHERE id IN (SELECT id FROM rateLimit WHERE lastRequest < ? ORDER BY lastRequest LIMIT 500)";
    await expectIndex(sql, "rateLimit_lastRequest_idx");
    const removed = await env.DB.prepare(sql).bind(CUTOFF).run();
    expect(removed.meta.changes).toBe(3);
    expect(removed.meta.rows_read).toBeLessThanOrEqual(16);
    const empty = await env.DB.prepare(sql).bind(CUTOFF).run();
    expect(empty.meta.changes).toBe(0);
    expect(empty.meta.rows_read).toBeLessThanOrEqual(3);
    expect(empty.meta.rows_written).toBe(0);
  });

  it("keeps the existing rate-limit key lookup bounded for hits and misses", async () => {
    const sql = "SELECT count FROM rateLimit WHERE key = ?";
    for (const [key, expected] of [["cost-key-1", [{ count: 1 }]], ["missing-key", []]] as const) {
      const result = await env.DB.prepare(sql).bind(key).all();
      expect(result.results).toEqual(expected);
      expect(result.meta.rows_read).toBeLessThanOrEqual(3);
    }
  });

  // Negative control: these row budgets really detect the missing migration.
  it("exposes full-table reads when either range index is removed", async () => {
    for (const [index, sql] of [
      ["session_expiresAt_idx", ACTIVE_SQL],
      ["rateLimit_lastRequest_idx", "SELECT count(*) AS value FROM rateLimit WHERE lastRequest < ?"],
      ["verification_expiresAt_idx", 'SELECT count(*) AS value FROM "verification" WHERE "expiresAt" < ?'],
    ]) {
      const definition = await env.DB.prepare("SELECT sql FROM sqlite_schema WHERE name = ?")
        .bind(index).first<{ sql: string }>();
      if (!definition?.sql) throw new Error(`Missing migrated index: ${index}`);
      await env.DB.prepare(`DROP INDEX ${index}`).run();
      try {
        const result = await env.DB.prepare(sql).bind(CUTOFF).all();
        expect(result.meta.rows_read).toBeGreaterThan(500);
      } finally {
        await env.DB.prepare(definition.sql).run();
      }
    }
  });

  it("keeps OAuth account lookup bounded on hits and misses via account_issuer_accountId_idx", async () => {
    await expectIndex(ACCOUNT_LOOKUP_SQL, "account_issuer_accountId_idx", [
      "https://accounts.google.com",
      "cost-sub-1",
    ]);
    const hit = await env.DB.prepare(ACCOUNT_LOOKUP_SQL)
      .bind("https://accounts.google.com", "cost-sub-1")
      .all<{ id: string; userId: string }>();
    expect(hit.results).toEqual([{ id: "cost-account-1", userId: "cost-user" }]);
    expect(hit.meta.rows_read).toBeLessThanOrEqual(3);
    expect(hit.meta.rows_written).toBe(0);

    const miss = await env.DB.prepare(ACCOUNT_LOOKUP_SQL)
      .bind("https://accounts.google.com", "missing-sub")
      .all();
    expect(miss.results).toEqual([]);
    expect(miss.meta.rows_read).toBeLessThanOrEqual(3);
    expect(miss.meta.rows_written).toBe(0);
  });

  it("bounds verification cleanup and does no work when nothing has expired", async () => {
    await expectIndex(VERIFICATION_PURGE_SQL, "verification_expiresAt_idx");
    const empty = await env.DB.prepare(VERIFICATION_PURGE_SQL).bind(0).run();
    expect(empty.meta.changes).toBe(0);
    expect(empty.meta.rows_read).toBeLessThanOrEqual(3);
    expect(empty.meta.rows_written).toBe(0);

    const removed = await env.DB.prepare(VERIFICATION_PURGE_SQL).bind(CUTOFF).run();
    expect(removed.meta.changes).toBe(3);
    expect(removed.meta.rows_read).toBeLessThanOrEqual(20);
    expect(removed.meta.rows_written).toBeLessThanOrEqual(12);
  });

  it("bounds full cleanup batches using the recipes' generated Drizzle SQL", async () => {
    const db = drizzle(env.DB);
    const expired = db.select({ id: session.id }).from(session)
      .where(lt(session.expiresAt, new Date(CUTOFF * 1_000)))
      .orderBy(asc(session.expiresAt)).limit(500);
    const purge = db.delete(session).where(inArray(session.id, expired)).toSQL();
    // Auth timestamp columns encode Date as seconds, unlike limiter timestamps.
    expect(purge.params).toEqual([CUTOFF, 500]);
    const deleted = await env.DB.prepare(purge.sql).bind(...purge.params).run();
    expect(deleted.meta.changes).toBe(500);
    // Deletion also reads index entries for maintenance, not just candidates.
    expect(deleted.meta.rows_read).toBeLessThanOrEqual(2_500);
    expect(deleted.meta.rows_written).toBeGreaterThanOrEqual(500);
    expect(deleted.meta.rows_written).toBeLessThanOrEqual(3_000);
    const active = await env.DB.prepare(ACTIVE_SQL).bind(CUTOFF).first<{ value: number }>();
    expect(active?.value).toBe(3);

    // Keep this test independent when run alone with vitest -t.
    await env.DB.prepare("DELETE FROM rateLimit WHERE lastRequest < ?").bind(CUTOFF).run();
    await env.DB.prepare(`WITH RECURSIVE n(i) AS (
      SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 503
    ) INSERT INTO rateLimit (id, key, count, lastRequest)
      SELECT 'batch-limit-' || i, 'batch-key-' || i, 1, 100 FROM n`).run();
    const stale = db.select({ id: rateLimit.id }).from(rateLimit)
      .where(lt(rateLimit.lastRequest, CUTOFF))
      .orderBy(asc(rateLimit.lastRequest)).limit(500);
    const cleanup = db.delete(rateLimit).where(inArray(rateLimit.id, stale)).toSQL();
    expect(cleanup.params).toEqual([CUTOFF, 500]);
    const removed = await env.DB.prepare(cleanup.sql).bind(...cleanup.params).run();
    expect(removed.meta.changes).toBe(500);
    expect(removed.meta.rows_read).toBeLessThanOrEqual(2_500);
    expect(removed.meta.rows_written).toBeGreaterThanOrEqual(500);
    expect(removed.meta.rows_written).toBeLessThanOrEqual(2_500);
    const left = await env.DB.prepare("SELECT count(*) AS n FROM rateLimit WHERE lastRequest < ?")
      .bind(CUTOFF).first<{ n: number }>();
    expect(left?.n).toBe(3);
  });
});
