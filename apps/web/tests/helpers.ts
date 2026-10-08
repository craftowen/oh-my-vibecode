import { expect } from "vitest";
import { SELF } from "cloudflare:test";

/**
 * A same-origin form POST, the way a browser submits it with JavaScript off.
 * `redirect: "manual"` keeps the 302 visible so specs can assert `Location`
 * and `Set-Cookie`. Pass `ip` to give a spec its own rate-limit bucket —
 * without it every request shares the `"unknown"` client address.
 */
export function formPost(
  path: string,
  fields: Record<string, string>,
  cookie?: string,
  ip?: string,
) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: "http://localhost",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(ip ? { "CF-Connecting-IP": ip } : {}),
    },
    body: new URLSearchParams(fields).toString(),
    redirect: "manual",
  });
}

/** Collects the cookie pairs from a response into a single Cookie header. */
export function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

/**
 * Signs up through the real form and returns the session cookie. Fails loudly
 * on anything but a redirect, so a broken signup does not surface later as a
 * confusing anonymous-user assertion.
 */
export async function signUp(email: string, ip?: string): Promise<string> {
  const response = await SELF.fetch(
    formPost(
      "/signup",
      { name: "Test Person", email, password: "password1234" },
      undefined,
      ip,
    ),
  );
  expect(response.status).toBe(302);
  return cookieHeader(response);
}
