/**
 * Discover: a random site to feature, and the check behind handle lookup. Only
 * sites the viewer would show without any gate qualify - not blocked, no hide
 * or warn labels (Bluesky's or self-applied), a resolvable PDS and a working
 * home page.
 */

import type { DiscoverSite } from "../shared/dto.ts";
import { pickRandom } from "../shared/random.ts";
import type { SiteRecord } from "../shared/records.ts";
import { resolveActor, type ResolvedIdentity } from "./atproto/identity.ts";
import { origin, type AppEnv } from "./env.ts";
import { checkModeration, isBlocked } from "./moderation.ts";
import { fetchProfileCard, safeAvatar } from "./render/bsky.ts";
import { siteDirectory } from "./site-directory.ts";
import { loadSite } from "./site-loader.ts";

export interface FeaturedSite {
  card: DiscoverSite;
  record: SiteRecord;
}

/**
 * The site's card if it can be featured, else null. Shared by the random pick,
 * the directory and handle lookup. Pass `identity` when it's already resolved.
 */
export async function featureable(
  env: AppEnv,
  did: string,
  identity?: ResolvedIdentity | null,
): Promise<FeaturedSite | null> {
  if (await isBlocked(env, did)) return null;
  identity ??= await resolveActor(did, env.HANDLE_RESOLVER_URL ?? "https://bsky.social");
  if (!identity) return null;
  const [loaded, profile] = await Promise.all([
    loadSite(identity.pds, did, { kind: "page" }),
    fetchProfileCard(did),
  ]);
  if (!loaded || profile?.hidden) return null;
  const verdict = await checkModeration(env, did, identity.pds, loaded.selfLabels);
  if (verdict.kind !== "ok") return null;

  const site = loaded.site.value;
  const description = site.og?.description ?? site.description;
  return {
    card: {
      did,
      handle: identity.handle,
      url: `${origin(env.PUBLIC_URL)}/@${identity.handle ?? did}`,
      title: site.og?.title || site.title,
      ...(description ? { description } : {}),
      ...(profile?.profile.displayName ? { displayName: profile.profile.displayName } : {}),
      ...(safeAvatar(profile?.profile.avatar) ? { avatar: profile?.profile.avatar } : {}),
    },
    record: site,
  };
}

/**
 * A random featureable site from the directory index, skipping `exclude` when
 * there's anything else. Reading the index also advances its refresh, so a
 * cold index has something to offer after a request or two.
 */
export async function discoverSite(env: AppEnv, exclude?: string): Promise<DiscoverSite | null> {
  const { sites } = await siteDirectory(env);
  const pick = pickRandom(sites, (s) => s.did, exclude);
  if (!pick) return null;
  const { did, handle, url, title, description, displayName, avatar } = pick;
  return {
    did,
    url,
    title,
    ...(handle ? { handle } : {}),
    ...(description ? { description } : {}),
    ...(displayName ? { displayName } : {}),
    ...(avatar ? { avatar } : {}),
  };
}
