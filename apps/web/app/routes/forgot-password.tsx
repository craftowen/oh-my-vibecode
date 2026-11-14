import { Form, Link, data, useNavigation } from "react-router";
import { buildAuth } from "../lib/auth.server";
import { authErrorStatus } from "../lib/auth-actions.server";
import { cloudflareContext } from "../lib/app-context";
import { limitAuthAttempt } from "../lib/rate-limit.server";
import {
  field,
  isSubmittingTo,
  isValidEmail,
  type FormErrors,
} from "../lib/validation";
import { AuthShell } from "../components/auth-shell";
import { Field } from "../components/field";
import { Alert } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import type { Route } from "./+types/forgot-password";

export const meta: Route.MetaFunction = () => [
  { title: "Reset your password · oh-my-vibecode" },
];

export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext)!;
  const form = await request.formData();
  const email = field(form, "email");

  if (!email) {
    const errors: FormErrors = { email: "Email is required." };
    return data({ errors, values: { email }, sent: false }, { status: 400 });
  }
  if (!isValidEmail(email)) {
    const errors: FormErrors = { email: "Enter a valid email address." };
    return data({ errors, values: { email }, sent: false }, { status: 400 });
  }

  const limit = await limitAuthAttempt(env, request, "forgot-password", {
    window: 300,
    max: 5,
  });
  if (limit.blocked) {
    const errors: FormErrors = { form: limit.message };
    return data({ errors, values: { email }, sent: false }, { status: 429 });
  }

  const auth = buildAuth(env);
  try {
    await auth.api.requestPasswordReset({
      body: { email, redirectTo: "/reset-password" },
      headers: request.headers,
    });
  } catch (error) {
    const status = authErrorStatus(error);
    if (status === 429) {
      const errors: FormErrors = { form: "Too many attempts. Try again later." };
      return data({ errors, values: { email }, sent: false }, { status: 429 });
    }
    if (status >= 500) {
      console.error("[auth] password reset request failed:", error);
      const errors: FormErrors = {
        form: "Could not send reset email right now. Please try again.",
      };
      return data({ errors, values: { email }, sent: false }, { status: 500 });
    }
    // Swallow 4xx: telling the visitor whether the address exists would leak the
    // account list. The generic confirmation below is returned either way.
  }

  return { errors: {} as FormErrors, values: { email }, sent: true };
}

export default function ForgotPassword({ actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const submitting = isSubmittingTo(navigation, "/forgot-password");
  const errors = actionData?.errors ?? {};

  return (
    <AuthShell
      title="Reset your password"
      description="We'll email you a link to choose a new one."
      footer={
        <>
          Remembered it?{" "}
          <Link
            to="/login"
            prefetch="intent"
            className="text-primary underline-offset-4 hover:underline"
          >
            Back to log in
          </Link>
        </>
      }
    >
      {actionData?.sent ? (
        <Alert variant="success">
          If an account exists for that address, a reset link is on its way.
          Check your inbox — and your spam folder.
        </Alert>
      ) : (
        <>
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
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Sending…" : "Send reset link"}
            </Button>
          </Form>
        </>
      )}
    </AuthShell>
  );
}
