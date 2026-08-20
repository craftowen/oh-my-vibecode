import { Suspense, use } from "react";
import { Link, useLoaderData } from "react-router";
import { drizzle } from "drizzle-orm/d1";
import { count } from "drizzle-orm";
import { ArrowRight, KeyRound, Users } from "lucide-react";
import { cloudflareContext } from "../lib/app-context";
import { sessionContext } from "../lib/middleware";
import { session as sessionTable, user } from "../db/auth-schema";
import { Badge } from "../components/ui/badge";
import { Skeleton } from "../components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import type { Route } from "./+types/dashboard";

export const meta: Route.MetaFunction = () => [
  { title: "Dashboard · oh-my-vibecode" },
];

/**
 * PERFORMANCE PATTERN — streaming SSR (the kit's default for slow data):
 * return the promise WITHOUT awaiting it. React Router streams the page
 * shell immediately; <Suspense> fills this in when the query resolves.
 * Only await data that is needed to render the shell (e.g. the session,
 * which authMiddleware already resolved — read it from context for free).
 *
 * Both queries below are created before either is awaited, so D1 runs them
 * concurrently instead of one after the other.
 */
export async function loader({ context }: Route.LoaderArgs) {
  const session = context.get(sessionContext)!;
  const { env } = context.get(cloudflareContext)!;
  const db = drizzle(env.DB);

  // NOT awaited on purpose — replace with your real (possibly slow) queries.
  const stats = Promise.all([
    db.select({ value: count() }).from(user),
    db.select({ value: count() }).from(sessionTable),
  ]).then(([users, sessions]) => ({
    users: users[0]?.value ?? 0,
    sessions: sessions[0]?.value ?? 0,
  }));

  return { name: session.user.name || session.user.email, stats };
}

type Stats = { users: number; sessions: number };

function StatValue({ promise, pick }: { promise: Promise<Stats>; pick: keyof Stats }) {
  const stats = use(promise); // React 19: suspends until the promise resolves
  return <span className="text-3xl font-semibold tabular-nums">{stats[pick]}</span>;
}

function StatSkeleton() {
  // Same box as the real value so the shell does not shift when it streams in.
  return <Skeleton className="h-9 w-14" />;
}

function StatCard({
  label,
  icon: Icon,
  promise,
  pick,
}: {
  label: string;
  icon: typeof Users;
  promise: Promise<Stats>;
  pick: keyof Stats;
}) {
  return (
    <Card className="gap-3 py-5">
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardDescription>{label}</CardDescription>
        <Icon className="size-4 text-muted-foreground" aria-hidden />
      </CardHeader>
      <CardContent>
        <Suspense fallback={<StatSkeleton />}>
          <StatValue promise={promise} pick={pick} />
        </Suspense>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { name, stats } = useLoaderData<typeof loader>();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Dashboard</h1>
          <Badge variant="secondary">streaming SSR</Badge>
        </div>
        <p className="break-words text-muted-foreground">
          Welcome back, {name}. This shell renders instantly; the numbers below
          stream in when D1 answers.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Registered users" icon={Users} promise={stats} pick="users" />
        <StatCard
          label="Active sessions"
          icon={KeyRound}
          promise={stats}
          pick="sessions"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Next step</CardTitle>
          <CardDescription>
            Add your first feature — the recipe in AGENTS.md walks an agent
            through a full CRUD route in six steps.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            to="/settings"
            prefetch="intent"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Go to settings
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
