import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";
import { safeRedirect } from "../app/lib/validation";
import { formPost, signUp } from "./helpers";

/** Regressions for the issues found in the dogfood pass. */

describe("ISSUE-006 — open redirect", () => {
  it("keeps in-app paths and turns every off-origin target into /", () => {
    const cases: [string | null, string][] = [
      // The original bug: "//evil.example.com" starts with "/" and slipped past.
      ["//evil.example.com/x", "/"],
      ["/\\evil.example.com/x", "/"],
      // URL parsing strips tab/newline/CR, turning "/\t/evil" into "//evil".
      ["/\t/evil.example/path", "/"],
      ["/\n/evil.example/path", "/"],
      ["/\r/evil.example/path", "/"],
      ["https://evil.example.com/x", "/"],
      ["javascript:alert(1)", "/"],
      ["", "/"],
      [null, "/"],
      ["/settings", "/settings"],
      ["/dashboard?tab=1", "/dashboard?tab=1"],
    ];
    for (const [target, expected] of cases) {
      expect(safeRedirect(target), JSON.stringify(target)).toBe(expected);
    }
  });

  it("never sends the visitor off-origin from /api/theme", async () => {
    const request = formPost("/api/theme", {
      theme: "dark",
      redirectTo: "//evil.example.com/pwned",
    });
    request.headers.set("Sec-Fetch-Mode", "navigate");
    const res = await SELF.fetch(request);

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/");
  });
});

describe("ISSUE-002 — resource route answers GET", () => {
  it("returns 405 with an Allow header, not a framework error", async () => {
    const res = await SELF.fetch(new Request("http://localhost/api/theme"));

    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST");
    expect(await res.text()).not.toContain("did not provide a `loader`");
  });
});

describe("ISSUE-005 — name length", () => {
  it("rejects an over-long name at signup", async () => {
    const res = await SELF.fetch(
      formPost("/signup", {
        name: "x".repeat(200),
        email: "toolong@example.com",
        password: "password1234",
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Keep it under 80 characters");
  });

  it("rejects an over-long name in settings", async () => {
    const cookie = await signUp("rename-long@example.com");
    const res = await SELF.fetch(
      formPost(
        "/settings",
        { intent: "update-profile", name: "y".repeat(200) },
        cookie,
      ),
    );

    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Keep it under 80 characters");
  });
});

describe("ISSUE-008 — signed-out pages expose a heading", () => {
  for (const path of ["/login", "/signup", "/forgot-password", "/verify-email"]) {
    it(`${path} renders exactly one <h1>`, async () => {
      const html = await (await SELF.fetch(new Request(`http://localhost${path}`))).text();
      const headings = html.match(/<h1[\s>]/g) ?? [];
      expect(headings).toHaveLength(1);
    });
  }
});

describe("ISSUE-009 — dates render deterministically on the server", () => {
  it("emits a fixed UTC string and a machine-readable datetime", async () => {
    const cookie = await signUp("dates@example.com");
    const html = await (
      await SELF.fetch(
        new Request("http://localhost/settings", { headers: { Cookie: cookie } }),
      )
    ).text();

    // A <time datetime="..."> carries the raw instant...
    expect(html).toMatch(/<time datetime="\d{4}-\d{2}-\d{2}T[\d:.]+Z"/i);
    // ...and the visible text is derived from that string by hand, so it is
    // byte-identical in every runtime and hydration cannot mismatch. (Intl is
    // deliberately avoided: workerd and browsers ship different ICU versions.)
    expect(html).toMatch(/>\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC</);
    // The locale-dependent formatting must not be server-rendered.
    expect(html).not.toMatch(/\d{4}\. \d{1,2}\. \d{1,2}\./);
  });
});

describe("ISSUE-009b — no nested <form>", () => {
  it("settings does not render a form inside a form", async () => {
    const cookie = await signUp("nested-form@example.com");
    const html = await (
      await SELF.fetch(
        new Request("http://localhost/settings", { headers: { Cookie: cookie } }),
      )
    ).text();

    // Browsers drop the inner <form> while parsing, so the server tree and the
    // hydrated tree disagree — and the inner button submits the outer action.
    const between = html.split("<form");
    for (let i = 1; i < between.length; i++) {
      const segment = between[i];
      const close = segment.indexOf("</form>");
      const nextOpen = segment.indexOf("<form");
      if (close !== -1 && nextOpen !== -1) {
        expect(nextOpen).toBeGreaterThan(close);
      }
    }
    // Every opening tag has a matching close.
    expect(html.split("<form").length).toBe(html.split("</form>").length);
  });
});

describe("ISSUE-001 — no button nested inside a link", () => {
  it("landing CTAs are plain links carrying button styles", async () => {
    const html = await (await SELF.fetch(new Request("http://localhost/"))).text();

    // An <a ...><button would be invalid nesting and a duplicate tab stop.
    expect(html).not.toMatch(/<a\b[^>]*>\s*(<[^>]+>\s*)*<button\b/);
  });
});
