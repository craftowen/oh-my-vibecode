import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import * as authSchema from "../db/auth-schema";

/** Better Auth must be created lazily per-env: on Workers, bindings (env.DB)
 * only exist inside a request, never at module scope. */
function createAuth(env: Env) {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(drizzle(env.DB), { provider: "sqlite", schema: authSchema }),
    emailAndPassword: { enabled: true },
    socialProviders:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
            },
          }
        : {},
  });
}

export type Auth = ReturnType<typeof createAuth>;

let cached: { env: Env; auth: Auth } | null = null;

export function buildAuth(env: Env): Auth {
  if (!cached || cached.env !== env) {
    cached = { env, auth: createAuth(env) };
  }
  return cached.auth;
}
