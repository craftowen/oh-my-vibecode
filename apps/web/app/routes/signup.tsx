import { Form, Link, data, redirect, useNavigation } from "react-router";
import { buildAuth } from "../lib/auth.server";
import { callAuth, redirectWithSession } from "../lib/auth-actions.server";
import { cloudflareContext } from "../lib/app-context";
import { limitAuthAttempt } from "../lib/rate-limit.server";
import {
  MAX_NAME_LENGTH,
  MIN_PASSWORD_LENGTH,
  field,
  safeRedirect,
  type FormErrors,
} from "../lib/validation";
import { AuthShell } from "../components/auth-shell";
import { Field } from "../components/field";
import { Alert } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import type { Route } from "./+types/signup";

export const meta: Route.MetaFunction = () => [
  { title: "Sign up · oh-my-vibecode" },
];

/** The credentials `bun run setup` tells you to use. They are pre-filled here —
 * on the SIGNUP page, where they actually work — so a fresh clone reaches the
 * dashboard in one click. Local dev only: on a deployed site a pre-filled,
 * public password is one shared account anybody can sign in to. */
const DEMO = {
  name: "Demo User",
  email: "demo@example.com",
  password: "password1234",
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const auth = buildAuth(context.get(cloudflareContext)!.env);
  const { response: session, headers } = await auth.api.getSession({
    headers: request.headers,
    returnHeaders: true,
  });
  // "" when absent or unsafe, so the form only carries a vetted path.
  const redirectTo = safeRedirect(
    new URL(request.url).searchParams.get("redirectTo"),
    "",
  );
  if (session) throw redirect(redirectTo || "/dashboard", { headers });
  // import.meta.env.DEV is replaced at build time: true under `bun dev`, false
  // in the deployed build, so the demo values never reach production HTML or
  // the client bundle.
  return data(
    { demo: import.meta.env.DEV ? DEMO : null, redirectTo },
    { headers },
  );
}

export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext)!;
  const form = await request.formData();
  const name = field(form, "name");
  const email = field(form, "email");
  const password = String(form.get("password") ?? "");

  const errors: FormErrors = {};
  if (!name) {
    errors.name = "Name is required.";
  } else if (name.length > MAX_NAME_LENGTH) {
    errors.name = `Keep it under ${MAX_NAME_LENGTH} characters.`;
  }
  if (!email) errors.email = "Email is required.";
  if (!password) {
    errors.password = "Password is required.";
  } else if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (Object.keys(errors).length > 0) {
    return data({ errors, values: { name, email } }, { status: 400 });
  }

  const limit = await limitAuthAttempt(env, request, "signup", {
    window: 3600,
    max: 10,
  });
  if (limit.blocked) {
    const formError: FormErrors = { form: limit.message };
    return data({ errors: formError, values: { name, email } }, { status: 429 });
  }

  const auth = buildAuth(env);
  const result = await callAuth(
    () =>
      auth.api.signUpEmail({
        body: { name, email, password },
        headers: request.headers,
        asResponse: true,
      }),
    "Could not create the account.",
  );
  if ("error" in result) {
    const formError: FormErrors = { form: result.error };
    return data({ errors: formError, values: { name, email } }, { status: 400 });
  }
  // Re-checked here: the hidden field is client input like any other.
  return redirectWithSession(
    result.response,
    safeRedirect(form.get("redirectTo"), "/dashboard"),
  );
}

export default function Signup({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const submitting = navigation.formAction === "/signup";
  const errors = actionData?.errors ?? {};
  const { redirectTo } = loaderData;
  // Only the first render is pre-filled: after a failed no-JS submit the demo
  // password would silently replace the one the visitor typed.
  const demo = actionData ? null : loaderData.demo;

  return (
    <AuthShell
      title="Create your account"
      description="It takes a few seconds — no credit card required."
      footer={
        <>
          Already have an account?{" "}
          <Link
            to={redirectTo
              ? `/login?redirectTo=${encodeURIComponent(redirectTo)}`
              : "/login"}
            prefetch="intent"
            className="text-primary underline-offset-4 hover:underline"
          >
            Log in
          </Link>
        </>
      }
    >
      {demo && (
        <p className="rounded-md border border-dashed bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          Pre-filled with the demo account from the README — submit as-is to get
          straight into the dashboard, or replace it with your own details.
        </p>
      )}

      {errors.form && <Alert variant="destructive">{errors.form}</Alert>}

      <Form method="post" className="space-y-4" replace>
        {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}
        <Field
          label="Name"
          name="name"
          autoComplete="name"
          defaultValue={actionData?.values?.name ?? demo?.name}
          error={errors.name}
          maxLength={MAX_NAME_LENGTH}
          required
        />
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={actionData?.values?.email ?? demo?.email}
          error={errors.email}
          required
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          defaultValue={demo?.password}
          error={errors.password}
          required
        />
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Creating account…" : "Create account"}
        </Button>
      </Form>
    </AuthShell>
  );
}
