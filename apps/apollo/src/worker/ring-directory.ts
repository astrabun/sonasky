/**
 * The public ring directory: every listed ring with at least one active member,
 * rebuilt from the network like the site pool - repos with a ring record, their
 * ring records, and Constellation backlinks for acceptances. Cached briefly.
 */

import type { DirectoryRing } from "../shared/dto.ts";
import { LIMITS } from "../shared/limits.ts";
import { NSID_RING } from "../shared/nsid.ts";
import type { RingRecord } from "../shared/records.ts";
import { isSlug } from "../shared/slug.ts";
import { resolveActor } from "./atproto/identity.ts";
import { listPublicRecords } from "./atproto/repo.ts";
import type { AppEnv } from "./env.ts";
import { checkModeration, isBlocked } from "./moderation.ts";
import { fetchProfileCard, safeAvatar } from "./render/bsky.ts";
import { acceptedDids, isRing, mapLimit, memberDids, ringRef, ringUri } from "./rings.ts";
import { listReposWith, listSiteDids } from "./stats.ts";

const CACHE_SECONDS = 600;
/** Owners checked per build; past this, the directory needs real storage. */
const MAX_OWNERS = 200;
const CONCURRENCY = 6;

async function ownerRings(env: AppEnv, did: string, sites: Set<string>): Promise<DirectoryRing[]> {
  if (await isBlocked(env, did)) return [];
  const owner = await resolveActor(did, env.HANDLE_RESOLVER_URL ?? "https://bsky.social");
  if (!owner) return [];
  const verdict = await checkModeration(env, did, owner.pds);
  if (verdict.kind === "unavailable") return [];

  const records = (
    await listPublicRecords<RingRecord>(owner.pds, did, NSID_RING, LIMITS.ringsPerAccount)
  ).filter((e) => isSlug(e.rkey) && isRing(e.value) && e.value.unlisted !== true);
  if (records.length === 0) return [];

  const [profile, rings] = await Promise.all([
    fetchProfileCard(did).catch(() => null),
    Promise.all(
      records.map(async (entry) => {
        const uri = ringUri(did, entry.rkey);
        const accepted = await acceptedDids(uri);
        const activeMembers = memberDids(entry.value).filter(
          (m) => accepted.has(m) && sites.has(m),
        ).length;
        return { entry, uri, activeMembers };
      }),
    ),
  ]);
  if (profile?.hidden) return [];

  return rings
    .filter((r) => r.activeMembers > 0)
    .map(({ entry, uri, activeMembers }) => ({
      ...ringRef(env, { owner, slug: entry.rkey, uri, entry }),
      activeMembers,
      createdAt: entry.value.createdAt,
      updatedAt: entry.value.updatedAt,
      ...(profile?.profile.displayName ? { ownerDisplayName: profile.profile.displayName } : {}),
      ...(safeAvatar(profile?.profile.avatar) ? { ownerAvatar: profile?.profile.avatar } : {}),
    }));
}

async function buildDirectory(env: AppEnv): Promise<DirectoryRing[]> {
  const [owners, siteDids] = await Promise.all([listReposWith(NSID_RING), listSiteDids()]);
  if (owners.length > MAX_OWNERS) {
    console.warn(`ring directory: ${owners.length} owners, only checking ${MAX_OWNERS}`);
  }
  const sites = new Set(siteDids);
  const perOwner = await mapLimit(owners.slice(0, MAX_OWNERS), CONCURRENCY, (did) =>
    ownerRings(env, did, sites).catch((err) => {
      console.warn("ring directory: owner failed", did, err);
      return [];
    }),
  );
  return perOwner.flat();
}

/** Every listed ring with an active member. Cached for 10 minutes; throws if the index is down. */
export async function ringDirectory(env: AppEnv): Promise<DirectoryRing[]> {
  const cacheKey = new Request("https://apollo-internal.invalid/ring-directory");
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return (await cached.json()) as DirectoryRing[];

  const rings = await buildDirectory(env);
  await cache.put(
    cacheKey,
    new Response(JSON.stringify(rings), {
      headers: { "content-type": "application/json", "cache-control": `max-age=${CACHE_SECONDS}` },
    }),
  );
  return rings;
}
