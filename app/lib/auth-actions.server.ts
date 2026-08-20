import { redirect } from "react-router";

/**
 * Better Auth's server API returns a Response when `asResponse: true`. Its
 * Set-Cookie headers carry the new session, so they must be copied onto our
 * redirect — otherwise the user is "signed in" with no cookie to prove it.
 */
export function redirectWithSession(from: Response, to: string): Response {
  const headers = new Headers();
  for (const cookie of from.headers.getSetCookie()) {
    headers.append("Set-Cookie", cookie);
  }
  return redirect(to, { headers });
}

/**
 * Only a 4xx carries a message meant for the person filling in the form. A 5xx
 * body is an internal failure — a D1 error, for instance, arrives as the raw
 * failing SQL plus its bound parameters. Never put that on screen: log it and
 * show the fallback.
 */
export async function responseErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  if (response.status >= 500) {
    console.error(
      `[auth] ${response.status} from Better Auth:`,
      await response.clone().text(),
    );
    return fallback;
  }
  try {
    const body = (await response.clone().json()) as { message?: string };
    return body.message || fallback;
  } catch {
    return fallback;
  }
}

/** Same rule for the throwing path: Better Auth raises APIError for things like
 * a duplicate email (4xx, safe to show) but a driver-level failure surfaces as
 * an ordinary Error with an internal message (never safe to show). */
export function authErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null) {
    const status =
      (error as { statusCode?: number }).statusCode ??
      (error as { status?: number }).status;
    const clientError = typeof status === "number" && status >= 400 && status < 500;

    if (clientError) {
      const body = (error as { body?: { message?: string } }).body;
      if (body?.message) return body.message;
      const message = (error as { message?: string }).message;
      if (message) return message;
    }
  }
  console.error("[auth] unexpected failure:", error);
  return fallback;
}
