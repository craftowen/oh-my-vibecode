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
    const body = (await response.clone().json()) as unknown;
    if (
      typeof body === "object" &&
      body !== null &&
      "message" in body &&
      typeof body.message === "string" &&
      body.message.length > 0
    ) {
      return body.message;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

/** Extracts an HTTP status from a thrown Better Auth error when available. */
export function authErrorStatus(error: unknown): number {
  if (typeof error === "object" && error !== null) {
    const status =
      (error as { statusCode?: unknown }).statusCode ??
      (error as { status?: unknown }).status;
    if (typeof status === "number" && status >= 400 && status < 500) {
      return status;
    }
  }
  return 500;
}

/** Same rule for the throwing path: Better Auth raises APIError for things like
 * a duplicate email (4xx, safe to show) but a driver-level failure surfaces as
 * an ordinary Error with an internal message (never safe to show). */
export function authErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null) {
    const status = authErrorStatus(error);
    if (status >= 400 && status < 500) {
      const body = (error as { body?: unknown }).body;
      if (
        typeof body === "object" &&
        body !== null &&
        "message" in body &&
        typeof body.message === "string" &&
        body.message.length > 0
      ) {
        return body.message;
      }
      const message = (error as { message?: unknown }).message;
      if (typeof message === "string" && message.length > 0) return message;
    }
  }
  console.error("[auth] unexpected failure:", error);
  return fallback;
}

/**
 * Runs an `asResponse: true` Better Auth call and folds both ways it can fail
 * into one safe message and status: a rejected credential comes back as a non-OK
 * Response, while some failures (a duplicate email, a driver error) still
 * throw. Checking only one of the two is the bug this exists to prevent.
 */
export async function callAuth(
  run: () => Promise<Response>,
  fallback: string,
): Promise<{ response: Response } | { error: string; status: number }> {
  try {
    const response = await run();
    if (response.ok) return { response };
    return {
      error: await responseErrorMessage(response, fallback),
      status: response.status >= 400 && response.status < 600 ? response.status : 500,
    };
  } catch (error) {
    return {
      error: authErrorMessage(error, fallback),
      status: authErrorStatus(error),
    };
  }
}
