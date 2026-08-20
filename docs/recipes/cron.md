# Scheduled work

Cron Triggers invoke your Worker on a schedule. They call a `scheduled()` export
— a different entry point from `fetch()`, so React Router is not involved.

## 1. Declare the schedule

```jsonc
// wrangler.jsonc
{
  "triggers": {
    "crons": ["0 3 * * *"]   // 03:00 UTC daily
  }
}
```

## 2. Add the handler

`server.ts` currently exports only `fetch`. Add `scheduled` alongside it:

```ts
// server.ts
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

async function purgeExpiredSessions(env: Env) {
  const db = drizzle(env.DB);
  const deleted = await db.delete(session).where(lt(session.expiresAt, new Date()));
  console.log(`[cron] purged ${deleted.meta?.changes ?? 0} expired sessions`);
}
```

Wrap the real work in `ctx.waitUntil()` so the Worker is not killed mid-flight.

## 3. Test it locally

```bash
bun dev
curl "http://localhost:5173/cdn-cgi/handler/scheduled"
```

Wrangler exposes that path in dev to fire the handler on demand.

## Good candidates in this kit

- Purging rows from `rateLimit` whose window has long passed.
- Deleting expired `verification` rows.
- Nightly aggregates so dashboards read one small table instead of scanning.

## When to reach for Queues instead

Cron is for *time*. If the trigger is an *event* (a signup that needs a slow
webhook, an upload that needs processing), use a Queue: it retries, batches, and
keeps the request path fast.
