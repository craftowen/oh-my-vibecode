import { describe, it, expect, beforeAll } from "vitest";
import { env, SELF } from "cloudflare:test";
import { setupDb } from "./setup-db";

describe("Auth Flow", () => {
  beforeAll(async () => {
    await setupDb(env);
  });

  it("should create user and login", async () => {
    // 1. Sign up using Better Auth endpoint
    const signupRes = await SELF.fetch(new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "password123",
        name: "Test User"
      })
    }));
    
    expect(signupRes.status).toBe(200);
    const signupData: any = await signupRes.json();
    expect(signupData.user.email).toBe("test@example.com");

    const setCookie = signupRes.headers.get("set-cookie") || "";
    
    // 2. Check session endpoint
    const sessionRes = await SELF.fetch(new Request("http://localhost/api/auth/get-session", {
      headers: { "Cookie": setCookie }
    }));
    expect(sessionRes.status).toBe(200);
    const sessionData: any = await sessionRes.json();
    expect(sessionData.user.email).toBe("test@example.com");
  });
});
