import { buildAuth } from "../lib/auth.server";
import { cloudflareContext } from "../lib/app-context";
import type { Route } from "./+types/api.auth";

/** Better Auth owns every /api/auth/* endpoint (sign-in, sign-out, OAuth
 * callbacks, session). Do not add custom auth endpoints alongside it. */
export async function loader({ request, context }: Route.LoaderArgs) {
  const auth = buildAuth(context.get(cloudflareContext)!.env);
  return auth.handler(request);
}

export async function action({ request, context }: Route.ActionArgs) {
  const auth = buildAuth(context.get(cloudflareContext)!.env);
  return auth.handler(request);
}
