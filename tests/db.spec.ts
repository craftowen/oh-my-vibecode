import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { setupDb } from "./setup-db";

describe("Database Migration", () => {
  beforeAll(async () => {
    await setupDb(env);
  });

  it("has the user table", async () => {
    const res = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user'").first();
    expect(res).toBeTruthy();
    expect(res?.name).toBe("user");
  });
});
