import { afterEach, describe, expect, it, vi } from "vitest";
import { env, SELF } from "cloudflare:test";
import { consumeRateLimit } from "../app/lib/rate-limit.server";
import { actionEmail, sendEmail } from "../app/lib/email.server";

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
  it("does not reject the auth flow when delivery throws", async () => {
    const mockEmail = {
      send: vi.fn().mockRejectedValue(new Error("Delivery failed")),
    } as unknown as SendEmail;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(sendEmail({ ...env, EMAIL: mockEmail }, {
      to: "delivery@example.com", subject: "Test", text: "Test",
    })).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("[email] delivery failed:", expect.any(Error));
    expect(mockEmail.send).toHaveBeenCalledOnce();
  });

  it("logs to console when EMAIL binding is not configured", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const envWithoutEmail = { ...env, EMAIL: undefined as unknown as SendEmail };
    await expect(sendEmail(envWithoutEmail, {
      to: "delivery@example.com", subject: "Test", text: "Test message",
    })).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("[email] (no EMAIL binding — not sent)"));
  });

  it("delivers email with expected payload when binding is present", async () => {
    const mockEmail = {
      send: vi.fn().mockResolvedValue({ messageId: "msg-123" }),
    } as unknown as SendEmail;
    await expect(sendEmail({ ...env, EMAIL: mockEmail, EMAIL_FROM: "custom@example.com" }, {
      to: "recipient@example.com", subject: "Hello", text: "World", html: "<p>World</p>",
    })).resolves.toBeUndefined();
    expect(mockEmail.send).toHaveBeenCalledWith({
      from: "custom@example.com",
      to: "recipient@example.com",
      subject: "Hello",
      text: "World",
      html: "<p>World</p>",
    });
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
  const csp = response.headers.get("Content-Security-Policy");
  // Only production builds carry the policy; vitest runs the production
  // bundle, so it must be here.
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  const nonce = csp?.match(/'nonce-([^']+)'/)?.[1];
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

  // Non-browser clients send no Origin; only a mismatched one is refused.
  it("admits a mutation that carries no Origin header", async () => {
    const response = await SELF.fetch("http://localhost/api/theme", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "theme=dark",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toContain("theme=dark");
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
