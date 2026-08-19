import { Suspense, use } from "react";
import { Link, useLoaderData } from "react-router";
import { drizzle } from "drizzle-orm/d1";
import { count } from "drizzle-orm";
import { cloudflareContext } from "../lib/app-context";
import { sessionContext } from "../lib/middleware";
import { user } from "../db/auth-schema";
import type { Route } from "./+types/dashboard";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Dashboard" }];
}

/**
 * PERFORMANCE PATTERN — streaming SSR (the kit's default for slow data):
 * return the promise WITHOUT awaiting it. React Router streams the page
 * shell immediately; <Suspense> fills this in when the query resolves.
 * Only await data that is needed to render the shell (e.g. the session,
 * which authMiddleware already resolved — read it from context for free).
 */
export async function loader({ context }: Route.LoaderArgs) {
  const session = context.get(sessionContext)!;
  const { env } = context.get(cloudflareContext)!;
  const db = drizzle(env.DB);

  // NOT awaited on purpose — replace with your real (possibly slow) query.
  const stats = db
    .select({ users: count() })
    .from(user)
    .then(([row]) => ({ users: row?.users ?? 0 }));

  return { name: session.user.name || session.user.email, stats };
}

function Stats({ promise }: { promise: Promise<{ users: number }> }) {
  const stats = use(promise); // React 19: suspends until the promise resolves
  return <p className="text-3xl font-bold">{stats.users}</p>;
}

function StatsSkeleton() {
  return <div className="h-9 w-16 animate-pulse rounded bg-gray-200" />;
}

export default function Dashboard() {
  const { name, stats } = useLoaderData<typeof loader>();
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Dashboard</h2>
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <p className="text-gray-600 mb-4">Welcome back, {name}. This shell renders instantly; the number below streams in.</p>
        <div className="rounded-lg border border-gray-200 p-4 inline-block">
          <p className="text-sm text-gray-500">Registered users</p>
          <Suspense fallback={<StatsSkeleton />}>
            <Stats promise={stats} />
          </Suspense>
        </div>
      </div>
      <Link to="/settings" prefetch="intent" className="text-blue-600 hover:underline">
        Go to Settings &rarr;
      </Link>
    </div>
  );
}
