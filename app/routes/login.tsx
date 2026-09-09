import { Form, Link, data, redirect, useNavigation } from "react-router";
import { buildAuth } from "../lib/auth.server";
import {
  authErrorMessage,
  redirectWithSession,
  responseErrorMessage,
} from "../lib/auth-actions.server";
import { cloudflareContext } from "../lib/app-context";
import { limitAuthAttempt } from "../lib/rate-limit.server";
import { field } from "../lib/validation";
import { authClient } from "../lib/auth.client";
import { AuthShell } from "../components/auth-shell";
import { Field } from "../components/field";
import { Alert } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import type { Route } from "./+types/login";

export const meta: Route.MetaFunction = () => [{ title: "Log in · oh-my-vibecode" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext)!;
  const auth = buildAuth(env);
  const { response: session, headers } = await auth.api.getSession({
    headers: request.headers,
    returnHeaders: true,
  });
  if (session) throw redirect("/dashboard", { headers });

  const url = new URL(request.url);
  return data({
    hasGoogle: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    justReset: url.searchParams.has("reset"),
  }, { headers });
}

/**
 * Server-side sign-in. Doing this in an action (instead of calling the auth
 * client from an onSubmit handler) is what makes the form work without JS and
 * lets React Router own the redirect.
 */
export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext)!;
  const form = await request.formData();
  const email = field(form, "email");
  const password = String(form.get("password") ?? "");

  const errors: Record<string, string> = {};
  if (!email) errors.email = "Email is required.";
  if (!password) errors.password = "Password is required.";
  if (Object.keys(errors).length > 0) {
    return data({ errors, values: { email } }, { status: 400 });
  }

  // Better Auth's own limiter only guards /api/auth/*; this action bypasses it.
  const limit = await limitAuthAttempt(env, request, "login", {
    window: 300,
    max: 10,
  });
  if (limit.blocked) {
    const formError: Record<string, string> = { form: limit.message };
    return data({ errors: formError, values: { email } }, { status: 429 });
  }

  const auth = buildAuth(env);
  try {
    const response = await auth.api.signInEmail({
      body: { email, password },
      headers: request.headers,
      asResponse: true,
    });
    if (!response.ok) {
      const formError: Record<string, string> = {
        form: await responseErrorMessage(response, "Invalid email or password."),
      };
      return data({ errors: formError, values: { email } }, { status: 400 });
    }
    return redirectWithSession(response, "/dashboard");
  } catch (error) {
    const formError: Record<string, string> = {
      form: authErrorMessage(error, "Invalid email or password."),
    };
    return data({ errors: formError, values: { email } }, { status: 400 });
  }
}

export default function Login({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const submitting = navigation.formAction === "/login";
  const errors = actionData?.errors ?? {};

  return (
    <AuthShell
      title="Welcome back"
      description="Log in to continue to your dashboard."
      footer={
        <>
          No account yet?{" "}
          <Link
            to="/signup"
            prefetch="intent"
            className="text-primary underline-offset-4 hover:underline"
          >
            Create one
          </Link>{" "}
          — a fresh install has no users until you do.
        </>
      }
    >
      {loaderData.justReset && (
        <Alert variant="success">
          Your password was changed. Log in with the new one.
        </Alert>
      )}

      {errors.form && <Alert variant="destructive">{errors.form}</Alert>}

      <Form method="post" className="space-y-4" replace>
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={actionData?.values?.email}
          error={errors.email}
          required
        />
        <div className="space-y-1">
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            error={errors.password}
            required
          />
          <div className="text-right">
            <Link
              to="/forgot-password"
              prefetch="intent"
              className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Forgot your password?
            </Link>
          </div>
        </div>
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </Form>

      {loaderData.hasGoogle && (
        <>
          <div className="relative text-center text-xs text-muted-foreground">
            <span className="relative z-10 bg-card px-2">or</span>
            <span className="absolute inset-x-0 top-1/2 -z-0 block border-t" />
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={() =>
              authClient.signIn.social({
                provider: "google",
                callbackURL: "/dashboard",
              })
            }
          >
            Continue with Google
          </Button>
        </>
      )}
    </AuthShell>
  );
}
