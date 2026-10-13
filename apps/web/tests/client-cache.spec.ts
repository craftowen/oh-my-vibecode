import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cachedClientLoader,
  canRefreshInBackground,
  invalidateClientCache,
  invalidateOnMutation,
  setClientCacheUser,
} from "../app/lib/client-cache";

const DASHBOARD_URL = "http://localhost/dashboard";

/** Entries are stored after streamed values resolve, a microtask later. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function args(url = DASHBOARD_URL, data: unknown = { n: 1 }) {
  const serverLoader = vi.fn(async () => data);
  return { request: new Request(url), serverLoader };
}

/** Loads once through a fresh serverLoader and waits for the entry to land. */
async function prime(url = DASHBOARD_URL, scope?: string) {
  await cachedClientLoader(args(url), scope);
  await settle();
}

describe("client cache", () => {
  beforeEach(() => {
    setClientCacheUser(null);
    setClientCacheUser("user-1");
  });

  it("serves a hit without calling the server loader", async () => {
    await prime();
    const second = args();
    expect(await cachedClientLoader(second)).toEqual({ n: 1 });
    expect(second.serverLoader).not.toHaveBeenCalled();
  });

  it("never stores anything without a signed-in user", async () => {
    setClientCacheUser(null);
    await prime();
    const second = args();
    await cachedClientLoader(second);
    expect(second.serverLoader).toHaveBeenCalledOnce();
  });

  it("empties on invalidate and on a user change", async () => {
    await prime();
    invalidateClientCache();
    const afterInvalidate = args();
    await cachedClientLoader(afterInvalidate);
    expect(afterInvalidate.serverLoader).toHaveBeenCalledOnce();

    await settle();
    setClientCacheUser("user-2");
    const afterSwitch = args();
    await cachedClientLoader(afterSwitch);
    expect(afterSwitch.serverLoader).toHaveBeenCalledOnce();
  });

  it("drops a response that started before an invalidate", async () => {
    let resolve!: (value: unknown) => void;
    const slow = {
      request: new Request(DASHBOARD_URL),
      serverLoader: () => new Promise((r) => (resolve = r)),
    };
    const pending = cachedClientLoader(slow);
    invalidateClientCache();
    resolve({ n: "old" });
    await pending;
    await settle();

    const next = args();
    await cachedClientLoader(next);
    expect(next.serverLoader).toHaveBeenCalledOnce();
  });

  it("keeps scope keys apart from URL keys", async () => {
    await prime(DASHBOARD_URL, "routes/layout");
    const leaf = args();
    await cachedClientLoader(leaf);
    expect(leaf.serverLoader).toHaveBeenCalledOnce();

    // A scoped entry is shared across URLs — that is what parents rely on.
    const parentElsewhere = args("http://localhost/settings");
    await cachedClientLoader(parentElsewhere, "routes/layout");
    expect(parentElsewhere.serverLoader).not.toHaveBeenCalled();
  });

  it("replays streamed promises as already-fulfilled thenables", async () => {
    await cachedClientLoader(args(DASHBOARD_URL, { stats: Promise.resolve(7) }));
    await settle();
    const hit = (await cachedClientLoader(args())) as { stats: Promise<number> };
    expect(hit.stats).toMatchObject({ status: "fulfilled", value: 7 });
    expect(await hit.stats).toBe(7);
  });

  it("swallows a failing server loader to null on a prefetch", async () => {
    const failing = {
      request: new Request(`${DASHBOARD_URL}?_prefetch=1`),
      serverLoader: () => Promise.reject(new Error("redirect")),
    };
    expect(await cachedClientLoader(failing)).toBeNull();
  });

  it("passes GET through untouched and clears on POST", async () => {
    await prime();
    const next = vi.fn(async () => "done");

    await invalidateOnMutation({ request: new Request(DASHBOARD_URL) }, next);
    const afterGet = args();
    await cachedClientLoader(afterGet);
    expect(afterGet.serverLoader).not.toHaveBeenCalled();

    await invalidateOnMutation({ request: new Request(DASHBOARD_URL, { method: "POST" }) }, next);
    const afterPost = args();
    await cachedClientLoader(afterPost);
    expect(afterPost.serverLoader).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledTimes(2);
  });

  // Regression: after a JS sign-in the landing screen loaded while the user was
  // still unknown, so nothing was stored and the next click refetched root and layout.
  it("seeds the screen on screen when the user becomes known", async () => {
    setClientCacheUser(null);
    setClientCacheUser("user-2", "/dashboard", [
      { scope: "routes/layout", data: { user: { id: "user-2" } } },
      { data: { n: 2 } },
    ]);
    await settle();

    const layout = args("http://localhost/settings");
    await cachedClientLoader(layout, "routes/layout");
    expect(layout.serverLoader).not.toHaveBeenCalled();
    const leaf = args();
    expect(await cachedClientLoader(leaf)).toEqual({ n: 2 });
    expect(leaf.serverLoader).not.toHaveBeenCalled();
  });

  // Regression: the focus/60s revalidation reset actionData, so a login error or
  // a settings form error disappeared when the user tabbed back.
  it("allows background refresh only signed in and with no form result on screen", () => {
    expect(canRefreshInBackground(undefined)).toBe(true);
    expect(canRefreshInBackground({ errors: { name: "Name is required." } })).toBe(false);
    setClientCacheUser(null);
    expect(canRefreshInBackground(undefined)).toBe(false);
  });
});
