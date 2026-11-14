import { buildAuth } from "../lib/auth.server";
import { redirectWithSession } from "../lib/auth-actions.server";
import { cloudflareContext } from "../lib/app-context";
import type { Route } from "./+types/logout";

/**
 * Sign-out lives in its own route action rather than posting straight at
 * `/api/auth/*`: Better Auth's HTTP endpoint expects JSON and an Origin header,
 * neither of which a plain <Form> sends. Going through the server API here
 * keeps logout working with JavaScript disabled.
 */
export async function action({ request, context }: Route.ActionArgs) {
  const auth = buildAuth(context.get(cloudflareContext)!.env);
  const response = await auth.api.signOut({
    headers: request.headers,
    asResponse: true,
  });
  // The response carries the cookie-clearing headers; move them onto the redirect.
  return redirectWithSession(response, "/login");
}

/** Action-only endpoint: GET requests must never sign a user out. */
export function loader() {
  return new Response("Method Not Allowed", {
    status: 405,
    headers: { Allow: "POST" },
  });
}
