/** Password floor. Must match Better Auth's `emailAndPassword.minPasswordLength`
 * (8 by default) so the client-side hint and the server-side rule agree. */
export const MIN_PASSWORD_LENGTH = 8;

/** Display names are rendered inline in headings and nav — an unbounded one
 * pushes the rest of the page off screen. Enforced on the server AND as
 * `maxLength` on the input. */
export const MAX_NAME_LENGTH = 80;

/**
 * Field name → message. Always annotate an action's error object with this:
 * without it TypeScript infers a different literal shape per branch and
 * `actionData.errors.email` stops type-checking in the component.
 */
export type FormErrors = Record<string, string>;

/** Reads a trimmed string field out of a submitted form. */
export function field(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}

/**
 * Guards a user-supplied redirect target.
 *
 * A "starts with /" check is NOT enough: `//evil.example.com/x` also starts
 * with a slash, and browsers resolve that protocol-relative form as an absolute
 * URL on another origin — a working open redirect. Backslashes are rejected for
 * the same reason (some browsers normalise `/\evil.com` to `//evil.com`).
 */
export function safeRedirect(to: unknown, fallback = "/"): string {
  if (typeof to !== "string" || to === "") return fallback;
  if (!to.startsWith("/")) return fallback;
  if (to.startsWith("//") || to.startsWith("/\\")) return fallback;
  return to;
}
