# Adding a second app

The repo is a bun-workspaces monorepo: every deployable Worker is a folder under
`apps/`, and every app that touches the database imports its tables from
`@repo/db` (`packages/db`). The kit ships only `apps/web`. The two apps it is
laid out for are:

- **`apps/admin`** — an internal console on its own hostname, guarded by
  Cloudflare Access so it carries no auth code.
- **`apps/jobs`** — a plain Worker for cron triggers and queue consumers.

Create them when you need them, not before.

## Rules for every app

1. **Folder = workspace.** `apps/<name>/` with its own `package.json`
   (`"name": "@repo/<name>"`, `"private": true`) and `wrangler.jsonc`. The
   root `"workspaces": ["apps/*", "packages/*"]` glob picks it up; run
   `bun install` once from the root and nothing else needs registering.
2. **Same D1, same migrations.** An app that binds the database copies
   `apps/web`'s `d1_databases` entry exactly — same `binding`,
   `database_name`, `database_id` — with
   `"migrations_dir": "../../packages/db/drizzle"`.
3. **Never generate migrations from an app.** Schema edits happen in
   `packages/db/src/schema.ts` and `bun run db:generate` writes them to
   `packages/db/drizzle/`. Two generators on one database fork the migration
   history, and the second one's SQL will try to recreate tables that exist.
4. **Applying migrations stays where it is.** `bun run db:migrate:local` /
   `db:migrate:remote` run through `apps/web`. The shared `migrations_dir`
   means any app *could* apply them; pick one so there is a single owner.
5. **Commands run from the root.** For one app:
   `bun run --cwd apps/<name> <script>` or `bun --filter @repo/<name> <script>`.

## A. `apps/admin` — a separate Worker behind Cloudflare Access

A second React Router Worker on the same D1, served from its own hostname
(`admin.example.com`). Cloudflare Access sits in front of that hostname and
only lets listed people through, so the Worker never sees an anonymous request
and needs no login page, session table or rate limiter of its own.

### 1. Scaffold

Start from `apps/web`'s build setup and leave the auth out: copy
`react-router.config.ts`, `vite.config.ts`, `tsconfig.json`, `server.ts`,
`app/root.tsx`, `app/app.css` and the `app/components/ui/` primitives you need.
Skip `app/lib/auth*`, `app/lib/middleware.ts`, the auth routes and
`better-auth`.

```json
// apps/admin/package.json
{
  "name": "@repo/admin",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "react-router dev",
    "build": "react-router build",
    "deploy": "wrangler deploy",
    "typecheck": "react-router typegen && tsc",
    "cf-typegen": "wrangler types"
  },
  "dependencies": {
    "@repo/db": "workspace:*",
    "drizzle-orm": "^0.45.2",
    "isbot": "^5.2.1",
    "react": "^19.2.8",
    "react-dom": "^19.2.8",
    "react-router": "^8.3.0"
  },
  "devDependencies": {
    "@cloudflare/vite-plugin": "^1.53.0",
    "@react-router/dev": "^8.3.0",
    "@tailwindcss/vite": "^4.3.3",
    "@types/react": "^19.2.18",
    "@types/react-dom": "^19.2.4",
    "tailwindcss": "^4.3.3",
    "typescript": "^5.9.3",
    "vite": "^8.2.1",
    "wrangler": "^4.124.0"
  }
}
```

Keep the versions in step with `apps/web/package.json`; two copies of React
Router in one lockfile is a slow way to find a bug.

```jsonc
// apps/admin/wrangler.jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "oh-my-vibecode-admin",
  "compatibility_date": "2026-08-15",
  "compatibility_flags": ["nodejs_compat"],
  "main": "server.ts",
  // Access only guards the hostname below. Turn off the *.workers.dev and
  // preview URLs, or they serve the same Worker with no Access in front.
  "workers_dev": false,
  "preview_urls": false,
  "routes": [{ "pattern": "admin.example.com", "custom_domain": true }],
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "oh-my-vibecode-db",
      "database_id": "placeholder-run-setup",
      "migrations_dir": "../../packages/db/drizzle"
    }
  ],
  "observability": {
    "enabled": true
  }
}
```

Use a different dev port from `apps/web` (`server: { port: 5174 }` in
`apps/admin/vite.config.ts`) so both run at once.

### 2. Read the shared tables

Loaders look exactly like `apps/web`'s, minus the session:

```tsx
// apps/admin/app/routes/users.tsx
import { drizzle } from "drizzle-orm/d1";
import { desc } from "drizzle-orm";
import { user } from "@repo/db";
import { cloudflareContext } from "../lib/app-context";
import type { Route } from "./+types/users";

export async function loader({ context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext)!;
  const users = drizzle(env.DB)
    .select({ id: user.id, email: user.email, createdAt: user.createdAt })
    .from(user)
    .orderBy(desc(user.createdAt))
    .limit(100)
    .then((rows) => rows);

  return { users };
}
```

Writes to Better Auth's tables (`user`, `session`, `account`) from the admin
app bypass Better Auth's hooks. Deleting a `session` row to sign someone out is
fine; creating users or changing passwords belongs in `apps/web` through
`auth.api`.

### 3. Put Cloudflare Access in front

1. Zero Trust dashboard → **Access → Applications → Add an application →
   Self-hosted**.
2. Application domain: `admin.example.com`.
3. Policy: **Allow**, include the emails (or the email domain, or an identity
   provider group) of the people who run the console.
4. Deploy the Worker (`bun run --cwd apps/admin deploy`) and open the hostname:
   Access shows its own login before the request reaches your code.

Access adds a signed `Cf-Access-Jwt-Assertion` header to every request it lets
through. For defence in depth, verify it in `apps/admin/server.ts` against your
team's keys at `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs` and
return 403 when it is missing or invalid — that closes the hole if someone
later re-enables `workers_dev`.

### Why not Better Auth with a role check?

It works: add a `role` column (Better Auth's admin plugin, or your own field),
build `buildAuth(env)` in the admin app with the same `BETTER_AUTH_SECRET`, and
gate every loader with a role check. It is heavier on every axis — a schema
migration, a second auth instance and its env, cookie sharing or a second login
UI across hostnames, rate limiting on that login, and an admin role that is one
bug away from being grantable through the public app. For a console a handful
of people use, Access is less code and a smaller attack surface. Reach for the
role check when customers, not staff, need admin rights.

## B. `apps/jobs` — cron and queues

A plain Worker: no React Router, no Vite, no UI. One entry file exporting
`scheduled()` (and, optionally, `queue()`).

```json
// apps/jobs/package.json
{
  "name": "@repo/jobs",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev --test-scheduled",
    "deploy": "wrangler deploy",
    "typecheck": "wrangler types && tsc",
    "cf-typegen": "wrangler types"
  },
  "dependencies": {
    "@repo/db": "workspace:*",
    "drizzle-orm": "^0.45.2"
  },
  "devDependencies": {
    "typescript": "^5.9.3",
    "wrangler": "^4.124.0"
  }
}
```

```json
// apps/jobs/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": []
  },
  "include": ["src/**/*.ts", "worker-configuration.d.ts"]
}
```

```jsonc
// apps/jobs/wrangler.jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "oh-my-vibecode-jobs",
  "main": "src/index.ts",
  "compatibility_date": "2026-08-15",
  "compatibility_flags": ["nodejs_compat"],
  // Nothing to serve over HTTP.
  "workers_dev": false,
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "oh-my-vibecode-db",
      "database_id": "placeholder-run-setup",
      "migrations_dir": "../../packages/db/drizzle"
    }
  ],
  "triggers": {
    "crons": ["0 3 * * *", "*/15 * * * *"]
  },
  // Optional: consume a queue the web app produces to.
  "queues": {
    "consumers": [{ "queue": "oh-my-vibecode-events", "max_batch_size": 10 }]
  },
  "observability": {
    "enabled": true
  }
}
```

```ts
// apps/jobs/src/index.ts
import { drizzle } from "drizzle-orm/d1";
import { lt } from "drizzle-orm";
import { rateLimit, session } from "@repo/db";

export default {
  async scheduled(controller, env, ctx) {
    switch (controller.cron) {
      case "0 3 * * *":
        ctx.waitUntil(purgeExpiredSessions(env));
        break;
      case "*/15 * * * *":
        ctx.waitUntil(purgeStaleRateLimits(env));
        break;
    }
  },

  async queue(batch, env) {
    for (const message of batch.messages) {
      try {
        console.log("[jobs] event:", message.body);
        message.ack();
      } catch (error) {
        console.error("[jobs] event failed, retrying:", error);
        message.retry();
      }
    }
  },
} satisfies ExportedHandler<Env>;

async function purgeExpiredSessions(env: Env) {
  const deleted = await drizzle(env.DB)
    .delete(session)
    .where(lt(session.expiresAt, new Date()));
  console.log(`[jobs] purged ${deleted.meta?.changes ?? 0} expired sessions`);
}

async function purgeStaleRateLimits(env: Env) {
  // lastRequest is epoch milliseconds; a day is far past any limiter window.
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  await drizzle(env.DB).delete(rateLimit).where(lt(rateLimit.lastRequest, cutoff));
}
```

Then, from the root:

```bash
bun install                               # registers @repo/jobs
bun run --cwd apps/jobs cf-typegen        # writes apps/jobs/worker-configuration.d.ts
bun run --cwd apps/jobs dev               # wrangler dev --test-scheduled
curl "http://localhost:8787/__scheduled?cron=0+3+*+*+*"
```

Drop the `queues` block and the `queue()` handler if you only need cron. To
produce messages from `apps/web`, add a `queues.producers` binding to
`apps/web/wrangler.jsonc` and call `env.EVENTS.send(…)` from an action —
keeping the slow work off the request path. See [cron.md](./cron.md) for what
belongs on a schedule.

## C. CI

`.github/workflows/ci.yml` checks and deploys `apps/web` only. Each new app
adds one step to `check` and one deploy job.

In the `check` job, after `bun run check`:

```yaml
      - name: Typecheck apps/jobs
        run: bun run --cwd apps/jobs typecheck
```

(`apps/admin` gets `typecheck` and `build` the same way.) The migrations gate
already covers every app — there is only one migrations dir.

A deploy job per app, mirroring the existing `deploy` job. Each app's
`wrangler.jsonc` has the same placeholder `database_id`, so each needs its own
config secret:

```yaml
  deploy-jobs:
    needs: check
    if: github.ref == 'refs/heads/main' && github.event_name != 'pull_request'
    name: deploy jobs
    runs-on: ubuntu-latest
    timeout-minutes: 10
    concurrency:
      group: deploy-production-jobs
      cancel-in-progress: false
    steps:
      - uses: actions/checkout@v7

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version-file: package.json

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Restore production Worker configuration
        env:
          WORKER_CONFIG: ${{ secrets.CLOUDFLARE_WRANGLER_CONFIG_JOBS }}
        run: |
          test -n "$WORKER_CONFIG"
          printf '%s\n' "$WORKER_CONFIG" > apps/jobs/wrangler.jsonc

      - name: Deploy to Cloudflare Workers
        uses: cloudflare/wrangler-action@v4
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          workingDirectory: apps/jobs
          command: deploy --keep-vars
```

`apps/admin` is a React Router build like `apps/web`: write its secret to
`apps/admin/wrangler.jsonc`, run `bun run --cwd apps/admin build` before the
deploy step, and deploy with `workingDirectory: apps/admin` and
`command: deploy --config build/server/wrangler.json --keep-vars`.

Deploy a schema change to production in this order: `bun run db:migrate:remote`
first, then the apps. Every app reads the same tables, so a Worker that ships
before its migration fails on the first query.
