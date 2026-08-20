import { Link } from "react-router";
import { CheckCircle2, MailWarning } from "lucide-react";
import { AuthShell } from "../components/auth-shell";
import { Alert } from "../components/ui/alert";
import { buttonStyles } from "../components/ui/button";
import type { Route } from "./+types/verify-email";

export const meta: Route.MetaFunction = () => [
  { title: "Email verification · oh-my-vibecode" },
];

/**
 * Landing page for the link in the verification email. Better Auth verifies the
 * token at `/api/auth/verify-email` and then redirects here with the outcome,
 * so this route only reports what happened.
 */
export function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  return { error: url.searchParams.get("error") };
}

export default function VerifyEmail({ loaderData }: Route.ComponentProps) {
  const failed = Boolean(loaderData.error);

  return (
    <AuthShell
      title={failed ? "Verification failed" : "Email verified"}
      description={
        failed
          ? "The link may have expired or already been used."
          : "Thanks — your address is confirmed."
      }
    >
      <Alert variant={failed ? "destructive" : "success"}>
        <span className="flex items-center gap-2">
          {failed ? (
            <MailWarning className="size-4 shrink-0" aria-hidden />
          ) : (
            <CheckCircle2 className="size-4 shrink-0" aria-hidden />
          )}
          {failed
            ? "We could not verify this address."
            : "Your email address has been verified."}
        </span>
      </Alert>
      <Link
        to={failed ? "/settings" : "/dashboard"}
        prefetch="intent"
        className={buttonStyles({ className: "w-full" })}
      >
        {failed ? "Back to settings" : "Go to dashboard"}
      </Link>
    </AuthShell>
  );
}
