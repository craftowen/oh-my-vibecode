import { createContext, redirect } from "react-router";
import type { RouterContextProvider } from "react-router";
import { buildAuth, type Auth } from "./auth.server";
import { cloudflareContext } from "./app-context";

export type Session = NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>;

/** Set by authMiddleware; any loader/action under a protected layout can read it. */
export const sessionContext = createContext<Session>();

/** React Router 8 middleware: runs once before all loaders/actions in the
 * protected subtree. Redirects to /login when unauthenticated — carrying the
 * requested page as `redirectTo` so a deep link survives the sign-in —
 * otherwise stores the session in context so loaders never re-fetch it. */
export const authMiddleware = async (
  {
    request,
    context,
  }: {
    request: Request;
    context: Readonly<RouterContextProvider>;
  },
  next: () => Promise<Response>,
): Promise<Response> => {
  const { env } = context.get(cloudflareContext)!;
  const auth = buildAuth(env);
  const { response: session, headers } = await auth.api.getSession({
    headers: request.headers,
    returnHeaders: true,
  });
  if (!session) {
    // A client-side navigation asks for /settings.data?_routes=…; the page
    // the visitor wants is /settings.
    const url = new URL(request.url);
    url.searchParams.delete("_routes");
    const target = url.pathname.replace(/\.data$/, "") + url.search;
    // /dashboard is where login lands anyway; a bare /login keeps that URL clean.
    const login = target === "/dashboard"
      ? "/login"
      : `/login?redirectTo=${encodeURIComponent(target)}`;
    throw redirect(login, { headers });
  }
  context.set(sessionContext, session);
  const response = await next();
  for (const cookie of headers.getSetCookie()) {
    response.headers.append("Set-Cookie", cookie);
  }
  return response;
};
