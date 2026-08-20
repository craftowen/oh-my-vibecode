import { describe, it, expect, beforeAll } from "vitest";
import { env, SELF } from "cloudflare:test";
import { setupDb } from "./setup-db";

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

function formPost(path: string, fields: Record<string, string>) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
    redirect: "manual",
  });
}

/** Collects the cookie pairs from a response into a single Cookie header. */
function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

describe("UI auth flows", () => {
  beforeAll(async () => {
    await setupDb(env);
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

    const logout = await SELF.fetch(
      new Request("http://localhost/logout", {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded" },
        body: "",
        redirect: "manual",
      }),
    );

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
  beforeAll(async () => {
    await setupDb(env);
  });

  it("server-renders the dark class from the theme cookie", async () => {
    const res = await SELF.fetch(
      new Request("http://localhost/", { headers: { Cookie: "theme=dark" } }),
    );
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toMatch(/<html[^>]*class="dark"/);
  });

  it("stores the theme choice as a cookie", async () => {
    const res = await SELF.fetch(formPost("/api/theme", { theme: "dark" }));

    expect(cookieHeader(res)).toContain("theme=dark");
  });
});
