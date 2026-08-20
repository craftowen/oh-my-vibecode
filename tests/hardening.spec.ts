import { describe, it, expect, beforeAll } from "vitest";
import { env, SELF } from "cloudflare:test";
import { setupDb } from "./setup-db";

function loginAttempt(email: string, password: string, ip: string) {
  return SELF.fetch(
    new Request("http://localhost/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "CF-Connecting-IP": ip,
      },
      body: new URLSearchParams({ email, password }).toString(),
      redirect: "manual",
    }),
  );
}

describe("rate limiting", () => {
  beforeAll(async () => {
    await setupDb(env);
  });

  it("blocks password guessing after the window's allowance", async () => {
    const ip = "203.0.113.10";
    let last: Response | undefined;

    // The action allows 10 attempts per 5 minutes per IP.
    for (let attempt = 0; attempt < 11; attempt++) {
      last = await loginAttempt("victim@example.com", `guess-${attempt}`, ip);
    }

    expect(last!.status).toBe(429);
    expect(await last!.text()).toContain("Too many attempts");
  });

  it("counts per client address, so one attacker cannot lock out everyone", async () => {
    const ip = "203.0.113.11";
    for (let attempt = 0; attempt < 11; attempt++) {
      await loginAttempt("victim2@example.com", `guess-${attempt}`, ip);
    }

    // A different address still gets a normal (failed) login, not a 429.
    const other = await loginAttempt("victim2@example.com", "nope", "203.0.113.99");
    expect(other.status).toBe(400);
  });

  it("persists counters in D1 rather than isolate memory", async () => {
    await loginAttempt("counted@example.com", "nope", "203.0.113.20");
    const row = await env.DB.prepare(
      "SELECT count FROM rateLimit WHERE key = ?",
    )
      .bind("login:203.0.113.20")
      .first<{ count: number }>();

    expect(row?.count).toBe(1);
  });
});

describe("security headers", () => {
  beforeAll(async () => {
    await setupDb(env);
  });

  it("sets the baseline headers on HTML responses", async () => {
    const res = await SELF.fetch(new Request("http://localhost/"));

    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(res.headers.get("Permissions-Policy")).toContain("camera=()");
  });

  it("serves a nonce-based CSP whose nonce matches the rendered scripts", async () => {
    const res = await SELF.fetch(new Request("http://localhost/"));
    const csp = res.headers.get("Content-Security-Policy");

    // Only production builds carry the policy; vitest runs the production
    // bundle, so it must be here.
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");

    const nonce = csp?.match(/'nonce-([a-f0-9]+)'/)?.[1];
    expect(nonce).toBeTruthy();

    // If these two ever drift, every script on the page is blocked in prod.
    const html = await res.text();
    expect(html).toContain(`nonce="${nonce}"`);
  });

  it("gives each request its own nonce", async () => {
    const first = await SELF.fetch(new Request("http://localhost/"));
    const second = await SELF.fetch(new Request("http://localhost/"));

    expect(first.headers.get("Content-Security-Policy")).not.toBe(
      second.headers.get("Content-Security-Policy"),
    );
  });

  it("sets HSTS only over https", async () => {
    const insecure = await SELF.fetch(new Request("http://localhost/"));
    expect(insecure.headers.get("Strict-Transport-Security")).toBeNull();

    const secure = await SELF.fetch(new Request("https://localhost/"));
    expect(secure.headers.get("Strict-Transport-Security")).toContain(
      "max-age=31536000",
    );
  });
});
