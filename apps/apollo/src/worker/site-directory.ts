/**
 * The public site directory: every featureable site in the pool, with its like
 * count (Constellation backlinks to the site record) and when it was last
 * linked from Bluesky.
 *
 * Workers Free allows 50 subrequests per request (Cache API calls included),
 * and checking a site takes about a dozen, so the directory can't be rebuilt in
 * one go. Instead it's an index kept in the cache, and every request that reads
 * it refreshes a little: the stalest couple of sites in full, then like counts
 * with whatever budget is left. A cold index fills in over a few requests.
 * Nothing leaves Apollo's cache; the network stays the source of truth.
 */

import type { DirectorySite } from "../shared/dto.ts";
import { NSID_PAGE, NSID_SITE, SITE_RKEY } from "../shared/nsid.ts";
import type { PageRecord, SiteRecord } from "../shared/records.ts";
import { isSlug } from "../shared/slug.ts";
import { resolveActor } from "./atproto/identity.ts";
import { getPublicRecord, getRepoStatus } from "./atproto/repo.ts";
import { origin, type AppEnv } from "./env.ts";
import { likeCount, siteUri } from "./likes.ts";
import {
  activeLabelValues,
  bskyLabelsFor,
  HIDE_LABELS,
  isBlocked,
  WARN_LABELS,
  type LabelRow,
} from "./moderation.ts";
import { fetchProfiles, latestTime, linkCandidates, postTimes, safeAvatar } from "./render/bsky.ts";
import { mapLimit } from "./rings.ts";
import { listSiteDids } from "./stats.ts";

/** How long a site's full check stays fresh. */
const SITE_TTL_MS = 30 * 60_000;
/** How long a like count stays fresh. */
const LIKES_TTL_MS = 2 * 60_000;
/** After a failed check, try that site again this much sooner than SITE_TTL_MS. */
const RETRY_MS = 5 * 60_000;

/**
 * Subrequest budget for refresh work, leaving room under the 50-per-request
 * limit for reading the pool and reading/writing the index (at most 5).
 */
const WORK_BUDGET = 40;
/** Full checks per request. Each costs at most FULL_COST subrequests. */
const FULL_PER_REQUEST = 2;
/**
 * DID document (1), handle check (1, up to 3 with fallbacks), site + home page
 * records (2), repo status (1), likes (1), Bluesky link lookups (4).
 */
const FULL_COST = 13;
/** Shared by a round of full checks: profiles, labels, post times. */
const BATCH_COST = 3;
const CONCURRENCY = 6;
const INDEX_CACHE_SECONDS = 86_400;
const INDEX_KEY = new Request("https://apollo-internal.invalid/site-index-v1");

/** Labels that keep a site out of the directory: hidden, warned or adult/graphic. */
const EXCLUDE = new Set([...HIDE_LABELS, ...WARN_LABELS, "!warn"]);

type IndexedSite = Omit<DirectorySite, "likes">;

interface IndexEntry {
  /** null when the site can't be featured (no site, moderated, ...). */
  site: IndexedSite | null;
  checkedAt: number;
  likes: number;
  likesAt: number;
}

type SiteIndex = Record<string, IndexEntry>;

async function readIndex(): Promise<SiteIndex> {
  const hit = await caches.default.match(INDEX_KEY);
  return hit ? ((await hit.json()) as SiteIndex) : {};
}

async function writeIndex(index: SiteIndex): Promise<void> {
  await caches.default.put(
    INDEX_KEY,
    new Response(JSON.stringify(index), {
      headers: {
        "content-type": "application/json",
        "cache-control": `max-age=${INDEX_CACHE_SECONDS}`,
      },
    }),
  );
}

/** What one site's own checks found, before the batched profile/label/post lookups. */
interface Probe {
  did: string;
  handle?: string;
  site: SiteRecord;
  homeUri: string;
  selfLabels: string[];
  likes: number | null;
  linkCandidates: string[];
}

/** One site's per-site checks. Null when it can't be featured; throws when unsure. */
async function probe(env: AppEnv, did: string): Promise<Probe | null> {
  if (await isBlocked(env, did)) return null;
  const identity = await resolveActor(did, env.HANDLE_RESOLVER_URL ?? "https://bsky.social");
  if (!identity) return null;
  const site = await getPublicRecord<SiteRecord>(identity.pds, did, NSID_SITE, SITE_RKEY);
  if (site?.value?.$type !== NSID_SITE || !isSlug(site.value.homePage)) return null;
  const actor = identity.handle ?? did;
  const [home, status, likes, links] = await Promise.all([
    getPublicRecord<PageRecord>(identity.pds, did, NSID_PAGE, site.value.homePage),
    getRepoStatus(identity.pds, did),
    likeCount(did),
    // People share the handle URL; the DID form is rare enough to skip here.
    linkCandidates([`${origin(env.PUBLIC_URL)}/@${actor}`]),
  ]);
  if (home?.value?.$type !== NSID_PAGE || !status.active) return null;
  return {
    did,
    handle: identity.handle,
    site: site.value,
    homeUri: home.uri,
    selfLabels: [...(site.value.labels?.values ?? []), ...(home.value.labels?.values ?? [])].map(
      (l) => l.val,
    ),
    likes,
    linkCandidates: links,
  };
}

/** Full checks for `dids`. Sites missing from the result couldn't be checked this time. */
async function checkSites(env: AppEnv, dids: string[]): Promise<Map<string, IndexEntry>> {
  const out = new Map<string, IndexEntry>();
  const now = Date.now();
  const probes = await mapLimit(dids, CONCURRENCY, async (did) => {
    try {
      const p = await probe(env, did);
      if (!p) out.set(did, { site: null, checkedAt: now, likes: 0, likesAt: now });
      return p;
    } catch (err) {
      console.warn("site index: check failed", did, err);
      return null;
    }
  });
  const found = probes.filter((p): p is Probe => p !== null);
  if (found.length === 0) return out;

  const [profiles, labels, times] = await Promise.all([
    fetchProfiles(found.map((p) => p.did)),
    bskyLabelsFor(found.flatMap((p) => [p.did, siteUri(p.did), p.homeUri])).catch((err) => {
      // Fail open, as the viewer's moderation check does.
      console.warn("site index: queryLabels failed", err);
      return [] as LabelRow[];
    }),
    postTimes(found.flatMap((p) => p.linkCandidates)),
  ]);
  // Without profiles we can't tell taken-down accounts apart; try again later.
  if (!profiles) return out;

  for (const p of found) {
    const profile = profiles.get(p.did);
    const rows = [
      ...labels.filter((l) => l.uri === p.did || l.uri === siteUri(p.did) || l.uri === p.homeUri),
      ...((profile?.labels ?? []) as LabelRow[]),
    ];
    const values = [...activeLabelValues(rows), ...p.selfLabels];
    if (!profile || values.some((v) => EXCLUDE.has(v))) {
      out.set(p.did, { site: null, checkedAt: now, likes: 0, likesAt: now });
      continue;
    }
    const description = p.site.og?.description ?? p.site.description;
    const linked = latestTime(p.linkCandidates, times);
    out.set(p.did, {
      site: {
        did: p.did,
        handle: p.handle,
        url: `${origin(env.PUBLIC_URL)}/@${p.handle ?? p.did}`,
        title: p.site.og?.title || p.site.title,
        ...(description ? { description } : {}),
        ...(profile.displayName ? { displayName: profile.displayName } : {}),
        ...(safeAvatar(profile.avatar) ? { avatar: profile.avatar } : {}),
        createdAt: p.site.createdAt,
        updatedAt: p.site.updatedAt,
        ...(linked ? { lastLinkedAt: linked } : {}),
      },
      checkedAt: now,
      likes: p.likes ?? 0,
      // Unknown count: retry it with the next like refresh.
      likesAt: p.likes === null ? 0 : now,
    });
  }
  return out;
}

export interface SiteDirectory {
  sites: DirectorySite[];
  /** Sites in the pool that haven't been checked yet. */
  pending: number;
}

/**
 * Every featureable site checked so far, after spending this request's share
 * of refresh work. Throws if the relay is down and there's no pool.
 */
export async function siteDirectory(env: AppEnv): Promise<SiteDirectory> {
  const [pool, stored] = await Promise.all([listSiteDids(), readIndex()]);
  const index: SiteIndex = {};
  for (const did of pool) if (stored[did]) index[did] = stored[did];
  let changed = Object.keys(index).length !== Object.keys(stored).length;

  const now = Date.now();
  // Never-checked sites first, then the stalest.
  const stale = pool
    .filter((did) => !index[did] || now - index[did].checkedAt > SITE_TTL_MS)
    .sort((a, b) => (index[a]?.checkedAt ?? -1) - (index[b]?.checkedAt ?? -1))
    .slice(0, FULL_PER_REQUEST);

  if (stale.length > 0) {
    const checked = await checkSites(env, stale);
    for (const did of stale) {
      const entry = checked.get(did);
      if (entry) index[did] = entry;
      else if (index[did]) index[did].checkedAt = now - SITE_TTL_MS + RETRY_MS;
      else
        index[did] = { site: null, checkedAt: now - SITE_TTL_MS + RETRY_MS, likes: 0, likesAt: 0 };
    }
    changed = true;
  }

  const likesBudget = WORK_BUDGET - stale.length * FULL_COST - (stale.length ? BATCH_COST : 0);
  const staleLikes = Object.entries(index)
    .filter(([did, e]) => e.site && !stale.includes(did) && now - e.likesAt > LIKES_TTL_MS)
    .sort(([, a], [, b]) => a.likesAt - b.likesAt)
    .slice(0, Math.max(0, likesBudget))
    .map(([did]) => did);
  if (staleLikes.length > 0) {
    const counts = await mapLimit(staleLikes, CONCURRENCY, (did) => likeCount(did));
    staleLikes.forEach((did, i) => {
      // Keep the old count when Constellation couldn't be reached.
      const count = counts[i];
      if (count !== null) index[did].likes = count;
      index[did].likesAt = now;
    });
    changed = true;
  }

  if (changed) await writeIndex(index);
  return {
    sites: Object.values(index).flatMap((e) => (e.site ? [{ ...e.site, likes: e.likes }] : [])),
    pending: pool.filter((did) => !index[did]).length,
  };
}

/**
 * Reflect a like/unlike made through Apollo right away (this colo only), and
 * re-read the real count shortly after, once the backlink index has caught up.
 */
export async function noteLike(did: string, delta: 1 | -1): Promise<void> {
  const index = await readIndex();
  const entry = index[did];
  if (!entry?.site) return;
  entry.likes = Math.max(0, entry.likes + delta);
  entry.likesAt = Date.now() - LIKES_TTL_MS + 30_000;
  await writeIndex(index);
}
