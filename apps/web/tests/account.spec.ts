import { describe, it, expect } from "vitest";
import { env, SELF } from "cloudflare:test";
import { cookieHeader, formPost, signUp } from "./helpers";

/** Password reset, profile editing and session management — the flows a real
 * account needs beyond signing in. */

/** Better Auth stores the reset token as `reset-password:<token>`. */
async function latestResetToken(): Promise<string> {
  const row = await env.DB.prepare(
    "SELECT identifier FROM verification WHERE identifier LIKE 'reset-password:%' ORDER BY rowid DESC LIMIT 1",
  ).first<{ identifier: string }>();
  return row?.identifier.split(":")[1] ?? "";
}

describe("password reset", () => {
  it("answers the same way whether or not the address exists", async () => {
    const known = await SELF.fetch(
      formPost("/forgot-password", { email: "nobody@example.com" }),
    );
    expect(known.status).toBe(200);
    expect(await known.text()).toContain("If an account exists");
  });

  it("resets the password with the emailed token and revokes old sessions", async () => {
    const email = "reset-me@example.com";
    const oldCookie = await signUp(email);

    // The old session works right now...
    const before = await SELF.fetch(
      new Request("http://localhost/dashboard", {
        headers: { Cookie: oldCookie },
        redirect: "manual",
      }),
    );
    expect(before.status).toBe(200);

    await SELF.fetch(formPost("/forgot-password", { email }));
    const token = await latestResetToken();
    expect(token).not.toBe("");

    const reset = await SELF.fetch(
      formPost("/reset-password", {
        token,
        password: "brand-new-password",
        confirmPassword: "brand-new-password",
      }),
    );
    expect(reset.status).toBe(302);
    expect(reset.headers.get("location")).toBe("/login?reset=1");

    // ...and is dead afterwards, because revokeSessionsOnPasswordReset is on.
    const after = await SELF.fetch(
      new Request("http://localhost/dashboard", {
        headers: { Cookie: oldCookie },
        redirect: "manual",
      }),
    );
    expect(after.status).toBe(302);
    expect(after.headers.get("location")).toBe("/login");

    // The new password is the one that works now.
    const login = await SELF.fetch(
      formPost("/login", { email, password: "brand-new-password" }),
    );
    expect(login.headers.get("location")).toBe("/dashboard");
  });

  it("rejects mismatched confirmation before touching the token", async () => {
    const res = await SELF.fetch(
      formPost("/reset-password", {
        token: "irrelevant",
        password: "password1234",
        confirmPassword: "password4321",
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Passwords do not match");
  });

  it("shows an expired-link page when the token is missing", async () => {
    const res = await SELF.fetch(new Request("http://localhost/reset-password"));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("no longer valid");
  });
});

describe("settings actions", () => {
  it("updates the display name", async () => {
    const cookie = await signUp("rename@example.com");

    const res = await SELF.fetch(
      formPost("/settings", { intent: "update-profile", name: "Renamed" }, cookie),
    );
    expect(res.status).toBe(200);

    const page = await SELF.fetch(
      new Request("http://localhost/settings", { headers: { Cookie: cookie } }),
    );
    expect(await page.text()).toContain("Renamed");
  });

  it("rejects an empty name", async () => {
    const cookie = await signUp("empty-name@example.com");
    const res = await SELF.fetch(
      formPost("/settings", { intent: "update-profile", name: "  " }, cookie),
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Name is required");
  });

  it("revokes another device's session", async () => {
    const email = "two-devices@example.com";
    const first = await signUp(email);
    const secondRes = await SELF.fetch(
      formPost("/login", { email, password: "password1234" }),
    );
    const second = cookieHeader(secondRes);

    const tokenRow = await env.DB.prepare(
      "SELECT token FROM session JOIN user ON user.id = session.userId WHERE user.email = ? ORDER BY session.rowid ASC LIMIT 1",
    )
      .bind(email)
      .first<{ token: string }>();
    expect(tokenRow?.token).toBeTruthy();

    // Revoke the first device from the second device's session.
    const revoke = await SELF.fetch(
      formPost(
        "/settings",
        { intent: "revoke-session", token: tokenRow!.token },
        second,
      ),
    );
    expect(revoke.status).toBe(200);

    const firstNow = await SELF.fetch(
      new Request("http://localhost/dashboard", {
        headers: { Cookie: first },
        redirect: "manual",
      }),
    );
    expect(firstNow.status).toBe(302);
  });

  it("refuses an unknown intent", async () => {
    const cookie = await signUp("weird-intent@example.com");
    const res = await SELF.fetch(
      formPost("/settings", { intent: "drop-tables" }, cookie),
    );
    expect(res.status).toBe(400);
  });

  it("rejects empty or current-session revocation and skips resend when already verified", async () => {
    const email = "settings-guards@example.com";
    const cookie = await signUp(email);

    const emptyRevoke = await SELF.fetch(
      formPost("/settings", { intent: "revoke-session", token: "" }, cookie),
    );
    expect(emptyRevoke.status).toBe(400);
    expect(await emptyRevoke.text()).toContain("Session token is required");

    const row = await env.DB.prepare(
      'SELECT s.token AS token FROM session s JOIN "user" u ON u.id = s."userId" WHERE u.email = ? LIMIT 1',
    )
      .bind(email)
      .first<{ token: string }>();
    const selfRevoke = await SELF.fetch(
      formPost("/settings", { intent: "revoke-session", token: row!.token }, cookie),
    );
    expect(selfRevoke.status).toBe(400);
    expect(await selfRevoke.text()).toContain("Log out in the header");

    await env.DB.prepare('UPDATE "user" SET "emailVerified" = 1 WHERE email = ?')
      .bind(email)
      .run();
    const beforeCount = await env.DB.prepare(
      "SELECT count(*) AS n FROM verification",
    ).first<{ n: number }>();
    const resend = await SELF.fetch(
      formPost("/settings", { intent: "resend-verification" }, cookie),
    );
    expect(resend.status).toBe(200);
    expect(await resend.text()).toContain("already verified");
    const afterCount = await env.DB.prepare(
      "SELECT count(*) AS n FROM verification",
    ).first<{ n: number }>();
    expect(afterCount?.n).toBe(beforeCount?.n);
  });
});
