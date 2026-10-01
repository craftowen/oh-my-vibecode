import { beforeAll } from "vitest";
import { applyD1Migrations, env } from "cloudflare:test";

/**
 * Every committed migration, discovered automatically and applied in filename
 * order. Adding a migration needs no change here — `bun run db:generate` and
 * the tests stay in sync on their own.
 */
const modules = import.meta.glob("../drizzle/*.sql", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

const MIGRATIONS = Object.entries(modules)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, sql]) => ({
    name: path.split("/").pop()!,
    queries: sql
      .split("--> statement-breakpoint")
      .map((query) => query.trim())
      .filter(Boolean),
  }));

// Registered as a vitest setup file, so this runs before every spec file —
// no spec can forget it, and no describe can lean on another having run first.
// applyD1Migrations is idempotent, so the per-file repeat is safe.
beforeAll(() => applyD1Migrations(env.DB, MIGRATIONS));
