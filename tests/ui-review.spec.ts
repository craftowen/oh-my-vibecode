import { expect, it } from "vitest";
import { env, SELF } from "cloudflare:test";
import { signUp } from "./helpers";

it("shows only the user's live devices and excludes expired sessions from dashboard totals", async () => {
  const cookies = [
    await signUp("devices-owner@example.com"),
    await signUp("devices-other@example.com"),
  ];
  await env.DB.prepare(
    "UPDATE session SET userAgent = 'Other account device' WHERE userId = (SELECT id FROM user WHERE email = ?)",
  ).bind("devices-other@example.com").run();
  await env.DB.prepare(
    `INSERT INTO session (id, token, userId, expiresAt, createdAt, updatedAt, userAgent)
     SELECT 'expired-device', 'expired-token', id, 1, 1, 1, 'Expired device'
     FROM user WHERE email = ?`,
  ).bind("devices-owner@example.com").run();

  const settings = await SELF.fetch("http://localhost/settings", { headers: { Cookie: cookies[0] } });
  expect(settings.status).toBe(200);
  const html = await settings.text();
  expect(html).toContain("This device");
  expect(html).not.toContain("Expired device");
  expect(html).not.toContain("Other account device");
  expect(html).not.toContain("expired-token");

  const dashboard = await SELF.fetch("http://localhost/dashboard", { headers: { Cookie: cookies[0] } });
  const stats = [...(await dashboard.text()).matchAll(/data-stat="\w+"[^>]*>(\d+)</g)];
  expect(stats.map((match) => Number(match[1]))).toEqual([2, 2]);
});
