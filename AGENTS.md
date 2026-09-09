# AGENTS.md — oh-my-vibecode

Instructions for AI agents (and humans) working in this repo. Read this file first; you should not need to explore the codebase to add a feature.

This is the **only** instruction file. `CLAUDE.md` is a one-line `@AGENTS.md` import so Claude Code, Codex, Cursor and humans all read the same text — edit here, never there. Style rules (formatting, naming, imports, comments, tests, git) live in [docs/CONVENTIONS.md](./docs/CONVENTIONS.md); the summary below is the part you must not skip.

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
app/routes/               # home, login, signup, forgot-password, reset-password, verify-email,
                          #   logout, api.auth, api.theme, layout (protected shell), dashboard, settings
                          #   flat names; routing lives ONLY in app/routes.ts
app/components/ui/        # design-system primitives: button, input, label, card, badge, alert, skeleton
app/components/field.tsx  # Label + Input + inline error, already wired for screen readers
app/components/auth-shell.tsx # shared frame for signed-out pages
app/components/toast.tsx  # ToastProvider / useToast / useToastOnChange (aria-live, no dependency)
app/components/empty-state.tsx # what a list looks like when it is empty
app/components/local-time.tsx # hydration-safe timestamp rendering
app/app.css               # Tailwind v4 entry + design tokens (shadcn variable names) + dark mode
app/lib/app-context.ts    # cloudflareContext (env/ctx) + nonceContext (CSP)
app/lib/auth.server.ts    # buildAuth(env) — lazy per-env Better Auth instance
app/lib/auth-actions.server.ts # redirectWithSession / error-message helpers for auth actions
app/lib/email.server.ts   # sendEmail(env, message) — Resend over fetch, console fallback
app/lib/rate-limit.server.ts # D1-backed limiter for the kit's own auth actions
app/lib/validation.ts     # MIN_PASSWORD_LENGTH, field(form, name), FormErrors
app/lib/middleware.ts     # authMiddleware (RR8 middleware) + sessionContext
app/lib/theme.ts          # theme cookie read/write (dark mode)
app/lib/cn.ts             # class joiner (no clsx/tailwind-merge — see UI rules)
docs/recipes/             # guides for things left out of the core (email, OAuth, R2, AI, cron)
docs/CONVENTIONS.md       # code style: formatting, naming, import order, comments, tests, git
app/db/schema.ts          # app tables (Drizzle). auth-schema.ts is Better Auth's — never edit by hand
drizzle/                  # generated SQL migrations (committed)
tests/                    # vitest-pool-workers specs
```

## Core patterns (follow these exactly)

1. **Cloudflare bindings**: only available per-request. In loaders/actions: `const { env } = context.get(cloudflareContext)!;`. Never touch bindings at module scope.
2. **Auth**: `buildAuth(env)` (lazy, cached per env). Better Auth owns `/api/auth/*` — never add competing auth endpoints there.
   - Sign-in/sign-up/sign-out run **server-side in route actions** (`app/routes/login.tsx`, `signup.tsx`, `logout.tsx`) via `auth.api.signInEmail` / `signUpEmail` / `signOut` with `asResponse: true`, then `redirectWithSession(response, "/dashboard")` to carry the Set-Cookie headers onto the redirect. This is what makes auth work without JavaScript.
   - With `asResponse: true` a rejected credential comes back as a **non-OK Response, not a thrown error** — always check `response.ok` before redirecting. Keep the try/catch too: some failures (e.g. duplicate email) still throw.
   - The auth client (`app/lib/auth.client.ts`) is only for redirect-based social sign-in.
3. **Protected routes**: place them under the protected `layout` route. `authMiddleware` (RR8 middleware, runs once before all loaders in the subtree) redirects anonymous users to /login and stores the session; read it with `context.get(sessionContext)!` — never call `getSession` again in loaders under the protected layout.
4. **DB changes**: edit `app/db/schema.ts` → `bun run db:generate` → `bun run db:migrate:local` → commit generated files in `drizzle/`. Never write raw SQL migrations by hand. Tests discover migrations automatically (`tests/setup-db.ts` globs `drizzle/*.sql`) — nothing to register.
5. **Rate-limit anything that costs money or guesses secrets.** `limitAuthAttempt(env, request, "route-name", { window, max })` from `app/lib/rate-limit.server.ts`, returning `data({ errors }, { status: 429 })` when blocked. Better Auth's own limiter only covers `/api/auth/*`, never your actions.
6. **Email** goes through `sendEmail(env, message)`. It must never throw into a request path; it logs to the console when `RESEND_API_KEY` is unset.
7. **New env var** → add it to `.dev.vars`, `.dev.vars.example` and `scripts/setup.ts`, then run `bun run cf-typegen` so `Env` picks it up.
8. **Any user-supplied redirect target goes through `safeRedirect()`** (`app/lib/validation.ts`). A `startsWith("/")` check is not enough — `//evil.example.com` passes it and browsers treat it as another origin.
9. **Every route answers every method it is registered for.** A resource route with only an `action` must still export a `loader` (return 405), or a GET falls through to React Router's own error handler.

## Recipe: add a CRUD feature (e.g. "notes")

1. `app/db/schema.ts`: add the Drizzle table (include `userId` referencing `user.id` if per-user).
2. `bun run db:generate && bun run db:migrate:local`.
3. `app/routes/notes.tsx`: loader (read via `drizzle(env.DB)`), action (create/delete), component. Session from `context.get(sessionContext)!`.
4. Register in `app/routes.ts` under the protected `layout` route.
5. UI: compose from `app/components/ui/*` and `<Field>` — do not hand-roll inputs or buttons.
6. `tests/notes.spec.ts`: follow `tests/ui-flow.spec.ts` — drive the **route** the browser hits (form POST to your action), not just the underlying API. Tests that only call the API miss broken forms.
7. `bun run check` — done only when green.

## Performance rules (non-negotiable defaults)

Pages must render fast. Every new page follows these:

1. **Stream slow data — never block the shell.** In loaders, `await` only what the shell needs (session comes free from `sessionContext`). Return slow queries as un-awaited promises and render them with `<Suspense fallback={<Skeleton/>}>` + React 19 `use(promise)`. Reference implementation: `app/routes/dashboard.tsx`.
2. **Prefetch on intent.** Every internal `<Link>` gets `prefetch="intent"` (loads code+data on hover/focus) unless it points to an auth-mutating URL.
3. **Don't re-fetch what middleware resolved.** Session reads are `context.get(sessionContext)!` — an extra `getSession` call per loader is a wasted DB roundtrip.
4. **Keep the client bundle lean.** No new client-side data libraries; loaders + fetchers are the data layer. Heavy, below-the-fold components load via `React.lazy`.
5. **Parallelize queries.** Multiple independent queries in one loader start together (create promises first, then await what's needed) — never sequential awaits.

## UI rules (every new page follows these)

1. **Use the tokens, never raw palette classes.** `bg-background`, `text-muted-foreground`, `border-border`, `bg-card`, `text-primary`. Writing `bg-gray-50` or `text-blue-600` breaks dark mode — those classes are static.
2. **Compose primitives.** `Button` (variant: default/secondary/outline/ghost/destructive/link, size: default/sm/lg/icon), `Input`, `Label`, `Card` + `CardHeader/Title/Description/Content/Footer`, `Badge`. Forms use `<Field label name error />`, which wires `aria-invalid` / `aria-describedby` for you.
3. **`className` is for layout only** (`w-full`, `mt-4`, `col-span-2`). There is no tailwind-merge, so it does NOT reliably override a component's base styles — change the look with `variant` / `size` instead.
4. **Form errors come from the action.** Return `data({ errors, values }, { status: 400 })` and read `actionData` in the component. **Annotate the error object as `FormErrors`** (`app/lib/validation.ts`) — without it TypeScript infers a different literal shape per branch and `actionData.errors.email` stops compiling. Render form-level errors with `<Alert variant="destructive">`. Never validate only on the client.
5. **Confirmations are toasts, problems are Alerts.** `useToastOnChange(actionData?.message)` announces a success once per result through the `aria-live` region; anything the user must act on stays on the page.
6. **Multiple forms on one page** share a single action, switched on a hidden `intent` field — see `app/routes/settings.tsx`. Row-level actions use `useFetcher` so the page does not navigate.
7. **Pending state.** The root already renders a global progress bar from `useNavigation()`. For submit buttons, disable and relabel using `useNavigation().formAction === "/your-route"` (or `navigation.formData?.get("intent")` when the page has several forms).
8. **Empty lists render `<EmptyState>`**, never a bare empty `<ul>`. Streaming fallbacks use `<Skeleton>` sized like the real content so the shell does not shift.
9. **Accessibility is not optional.** Icons get `aria-hidden`; icon-only buttons get `aria-label`; **each page renders exactly one `<h1>`** (`<CardTitle as="h1">` when the card is the page); nav links use `NavLink` so the active state is real. Anything that overlays the page — drawers, dialogs — must close on Escape, take focus on open, trap Tab, and return focus to its trigger.
10. **Adding a shadcn component is allowed** when a primitive is genuinely missing: `bunx shadcn@latest add <name>` works — the tokens already match. Weigh the client-bundle cost first; Radix-backed overlays (dialog, select, dropdown, popover) pull in extra dependencies.

## Code conventions (summary — full rules in [docs/CONVENTIONS.md](./docs/CONVENTIONS.md))

1. **Formatting**: 2-space indent, double quotes, semicolons, trailing commas, wrap around 80 (100 max). No formatter is configured — match the neighbouring code.
2. **Naming**: kebab-case files; `.server.ts` / `.client.ts` suffixes for one-sided modules; `api.<name>.tsx` for resource routes; PascalCase components/types, camelCase functions, UPPER_SNAKE constants; booleans read as predicates (`submitting`, `hasGoogle`).
3. **Imports**: relative paths only (the `~/*` alias is unused); order react → react-router → third-party → `../lib` → `../db` → `../components` → `./+types` last; `import type` for types; named exports everywhere except a route's default component; no barrel files.
4. **Route module order**: `meta` → `middleware` → `loader` → action helpers → `action` → local components → `export default` page. Loaders `throw redirect()`, actions `return redirect()`.
5. **Types**: `interface` for props and contracts, `type` for unions/derived; `as const` lookup tables with `keyof typeof`; no `any`, no `@ts-ignore`; `!` only on `context.get(…)`.
6. **Comments explain why, not what.** Every exported symbol gets a JSDoc naming the reason or the trap; deliberate-looking-wrong code gets an inline `// … on purpose` note. No commented-out code.
7. **Logging**: `console.error("[module] what happened:", error)`. Rate limiting fails open, auth fails closed — say which in a comment.
8. **Tests**: `tests/<feature>.spec.ts`, `describe`/`it` in plain sentences, `SELF.fetch` through the route, assert status/`Location`/`Set-Cookie`, regression tests start with a comment naming the bug.
9. **Git**: Conventional Commits (`feat(scope): lowercase imperative`, ≤ 72 chars); one logical change per commit; schema + migration + test travel together.

## Constraints

- No new runtime dependencies without explicit user approval (current allowlist: react-router, better-auth, drizzle-orm, tailwind v4, lucide-react). This is why `cn()` is hand-written instead of clsx/tailwind-merge/cva.
- `lucide-react` brand icons (e.g. `Github`) are deprecated — use an inline SVG like `app/components/github-mark.tsx`.
- Never edit `app/db/auth-schema.ts`, `worker-configuration.d.ts` (generated via `cf-typegen`), or files in `drizzle/meta/`.
- Never commit `.dev.vars` / secrets. `wrangler.jsonc` database_id is a placeholder replaced by setup/deploy.
- No git commit/push unless the user explicitly asks.
- `vite.config.ts` uses `cloudflare({ viteEnvironment: { name: "ssr" } })` — do not change this (avoids the double-SSR-build trap).
- `server.ts` sets security headers on every response and a nonce-based CSP on production HTML. Any inline `<script>` you add needs the nonce from the root loader, or it will be blocked in production. Prefer not adding one.
- Never render a raw error message from a dependency. `authErrorMessage` / `responseErrorMessage` only surface 4xx text; 5xx bodies (which include failing SQL and its parameters) go to the log and the user sees a generic sentence.
