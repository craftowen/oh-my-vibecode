# AGENTS.md — oh-my-vibecode

Instructions for AI agents (and humans) working in this repo. Read this file first; you should not need to explore the codebase to add a feature.

Stack: React Router 8 (framework mode, SSR) on Cloudflare Workers · D1 + Drizzle ORM · Better Auth · Tailwind v4 · Vitest (workers pool) · bun.

## Commands

```bash
bun run setup             # one-time local provisioning: .dev.vars + local D1 migrations (no Cloudflare account needed)
bun dev                   # dev server at localhost:5173
bun run check             # typecheck && build && test — MUST pass before you claim any task is done
bun run typecheck         # react-router typegen && tsc
bun run test              # vitest run (runs in real Workers runtime; requires prior build)
bun run db:generate       # drizzle-kit generate (after editing app/db/schema.ts)
bun run db:migrate:local  # apply migrations to local D1
bun run deploy            # wrangler deploy (requires wrangler login; prod migrations via db:migrate:remote first)
```

## Structure

```
server.ts                 # Worker entry: request handler + RouterContextProvider(env, ctx)
app/routes.ts             # explicit route table — every new route is registered here
app/routes/               # _index, login, signup, api.auth.$, _app (protected layout), _app.dashboard, _app.settings
app/lib/app-context.ts    # cloudflareContext — read env/ctx in loaders: context.get(cloudflareContext)!.env
app/lib/auth.server.ts    # buildAuth(env) — lazy per-env Better Auth instance
app/lib/middleware.ts     # authMiddleware (RR8 middleware) + sessionContext
app/db/schema.ts          # app tables (Drizzle). auth-schema.ts is Better Auth's — never edit by hand
drizzle/                  # generated SQL migrations (committed)
tests/                    # vitest-pool-workers specs
```

## Core patterns (follow these exactly)

1. **Cloudflare bindings**: only available per-request. In loaders/actions: `const { env } = context.get(cloudflareContext)!;`. Never touch bindings at module scope.
2. **Auth**: `buildAuth(env)` (lazy, cached per env). Client side uses `authClient` from `app/lib/auth.client.ts`. Auth HTTP endpoints live under `/api/auth/*` — do not add your own login/logout endpoints.
3. **Protected routes**: place them under the `_app` layout. `authMiddleware` (RR8 middleware, runs once before all loaders in the subtree) redirects anonymous users to /login and stores the session; read it with `context.get(sessionContext)!` — never call `getSession` again in loaders under `_app`.
4. **DB changes**: edit `app/db/schema.ts` → `bun run db:generate` → `bun run db:migrate:local` → commit generated files in `drizzle/`. Never write raw SQL migrations by hand.

## Recipe: add a CRUD feature (e.g. "notes")

1. `app/db/schema.ts`: add the Drizzle table (include `userId` referencing `user.id` if per-user).
2. `bun run db:generate && bun run db:migrate:local`.
3. `app/routes/_app.notes.tsx`: loader (read via `drizzle(env.DB)`), action (create/delete), component. Session from `context.get(sessionContext)!`.
4. Register in `app/routes.ts` under the `_app` layout.
5. `tests/notes.spec.ts`: follow `tests/auth.spec.ts` structure.
6. `bun run check` — done only when green.

## Performance rules (non-negotiable defaults)

Pages must render fast. Every new page follows these:

1. **Stream slow data — never block the shell.** In loaders, `await` only what the shell needs (session comes free from `sessionContext`). Return slow queries as un-awaited promises and render them with `<Suspense fallback={<Skeleton/>}>` + React 19 `use(promise)`. Reference implementation: `app/routes/_app.dashboard.tsx`.
2. **Prefetch on intent.** Every internal `<Link>` gets `prefetch="intent"` (loads code+data on hover/focus) unless it points to an auth-mutating URL.
3. **Don't re-fetch what middleware resolved.** Session reads are `context.get(sessionContext)!` — an extra `getSession` call per loader is a wasted DB roundtrip.
4. **Keep the client bundle lean.** No new client-side data libraries; loaders + fetchers are the data layer. Heavy, below-the-fold components load via `React.lazy`.
5. **Parallelize queries.** Multiple independent queries in one loader start together (create promises first, then await what's needed) — never sequential awaits.

## Constraints

- No new runtime dependencies without explicit user approval (current allowlist: react-router, better-auth, drizzle-orm, tailwind v4, lucide-react).
- Never edit `app/db/auth-schema.ts`, `worker-configuration.d.ts` (generated via `cf-typegen`), or files in `drizzle/meta/`.
- Never commit `.dev.vars` / secrets. `wrangler.jsonc` database_id is a placeholder replaced by setup/deploy.
- No git commit/push unless the user explicitly asks.
- `vite.config.ts` uses `cloudflare({ viteEnvironment: { name: "ssr" } })` — do not change this (avoids the double-SSR-build trap).
