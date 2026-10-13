/**
 * Client-side screen-data cache — revisits, back/forward and prefetched clicks
 * render from memory with zero server round trips.
 *
 * Correctness rules this file keeps:
 * - Our own writes drop everything. The root `invalidateOnMutation`
 *   (clientMiddleware) clears before and after every non-GET submission (Form
 *   and fetcher) and bumps the generation, so action revalidation never reads
 *   the cache, and a response that left before the write but lands after it is
 *   not stored. Other tabs hear about it over a BroadcastChannel.
 * - Per user: keys carry the signed-in user id and a user change drops the whole
 *   cache. With no known user nothing is stored.
 * - Other people's writes: an entry older than FRESH_MS renders instantly, then
 *   the root revalidates in the background (stale-while-revalidate); focus
 *   return and a 60s poll revalidate the current screen too.
 *
 * Usage — leaf routes are keyed by URL:
 *   export const clientLoader = (args: Route.ClientLoaderArgs) => cachedClientLoader(args);
 * Parent routes (root, layout) are keyed by route id. Single fetch re-runs
 * parent loaders on every navigation, so parents must be cached too or a cache
 * hit still costs a request: `cachedClientLoader(args, "routes/layout")`.
 * The first (SSR) render keeps `hydrate` false, so the server HTML is used as
 * is and the root seeds its data into the cache (setClientCacheUser).
 */

/** Entries younger than this are used as is; older ones render, then revalidate. */
export const FRESH_MS = 15_000;
/** A screen's data is a few KB, so this stays well under a few MB. Least recently used goes first. */
const MAX_ENTRIES = 150;

interface Entry {
  /** Streamed promises are stored as their resolved values. */
  value: Record<string, unknown>;
  promiseKeys: string[];
  at: number;
}

const entries = new Map<string, Entry>();
let generation = 0;
let user: string | null = null;
/** While revalidating (focus, poll, SWR) the cache is skipped and the server answers. */
let bypass = 0;
/** A stale entry was rendered — the root revalidates once navigation settles. */
let refreshWanted = false;

const channel =
  typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("omv-client-cache");
channel?.addEventListener("message", () => clear());

const clearListeners = new Set<() => void>();

function clear() {
  entries.clear();
  inflight.clear();
  generation++;
  for (const listener of clearListeners) listener();
}

/**
 * Registers something to drop whenever the cache drops (own write, another
 * tab's write, user change) — data kept outside the cache must follow the same
 * rules or a stale value or another user's data survives.
 */
export function onClientCacheClear(listener: () => void) {
  clearListeners.add(listener);
}

/** Call after (or right before) changing data — clears this tab and every other tab. */
export function invalidateClientCache() {
  clear();
  channel?.postMessage("invalidate");
}

/** One route's data on screen — parents carry their route id as scope, the leaf none. */
export interface ScreenData {
  scope?: string;
  data: unknown;
}

/**
 * The root calls this with the protected layout's user id, or null outside it.
 * A different user drops the cache so no one sees another account's data.
 * `screen` is what is rendered at `url` right now, seeded under the new user:
 * the SSR data on first load, and the screen a JS sign-in landed on — it was
 * loaded while the user was still unknown, so nothing of it was stored and the
 * next navigation would refetch root and layout.
 */
export function setClientCacheUser(next: string | null, url = "", screen: ScreenData[] = []) {
  if (next === user) return;
  user = next;
  clear();
  for (const { scope, data } of screen) seedClientCache(url, scope, data);
}

/**
 * Whether the focus/poll revalidation may run. Signed out nothing is cached, so
 * it would only cost D1 reads; and revalidate() resets actionData, so a form's
 * error or confirmation would vanish when the user tabs back.
 */
export function canRefreshInBackground(actionData: unknown) {
  return user !== null && actionData == null;
}

/** Marks a request as a prefetch — it only fills the cache, and a failure resolves to null instead of an error page. */
export const PREFETCH_PARAM = "_prefetch";

const keyOf = (url: string, scope?: string) => {
  if (scope) return `${user}|#${scope}`;
  const { pathname, searchParams } = new URL(url, "http://x");
  searchParams.delete(PREFETCH_PARAM);
  const search = searchParams.toString();
  return `${user}|${pathname}${search ? `?${search}` : ""}`;
};

/** The event requestPrefetch dispatches — the root's ClientCacheSync listens and fills the cache. */
export const PREFETCH_EVENT = "omv:prefetch";

/** requestPrefetch payload — onlyMissing skips URLs with any entry, since a stale one still renders instantly. */
export interface PrefetchRequest {
  hrefs: string[];
  onlyMissing: boolean;
}

/**
 * Fetches these same-origin paths into the cache without waiting for hover.
 * Fresh entries are skipped. Pass onlyMissing from hot paths (e.g. scroll):
 * stale entries then wait for SWR when opened instead of refetching now.
 */
export function requestPrefetch(hrefs: string[], { onlyMissing = false } = {}) {
  if (hrefs.length) {
    window.dispatchEvent(
      new CustomEvent<PrefetchRequest>(PREFETCH_EVENT, { detail: { hrefs, onlyMissing } }),
    );
  }
}

/** Requests in flight — a click during a prefetch awaits the same response instead of fetching twice. */
const inflight = new Map<string, { gen: number; promise: Promise<unknown> }>();

const isThenable = (v: unknown): v is PromiseLike<unknown> =>
  typeof (v as PromiseLike<unknown> | null)?.then === "function";

/**
 * An already-settled promise. React's `use()` reads a thenable tagged with
 * status/value synchronously (the same contract `<Await>` relies on), so a
 * cache hit never flashes a skeleton for even one frame.
 */
function fulfilled<T>(value: T): Promise<T> {
  return Object.assign(Promise.resolve(value), { status: "fulfilled", value });
}

function revive(entry: Entry) {
  const value = { ...entry.value };
  for (const k of entry.promiseKeys) value[k] = fulfilled(value[k]);
  return value;
}

/** Hands the server response through untouched and stores it once every streamed value resolves. */
function store(key: string, data: unknown, gen: number) {
  if (!user || !data || typeof data !== "object" || Array.isArray(data)) return;
  const source = data as Record<string, unknown>;
  const promiseKeys = Object.keys(source).filter((k) => isThenable(source[k]));
  void Promise.all(promiseKeys.map((k) => source[k])).then(
    (resolved) => {
      if (gen !== generation) return; // A write or user change happened meanwhile — may be stale.
      const value = { ...source };
      promiseKeys.forEach((k, i) => (value[k] = resolved[i]));
      entries.delete(key);
      entries.set(key, { value, promiseKeys, at: Date.now() });
      while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!);
    },
    () => {}, // A failed panel is the screen's error to show — just don't cache it.
  );
}

/** Whether this URL has an entry (even stale) or a request in flight — then a click renders instantly. */
export function hasClientCache(url: string) {
  if (!user) return false;
  const key = keyOf(url);
  return entries.has(key) || inflight.get(key)?.gen === generation;
}

/** Whether this URL needs no fetch right now — its entry is within FRESH_MS or it is already in flight. */
export function hasFreshClientCache(url: string) {
  if (!user) return false;
  const key = keyOf(url);
  const entry = entries.get(key);
  return (!!entry && Date.now() - entry.at < FRESH_MS) || inflight.get(key)?.gen === generation;
}

/**
 * The body of a route's clientLoader. Returns the same shape as the server
 * loader (streamed values stay promises). Pass `scope` (the route id) for
 * parent routes, which are keyed by id instead of URL.
 */
export async function cachedClientLoader<T>(
  { request, serverLoader }: { request: Request; serverLoader: () => Promise<T> },
  scope?: string,
): Promise<T> {
  const key = keyOf(request.url, scope);
  if (new URL(request.url).searchParams.has(PREFETCH_PARAM)) {
    // Root's PrefetchData fetcher — swallow errors and redirects; a real click fetches properly.
    return load(key, serverLoader).catch(() => null as T);
  }
  const entry = user && !bypass ? entries.get(key) : undefined;
  if (entry) {
    entries.delete(key);
    entries.set(key, entry); // Refresh LRU order.
    if (Date.now() - entry.at >= FRESH_MS) refreshWanted = true;
    return revive(entry) as T;
  }
  const pending = bypass ? undefined : inflight.get(key);
  if (pending?.gen === generation) {
    const data = await pending.promise.catch(() => null);
    if (data) return data as T;
  }
  return load(key, serverLoader);
}

async function load<T>(key: string, serverLoader: () => Promise<T>): Promise<T> {
  const gen = generation;
  const promise = serverLoader();
  inflight.set(key, { gen, promise });
  try {
    const data = await promise;
    store(key, data, gen);
    return data;
  } finally {
    if (inflight.get(key)?.promise === promise) inflight.delete(key);
  }
}

/**
 * Seeds data already on screen, so the first navigation already skips the
 * parent loaders and Back is instant. Same key rules as cachedClientLoader;
 * an existing entry is left alone.
 */
function seedClientCache(url: string, scope: string | undefined, data: unknown) {
  const key = keyOf(url, scope);
  if (user && !entries.has(key)) store(key, data, generation);
}

/**
 * The root's clientMiddleware — clears before and after every non-GET
 * submission, whatever route it targets. Before: a prefetch finishing during
 * the action cannot store old data (generation bump). After: revalidation and
 * the next navigation fetch fresh from the server.
 */
export async function invalidateOnMutation<R>(
  { request }: { request: Request },
  next: () => Promise<R>,
) {
  if (request.method === "GET") return next();
  invalidateClientCache();
  try {
    return await next();
  } finally {
    invalidateClientCache();
  }
}

/** A revalidation that goes to the server — the cache is skipped only while revalidate() runs. */
export async function refreshFromServer(revalidate: () => Promise<void>) {
  refreshWanted = false;
  bypass++;
  try {
    await revalidate();
  } finally {
    bypass--;
  }
}

/** Whether a stale entry was just rendered — the root checks once navigation settles and revalidates. */
export function takeRefreshWanted() {
  const wanted = refreshWanted;
  refreshWanted = false;
  return wanted;
}
