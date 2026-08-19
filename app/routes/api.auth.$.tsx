import { buildAuth } from "../lib/auth.server";
import type { Route } from "./+types/api.auth.$";

export async function action({ request, context }: Route.ActionArgs) {
  const auth = buildAuth(context.get(cloudflareContext)!.env);
  return auth.handler(request);
}

import { cloudflareContext } from "../lib/app-context";

export async function loader({ request, context }: Route.LoaderArgs) {
  const auth = buildAuth(context.get(cloudflareContext)!.env);
  return auth.handler(request);
}
