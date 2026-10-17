/**
 * Discover: pick a random site from the pool to feature. Only sites the viewer
 * would show without any gate qualify - not blocked, no hide or warn labels
 * (Bluesky's or self-applied), a resolvable PDS and a working home page.
 */

import type { DiscoverSite } from "../shared/dto.ts";
import { resolveActor } from "./atproto/identity.ts";
import { origin, type AppEnv } from "./env.ts";
import { checkModeration, isBlocked } from "./moderation.ts";
import { fetchProfileCard, safeAvatar } from "./render/bsky.ts";
import { loadSite } from "./site-loader.ts";
import { listSiteDids } from "./stats.ts";

/** Candidates tried per request before giving up. */
const MAX_TRIES = 6;

async function featureable(env: AppEnv, did: string): Promise<DiscoverSite | null> {
  if (await isBlocked(env, did)) return null;
  const identity = await resolveActor(did, env.HANDLE_RESOLVER_URL ?? "https://bsky.social");
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
    did,
    handle: identity.handle,
    url: `${origin(env.PUBLIC_URL)}/@${identity.handle ?? did}`,
    title: site.og?.title || site.title,
    ...(description ? { description } : {}),
    ...(profile?.profile.displayName ? { displayName: profile.profile.displayName } : {}),
    ...(safeAvatar(profile?.profile.avatar) ? { avatar: profile?.profile.avatar } : {}),
  };
}

/** A random featureable site, skipping `exclude` when there's anything else. */
export async function discoverSite(env: AppEnv, exclude?: string): Promise<DiscoverSite | null> {
  const pool = await listSiteDids();
  const candidates = pool.length > 1 ? pool.filter((d) => d !== exclude) : pool;
  // Partial Fisher-Yates: only the first MAX_TRIES slots are ever needed.
  const picks = [...candidates];
  const n = Math.min(MAX_TRIES, picks.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (picks.length - i));
    [picks[i], picks[j]] = [picks[j], picks[i]];
  }
  for (const did of picks.slice(0, n)) {
    try {
      const found = await featureable(env, did);
      if (found) return found;
    } catch (err) {
      console.warn("discover: candidate failed", did, err);
    }
  }
  return null;
}
