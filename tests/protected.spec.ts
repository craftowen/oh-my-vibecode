import { describe, it, expect, beforeAll } from "vitest";
import { env, SELF } from "cloudflare:test";
import { setupDb } from "./setup-db";

describe("Protected Routes", () => {
  beforeAll(async () => {
    await setupDb(env);
  });

  it("redirects unauthenticated user to /login", async () => {
    const res = await SELF.fetch(new Request("http://localhost/dashboard", {
      redirect: "manual"
    }));
    
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login");
  });
});
