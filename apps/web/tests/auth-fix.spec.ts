import { afterEach, describe, expect, it, vi } from "vitest";
import { env, SELF } from "cloudflare:test";
import { sendEmail } from "../app/lib/email.server";
import { formPost, signUp } from "./helpers";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("protected deep links", () => {
  // Regression: authMiddleware redirected to a bare /login, so signing in
  // after opening /settings always landed on /dashboard.
  it("sends an anonymous visitor to /login with the page as redirectTo", async () => {
    const response = await SELF.fetch(
      new Request("http://localhost/settings", { redirect: "manual" }),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/login?redirectTo=%2Fsettings");
  });

  it("names the page, not the .data request, on a client-side navigation", async () => {
    const response = await SELF.fetch(
      "http://localhost/settings.data?tab=a&_routes=routes%2Flayout%2Croutes%2Fsettings",
    );
    expect(await response.text()).toContain('"/login?redirectTo=%2Fsettings%3Ftab%3Da"');
  });

  it("carries a vetted redirectTo into the login form, never an unsafe one", async () => {
    const safe = await SELF.fetch("http://localhost/login?redirectTo=%2Fsettings");
    expect(await safe.text()).toContain('name="redirectTo" value="/settings"');

    const unsafe = await SELF.fetch(
      "http://localhost/login?redirectTo=%2F%2Fevil.example.com",
    );
    expect(await unsafe.text()).not.toContain('name="redirectTo"');
  });

  it("logs in to the page named by redirectTo", async () => {
    await signUp("deep-link@example.com", "10.9.1.1");
    const response = await SELF.fetch(
      formPost(
        "/login",
        {
          email: "deep-link@example.com",
          password: "password1234",
          redirectTo: "/settings",
        },
        undefined,
        "10.9.1.1",
      ),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/settings");
  });

  it("falls back to /dashboard for an off-site redirectTo", async () => {
    await signUp("deep-link-evil@example.com", "10.9.1.2");
    const response = await SELF.fetch(
      formPost(
        "/login",
        {
          email: "deep-link-evil@example.com",
          password: "password1234",
          redirectTo: "//evil.example.com",
        },
        undefined,
        "10.9.1.2",
      ),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/dashboard");
  });

  it("signs up to the page named by redirectTo", async () => {
    const response = await SELF.fetch(
      formPost(
        "/signup",
        {
          name: "Deep Link",
          email: "deep-link-signup@example.com",
          password: "password1234",
          redirectTo: "/settings",
        },
        undefined,
        "10.9.1.3",
      ),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/settings");
  });
});

describe("demo credentials", () => {
  // Regression: the deployed signup page pre-filled demo@example.com /
  // password1234, handing every visitor one shared account. Specs run the
  // production build, so this is what a deployed Worker renders.
  it("are not pre-filled in the production build", async () => {
    const html = await (await SELF.fetch("http://localhost/signup")).text();
    expect(html).not.toContain("password1234");
    expect(html).not.toContain("demo@example.com");
  });
});

describe("email without a binding", () => {
  // Regression: the no-binding fallback logged the whole message, so on a
  // deployed Worker every reset/verification link (a live bearer token)
  // landed in Workers Logs.
  it("logs only the recipient domain and subject outside local dev", async () => {
    vi.stubEnv("DEV", false);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const link = "https://app.example.com/reset-password/secret-token";

    await sendEmail({ ...env, EMAIL: undefined as unknown as SendEmail }, {
      to: "victim@example.com",
      subject: "Reset your password",
      text: `Reset your password: ${link}`,
    });

    expect(info).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledOnce();
    const logged = String(error.mock.calls[0]?.[0]);
    expect(logged).toContain("[email] EMAIL binding missing — message not sent");
    expect(logged).toContain("*@example.com");
    expect(logged).toContain("Reset your password");
    expect(logged).not.toContain("secret-token");
    expect(logged).not.toContain("victim");
  });
});
