/**
 * The pool of Apollo sites: every repo the relay knows has an
 * `app.sonasky.apollo` site record - no Apollo-side storage involved. Backs the
 * public site count and Discover.
 */

import type { StatsResponse } from "../shared/dto.ts";
import { NSID_SITE } from "../shared/nsid.ts";

const RELAY_URL = "https://bsky.network";
const PAGE_LIMIT = 2000;
/** Stop paging past this many pages; the pool is a nicety, not a ledger. */
const MAX_PAGES = 50;
const CACHE_SECONDS = 600;

async function fetchSiteDids(): Promise<string[]> {
  const dids: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL("/xrpc/com.atproto.sync.listReposByCollection", RELAY_URL);
    url.searchParams.set("collection", NSID_SITE);
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

  const dids = await fetchSiteDids();
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
