/**
 * Rings (webrings). A ring record lives in its owner's repo and lists the
 * sites invited to it; each member accepts by writing a `ringMember` record
 * pointing back at the ring. Only when both exist (and the member has a site)
 * is the site part of the ring. Nothing is stored on Apollo's side - the
 * roster is rebuilt from the repos and cached briefly.
 */

import type { RingRef } from "../shared/dto.ts";
import { LIMITS } from "../shared/limits.ts";
import { NSID_RING, NSID_RING_MEMBER, NSID_SITE, SITE_RKEY } from "../shared/nsid.ts";
import { pickRandom } from "../shared/random.ts";
import type { RingMemberRecord, RingRecord, SiteRecord } from "../shared/records.ts";
import { isSlug } from "../shared/slug.ts";
import { resolveActor, type ResolvedIdentity } from "./atproto/identity.ts";
import { hashRkey } from "./atproto/rkey.ts";
import { getPublicRecord, listPublicRecords, type RecordEntry } from "./atproto/repo.ts";
import { origin, type AppEnv } from "./env.ts";
import { checkModeration, isBlocked } from "./moderation.ts";
import { fetchProfileCard, safeAvatar } from "./render/bsky.ts";
import { parseRingUri } from "./validate/records.ts";

const CONSTELLATION_URL = "https://constellation.microcosm.blue";
const ROSTER_CACHE_SECONDS = 300;
/** Parallel member checks while building a roster. */
const CONCURRENCY = 6;

export function ringUri(ownerDid: string, slug: string): string {
  return `at://${ownerDid}/${NSID_RING}/${slug}`;
}

/**
 * rkey of a member's `ringMember` record for a ring. Deterministic, so
 * checking a membership is one getRecord.
 */
export const membershipRkey = hashRkey;

function resolver(env: AppEnv): string {
  return env.HANDLE_RESOLVER_URL ?? "https://bsky.social";
}

/** Viewer URL of a ring's index page. */
export function ringPageUrl(env: AppEnv, ownerActor: string, slug: string): string {
  return `${origin(env.PUBLIC_URL)}/@${ownerActor}/ring/${slug}`;
}

export function isRing(value: unknown): value is RingRecord {
  const v = value as Partial<RingRecord> | null;
  return (
    typeof v === "object" &&
    v !== null &&
    v.$type === NSID_RING &&
    typeof v.name === "string" &&
    Array.isArray(v.members)
  );
}

/** Member DIDs in ring order, ignoring malformed entries (records can come from any client). */
export function memberDids(ring: RingRecord): string[] {
  const out: string[] = [];
  for (const m of ring.members.slice(0, LIMITS.ringMembers)) {
    if (m && typeof m.did === "string" && !out.includes(m.did)) out.push(m.did);
  }
  return out;
}

export interface LoadedRing {
  owner: ResolvedIdentity;
  slug: string;
  uri: string;
  entry: RecordEntry<RingRecord>;
}

/** The ring record, or null when the owner or ring doesn't exist. */
export async function loadRing(
  env: AppEnv,
  ownerDid: string,
  slug: string,
  owner?: ResolvedIdentity,
): Promise<LoadedRing | null> {
  if (!isSlug(slug)) return null;
  const identity = owner ?? (await resolveActor(ownerDid, resolver(env)));
  if (!identity) return null;
  const entry = await getPublicRecord<RingRecord>(identity.pds, identity.did, NSID_RING, slug);
  if (!entry || !isRing(entry.value)) return null;
  return { owner: identity, slug, uri: ringUri(identity.did, slug), entry };
}

/** Has `did` accepted the ring at `uri`? */
export async function hasAccepted(pds: string, did: string, uri: string): Promise<boolean> {
  const rec = await getPublicRecord<RingMemberRecord>(
    pds,
    did,
    NSID_RING_MEMBER,
    await membershipRkey(uri),
  );
  return rec?.value?.$type === NSID_RING_MEMBER && rec.value.ring === uri;
}

export interface RosterMember {
  did: string;
  handle?: string;
  title: string;
  description?: string;
  /** Viewer URL of the member's site. */
  url: string;
  displayName?: string;
  avatar?: string;
}

export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** One member, if it has accepted, has a site and isn't blocked or taken down. */
async function rosterMember(env: AppEnv, uri: string, did: string): Promise<RosterMember | null> {
  try {
    if (await isBlocked(env, did)) return null;
    const identity = await resolveActor(did, resolver(env));
    if (!identity) return null;
    const [accepted, site] = await Promise.all([
      hasAccepted(identity.pds, did, uri),
      getPublicRecord<SiteRecord>(identity.pds, did, NSID_SITE, SITE_RKEY),
    ]);
    if (!accepted || site?.value?.$type !== NSID_SITE) return null;
    const verdict = await checkModeration(
      env,
      did,
      identity.pds,
      (site.value.labels?.values ?? []).map((l) => l.val),
    );
    if (verdict.kind === "unavailable") return null;
    const profile = await fetchProfileCard(did).catch(() => null);
    const description = site.value.og?.description ?? site.value.description;
    return {
      did,
      handle: identity.handle,
      title: (site.value.og?.title || site.value.title || identity.handle) ?? did,
      ...(description ? { description } : {}),
      url: `${origin(env.PUBLIC_URL)}/@${identity.handle ?? did}`,
      ...(profile?.profile.displayName ? { displayName: profile.profile.displayName } : {}),
      ...(safeAvatar(profile?.profile.avatar) ? { avatar: profile?.profile.avatar } : {}),
    };
  } catch (err) {
    console.warn("ring member check failed", did, err);
    return null;
  }
}

function rosterCacheKey(uri: string): Request {
  return new Request(`https://apollo-internal.invalid/ring-roster?uri=${encodeURIComponent(uri)}`);
}

/**
 * Listed members in ring order. Cached for 5 minutes; the ring's cid is part of
 * the cached value, so an owner's edit is picked up immediately.
 */
export async function ringRoster(env: AppEnv, ring: LoadedRing): Promise<RosterMember[]> {
  const cache = caches.default;
  const key = rosterCacheKey(ring.uri);
  const hit = await cache.match(key);
  if (hit) {
    const cached = (await hit.json()) as { cid: string; members: RosterMember[] };
    if (cached.cid === ring.entry.cid) return cached.members;
  }
  const members = (
    await mapLimit(memberDids(ring.entry.value), CONCURRENCY, (did) =>
      rosterMember(env, ring.uri, did),
    )
  ).filter((m): m is RosterMember => m !== null);
  await cache.put(
    key,
    new Response(JSON.stringify({ cid: ring.entry.cid, members }), {
      headers: {
        "content-type": "application/json",
        "cache-control": `max-age=${ROSTER_CACHE_SECONDS}`,
      },
    }),
  );
  return members;
}

/** Drop a cached roster after a join/leave so it shows up sooner (this colo only). */
export async function forgetRoster(uri: string): Promise<void> {
  await caches.default.delete(rosterCacheKey(uri));
}

/** The listed site before/after `from`, wrapping around. Null when `from` isn't listed. */
export function neighbor<T extends { did: string }>(
  roster: T[],
  from: string | undefined,
  direction: "prev" | "next",
): T | null {
  const i = roster.findIndex((m) => m.did === from);
  if (i < 0) return null;
  const step = direction === "next" ? 1 : -1;
  return roster[(i + step + roster.length) % roster.length];
}

/** A random listed site, avoiding `not` when there's any other choice. */
export function randomMember<T extends { did: string }>(roster: T[], not?: string): T | null {
  return pickRandom(roster, (m) => m.did, not);
}

export interface RingNav {
  name: string;
  indexUrl: string;
  prevUrl: string;
  nextUrl: string;
}

/**
 * Footer navs for a member site: rings it has accepted that still list it.
 * Prev/next are links to redirect routes, so rendering never needs a roster.
 */
export async function siteRings(env: AppEnv, pds: string, did: string): Promise<RingNav[]> {
  let accepted: RecordEntry<RingMemberRecord>[];
  try {
    accepted = await listPublicRecords<RingMemberRecord>(
      pds,
      did,
      NSID_RING_MEMBER,
      LIMITS.ringsPerSite,
    );
  } catch (err) {
    console.warn("ring memberships failed", did, err);
    return [];
  }
  const navs = await Promise.all(
    accepted.map(async (rec): Promise<RingNav | null> => {
      const ref = rec.value?.$type === NSID_RING_MEMBER ? parseRingUri(rec.value.ring) : null;
      if (!ref) return null;
      try {
        if (await isBlocked(env, ref.did)) return null;
        const ring = await loadRing(env, ref.did, ref.slug);
        if (!ring || !memberDids(ring.entry.value).includes(did)) return null;
        const verdict = await checkModeration(env, ring.owner.did, ring.owner.pds);
        if (verdict.kind === "unavailable") return null;
        const index = ringPageUrl(env, ring.owner.did, ref.slug);
        const from = encodeURIComponent(did);
        return {
          name: ring.entry.value.name,
          indexUrl: index,
          prevUrl: `${index}/prev?from=${from}`,
          nextUrl: `${index}/next?from=${from}`,
        };
      } catch (err) {
        console.warn("ring nav failed", rec.value.ring, err);
        return null;
      }
    }),
  );
  return navs.filter((n): n is RingNav => n !== null);
}

export function ringRef(env: AppEnv, ring: LoadedRing): RingRef {
  const v = ring.entry.value;
  return {
    uri: ring.uri,
    name: v.name,
    ...(v.description ? { description: v.description } : {}),
    url: ringPageUrl(env, ring.owner.handle ?? ring.owner.did, ring.slug),
    ownerDid: ring.owner.did,
    ...(ring.owner.handle ? { ownerHandle: ring.owner.handle } : {}),
  };
}

/**
 * DIDs with a `ringMember` record pointing at the ring at `uri`, from the
 * Constellation backlink index. Includes people who aren't (or are no longer)
 * invited - callers intersect with the ring's members. Throws when the index
 * can't be reached.
 */
export async function acceptedDids(uri: string): Promise<Set<string>> {
  const out = new Set<string>();
  let cursor: string | undefined;
  // Members cap at 100; a few pages covers stale acceptances too.
  for (let page = 0; page < 3; page++) {
    const url = new URL("/links/distinct-dids", CONSTELLATION_URL);
    url.searchParams.set("target", uri);
    url.searchParams.set("collection", NSID_RING_MEMBER);
    url.searchParams.set("path", ".ring");
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "SonaSky Apollo (rings)" },
    });
    if (!res.ok) throw new Error(`constellation: ${res.status}`);
    const body = (await res.json()) as { linking_dids?: string[]; cursor?: string | null };
    for (const did of body.linking_dids ?? []) out.add(did);
    cursor = body.cursor ?? undefined;
    if (!cursor) break;
  }
  return out;
}

/**
 * Rings that list `did`, from the Constellation backlink index. Each hit is
 * re-checked against the real ring record by the caller. Throws when the
 * index can't be reached.
 */
export async function ringsListing(did: string): Promise<{ ownerDid: string; slug: string }[]> {
  const url = new URL("/links", CONSTELLATION_URL);
  url.searchParams.set("target", did);
  url.searchParams.set("collection", NSID_RING);
  url.searchParams.set("path", ".members[].did");
  url.searchParams.set("limit", "50");
  const res = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "SonaSky Apollo (rings)" },
  });
  if (!res.ok) throw new Error(`constellation: ${res.status}`);
  const body = (await res.json()) as {
    linking_records?: { did: string; collection: string; rkey: string }[];
  };
  const out: { ownerDid: string; slug: string }[] = [];
  for (const r of body.linking_records ?? []) {
    if (r.collection === NSID_RING && isSlug(r.rkey) && parseRingUri(ringUri(r.did, r.rkey))) {
      out.push({ ownerDid: r.did, slug: r.rkey });
    }
  }
  return out;
}
