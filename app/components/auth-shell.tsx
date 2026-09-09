import { Link } from "react-router";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";

interface AuthShellProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/** Shared frame for the signed-out pages (login, signup, password reset) so
 * they stay visually identical as you add more of them. */
export function AuthShell({
  title,
  description,
  children,
  footer,
}: AuthShellProps) {
  return (
    <main
      id="main"
      tabIndex={-1}
      className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-12"
    >
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <Link to="/" prefetch="intent" className="text-lg font-semibold tracking-tight">
            oh-my-vibecode
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle as="h1" className="text-xl">
              {title}
            </CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-4">{children}</CardContent>
        </Card>

        {footer && (
          <p className="text-center text-sm text-muted-foreground">{footer}</p>
        )}
      </div>
    </main>
  );
}
