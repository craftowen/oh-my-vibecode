import { describe, expect, it } from "vitest";
import { env, SELF } from "cloudflare:test";
import { formPost, signUp } from "./helpers";

// Its own client address keeps this file's signups out of the shared
// "unknown" rate-limit bucket.
const IP = "203.0.113.180";

describe("auth review regressions", () => {
  it("limits verification resend forms and derives the recipient from the session", async () => {
    const cookie = await signUp("auth-review-resend@example.com", IP);
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await SELF.fetch(formPost("/settings", {
        intent: "resend-verification",
        email: "tampered@example.com",
      }, cookie, IP));
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("Verification email sent.");
    }
    const blocked = await SELF.fetch(formPost("/settings", {
      intent: "resend-verification",
    }, cookie, IP));
    expect(blocked.status).toBe(429);
    expect(await blocked.text()).toContain("Too many attempts");
  });

  it("does not report verification success for anonymous or unverified visitors", async () => {
    const anonymous = await SELF.fetch(new Request("http://localhost/verify-email"));
    expect(await anonymous.text()).toContain("We could not verify this address.");

    const cookie = await signUp("auth-review-unverified@example.com", IP);
    const unverified = await SELF.fetch(new Request("http://localhost/verify-email", {
      headers: { Cookie: cookie },
    }));
    expect(await unverified.text()).toContain("We could not verify this address.");
  });

  it("reports verified session state while retaining explicit callback failures", async () => {
    const email = "auth-review-verified@example.com";
    const cookie = await signUp(email, IP);
    await env.DB.prepare("UPDATE user SET emailVerified = 1 WHERE email = ?").bind(email).run();
    const verified = await SELF.fetch(new Request("http://localhost/verify-email", {
      headers: { Cookie: cookie },
    }));
    expect(await verified.text()).toContain("Your email address has been verified.");

    const failed = await SELF.fetch(new Request("http://localhost/verify-email?error=", {
      headers: { Cookie: cookie },
    }));
    expect(await failed.text()).toContain("We could not verify this address.");
  });

  for (const path of ["/settings", "/login", "/signup", "/verify-email"]) {
    it(`forwards refreshed session cookies from ${path}`, async () => {
      const email = `auth-review-refresh-${path.slice(1)}@example.com`;
      const cookie = await signUp(email, IP);
      // Default sessions last seven days and refresh after one day. Put the
      // session inside its refresh window without relying on fake timers.
      const expiresAt = Math.floor(Date.now() / 1000) + 5 * 24 * 60 * 60;
      await env.DB.prepare(
        "UPDATE session SET expiresAt = ? WHERE userId = (SELECT id FROM user WHERE email = ?)",
      ).bind(expiresAt, email).run();

      const response = await SELF.fetch(new Request(`http://localhost${path}`, {
        headers: { Cookie: cookie },
        redirect: "manual",
      }));
      expect(response.status).toBe(path === "/login" || path === "/signup" ? 302 : 200);
      expect(response.headers.getSetCookie().some((value) =>
        value.startsWith("better-auth.session_token=") && /Max-Age=[1-9]/i.test(value),
      )).toBe(true);
      const row = await env.DB.prepare(
        "SELECT expiresAt FROM session WHERE userId = (SELECT id FROM user WHERE email = ?)",
      ).bind(email).first<{ expiresAt: number }>();
      expect(row!.expiresAt).toBeGreaterThan(expiresAt);
      await response.text();
    });
  }
});
