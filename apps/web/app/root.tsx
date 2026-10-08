import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useNavigation,
  useRouteLoaderData,
} from "react-router";

import type { Route } from "./+types/root";
import { nonceContext } from "./lib/app-context";
import { getTheme } from "./lib/theme";
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

/** Root loader stays cheap on purpose: reading a cookie costs nothing and it
 * lets the server render the correct theme, so there is no flash. */
export function loader({ request, context }: Route.LoaderArgs) {
  return {
    theme: getTheme(request),
    nonce: context.get(nonceContext) ?? "",
  };
}

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
  return <Outlet />;
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
