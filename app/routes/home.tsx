import { Link } from "react-router";
import {
  Bot,
  CheckCircle2,
  Cloud,
  Database,
  Gauge,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { GithubMark } from "../components/github-mark";
import { Badge } from "../components/ui/badge";
import { buttonStyles } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import type { Route } from "./+types/home";

export const meta: Route.MetaFunction = () => [
  { title: "oh-my-vibecode — React Router 8 × Cloudflare Workers starter" },
  {
    name: "description",
    content:
      "Auth, D1, streaming SSR and a green test harness on day one. Built to be cloned and extended by AI agents.",
  },
];

const REPO = "https://github.com/craftowen/oh-my-vibecode";

const FEATURES = [
  {
    icon: Terminal,
    title: "Zero infra setup",
    body: "bun i && bun run setup && bun dev. Local D1, migrations and .dev.vars are provisioned for you — no Cloudflare account needed to start.",
  },
  {
    icon: ShieldCheck,
    title: "Auth already wired",
    body: "Better Auth on D1 with email + optional Google, session middleware, and protected routes that redirect anonymous visitors.",
  },
  {
    icon: Gauge,
    title: "Fast by default",
    body: "Streaming SSR with Suspense, prefetch on intent, and a session the middleware resolves once — the patterns are the defaults, not the docs.",
  },
  {
    icon: Bot,
    title: "Agent-ready",
    body: "AGENTS.md documents every pattern and constraint, so an agent adds a feature without exploring the codebase first.",
  },
  {
    icon: Database,
    title: "Typed schema + migrations",
    body: "Drizzle over D1: edit the schema, generate SQL, apply locally. Generated migrations are committed.",
  },
  {
    icon: CheckCircle2,
    title: "Green harness on clone",
    body: "Typecheck, build and vitest against the real Workers runtime — plus CI, so machines verify what the agent wrote.",
  },
] as const;

const STACK = [
  "React Router 8",
  "Cloudflare Workers",
  "D1 + Drizzle",
  "Better Auth",
  "Tailwind v4",
  "Vitest",
  "bun",
];

export default function Home() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
        <nav
          aria-label="Main"
          className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 px-3 sm:px-4"
        >
          <span className="truncate font-semibold tracking-tight">oh-my-vibecode</span>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <a
              href={REPO}
              target="_blank"
              rel="noreferrer noopener"
              className={buttonStyles({ variant: "ghost", size: "sm" })}
            >
              <GithubMark className="size-4" />
              <span className="hidden sm:inline">GitHub</span>
            </a>
            <Link
              to="/login"
              prefetch="intent"
              className={buttonStyles({ size: "sm" })}
            >
              Sign in
            </Link>
          </div>
        </nav>
      </header>

      <main id="main">
        {/* Hero */}
        <section className="relative overflow-hidden border-b">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,var(--color-accent),transparent)] opacity-70"
          />
          <div className="relative mx-auto max-w-3xl px-4 py-16 text-center sm:py-24 lg:py-28">
            <Badge variant="outline" className="mb-6">
              React Router 8 · Cloudflare Workers
            </Badge>
            <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl lg:text-5xl">
              The starter your agent can actually finish.
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base text-pretty text-muted-foreground sm:text-lg">
              Auth, database, streaming SSR and a green test harness on day one —
              wired the way the docs say, so the next feature is the only thing
              left to build.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                to="/signup"
                prefetch="intent"
                className={buttonStyles({ size: "lg" })}
              >
                Get started
              </Link>
              <a
                href={REPO}
                target="_blank"
                rel="noreferrer noopener"
                className={buttonStyles({ size: "lg", variant: "outline" })}
              >
                <GithubMark className="size-4" />
                View source
              </a>
            </div>
            <div className="mt-8 flex justify-center">
              <p className="flex max-w-full items-center gap-2 overflow-x-auto rounded-lg border bg-card px-3 py-2 font-mono text-xs whitespace-nowrap shadow-xs sm:px-4 sm:text-sm">
                <span className="select-none text-muted-foreground">$</span>
                bun create craftowen/oh-my-vibecode my-app
              </p>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-5xl px-4 py-12 sm:py-16 lg:py-20">
          <h2 className="text-center text-2xl font-semibold tracking-tight">
            What is already done for you
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <Card key={title} className="gap-3 py-5">
                <CardContent className="space-y-2">
                  <Icon className="size-5 text-primary" aria-hidden />
                  <h3 className="font-medium">{title}</h3>
                  <p className="text-sm text-muted-foreground">{body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Stack */}
        <section className="border-y bg-muted/40">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-2 px-4 py-10">
            <Cloud className="size-4 text-muted-foreground" aria-hidden />
            {STACK.map((item) => (
              <Badge key={item} variant="secondary">
                {item}
              </Badge>
            ))}
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-4 py-10 text-sm text-muted-foreground sm:flex-row">
        <p>MIT licensed. Built for the Cloudflare stack.</p>
        <a
          href={REPO}
          target="_blank"
          rel="noreferrer noopener"
          className="underline-offset-4 hover:underline"
        >
          craftowen/oh-my-vibecode
        </a>
      </footer>
    </div>
  );
}
