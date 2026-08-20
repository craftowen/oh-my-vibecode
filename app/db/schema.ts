import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Better Auth's own tables. Generated — never edit auth-schema.ts by hand. */
export * from "./auth-schema";

/**
 * Rate-limit counters.
 *
 * The shape matches what Better Auth expects from `rateLimit.storage: "database"`,
 * so the same table backs both its own /api/auth/* limiter and the limiter this
 * kit applies to its login/signup actions (`app/lib/rate-limit.server.ts`).
 * Workers isolates are short-lived and not shared, so in-memory counting would
 * reset constantly — this has to live in D1.
 */
export const rateLimit = sqliteTable("rateLimit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: integer("lastRequest").notNull(),
});
