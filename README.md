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
| **Database** | D1 + Drizzle ORM, generated migrations committed to `drizzle/` |
| **UI** | Tailwind v4 with shadcn-compatible design tokens, dark mode, 7 primitives, toasts, accessible forms |
| **Performance** | Streaming SSR (`Suspense` + `use`), `prefetch="intent"`, session resolved once by middleware |
| **Hardening** | Per-IP rate limiting in D1, security headers, nonce-based CSP in production |
| **Testing** | Vitest on `@cloudflare/vitest-pool-workers` — the real Workers runtime, not a mock |
| **CI** | GitHub Actions running `typecheck && build && test` on every push and PR |

## Commands

```bash
bun run setup             # one-time local provisioning (.dev.vars + local D1 migrations)
bun dev                   # dev server at localhost:5173
bun run check             # typecheck && build && test — the gate for "done"
bun run db:generate       # after editing app/db/schema.ts
bun run db:migrate:local  # apply migrations to local D1
bun run deploy            # wrangler deploy (run db:migrate:remote first)
```

## Deploying

```bash
bunx wrangler login
bun run db:migrate:remote
bun run deploy
```

`wrangler.jsonc`'s `database_id` is a placeholder that setup/deploy replaces. Set `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` as production secrets:

```bash
bunx wrangler secret put BETTER_AUTH_SECRET
bunx wrangler secret put BETTER_AUTH_URL
```

## Email, OAuth and the rest

Email verification and password reset are wired end to end. With `RESEND_API_KEY`
unset, messages are printed to the Worker console — so you can walk the entire
reset flow locally without signing up for anything. See
[docs/recipes/](./docs/recipes/) for switching on a real provider, adding OAuth
providers, R2 uploads, Workers AI and cron.

## Design system

The kit ships seven primitives in `app/components/ui/` (Button, Input, Label, Card, Badge, Alert, Skeleton) plus an accessible `<Field>` wrapper, a dependency-free toast region and an `<EmptyState>`. They consume **shadcn/ui's CSS variable names** (`--primary`, `--muted`, `--border`, …), so `bunx shadcn@latest add dialog` drops in registry components that match the existing look with no restyling.

Deliberately **no `clsx` / `tailwind-merge` / `cva` dependency** — the kit keeps a zero-added-deps rule and ships a small `cn()` in `app/lib/cn.ts`. The trade-off: `className` does not override a component's base classes by string order. Change the look with `variant` / `size`, and use `className` for layout only.

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

This is a **starter**, not a SaaS-in-a-box. Billing, admin consoles and multi-tenancy are explicit non-goals — they belong in your app, not in the kit.

## Structure

```
server.ts                 # Worker entry: request handler + RouterContextProvider(env, ctx)
app/routes.ts             # explicit route table — every new route is registered here
app/routes/               # home, login, signup, forgot-password, reset-password, verify-email,
                          #   logout, api.auth, api.theme, layout, dashboard, settings
app/components/ui/        # design-system primitives
app/components/           # field, auth-shell, toast, empty-state, theme-toggle
app/lib/                  # auth, email, rate-limit, middleware, context, theme, validation, cn
docs/recipes/             # email, OAuth, CRUD, Workers AI, R2, cron
app/db/schema.ts          # your tables (Drizzle); auth-schema.ts belongs to Better Auth
drizzle/                  # generated SQL migrations (committed)
tests/                    # vitest-pool-workers specs
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
| **데이터베이스** | D1 + Drizzle ORM, 생성된 마이그레이션은 `drizzle/`에 커밋 |
| **UI** | Tailwind v4 + shadcn 호환 디자인 토큰, 다크모드, 프리미티브 7종, 토스트, 접근성 갖춘 폼 |
| **성능** | 스트리밍 SSR(`Suspense` + `use`), `prefetch="intent"`, 미들웨어가 세션을 1회만 조회 |
| **하드닝** | D1 기반 IP별 레이트리밋, 보안 헤더, 운영 빌드 nonce CSP |
| **테스트** | `@cloudflare/vitest-pool-workers` — 목이 아닌 실제 Workers 런타임 |
| **CI** | 푸시·PR마다 `typecheck && build && test` 실행 |

## 명령어

```bash
bun run setup             # 최초 1회 로컬 프로비저닝(.dev.vars + 로컬 D1 마이그레이션)
bun dev                   # 개발 서버
bun run check             # typecheck && build && test — "완료" 판정 기준
bun run db:generate       # app/db/schema.ts 수정 후
bun run db:migrate:local  # 로컬 D1에 마이그레이션 적용
bun run deploy            # wrangler deploy (먼저 db:migrate:remote)
```

## 배포

```bash
bunx wrangler login
bun run db:migrate:remote
bun run deploy
```

`wrangler.jsonc`의 `database_id`는 setup/deploy가 치환하는 플레이스홀더입니다. 운영 시크릿은 `bunx wrangler secret put BETTER_AUTH_SECRET` / `BETTER_AUTH_URL`로 설정합니다.

## 이메일·OAuth·그 외

이메일 인증과 비밀번호 재설정이 끝까지 배선되어 있습니다. `RESEND_API_KEY`가 없으면
메일 내용이 Worker 콘솔에 출력되므로, 아무 데도 가입하지 않고 재설정 플로우 전체를
로컬에서 확인할 수 있습니다. 실제 발송 provider 연결, OAuth 추가, R2 업로드,
Workers AI, cron은 [docs/recipes/](./docs/recipes/) 참고.

## 디자인 시스템

`app/components/ui/`에 프리미티브 7종(Button, Input, Label, Card, Badge, Alert, Skeleton)과 접근성 래퍼 `<Field>`, 의존성 없는 토스트 영역, `<EmptyState>`가 있습니다. **shadcn/ui의 CSS 변수 이름**(`--primary`, `--muted`, `--border` 등)을 그대로 쓰기 때문에, `bunx shadcn@latest add dialog`로 레지스트리 컴포넌트를 추가해도 룩앤필이 그대로 맞습니다.

`clsx` / `tailwind-merge` / `cva`는 **의도적으로 넣지 않았습니다**(의존성 무증가 원칙). 대신 `app/lib/cn.ts`에 작은 `cn()`이 있습니다. 대가로 `className`이 문자열 순서로 기본 클래스를 이기지 못하므로, 외형 변경은 `variant`/`size`로 하고 `className`은 레이아웃 용도로만 쓰세요.

다크모드는 루트 로더가 쿠키를 읽어 서버에서 렌더링하므로 테마 깜빡임이 없습니다.

## 이 킷의 범위

결제·어드민 콘솔·멀티테넌시는 **의도적으로 넣지 않습니다.** 스타터의 가치는 기능 최다가 아니라 "최소 + 에이전트 친화"입니다.

## 라이선스

MIT
