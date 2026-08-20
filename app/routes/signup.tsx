import { Form, Link, data, redirect, useNavigation } from "react-router";
import { buildAuth } from "../lib/auth.server";
import {
  authErrorMessage,
  redirectWithSession,
  responseErrorMessage,
} from "../lib/auth-actions.server";
import { cloudflareContext } from "../lib/app-context";
import { limitAuthAttempt } from "../lib/rate-limit.server";
import { MAX_NAME_LENGTH, MIN_PASSWORD_LENGTH, field } from "../lib/validation";
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
 * dashboard in one click. */
const DEMO = {
  name: "Demo User",
  email: "demo@example.com",
  password: "password1234",
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const auth = buildAuth(context.get(cloudflareContext)!.env);
  const session = await auth.api.getSession({ headers: request.headers });
  if (session) throw redirect("/dashboard");
  return null;
}

export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext)!;
  const form = await request.formData();
  const name = field(form, "name");
  const email = field(form, "email");
  const password = String(form.get("password") ?? "");

  const errors: Record<string, string> = {};
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
    const formError: Record<string, string> = { form: limit.message };
    return data({ errors: formError, values: { name, email } }, { status: 429 });
  }

  const auth = buildAuth(env);
  try {
    const response = await auth.api.signUpEmail({
      body: { name, email, password },
      headers: request.headers,
      asResponse: true,
    });
    if (!response.ok) {
      const formError: Record<string, string> = {
        form: await responseErrorMessage(
          response,
          "Could not create the account.",
        ),
      };
      return data({ errors: formError, values: { name, email } }, { status: 400 });
    }
    return redirectWithSession(response, "/dashboard");
  } catch (error) {
    const formError: Record<string, string> = {
      form: authErrorMessage(error, "Could not create the account."),
    };
    return data({ errors: formError, values: { name, email } }, { status: 400 });
  }
}

export default function Signup({ actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const submitting = navigation.formAction === "/signup";
  const errors = actionData?.errors ?? {};

  return (
    <AuthShell
      title="Create your account"
      description="It takes a few seconds — no credit card required."
      footer={
        <>
          Already have an account?{" "}
          <Link
            to="/login"
            prefetch="intent"
            className="text-primary underline-offset-4 hover:underline"
          >
            Log in
          </Link>
        </>
      }
    >
      <p className="rounded-md border border-dashed bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
        Pre-filled with the demo account from the README — submit as-is to get
        straight into the dashboard, or replace it with your own details.
      </p>

      {errors.form && <Alert variant="destructive">{errors.form}</Alert>}

      <Form method="post" className="space-y-4" replace>
        <Field
          label="Name"
          name="name"
          autoComplete="name"
          defaultValue={actionData?.values?.name ?? DEMO.name}
          error={errors.name}
          maxLength={MAX_NAME_LENGTH}
          required
        />
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={actionData?.values?.email ?? DEMO.email}
          error={errors.email}
          required
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          defaultValue={DEMO.password}
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
