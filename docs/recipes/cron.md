# Scheduled work

Cron Triggers invoke a Worker on a schedule. They call a `scheduled()` export
— a different entry point from `fetch()`, so React Router is not involved.

There are two places that handler can live:

| | Where | When |
|---|---|---|
| **Recommended** | a dedicated `apps/jobs` Worker | anything you expect to grow: several schedules, queue consumers, long-running batches |
| Small alternative | `scheduled()` next to `fetch()` in `apps/web/server.ts` | one tiny housekeeping task you never want to deploy separately |

A separate Worker keeps cron failures, CPU limits and deploys out of the web
app's way, and it needs no React Router, Vite or auth code — just the schema
from `@repo/db`.

## Option A: a dedicated `apps/jobs` Worker

The full scaffold (`package.json`, `tsconfig.json`, CI) is in
[new-app.md](./new-app.md#b-appsjobs--cron-and-queues). The two parts that are
specific to cron:

### 1. Declare the schedule

```jsonc
// apps/jobs/wrangler.jsonc
{
  "name": "oh-my-vibecode-jobs",
  "main": "src/index.ts",
  "compatibility_date": "2026-08-15",
  "compatibility_flags": ["nodejs_compat"],
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "oh-my-vibecode-db",
      "database_id": "placeholder-run-setup",
      "migrations_dir": "../../packages/db/drizzle"
    }
  ],
  "triggers": {
    "crons": ["0 3 * * *"]   // 03:00 UTC daily
  }
}
```

### 2. Add the handler

```ts
// apps/jobs/src/index.ts
import { drizzle } from "drizzle-orm/d1";
import { lt } from "drizzle-orm";
import { session } from "@repo/db";

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(purgeExpiredSessions(env));
  },
} satisfies ExportedHandler<Env>;

async function purgeExpiredSessions(env: Env) {
  const db = drizzle(env.DB);
  const deleted = await db.delete(session).where(lt(session.expiresAt, new Date()));
  console.log(`[cron] purged ${deleted.meta?.changes ?? 0} expired sessions`);
}
```

Wrap the real work in `ctx.waitUntil()` so the Worker is not killed mid-flight.
With several schedules, switch on `controller.cron` to pick the job.

### 3. Test it locally

```bash
bun run --cwd apps/jobs dev   # wrangler dev --test-scheduled
curl "http://localhost:8787/__scheduled?cron=0+3+*+*+*"
```

`--test-scheduled` exposes `/__scheduled` so you can fire the handler on demand.
It shares the local D1 state only if it runs against the same persisted state as
`apps/web`; pass `--persist-to ../web/.wrangler/state` when you need the rows
the web app created.

## Option B: `scheduled()` in `apps/web/server.ts`

Add the trigger to `apps/web/wrangler.jsonc`:

```jsonc
// apps/web/wrangler.jsonc
{
  "triggers": {
    "crons": ["0 3 * * *"]
  }
}
```

`apps/web/server.ts` currently exports only `fetch`. Add `scheduled` alongside
it:

```ts
// apps/web/server.ts
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    /* unchanged */
  },

  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    // Bindings work exactly as they do in a loader — but there is no request,
    // so nothing here may use `context.get(...)`.
    ctx.waitUntil(purgeExpiredSessions(env));
  },
};
```

`purgeExpiredSessions` is the same function as in Option A. Fire it in dev
through the Vite plugin:

```bash
bun dev
curl "http://localhost:5173/cdn-cgi/handler/scheduled"
```

Move it to `apps/jobs` the day a second schedule or a queue shows up.

## Good candidates in this kit

- Purging rows from `rateLimit` whose window has long passed.
- Deleting expired `verification` rows.
- Nightly aggregates so dashboards read one small table instead of scanning.

## When to reach for Queues instead

Cron is for *time*. If the trigger is an *event* (a signup that needs a slow
webhook, an upload that needs processing), use a Queue: it retries, batches, and
keeps the request path fast. The consumer belongs in `apps/jobs` too — see
[new-app.md](./new-app.md#b-appsjobs--cron-and-queues).
