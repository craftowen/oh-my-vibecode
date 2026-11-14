import { waitUntil } from "cloudflare:workers";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@repo/db";
import { actionEmail, sendEmail } from "./email.server";
import { consumeRateLimit } from "./rate-limit.server";
import { MAX_NAME_LENGTH } from "./validation";

/** Enforces trimmed non-empty bounded display names across both form and OAuth paths. */
function enforceUserName<T extends { name?: unknown }>(data: T): T {
  if (typeof data.name !== "string") return data;
  const trimmed = data.name.trim();
  if (trimmed.length === 0) {
    throw new APIError("BAD_REQUEST", { message: "Name is required." });
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new APIError("BAD_REQUEST", {
      message: `Keep it under ${MAX_NAME_LENGTH} characters.`,
    });
  }
  return trimmed === data.name ? data : { ...data, name: trimmed };
}

/** Better Auth must be created lazily per-env: on Workers, bindings (env.DB)
 * only exist inside a request, never at module scope. */
function createAuth(env: Env) {
  // Fails closed on purpose. Without a secret Better Auth falls back to its
  // public default and only refuses when NODE_ENV is "production", which a
  // Worker never sets — anyone could then sign an email-verification token,
  // and autoSignInAfterVerification turns that into a session for any account.
  if (!env.BETTER_AUTH_SECRET) {
    throw new Error("[auth] BETTER_AUTH_SECRET is not set; refusing to start auth.");
  }
  // Without baseURL, Better Auth falls back to request host headers / HTTP,
  // disabling Secure cookies in production and breaking `new URL(url)` links.
  if (!env.BETTER_AUTH_URL) {
    throw new Error("[auth] BETTER_AUTH_URL is not set; refusing to start auth.");
  }
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    // The schema passed here includes the rateLimit table, which
    // `rateLimit.customStorage` below shares with `rate-limit.server.ts`.
    database: drizzleAdapter(drizzle(env.DB), { provider: "sqlite", schema }),

    // Workers never sets NODE_ENV=production, so override the default
    // /api/auth/error debug page with the app's own login screen.
    onAPIError: {
      errorURL: "/login",
    },

    databaseHooks: {
      user: {
        create: {
          before: async (data) => ({ data: enforceUserName(data) }),
        },
        update: {
          before: async (data) => ({ data: enforceUserName(data) }),
        },
      },
    },

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
      // Emails go out after the response. Awaiting the send made a reset
      // request for a real account a delivery round-trip slower than one for
      // an unknown address — a timing oracle for the account list.
      backgroundTasks: { handler: waitUntil },
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
      // Custom storage delegates to our atomic D1 upsert and prevents Better
      // Auth's built-in database storage from pruning rows older than its own
      // max rule window (300s), which wiped longer action windows (e.g. 3600s).
      customStorage: {
        consume: (key, rule) => consumeRateLimit(env, `ba:${key}`, rule),
      },
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 300, max: 10 },
        "/sign-up/email": { window: 3600, max: 10 },
        "/request-password-reset": { window: 300, max: 5 },
        "/reset-password": { window: 300, max: 5 },
        "/send-verification-email": { window: 300, max: 5 },
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
