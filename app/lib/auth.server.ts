import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { actionEmail, sendEmail } from "./email.server";

/** Better Auth must be created lazily per-env: on Workers, bindings (env.DB)
 * only exist inside a request, never at module scope. */
function createAuth(env: Env) {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    // The schema passed here includes the rateLimit table, which
    // `rateLimit.storage: "database"` below needs.
    database: drizzleAdapter(drizzle(env.DB), { provider: "sqlite", schema }),

    emailAndPassword: {
      enabled: true,
      // Flip to true once you have a real email provider configured; the kit
      // ships it off so `bun run setup && bun dev` gets you a usable account
      // with no third-party signup.
      requireEmailVerification: false,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail(env, {
          to: user.email,
          subject: "Reset your password",
          text: `Reset your password: ${url}`,
          html: actionEmail({
            heading: "Reset your password",
            body: "Click below to choose a new password. The link expires in one hour. If you did not request this, you can ignore this email.",
            actionLabel: "Reset password",
            url,
          }),
        });
      },
      revokeSessionsOnPasswordReset: true,
    },

    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        // Better Auth defaults the post-verification redirect to "/"; point it
        // at the page that actually reports the outcome.
        const verifyUrl = new URL(url);
        verifyUrl.searchParams.set("callbackURL", "/verify-email");
        const link = verifyUrl.toString();

        await sendEmail(env, {
          to: user.email,
          subject: "Verify your email address",
          text: `Verify your email: ${link}`,
          html: actionEmail({
            heading: "Verify your email address",
            body: "Confirm this address to secure your account.",
            actionLabel: "Verify email",
            url: link,
          }),
        });
      },
    },

    advanced: {
      ipAddress: {
        // Without this Better Auth cannot resolve the caller and falls back to
        // ONE shared bucket per path — a single attacker would rate-limit
        // everybody. Cloudflare sets CF-Connecting-IP at the edge and it cannot
        // be spoofed by the client.
        ipAddressHeaders: ["cf-connecting-ip"],
      },
    },

    /**
     * Guards Better Auth's own /api/auth/* surface (OAuth callbacks, the
     * client-side endpoints). It does NOT cover this kit's login/signup
     * actions, which call `auth.api.*` directly and so never pass through the
     * HTTP handler — those are limited in `app/lib/rate-limit.server.ts`.
     */
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 300, max: 5 },
        "/request-password-reset": { window: 300, max: 5 },
        "/reset-password": { window: 300, max: 5 },
      },
    },

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
