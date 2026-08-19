import { createContext, redirect } from "react-router";
import type { RouterContextProvider } from "react-router";
import { buildAuth, type Auth } from "./auth.server";
import { cloudflareContext } from "./app-context";

export type Session = NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>;

/** Set by authMiddleware; any loader/action under a protected layout can read it. */
export const sessionContext = createContext<Session>();

/** React Router 8 middleware: runs once before all loaders/actions in the
 * protected subtree. Redirects to /login when unauthenticated, otherwise
 * stores the session in context so loaders never re-fetch it. */
export const authMiddleware = async ({
  request,
  context,
}: {
  request: Request;
  context: Readonly<RouterContextProvider>;
}): Promise<void> => {
  const { env } = context.get(cloudflareContext)!;
  const auth = buildAuth(env);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    throw redirect("/login");
  }
  context.set(sessionContext, session);
};
