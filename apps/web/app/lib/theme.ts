export type Theme = "light" | "dark";

export const THEME_COOKIE = "theme";

/** Reads the theme cookie off a request. Returns null when the visitor has
 * never chosen — the client then follows the OS `prefers-color-scheme`. */
export function getTheme(request: Request): Theme | null {
  const cookie = request.headers.get("Cookie");
  if (!cookie) return null;
  const match = cookie.match(/(?:^|;\s*)theme=(light|dark)(?:;|$)/);
  return (match?.[1] as Theme) ?? null;
}

export function serializeTheme(theme: Theme): string {
  // 1 year, lax — a theme preference is not a security boundary.
  return `${THEME_COOKIE}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
