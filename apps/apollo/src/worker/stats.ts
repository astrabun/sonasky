/**
 * The pool of Apollo sites: every repo the collection index knows has an
 * `app.sonasky.apollo` site record - no Apollo-side storage involved. Backs the
 * public site count and Discover.
 */

import type { StatsResponse } from "../shared/dto.ts";
import { NSID_SITE } from "../shared/nsid.ts";

/**
 * Lightrail drops repos whose records were deleted; the bsky.network relay's
 * index keeps them, so it's only a fallback.
 */
const INDEX_URLS = ["https://lightrail.microcosm.blue", "https://bsky.network"];
const PAGE_LIMIT = 2000;
/** Stop paging past this many pages; the pool is a nicety, not a ledger. */
const MAX_PAGES = 50;
const CACHE_SECONDS = 600;

/** DIDs of every repo with a record in `collection`. Throws if no index can be reached. */
export async function listReposWith(collection: string): Promise<string[]> {
  let lastErr: unknown;
  for (const base of INDEX_URLS) {
    try {
      return await listReposFrom(base, collection);
    } catch (err) {
      console.error(`listReposByCollection ${collection} via ${base} failed`, err);
      lastErr = err;
    }
  }
  throw lastErr;
}

async function listReposFrom(base: string, collection: string): Promise<string[]> {
  const dids: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL("/xrpc/com.atproto.sync.listReposByCollection", base);
    url.searchParams.set("collection", collection);
    url.searchParams.set("limit", String(PAGE_LIMIT));
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`listReposByCollection failed: ${res.status}`);
    const data = (await res.json()) as { cursor?: string; repos: { did: string }[] };
    for (const r of data.repos) dids.push(r.did);
    cursor = data.repos.length ? data.cursor : undefined;
    if (!cursor) break;
  }
  return dids;
}

/** DIDs with an Apollo site record. Cached for 10 minutes; throws if the relay can't be reached. */
export async function listSiteDids(): Promise<string[]> {
  const cacheKey = new Request("https://apollo-internal.invalid/site-dids");
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return (await cached.json()) as string[];

  const dids = await listReposWith(NSID_SITE);
  await cache.put(
    cacheKey,
    new Response(JSON.stringify(dids), {
      headers: { "content-type": "application/json", "cache-control": `max-age=${CACHE_SECONDS}` },
    }),
  );
  return dids;
}

/** `sites` is null when the relay couldn't be reached. */
export async function getStats(): Promise<StatsResponse> {
  try {
    return { sites: (await listSiteDids()).length };
  } catch (err) {
    console.error("stats error", err);
    return { sites: null };
  }
}
