import { Form, Link, data, redirect, useNavigation } from "react-router";
import { buildAuth } from "../lib/auth.server";
import { authErrorMessage, responseErrorMessage } from "../lib/auth-actions.server";
import { cloudflareContext } from "../lib/app-context";
import { limitAuthAttempt } from "../lib/rate-limit.server";
import { AuthShell } from "../components/auth-shell";
import { Field } from "../components/field";
import { Alert } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { MIN_PASSWORD_LENGTH, type FormErrors } from "../lib/validation";
import type { Route } from "./+types/reset-password";

export const meta: Route.MetaFunction = () => [
  { title: "Choose a new password · oh-my-vibecode" },
];

/** Better Auth appends the token to the redirect URL it emailed. */
export function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  return {
    token: url.searchParams.get("token") ?? "",
    linkError: url.searchParams.get("error"),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext)!;
  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirmPassword") ?? "");

  const errors: FormErrors = {};
  if (!token) errors.form = "This reset link is invalid or has expired.";
  if (!password) {
    errors.password = "Password is required.";
  } else if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password !== confirm) errors.confirmPassword = "Passwords do not match.";
  if (Object.keys(errors).length > 0) return data({ errors }, { status: 400 });

  const limit = await limitAuthAttempt(env, request, "reset-password", {
    window: 300,
    max: 5,
  });
  if (limit.blocked) {
    const blockedError: FormErrors = { form: limit.message };
    return data({ errors: blockedError }, { status: 429 });
  }

  const auth = buildAuth(env);
  try {
    const response = await auth.api.resetPassword({
      body: { newPassword: password, token },
      headers: request.headers,
      asResponse: true,
    });
    if (!response.ok) {
      const formError: FormErrors = {
        form: await responseErrorMessage(
          response,
          "This reset link is invalid or has expired.",
        ),
      };
      return data({ errors: formError }, { status: 400 });
    }
  } catch (error) {
    const formError: FormErrors = {
      form: authErrorMessage(error, "This reset link is invalid or has expired."),
    };
    return data({ errors: formError }, { status: 400 });
  }

  // All sessions were revoked with the password change — sign in fresh.
  return redirect("/login?reset=1");
}

export default function ResetPassword({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  const submitting = navigation.formAction === "/reset-password";
  const errors = actionData?.errors ?? {};
  const { token, linkError } = loaderData;

  if (!token || linkError) {
    return (
      <AuthShell
        title="Link expired"
        description="Reset links are single-use and valid for one hour."
        footer={
          <Link
            to="/forgot-password"
            prefetch="intent"
            className="text-primary underline-offset-4 hover:underline"
          >
            Request a new link
          </Link>
        }
      >
        <Alert variant="destructive">
          This password reset link is no longer valid.
        </Alert>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Choose a new password"
      description="You will be signed out everywhere else."
    >
      {errors.form && <Alert variant="destructive">{errors.form}</Alert>}
      <Form method="post" className="space-y-4" replace>
        <input type="hidden" name="token" value={token} />
        <Field
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          error={errors.password}
          required
        />
        <Field
          label="Confirm new password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword}
          required
        />
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Saving…" : "Set new password"}
        </Button>
      </Form>
    </AuthShell>
  );
}
