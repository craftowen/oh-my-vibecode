/** Password floor. Must match Better Auth's `emailAndPassword.minPasswordLength`
 * (8 by default) so the client-side hint and the server-side rule agree. */
export const MIN_PASSWORD_LENGTH = 8;

/** Password ceiling. Must match Better Auth's `emailAndPassword.maxPasswordLength`
 * (128 by default) so scrypt cannot be abused with megabyte-sized payloads. */
export const MAX_PASSWORD_LENGTH = 128;

/** Display names are rendered inline in headings and nav — an unbounded one
 * pushes the rest of the page off screen. Enforced on the server AND as
 * `maxLength` on the input. */
export const MAX_NAME_LENGTH = 80;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Field name → message. Always annotate an action's error object with this:
 * without it TypeScript infers a different literal shape per branch and
 * `actionData.errors.email` stops type-checking in the component.
 */
export type FormErrors = Record<string, string>;

/** Reads a trimmed string field out of a submitted form (non-strings become ""). */
export function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** Reads an untrimmed string field (for passwords, where spaces are significant). */
export function rawField(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

/** Practical email sanity check before calling Better Auth or sending mail. */
export function isValidEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_RE.test(value);
}

/** Matches `navigation.formAction` pathname so `?query` params do not break pending states. */
export function isSubmittingTo(
  navigation: { state: string; formAction?: string },
  path: string,
): boolean {
  if (navigation.state === "idle" || !navigation.formAction) return false;
  try {
    return new URL(navigation.formAction, "http://localhost").pathname === path;
  } catch {
    return false;
  }
}

/**
 * Guards a user-supplied redirect target.
 *
 * A "starts with /" check is NOT enough: `//evil.example.com/x` also starts
 * with a slash, and browsers resolve that protocol-relative form as an absolute
 * URL on another origin — a working open redirect. Backslashes and `///` are
 * rejected by canonicalizing through `new URL` against a dummy origin.
 */
export function safeRedirect(to: unknown, fallback = "/"): string {
  if (typeof to !== "string" || to === "") return fallback;
  if (!to.startsWith("/") || to.startsWith("//") || to.startsWith("/\\")) {
    return fallback;
  }
  // URL parsers strip tabs/newlines before resolving the host.
  if (/[\u0000-\u001f\u007f\\]/.test(to)) return fallback;
  try {
    const parsed = new URL(to, "http://localhost");
    if (parsed.origin !== "http://localhost") return fallback;
    if (parsed.pathname.startsWith("//")) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
