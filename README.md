# oh-my-vibecode

**React Router 8 × Cloudflare Workers starter — built to be cloned and extended by AI agents.**

Auth, database, streaming SSR, a design system and a green test harness on day one. Everything is wired the way the official docs say, and [AGENTS.md](./AGENTS.md) tells an agent exactly how to add the next feature without exploring the codebase first.

[한국어 →](#한국어)

```bash
bun create craftowen/oh-my-vibecode my-app
cd my-app
bun install
bun run setup     # local D1 + .dev.vars — no Cloudflare account needed
bun dev           # http://localhost:5173
```

## What's in the box

| | |
|---|---|
| **Framework** | React Router 8, framework mode, SSR on Cloudflare Workers |
| **Auth** | Better Auth on D1 — email/password, email verification, password reset, session management, optional Google |
| **Database** | D1 + Drizzle ORM in a shared `@repo/db` package, generated migrations committed to `packages/db/drizzle/` |
| **UI** | Tailwind v4 with shadcn-compatible design tokens, dark mode, 7 primitives, toasts, accessible forms |
| **Performance** | Streaming SSR (`Suspense` + `use`), `prefetch="intent"`, session resolved once by middleware |
| **Hardening** | Per-IP rate limiting in D1, security headers, nonce-based CSP in production |
| **Testing** | Vitest on `@cloudflare/vitest-pool-workers` — the real Workers runtime, not a mock |
| **CI** | GitHub Actions running `typecheck && build && test` on every push and PR, and deploying `main` once that passes |
| **Monorepo** | bun workspaces — `apps/web` today, room for `apps/admin` and `apps/jobs` on the same D1, no turbo |

## Commands

All commands run from the repo root; the root `package.json` forwards them to `apps/web` (or `packages/db` for `db:generate`).

```bash
bun run setup             # one-time local provisioning (apps/web/.dev.vars + apply committed migrations to local D1)
bun dev                   # dev server at localhost:5173
bun run check             # typecheck && build && test — the gate for "done"
bun run db:generate       # after editing packages/db/src/schema.ts
bun run db:migrate:local  # apply migrations to local D1
bun run deploy            # manual wrangler deploy (see Deploying)
```

For a single package: `bun run --cwd apps/web <script>` or `bun --filter @repo/web <script>`.

## Deploying

```bash
bunx wrangler login
bunx wrangler d1 create oh-my-vibecode-db   # paste the printed id into apps/web/wrangler.jsonc's database_id
bun run db:migrate:remote
bun run deploy
```

`apps/web/wrangler.jsonc`'s `database_id` is a placeholder: local dev and tests work with it, and nothing replaces it for you on a manual deploy. In CI, the `deploy` job of `.github/workflows/ci.yml` runs on pushes to `main` after the checks pass, overwrites the whole `apps/web/wrangler.jsonc` with the `CLOUDFLARE_WRANGLER_CONFIG` repository secret (alongside `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`) and deploys from `apps/web`. Because the secret replaces the file, it must match the committed one apart from the real `database_id`: `"migrations_dir": "../../packages/db/drizzle"` (the old `"drizzle"` no longer resolves) and the `send_email` `EMAIL` binding. Set `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` as production secrets:

```bash
bunx wrangler secret put BETTER_AUTH_SECRET --config apps/web/wrangler.jsonc
bunx wrangler secret put BETTER_AUTH_URL --config apps/web/wrangler.jsonc
```

## Email, OAuth and the rest

Email verification and password reset are wired end to end. Without the `EMAIL`
send_email binding (local dev, tests), messages are printed to the Worker console — so you can walk the entire
reset flow locally without signing up for anything. See
[docs/recipes/](./docs/recipes/) for switching on a real provider, adding OAuth
providers, R2 uploads, Workers AI, cron and a second app.

## Design system

The kit ships seven primitives in `apps/web/app/components/ui/` (Button, Input, Label, Card, Badge, Alert, Skeleton) plus an accessible `<Field>` wrapper, a dependency-free toast region and an `<EmptyState>`. They consume **shadcn/ui's CSS variable names** (`--primary`, `--muted`, `--border`, …), so `bunx shadcn@latest add dialog` drops in registry components that match the existing look with no restyling.

Deliberately **no `clsx` / `tailwind-merge` / `cva` dependency** — the kit keeps a zero-added-deps rule and ships a small `cn()` in `apps/web/app/lib/cn.ts`. The trade-off: `className` does not override a component's base classes by string order. Change the look with `variant` / `size`, and use `className` for layout only.

Dark mode is a cookie read in the root loader and rendered server-side, so there is no flash of the wrong theme.

## How it compares

| | oh-my-vibecode | Typical RR7 + D1 templates | Paid SaaS kits |
|---|---|---|---|
| React Router 8 middleware / `RouterContextProvider` | ✅ native | ❌ RR7 patterns | mostly Next.js |
| One-command local provisioning | ✅ `bun run setup` | manual D1 create + ID paste | ✅ |
| Real Workers-runtime tests + CI green on clone | ✅ | rare | ✅ |
| Agent instructions as a first-class file | ✅ AGENTS.md | ❌ | ❌ |
| Streaming SSR as the default page pattern | ✅ | ❌ | varies |
| Password reset + email verification wired | ✅ | rare | ✅ |
| Rate limiting + CSP out of the box | ✅ | ❌ | varies |
| Billing / admin / multi-tenancy | ❌ by design | ❌ | ✅ |

This is a **starter**, not a SaaS-in-a-box. Billing, admin consoles and multi-tenancy are explicit non-goals — they belong in your app, not in the kit. The monorepo leaves the slots ready: `apps/admin` (an internal console behind Cloudflare Access) and `apps/jobs` (cron and queue work) are the intended extension points, both sharing the D1 through `@repo/db` — see [docs/recipes/new-app.md](./docs/recipes/new-app.md).

## Structure

```
package.json              # bun workspaces root: apps/*, packages/*; scripts forward to the packages
docs/recipes/             # email, OAuth, CRUD, Workers AI, R2, cron, new apps
apps/web/                 # @repo/web — the React Router Worker
  server.ts               # Worker entry: request handler + RouterContextProvider(env, ctx)
  wrangler.jsonc          # D1 (migrations_dir ../../packages/db/drizzle) + send_email binding
  app/routes.ts           # explicit route table — every new route is registered here
  app/routes/             # home, login, signup, forgot-password, reset-password, verify-email,
                          #   logout, api.auth, api.theme, layout, dashboard, settings
  app/components/ui/      # design-system primitives
  app/components/         # field, auth-shell, toast, empty-state, theme-toggle
  app/lib/                # auth, email, rate-limit, middleware, context, theme, validation, cn
  tests/                  # vitest-pool-workers specs
packages/db/              # @repo/db — shared by every app on the D1
  src/schema.ts           # your tables (Drizzle); auth-schema.ts belongs to Better Auth
  drizzle/                # generated SQL migrations (committed) — the only migrations dir
apps/admin/, apps/jobs/   # planned, not created — see docs/recipes/new-app.md
```

Read [AGENTS.md](./AGENTS.md) before adding a feature — it documents the patterns, the recipe for a CRUD route, and the constraints.

## License

MIT

---

<a id="한국어"></a>

# oh-my-vibecode (한국어)

**React Router 8 × Cloudflare Workers 스타터 — AI 에이전트가 그대로 복제·확장하도록 만든 킷.**

인증·DB·스트리밍 SSR·디자인 시스템·통과하는 테스트 하네스가 처음부터 들어 있습니다. 모든 배선은 공식 문서 방식을 따르고, [AGENTS.md](./AGENTS.md)에 패턴이 정리되어 있어 에이전트가 코드베이스를 탐색하지 않고 바로 기능을 추가할 수 있습니다.

```bash
bun create craftowen/oh-my-vibecode my-app
cd my-app
bun install
bun run setup     # 로컬 D1 + .dev.vars — Cloudflare 계정 없이 동작
bun dev           # http://localhost:5173
```

## 구성

| | |
|---|---|
| **프레임워크** | React Router 8 framework mode, Cloudflare Workers SSR |
| **인증** | Better Auth on D1 — 이메일/비밀번호, 이메일 인증, 비밀번호 재설정, 세션 관리, 선택적 Google |
| **데이터베이스** | D1 + Drizzle ORM, 공유 패키지 `@repo/db`, 생성된 마이그레이션은 `packages/db/drizzle/`에 커밋 |
| **UI** | Tailwind v4 + shadcn 호환 디자인 토큰, 다크모드, 프리미티브 7종, 토스트, 접근성 갖춘 폼 |
| **성능** | 스트리밍 SSR(`Suspense` + `use`), `prefetch="intent"`, 미들웨어가 세션을 1회만 조회 |
| **하드닝** | D1 기반 IP별 레이트리밋, 보안 헤더, 운영 빌드 nonce CSP |
| **테스트** | `@cloudflare/vitest-pool-workers` — 목이 아닌 실제 Workers 런타임 |
| **CI** | 푸시·PR마다 `typecheck && build && test` 실행, 통과하면 `main`을 배포 |
| **모노레포** | bun workspaces — 지금은 `apps/web`, 같은 D1을 쓰는 `apps/admin`·`apps/jobs` 자리 확보, turbo 없음 |

## 명령어

모든 명령은 저장소 루트에서 실행합니다. 루트 `package.json`이 `apps/web`(`db:generate`는 `packages/db`)으로 넘겨 줍니다.

```bash
bun run setup             # 최초 1회 로컬 프로비저닝(apps/web/.dev.vars + 커밋된 마이그레이션을 로컬 D1에 적용)
bun dev                   # 개발 서버
bun run check             # typecheck && build && test — "완료" 판정 기준
bun run db:generate       # packages/db/src/schema.ts 수정 후
bun run db:migrate:local  # 로컬 D1에 마이그레이션 적용
bun run deploy            # 수동 wrangler deploy (배포 절 참고)
```

패키지 하나만: `bun run --cwd apps/web <script>` 또는 `bun --filter @repo/web <script>`.

## 배포

```bash
bunx wrangler login
bunx wrangler d1 create oh-my-vibecode-db   # 출력된 id를 apps/web/wrangler.jsonc의 database_id에 기입
bun run db:migrate:remote
bun run deploy
```

`apps/web/wrangler.jsonc`의 `database_id`는 플레이스홀더입니다. 로컬 개발과 테스트는 그대로 동작하지만, 수동 배포 때는 아무것도 치환해 주지 않습니다. CI에서는 `.github/workflows/ci.yml`의 `deploy` job이 `main` 푸시 때 검사 통과 후 실행되며, `apps/web/wrangler.jsonc` 전체를 저장소 시크릿 `CLOUDFLARE_WRANGLER_CONFIG`로 덮어쓰고 `apps/web`에서 배포합니다(`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`도 필요). 시크릿이 파일을 통째로 대체하므로 실제 `database_id` 외에는 커밋된 파일과 같아야 합니다: `"migrations_dir": "../../packages/db/drizzle"`(예전 `"drizzle"`은 더 이상 경로가 맞지 않음)와 `send_email`의 `EMAIL` 바인딩. 운영 시크릿은 `bunx wrangler secret put BETTER_AUTH_SECRET --config apps/web/wrangler.jsonc`(`BETTER_AUTH_URL`도 동일)로 설정합니다.

## 이메일·OAuth·그 외

이메일 인증과 비밀번호 재설정이 끝까지 배선되어 있습니다. `EMAIL` send_email 바인딩이 없으면(로컬 개발·테스트)
메일 내용이 Worker 콘솔에 출력되므로, 아무 데도 가입하지 않고 재설정 플로우 전체를
로컬에서 확인할 수 있습니다. 실제 발송 provider 연결, OAuth 추가, R2 업로드,
Workers AI, cron, 두 번째 앱 추가는 [docs/recipes/](./docs/recipes/) 참고.

## 디자인 시스템

`apps/web/app/components/ui/`에 프리미티브 7종(Button, Input, Label, Card, Badge, Alert, Skeleton)과 접근성 래퍼 `<Field>`, 의존성 없는 토스트 영역, `<EmptyState>`가 있습니다. **shadcn/ui의 CSS 변수 이름**(`--primary`, `--muted`, `--border` 등)을 그대로 쓰기 때문에, `bunx shadcn@latest add dialog`로 레지스트리 컴포넌트를 추가해도 룩앤필이 그대로 맞습니다.

`clsx` / `tailwind-merge` / `cva`는 **의도적으로 넣지 않았습니다**(의존성 무증가 원칙). 대신 `apps/web/app/lib/cn.ts`에 작은 `cn()`이 있습니다. 대가로 `className`이 문자열 순서로 기본 클래스를 이기지 못하므로, 외형 변경은 `variant`/`size`로 하고 `className`은 레이아웃 용도로만 쓰세요.

다크모드는 루트 로더가 쿠키를 읽어 서버에서 렌더링하므로 테마 깜빡임이 없습니다.

## 이 킷의 범위

결제·어드민 콘솔·멀티테넌시는 **의도적으로 넣지 않습니다.** 스타터의 가치는 기능 최다가 아니라 "최소 + 에이전트 친화"입니다. 대신 모노레포에 자리는 마련해 두었습니다: `apps/admin`(Cloudflare Access 뒤의 내부 콘솔)과 `apps/jobs`(cron·큐 작업)가 의도된 확장 지점이며, 둘 다 `@repo/db`로 같은 D1을 씁니다 — [docs/recipes/new-app.md](./docs/recipes/new-app.md) 참고.

## 라이선스

MIT
