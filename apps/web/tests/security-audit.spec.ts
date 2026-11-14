import { describe, expect, it } from "vitest";
import { env, SELF } from "cloudflare:test";
import { buildAuth } from "../app/lib/auth.server";
import { clientIp } from "../app/lib/rate-limit.server";
import { field, safeRedirect } from "../app/lib/validation";
import { formPost, signUp } from "./helpers";

function from(ip: string) {
  return new Request("http://localhost/", { headers: { "CF-Connecting-IP": ip } });
}

describe("rate-limit client address", () => {
  // Regression: every IPv6 address got its own bucket, so rotating through the
  // /64 a single VPS is given made the login limiter unlimited.
  it("buckets IPv6 clients by their /64", () => {
    expect(clientIp(from("2001:db8:1:2:aaaa::1"))).toBe("2001:db8:1:2::/64");
    expect(clientIp(from("2001:DB8:1:2:bbbb:cccc:dddd:eeee"))).toBe("2001:db8:1:2::/64");
    expect(clientIp(from("2001:db8::1"))).toBe("2001:db8:0:0::/64");
    expect(clientIp(from("2001:db8:1:3::1"))).not.toBe(clientIp(from("2001:db8:1:2::1")));
  });

  it("keeps IPv4 and IPv4-mapped clients apart", () => {
    expect(clientIp(from("192.0.2.1"))).toBe("192.0.2.1");
    expect(clientIp(from("::ffff:192.0.2.1"))).toBe("192.0.2.1");
    expect(clientIp(from("::ffff:c000:0201"))).toBe("192.0.2.1");
    expect(clientIp(from("192.0.2.1:54321"))).toBe("192.0.2.1");
    expect(clientIp(from("[2001:db8:1:2::1]:443"))).toBe("2001:db8:1:2::/64");
    expect(clientIp(from("fe80::1%eth0"))).toBe("fe80:0:0:0::/64");
    expect(clientIp(from("::ffff:192.0.2.2"))).not.toBe(clientIp(from("::ffff:192.0.2.1")));
  });

  it("ignores spoofable X-Forwarded-For when CF-Connecting-IP is absent", () => {
    const req = new Request("http://localhost/", {
      headers: { "X-Forwarded-For": "198.51.100.10" },
    });
    expect(clientIp(req)).toBe("unknown");
  });

  it("blocks login guessing that rotates addresses inside one /64", async () => {
    let last: Response | undefined;
    for (let attempt = 0; attempt < 11; attempt++) {
      last = await SELF.fetch(formPost(
        "/login",
        { email: "ipv6-victim@example.com", password: `guess-${attempt}` },
        undefined,
        `2001:db8:77:1::${attempt + 1}`,
      ));
    }
    expect(last!.status).toBe(429);
  });
});

describe("auth configuration", () => {
  // Regression: a Worker deployed without the secret silently signed tokens
  // with Better Auth's public default, which lets anyone forge an
  // email-verification token and be auto-signed-in as its owner.
  it("refuses to build auth without BETTER_AUTH_SECRET", () => {
    expect(() => buildAuth({ ...env, BETTER_AUTH_SECRET: "" })).toThrow(
      /BETTER_AUTH_SECRET/,
    );
    expect(() => buildAuth({ ...env, BETTER_AUTH_URL: "" })).toThrow(
      /BETTER_AUTH_URL/,
    );
  });

  it("canonicalizes redirects and rejects File uploads in text fields", () => {
    expect(safeRedirect("/settings?tab=a#s")).toBe("/settings?tab=a#s");
    expect(safeRedirect("///evil.example.com")).toBe("/");
    expect(safeRedirect("/\\evil.example.com")).toBe("/");

    const form = new FormData();
    form.set("name", new File(["hi"], "avatar.txt", { type: "text/plain" }));
    expect(field(form, "name")).toBe("");
  });

  // Regression: the reset email was awaited inside the request, so a reset
  // for a real account took a delivery round-trip longer than one for an
  // unknown address.
  it("answers a reset request without waiting for the email to send", async () => {
    const email = "timing-audit@example.com";
    await signUp(email, "203.0.113.230");
    let release!: () => void;
    const sending = new Promise<void>((resolve) => (release = resolve));
    const auth = buildAuth({
      ...env,
      EMAIL: { send: () => sending } as unknown as SendEmail,
    });
    const answered = await Promise.race([
      auth.api
        .requestPasswordReset({ body: { email }, headers: new Headers() })
        .then(() => "answered"),
      new Promise((resolve) => setTimeout(() => resolve("waited"), 1_000)),
    ]);
    release();
    expect(answered).toBe("answered");
  });
});
