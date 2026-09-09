import { Suspense, use } from "react";
import { Form, data, useFetcher, useNavigation } from "react-router";
import { and, eq, gt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Monitor, ShieldCheck, ShieldAlert } from "lucide-react";
import { buildAuth } from "../lib/auth.server";
import { authErrorMessage } from "../lib/auth-actions.server";
import { cloudflareContext } from "../lib/app-context";
import { sessionContext } from "../lib/middleware";
import { limitAuthAttempt } from "../lib/rate-limit.server";
import { session as sessionTable } from "../db/auth-schema";
import { MAX_NAME_LENGTH, field } from "../lib/validation";
import { EmptyState } from "../components/empty-state";
import { LocalTime } from "../components/local-time";
import { useToastOnChange } from "../components/toast";
import { Field } from "../components/field";
import { Alert } from "../components/ui/alert";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import type { Route } from "./+types/settings";

export const meta: Route.MetaFunction = () => [
  { title: "Settings · oh-my-vibecode" },
];

export async function loader({ context }: Route.LoaderArgs) {
  // The profile comes from the session authMiddleware already resolved — no
  // second session lookup. Start the device query without blocking the profile.
  const session = context.get(sessionContext)!;
  const { env } = context.get(cloudflareContext)!;
  const sessions = drizzle(env.DB)
    .select()
    .from(sessionTable)
    .where(and(eq(sessionTable.userId, session.user.id), gt(sessionTable.expiresAt, new Date())))
    .then((rows) => rows);

  return {
    user: session.user,
    currentSessionToken: session.session.token,
    sessions,
  };
}

/** What every branch of the action returns, so `actionData` has one shape. */
type ActionResult = { errors: Record<string, string>; message?: string };

const ok = (message: string): ActionResult => ({ errors: {}, message });
const fail = (errors: Record<string, string>, status = 400) =>
  data<ActionResult>({ errors }, { status });

/**
 * One action, several intents — the pattern to copy when a page has more than
 * one form. Each <Form> carries a hidden `intent` field.
 */
export async function action({ request, context }: Route.ActionArgs) {
  const auth = buildAuth(context.get(cloudflareContext)!.env);
  const form = await request.formData();
  const intent = field(form, "intent");

  try {
    switch (intent) {
      case "update-profile": {
        const name = field(form, "name");
        if (!name) return fail({ name: "Name is required." });
        if (name.length > MAX_NAME_LENGTH) {
          return fail({
            name: `Keep it under ${MAX_NAME_LENGTH} characters.`,
          });
        }
        await auth.api.updateUser({ body: { name }, headers: request.headers });
        return ok("Profile updated.");
      }

      case "revoke-session": {
        const token = field(form, "token");
        await auth.api.revokeSession({
          body: { token },
          headers: request.headers,
        });
        return ok("That device was signed out.");
      }

      case "resend-verification": {
        const limit = await limitAuthAttempt(
          context.get(cloudflareContext)!.env,
          request,
          "resend-verification",
          { window: 300, max: 5 },
        );
        if (limit.blocked) return fail({ form: limit.message }, 429);
        const email = context.get(sessionContext)!.user.email;
        await auth.api.sendVerificationEmail({
          body: { email, callbackURL: "/verify-email" },
          headers: request.headers,
        });
        return ok("Verification email sent.");
      }

      default:
        return fail({ form: "Unknown action." });
    }
  } catch (error) {
    return fail({ form: authErrorMessage(error, "That did not work. Try again.") });
  }
}

export default function Settings({ loaderData, actionData }: Route.ComponentProps) {
  const { user, sessions, currentSessionToken } = loaderData;
  const navigation = useNavigation();
  const errors = actionData?.errors ?? {};

  // Successful actions announce themselves through the toast region.
  useToastOnChange(actionData?.message, "success", actionData);

  const savingProfile =
    navigation.formData?.get("intent") === "update-profile";

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Settings</h1>
        <p className="text-muted-foreground">
          Your profile and the devices currently signed in.
        </p>
      </header>

      {errors.form && <Alert variant="destructive">{errors.form}</Alert>}

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            Your display name is shown across the app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* The email block sits OUTSIDE this form on purpose: its resend
              button is its own fetcher form, and a <form> inside a <form> is
              invalid HTML — the browser drops the inner one, which breaks
              hydration and would submit the wrong action without JS. */}
          <Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="update-profile" />
            <Field
              label="Name"
              name="name"
              defaultValue={user.name}
              error={errors.name}
              autoComplete="name"
              maxLength={MAX_NAME_LENGTH}
              required
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={savingProfile}>
                {savingProfile ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </Form>

          <div className="grid gap-2 border-t pt-6">
            <p className="text-sm font-medium">Email</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 break-all text-sm text-muted-foreground">
                {user.email}
              </span>
              {user.emailVerified ? (
                <Badge variant="secondary">
                  <ShieldCheck className="size-3" aria-hidden />
                  Verified
                </Badge>
              ) : (
                <Badge variant="outline">
                  <ShieldAlert className="size-3" aria-hidden />
                  Unverified
                </Badge>
              )}
            </div>
            {!user.emailVerified && (
              <div className="pt-1">
                <ResendVerification />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Suspense fallback={<Skeleton className="h-48 w-full" />}>
        <SessionsCard sessions={sessions} currentSessionToken={currentSessionToken} />
      </Suspense>
    </div>
  );
}

function SessionsCard({ sessions: pending, currentSessionToken }: {
  sessions: Promise<(typeof sessionTable.$inferSelect)[]>;
  currentSessionToken: string;
}) {
  const sessions = use(pending);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Active sessions</CardTitle>
        <CardDescription>
          {sessions.length} {sessions.length === 1 ? "device" : "devices"} signed in.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sessions.length === 0 ? (
          <EmptyState
            icon={Monitor}
            title="No active sessions"
            description="Sessions appear here as you sign in from other devices."
          />
        ) : (
          <ul className="divide-y rounded-lg border">
            {sessions.map((item) => {
              const isCurrent = item.token === currentSessionToken;
              return (
                <li
                  key={item.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start"
                >
                  <Monitor
                    className="mt-0.5 hidden size-4 shrink-0 text-muted-foreground sm:block"
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p
                        className="min-w-0 flex-1 truncate text-sm font-medium"
                        title={item.userAgent || undefined}
                      >
                        {item.userAgent || "Unknown device"}
                      </p>
                      {isCurrent && <Badge variant="secondary">This device</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {item.ipAddress || "no IP"} · signed in{" "}
                      <LocalTime value={item.createdAt} />
                    </p>
                  </div>
                  {!isCurrent && (
                    <div className="flex shrink-0 justify-end">
                      <RevokeSessionButton token={item.token} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Revoking is a fetcher submit so the page (and the rest of the list) never
 * re-navigates — only this row's button shows progress. */
function RevokeSessionButton({ token }: { token: string }) {
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";
  useToastOnChange(fetcher.data?.message, "success", fetcher.data);

  return (
    <fetcher.Form method="post">
      {fetcher.data?.errors.form && <Alert variant="destructive">{fetcher.data.errors.form}</Alert>}
      <input type="hidden" name="intent" value="revoke-session" />
      <input type="hidden" name="token" value={token} />
      <Button type="submit" variant="ghost" size="sm" disabled={busy}>
        {busy ? "Signing out…" : "Sign out"}
      </Button>
    </fetcher.Form>
  );
}

function ResendVerification() {
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";
  useToastOnChange(fetcher.data?.message, "success", fetcher.data);

  return (
    <fetcher.Form method="post">
      {fetcher.data?.errors.form && <Alert variant="destructive">{fetcher.data.errors.form}</Alert>}
      <input type="hidden" name="intent" value="resend-verification" />
      <Button type="submit" variant="outline" size="sm" disabled={busy}>
        {busy ? "Sending…" : "Resend verification email"}
      </Button>
    </fetcher.Form>
  );
}
