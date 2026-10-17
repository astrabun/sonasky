/**
 * Public usage stats. The site count is every repo the relay knows has an
 * `app.sonasky.apollo` site record - no Apollo-side storage involved.
 */

import type { StatsResponse } from "../shared/dto.ts";
import { NSID_SITE } from "../shared/nsid.ts";

const RELAY_URL = "https://bsky.network";
const PAGE_LIMIT = 2000;
/** Stop paging past this many pages; the count is a nicety, not a ledger. */
const MAX_PAGES = 50;
const CACHE_SECONDS = 600;

async function countSites(): Promise<number> {
  let count = 0;
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL("/xrpc/com.atproto.sync.listReposByCollection", RELAY_URL);
    url.searchParams.set("collection", NSID_SITE);
    url.searchParams.set("limit", String(PAGE_LIMIT));
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`listReposByCollection failed: ${res.status}`);
    const data = (await res.json()) as { cursor?: string; repos: { did: string }[] };
    count += data.repos.length;
    cursor = data.repos.length ? data.cursor : undefined;
    if (!cursor) break;
  }
  return count;
}

/** Cached for 10 minutes. `sites` is null when the relay couldn't be reached. */
export async function getStats(): Promise<StatsResponse> {
  const cacheKey = new Request("https://apollo-internal.invalid/stats");
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return (await cached.json()) as StatsResponse;

  let stats: StatsResponse;
  try {
    stats = { sites: await countSites() };
  } catch (err) {
    console.error("stats error", err);
    return { sites: null };
  }
  await cache.put(
    cacheKey,
    new Response(JSON.stringify(stats), {
      headers: { "content-type": "application/json", "cache-control": `max-age=${CACHE_SECONDS}` },
    }),
  );
  return stats;
}
