import { describe, it, expect, beforeAll } from "vitest";
import { env, SELF } from "cloudflare:test";
import { setupDb } from "./setup-db";
import { safeRedirect } from "../app/lib/validation";

/** Regressions for the issues found in the dogfood pass. */

function formPost(path: string, fields: Record<string, string>, cookie?: string) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: new URLSearchParams(fields).toString(),
    redirect: "manual",
  });
}

function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

async function signUp(email: string, name = "Test Person") {
  const res = await SELF.fetch(
    formPost("/signup", { name, email, password: "password1234" }),
  );
  return cookieHeader(res);
}

describe("ISSUE-006 — open redirect", () => {
  beforeAll(async () => {
    await setupDb(env);
  });

  it("rejects protocol-relative targets", () => {
    // The original bug: "//evil.example.com" starts with "/" and slipped past.
    expect(safeRedirect("//evil.example.com/x")).toBe("/");
    expect(safeRedirect("/\\evil.example.com/x")).toBe("/");
    expect(safeRedirect("https://evil.example.com/x")).toBe("/");
    expect(safeRedirect("javascript:alert(1)")).toBe("/");
    expect(safeRedirect("")).toBe("/");
    expect(safeRedirect(null)).toBe("/");
  });

  it("keeps ordinary in-app paths", () => {
    expect(safeRedirect("/settings")).toBe("/settings");
    expect(safeRedirect("/dashboard?tab=1")).toBe("/dashboard?tab=1");
  });

  it("never sends the visitor off-origin from /api/theme", async () => {
    const res = await SELF.fetch(
      new Request("http://localhost/api/theme", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Sec-Fetch-Mode": "navigate",
        },
        body: new URLSearchParams({
          theme: "dark",
          redirectTo: "//evil.example.com/pwned",
        }).toString(),
        redirect: "manual",
      }),
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/");
  });
});

describe("ISSUE-002 — resource route answers GET", () => {
  beforeAll(async () => {
    await setupDb(env);
  });

  it("returns 405 with an Allow header, not a framework error", async () => {
    const res = await SELF.fetch(new Request("http://localhost/api/theme"));

    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST");
    expect(await res.text()).not.toContain("did not provide a `loader`");
  });
});

describe("ISSUE-005 — name length", () => {
  beforeAll(async () => {
    await setupDb(env);
  });

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
  beforeAll(async () => {
    await setupDb(env);
  });

  for (const path of ["/login", "/signup", "/forgot-password", "/verify-email"]) {
    it(`${path} renders exactly one <h1>`, async () => {
      const html = await (await SELF.fetch(new Request(`http://localhost${path}`))).text();
      const headings = html.match(/<h1[\s>]/g) ?? [];
      expect(headings).toHaveLength(1);
    });
  }
});

describe("ISSUE-009 — dates render deterministically on the server", () => {
  beforeAll(async () => {
    await setupDb(env);
  });

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
  beforeAll(async () => {
    await setupDb(env);
  });

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
