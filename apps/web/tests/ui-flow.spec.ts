import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";
import { cookieHeader, formPost } from "./helpers";

/**
 * These exercise the routes the browser actually hits — the forms and the
 * logout button — rather than Better Auth's HTTP API directly. That gap is how
 * a broken logout endpoint and a bad useRouteLoaderData id both shipped green.
 */

const CREDENTIALS = {
  name: "Flow User",
  email: "flow@example.com",
  password: "password1234",
};

describe("UI auth flows", () => {
  it("sends an anonymous visitor from a protected page to /login", async () => {
    const res = await SELF.fetch(
      new Request("http://localhost/dashboard", { redirect: "manual" }),
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login");
  });

  it("signs up through the signup form and lands on the dashboard", async () => {
    const res = await SELF.fetch(formPost("/signup", CREDENTIALS));

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/dashboard");
    expect(cookieHeader(res)).toContain("better-auth");
  });

  it("rejects a short password with a field error instead of a redirect", async () => {
    const res = await SELF.fetch(
      formPost("/signup", {
        name: "Too Short",
        email: "short@example.com",
        password: "abc",
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.text()).toContain("at least 8 characters");
  });

  it("signs in through the login form", async () => {
    const res = await SELF.fetch(
      formPost("/login", {
        email: CREDENTIALS.email,
        password: CREDENTIALS.password,
      }),
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/dashboard");
    expect(cookieHeader(res)).toContain("better-auth");
  });

  it("shows an error (not a redirect) on a wrong password", async () => {
    const res = await SELF.fetch(
      formPost("/login", { email: CREDENTIALS.email, password: "wrong-password" }),
    );

    expect(res.status).toBe(400);
    expect(res.headers.get("location")).toBeNull();
  });

  it("renders the signed-in user's email on /settings", async () => {
    const login = await SELF.fetch(
      formPost("/login", {
        email: CREDENTIALS.email,
        password: CREDENTIALS.password,
      }),
    );
    const cookie = cookieHeader(login);

    const settings = await SELF.fetch(
      new Request("http://localhost/settings", { headers: { Cookie: cookie } }),
    );

    expect(settings.status).toBe(200);
    // Guards the class of bug where the layout's loader data is read with the
    // wrong route id and the profile silently renders blank.
    expect(await settings.text()).toContain(CREDENTIALS.email);
  });

  it("logs out through the header form and kills the session", async () => {
    const login = await SELF.fetch(
      formPost("/login", {
        email: CREDENTIALS.email,
        password: CREDENTIALS.password,
      }),
    );
    const cookie = cookieHeader(login);

    const logout = await SELF.fetch(formPost("/logout", {}, cookie));

    expect(logout.status).toBe(302);
    expect(logout.headers.get("location")).toBe("/login");

    // The original cookie must no longer resolve to a session.
    const session = await SELF.fetch(
      new Request("http://localhost/api/auth/get-session", {
        headers: { Cookie: cookie },
      }),
    );
    const body = await session.text();
    expect(body === "" || body === "null").toBe(true);

    // ...and the protected route bounces us.
    const dashboard = await SELF.fetch(
      new Request("http://localhost/dashboard", {
        headers: { Cookie: cookie },
        redirect: "manual",
      }),
    );
    expect(dashboard.status).toBe(302);
    expect(dashboard.headers.get("location")).toBe("/login");
  });
});

describe("theme", () => {
  it("server-renders the dark class from the theme cookie", async () => {
    const res = await SELF.fetch(
      new Request("http://localhost/", { headers: { Cookie: "theme=dark" } }),
    );
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toMatch(/<html[^>]*class="dark"/);
  });

  // The toggle skips revalidation and keeps the new theme from this echo, so
  // dropping the body would make the class flip back after every click.
  it("stores the choice as a cookie and echoes it to the fetcher", async () => {
    const res = await SELF.fetch(formPost("/api/theme", { theme: "dark" }));

    expect(res.status).toBe(200);
    expect(cookieHeader(res)).toContain("theme=dark");
    expect(await res.text()).toContain("dark");
  });
});

describe("Better Auth HTTP API", () => {
  // Social sign-in posts here from the browser; the kit's own forms never do,
  // so nothing else would notice if the /api/auth action stopped answering.
  it("serves its POST endpoints", async () => {
    const res = await SELF.fetch(
      new Request("http://localhost/api/auth/sign-up/email", {
        method: "POST",
        // No Origin on purpose: Better Auth only trusts BETTER_AUTH_URL, and a
        // non-browser client sends none.
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Api User",
          email: "api-auth@example.com",
          password: "password1234",
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(cookieHeader(res)).toContain("session_token");
  });
});
