import { useContext, useEffect, useRef, useState } from "react";
import {
  isRouteErrorResponse,
  Link,
  Links,
  matchRoutes,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  UNSAFE_DataRouterContext,
  UNSAFE_FrameworkContext,
  useFetcher,
  useLocation,
  useMatches,
  useNavigation,
  useRevalidator,
  useRouteLoaderData,
} from "react-router";

import type { Route } from "./+types/root";
import { nonceContext } from "./lib/app-context";
import { getTheme } from "./lib/theme";
import {
  cachedClientLoader,
  FRESH_MS,
  hasClientCache,
  hasFreshClientCache,
  invalidateOnMutation,
  PREFETCH_EVENT,
  PREFETCH_PARAM,
  type PrefetchRequest,
  refreshFromServer,
  seedClientCache,
  setClientCacheUser,
  takeRefreshWanted,
} from "./lib/client-cache";
import { ToastProvider } from "./components/toast";
import { buttonStyles } from "./components/ui/button";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
];

export const meta: Route.MetaFunction = () => [
  { title: "oh-my-vibecode" },
  {
    name: "description",
    content:
      "React Router 8 × Cloudflare Workers starter — built to be cloned and extended by AI agents.",
  },
];

/** Any non-GET submission drops the client cache — see app/lib/client-cache.ts. */
export const clientMiddleware: Route.ClientMiddlewareFunction[] = [invalidateOnMutation];

/** Root loader stays cheap on purpose: reading a cookie costs nothing and it
 * lets the server render the correct theme, so there is no flash. */
export function loader({ request, context }: Route.LoaderArgs) {
  return {
    theme: getTheme(request),
    nonce: context.get(nonceContext) ?? "",
  };
}

/** Theme and nonce only change on a POST (theme toggle), so navigations reuse
 * the cached copy instead of re-requesting the root loader. */
export const clientLoader = (args: Route.ClientLoaderArgs) => cachedClientLoader(args, "root");

/** Applied before hydration when the visitor has no theme cookie yet, so the
 * first paint already matches the OS preference. */
const THEME_INIT = `try{if(matchMedia("(prefers-color-scheme:dark)").matches)document.documentElement.classList.add("dark")}catch(e){}`;

export function Layout({ children }: { children: React.ReactNode }) {
  // Undefined while the root loader itself is failing — the error page still
  // has to render, so every read here is optional.
  const data = useRouteLoaderData<typeof loader>("root");
  const theme = data?.theme ?? null;
  const nonce = data?.nonce;

  return (
    <html lang="en" className={theme ?? undefined} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light dark" />
        <Meta />
        <Links />
        {theme === null && (
          <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        )}
      </head>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <GlobalPending />
        <ToastProvider>{children}</ToastProvider>
        <ScrollRestoration nonce={nonce} />
        <Scripts nonce={nonce} />
      </body>
    </html>
  );
}

/** Top progress bar driven by React Router's navigation state — every page
 * transition in the app gets feedback without any per-route wiring. */
function GlobalPending() {
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 bg-primary transition-opacity duration-200 ${
        busy ? "animate-pulse opacity-100" : "opacity-0"
      }`}
    />
  );
}

export default function App() {
  return (
    <>
      <ClientCacheSync />
      <Outlet />
    </>
  );
}

/** How often the visible, idle screen refetches to pick up other people's writes. */
const POLL_MS = 60_000;
/** Hover this long before prefetching — like React Router's intent, it filters a passing cursor. */
const INTENT_DELAY_MS = 50;

/**
 * Browser-side wiring of the client cache (app/lib/client-cache.ts).
 * - Revalidation: after a navigation that rendered a stale entry, on focus
 *   return (if older than FRESH_MS), and every POLL_MS on a visible idle tab.
 * - Prefetch: React Router leaves a route's data out of intent prefetch once it
 *   has a clientLoader (only code is fetched). So hovering a link to such a
 *   route calls its clientLoader through a fetcher here, and the click renders
 *   from the cache.
 */
function ClientCacheSync() {
  const navigation = useNavigation();
  const { revalidate } = useRevalidator();
  const location = useLocation();
  const router = useContext(UNSAFE_DataRouterContext)?.router;
  const manifest = useContext(UNSAFE_FrameworkContext)?.manifest;
  const matches = useMatches();
  const [prefetches, setPrefetches] = useState<string[]>([]);
  // The cache is per user; outside the protected layout this is null and nothing is stored.
  const viewer = matches.find((m) => m.id === "routes/layout")?.loaderData as
    | { user: { id: string } }
    | undefined;
  const cacheUser = viewer?.user.id ?? null;
  const lastRefresh = useRef(0);
  const refresh = useRef(() => {});
  refresh.current = () => {
    lastRefresh.current = Date.now();
    void refreshFromServer(revalidate);
  };
  const here = useRef("");
  here.current = location.pathname + location.search;

  useEffect(() => setClientCacheUser(cacheUser), [cacheUser]);

  useEffect(() => {
    lastRefresh.current = Date.now(); // The first screen just came from the server.
    // Seed the SSR data — parents keyed by route id, the leaf by URL (same rule as cachedClientLoader).
    const url = window.location.pathname + window.location.search;
    matches.forEach((m, i) => {
      if (!manifest?.routes[m.id]?.hasClientLoader) return;
      seedClientCache(url, i === matches.length - 1 ? undefined : m.id, m.loaderData);
    });
    // First render's matches only on purpose — later screens fill the cache via clientLoader.
  }, []);

  useEffect(() => {
    if (navigation.state === "idle" && takeRefreshWanted()) refresh.current();
  }, [navigation.state]);

  useEffect(() => {
    const idle = () =>
      document.visibilityState === "visible" && router?.state.navigation.state === "idle";
    const onVisible = () => {
      if (idle() && Date.now() - lastRefresh.current > FRESH_MS) refresh.current();
    };
    const timer = setInterval(() => idle() && refresh.current(), POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [router]);

  useEffect(() => {
    if (!router || !manifest) return;
    const routes = router.routes;
    const routeManifest = manifest.routes;
    let timer: ReturnType<typeof setTimeout> | undefined;
    /** The URL to prefetch, or null for new-tab, download, opted-out, other-origin, current or fresh links. */
    function prefetchTarget(event: Event) {
      const a = (event.target as Element | null)?.closest?.("a[href]");
      if (
        !(a instanceof HTMLAnchorElement) ||
        a.target ||
        a.hasAttribute("download") ||
        a.hasAttribute("data-no-prefetch")
      ) {
        return null;
      }
      const url = new URL(a.href);
      const href = url.pathname + url.search;
      if (url.origin !== window.location.origin || href === here.current || hasFreshClientCache(href)) {
        return null;
      }
      const leaf = matchRoutes(routes, url.pathname)?.at(-1);
      if (!leaf || !routeManifest[leaf.route.id]?.hasClientLoader) return null;
      url.searchParams.set(PREFETCH_PARAM, "1");
      return url.pathname + url.search;
    }
    const start = (target: string) =>
      setPrefetches((list) => (list.includes(target) ? list : [...list, target]));
    function onIntent(event: Event) {
      const target = prefetchTarget(event);
      if (!target) return;
      clearTimeout(timer);
      timer = setTimeout(() => start(target), INTENT_DELAY_MS);
    }
    // Start on press — the click (on release) awaits this in-flight request
    // (cachedClientLoader dedupes), so the press-to-release time is not wasted.
    function onPress(event: Event) {
      const target = prefetchTarget(event);
      if (!target) return;
      clearTimeout(timer);
      start(target);
    }
    const cancel = () => clearTimeout(timer);
    // Prefetches a screen asked for directly (requestPrefetch) — no hover needed.
    function onRequest(event: Event) {
      const { hrefs, onlyMissing } = (event as CustomEvent<PrefetchRequest>).detail;
      const targets = hrefs
        .filter(
          (href) =>
            href !== here.current &&
            !(onlyMissing ? hasClientCache(href) : hasFreshClientCache(href)),
        )
        .map((href) => {
          const url = new URL(href, window.location.origin);
          url.searchParams.set(PREFETCH_PARAM, "1");
          return url.pathname + url.search;
        });
      if (targets.length) {
        setPrefetches((list) => [...list, ...targets.filter((t) => !list.includes(t))]);
      }
    }
    window.addEventListener(PREFETCH_EVENT, onRequest);
    document.addEventListener("pointerover", onIntent);
    document.addEventListener("pointerdown", onPress);
    document.addEventListener("focusin", onIntent);
    document.addEventListener("touchstart", onIntent, { passive: true });
    document.addEventListener("pointerout", cancel);
    return () => {
      cancel();
      window.removeEventListener(PREFETCH_EVENT, onRequest);
      document.removeEventListener("pointerover", onIntent);
      document.removeEventListener("pointerdown", onPress);
      document.removeEventListener("focusin", onIntent);
      document.removeEventListener("touchstart", onIntent);
      document.removeEventListener("pointerout", cancel);
    };
  }, [router, manifest]);

  return prefetches.map((href) => (
    <PrefetchData
      key={href}
      href={href}
      onDone={() => setPrefetches((list) => list.filter((h) => h !== href))}
    />
  ));
}

/**
 * One prefetch, one fetcher, unmounted once settled — a fetcher left mounted
 * counts as "loaded" and React Router revalidates it after every action, which
 * is a wasted request. One per href so they never cancel each other.
 */
function PrefetchData({ href, onDone }: { href: string; onDone: () => void }) {
  const fetcher = useFetcher();
  const started = useRef(false);
  const busy = useRef(false);
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      void fetcher.load(href);
    } else if (fetcher.state !== "idle") {
      busy.current = true;
    } else if (busy.current) {
      // Only the idle after a seen load — ending on the idle render right after load() cancels it.
      onDone();
    }
  });
  return null;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let status = 500;
  let message = "Something went wrong";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    status = error.status;
    message = error.status === 404 ? "Page not found" : `Error ${error.status}`;
    details =
      error.status === 404
        ? "The page you are looking for does not exist or has moved."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main
      id="main"
      tabIndex={-1}
      className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center"
    >
      <p className="font-mono text-sm text-muted-foreground">{status}</p>
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{message}</h1>
        <p className="max-w-prose text-muted-foreground">{details}</p>
      </div>
      <Link
        to="/"
        prefetch="intent"
        className={buttonStyles({ variant: "outline" })}
      >
        Return home
      </Link>
      {stack && (
        <pre className="mt-4 max-w-full overflow-x-auto rounded-lg border bg-muted p-4 text-left text-xs">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
