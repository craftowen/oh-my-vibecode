import { describe, expect, it } from "vitest";
import { SELF } from "cloudflare:test";
import { formPost, signUp } from "./helpers";

describe("settings without JavaScript", () => {
  // Regression: a no-JS profile save rendered the pre-action session's name
  // and no confirmation, so a successful save looked like a failure.
  it("renders the new name and a confirmation after a form-post update", async () => {
    const cookie = await signUp("rename-nojs@example.com", "10.9.1.1");
    const response = await SELF.fetch(
      formPost("/settings", { intent: "update-profile", name: "New Name" }, cookie, "10.9.1.1"),
    );
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('value="New Name"');
    expect(html).not.toContain('value="Test Person"');
    expect(html).toContain("Profile updated.");
  });
});
