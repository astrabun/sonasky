/**
 * The public site directory: every featureable site in the pool, with its like
 * count (Constellation backlinks to the site record) and when it was last
 * linked from Bluesky. Rebuilt from the network like the ring directory and
 * cached for 10 minutes; like counts change more often, so they're cached
 * separately for a minute and dropped whenever someone likes or unlikes here.
 * Sorting and paging happen per request.
 */

import type { DirectorySite } from "../shared/dto.ts";
import { featureable } from "./discover.ts";
import { origin, type AppEnv } from "./env.ts";
import { likeCount } from "./likes.ts";
import { lastLinkedAt } from "./render/bsky.ts";
import { mapLimit } from "./rings.ts";
import { listSiteDids } from "./stats.ts";

const CACHE_SECONDS = 600;
const LIKES_CACHE_SECONDS = 60;
/** Sites checked per build; past this, the directory needs real storage. */
const MAX_SITES = 500;
const CONCURRENCY = 6;

type CachedSite = Omit<DirectorySite, "likes">;

async function directorySite(env: AppEnv, did: string): Promise<CachedSite | null> {
  const found = await featureable(env, did);
  if (!found) return null;
  const root = `${origin(env.PUBLIC_URL)}/@`;
  const urls = [...new Set([found.card.handle, did].filter((a): a is string => !!a))].map(
    (actor) => `${root}${actor}`,
  );
  const linked = await lastLinkedAt(urls);
  return {
    ...found.card,
    createdAt: found.record.createdAt,
    updatedAt: found.record.updatedAt,
    ...(linked ? { lastLinkedAt: linked } : {}),
  };
}

async function buildDirectory(env: AppEnv): Promise<CachedSite[]> {
  const dids = await listSiteDids();
  if (dids.length > MAX_SITES) {
    console.warn(`site directory: ${dids.length} sites, only checking ${MAX_SITES}`);
  }
  const sites = await mapLimit(dids.slice(0, MAX_SITES), CONCURRENCY, (did) =>
    directorySite(env, did).catch((err) => {
      console.warn("site directory: site failed", did, err);
      return null;
    }),
  );
  return sites.filter((s): s is CachedSite => s !== null);
}

async function cached<T>(key: string, seconds: number, build: () => Promise<T>): Promise<T> {
  const cacheKey = new Request(`https://apollo-internal.invalid/${key}`);
  const cache = caches.default;
  const hit = await cache.match(cacheKey);
  if (hit) return (await hit.json()) as T;
  const value = await build();
  await cache.put(
    cacheKey,
    new Response(JSON.stringify(value), {
      headers: { "content-type": "application/json", "cache-control": `max-age=${seconds}` },
    }),
  );
  return value;
}

const LIKES_KEY = "site-likes";

/** Like counts by DID for `dids`, cached for a minute. */
function likeCounts(dids: string[]): Promise<Record<string, number>> {
  return cached(LIKES_KEY, LIKES_CACHE_SECONDS, async () => {
    const counts = await mapLimit(dids, CONCURRENCY, likeCount);
    return Object.fromEntries(dids.map((did, i) => [did, counts[i]]));
  });
}

/** Drop cached like counts after a like/unlike so the ranking catches up sooner (this colo only). */
export async function forgetLikeCounts(): Promise<void> {
  await caches.default.delete(new Request(`https://apollo-internal.invalid/${LIKES_KEY}`));
}

/** Every featureable site with its like count. Throws if the relay is down. */
export async function siteDirectory(env: AppEnv): Promise<DirectorySite[]> {
  const sites = await cached("site-directory", CACHE_SECONDS, () => buildDirectory(env));
  const likes = await likeCounts(sites.map((s) => s.did));
  return sites.map((s) => ({ ...s, likes: likes[s.did] ?? 0 }));
}
