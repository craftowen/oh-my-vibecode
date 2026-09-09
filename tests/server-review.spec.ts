import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { env, SELF } from "cloudflare:test";
import { consumeRateLimit } from "../app/lib/rate-limit.server";
import { actionEmail, sendEmail } from "../app/lib/email.server";
import { setupDb } from "./setup-db";

beforeAll(() => setupDb(env));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("concurrent rate limits", () => {
  it("admits only the allowance when requests arrive together", async () => {
    const key = `concurrent:${crypto.randomUUID()}`;
    const results = await Promise.all(
      Array.from({ length: 24 }, () =>
        consumeRateLimit(env, key, { window: 60, max: 5 }),
      ),
    );
    expect(results.filter((result) => result.allowed)).toHaveLength(5);
    expect(results.filter((result) => !result.allowed).every((r) => r.retryAfter > 0)).toBe(true);
  });

  it("starts a fresh allowance at the exact window boundary", async () => {
    const key = `boundary:${crypto.randomUUID()}`;
    const now = Date.now();
    await env.DB.prepare(
      "INSERT INTO rateLimit (id, key, count, lastRequest) VALUES (?, ?, ?, ?)",
    ).bind(crypto.randomUUID(), key, 5, now - 60_000).run();
    vi.spyOn(Date, "now").mockReturnValue(now);
    expect(await consumeRateLimit(env, key, { window: 60, max: 5 })).toEqual({
      allowed: true,
      retryAfter: 0,
    });
    for (let attempt = 1; attempt < 5; attempt++) {
      expect((await consumeRateLimit(env, key, { window: 60, max: 5 })).allowed).toBe(true);
    }
    expect(await consumeRateLimit(env, key, { window: 60, max: 5 })).toEqual({
      allowed: false,
      retryAfter: 60,
    });
  });
});

describe("email delivery failures", () => {
  it("does not reject the auth flow when the network fails", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Network failed"));
    vi.stubGlobal("fetch", fetchMock);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(sendEmail({ ...env, RESEND_API_KEY: "test-only" }, {
      to: "delivery@example.com", subject: "Test", text: "Test",
    })).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("handles a provider failure without exposing its response body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("provider details", { status: 500 })));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(sendEmail({ ...env, RESEND_API_KEY: "test-only" }, {
      to: "delivery@example.com", subject: "Test", text: "Test",
    })).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("[email] delivery failed (500)");
  });

  it("keeps email copy and URL quotes from changing the HTML structure", () => {
    const html = actionEmail({
      heading: "<b>Verify</b>", body: "A & B", actionLabel: "Let's verify",
      url: 'https://example.com/verify?token=one&next=two" data-extra="injected',
    });
    expect(html).toContain("&lt;b&gt;Verify&lt;/b&gt;");
    expect(html).toContain("A &amp; B");
    expect(html).toContain("Let&#39;s verify");
    expect(html).toContain('href="https://example.com/verify?token=one&amp;next=two&quot; data-extra=&quot;injected"');
  });
});

it("gives every streamed inline script the response CSP nonce", async () => {
  const response = await SELF.fetch("http://localhost/");
  const nonce = response.headers.get("Content-Security-Policy")?.match(/'nonce-([^']+)'/)?.[1];
  expect(nonce).toBeTruthy();
  const html = await response.text();
  const scripts = [...html.matchAll(/<script\b([^>]*)>/g)];
  expect(scripts.length).toBeGreaterThan(0);
  for (const [, attributes] of scripts) {
    expect(attributes.match(/(?:^|\s)nonce="([^"]+)"/)?.[1]).toBe(nonce);
  }
});

describe("browser mutation origins", () => {
  it.each(["/signup", "/login", "/settings", "/logout", "/reset-password", "/forgot-password"])(
    "rejects cross-origin auth form submissions at %s", async (path) => {
      const response = await SELF.fetch(`http://localhost${path}`, {
        method: "POST",
        headers: { Origin: "https://other.example", "Content-Type": "application/x-www-form-urlencoded" },
        body: "email=test%40example.com&password=password1234",
        redirect: "manual",
      });
      expect(response.status).toBe(403);
      expect(response.headers.get("Set-Cookie")).toBeNull();
    },
  );

  it.each([
    ["Origin", "https://other.example"],
    ["Origin", "null"],
    ["Sec-Fetch-Site", "cross-site"],
  ])("rejects a cross-origin theme mutation: %s=%s", async (name, value) => {
    const response = await SELF.fetch("http://localhost/api/theme", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", [name]: value },
      body: "theme=dark",
    });
    expect(response.status).toBe(403);
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("preserves a same-origin plain form submission", async () => {
    const response = await SELF.fetch("http://localhost/api/theme", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "http://localhost",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
      },
      body: "theme=dark&redirectTo=%2Flogin",
      redirect: "manual",
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/login");
    expect(response.headers.get("Set-Cookie")).toContain("theme=dark");
  });
});
