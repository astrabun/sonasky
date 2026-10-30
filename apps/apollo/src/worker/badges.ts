/**
 * 88x31 badges for the badges block. A block lists badges by at:// uri, and
 * those may live in anyone's repo, so they're loaded here (where the env is
 * available for moderation) before rendering - the same way ring navs are.
 * Badges that are missing, malformed, blocked or labelled are dropped.
 */

import { LIMITS } from "../shared/limits.ts";
import { badgeUri, parseBadgeUri } from "../shared/badges.ts";
import { NSID_BADGE } from "../shared/nsid.ts";
import type { Block, BadgeRecord } from "../shared/records.ts";
import { resolveActor } from "./atproto/identity.ts";
import { getPublicRecord, listPublicRecords } from "./atproto/repo.ts";
import type { AppEnv } from "./env.ts";
import { checkModeration, isBlocked } from "./moderation.ts";
import type { RenderTarget } from "./render/document.ts";
import { mapLimit } from "./rings.ts";

/** A badge as the renderer needs it. Fields come from someone else's repo: untrusted. */
export interface LoadedBadge {
  did: string;
  media: string;
  alt: string;
  href?: string;
}

/** Most badges one page loads, across all its badges blocks (each is a subrequest). */
const MAX_PER_PAGE = LIMITS.badgesPerBlock;

/** Badge uris used by a page or post's badges blocks, deduplicated, in order. */
export function badgeUris(target: RenderTarget): string[] {
  if (target.kind === "blog") return [];
  const blocks: Block[] = target.record.blocks ?? [];
  const uris = blocks.flatMap((b) =>
    b.$type === "app.sonasky.apollo.defs#badges" && Array.isArray(b.items)
      ? b.items.map((item) => item?.uri)
      : [],
  );
  return [...new Set(uris.filter((u): u is string => !!parseBadgeUri(u)))].slice(0, MAX_PER_PAGE);
}

async function allowed(env: AppEnv, did: string, pds: string, ownerDid: string): Promise<boolean> {
  // The owner's own account was already checked before rendering their site.
  if (did === ownerDid) return true;
  if (await isBlocked(env, did)) return false;
  return (await checkModeration(env, did, pds)).kind === "ok";
}

/** Load badges by uri. The map only holds the ones that can be shown. */
export async function loadBadges(
  env: AppEnv,
  ownerDid: string,
  uris: string[],
): Promise<Map<string, LoadedBadge>> {
  const out = new Map<string, LoadedBadge>();
  if (!uris.length) return out;
  const resolver = env.HANDLE_RESOLVER_URL ?? "https://bsky.social";

  // One identity + moderation lookup per account, however many of its badges are shown.
  const dids = [...new Set(uris.map((u) => parseBadgeUri(u)?.did).filter((d) => !!d))];
  const pdsByDid = new Map<string, string>();
  await mapLimit(dids as string[], 6, async (did) => {
    try {
      const identity = await resolveActor(did, resolver);
      if (identity && (await allowed(env, did, identity.pds, ownerDid))) {
        pdsByDid.set(did, identity.pds);
      }
    } catch (err) {
      console.warn("badges: identity failed", did, err);
    }
  });

  await mapLimit(uris, 6, async (uri) => {
    const ref = parseBadgeUri(uri);
    const pds = ref && pdsByDid.get(ref.did);
    if (!ref || !pds) return;
    try {
      const entry = await getPublicRecord<BadgeRecord>(pds, ref.did, NSID_BADGE, ref.rkey);
      const badge = loaded(ref.did, entry?.value);
      if (badge) out.set(uri, badge);
    } catch (err) {
      console.warn("badges: record failed", uri, err);
    }
  });
  return out;
}

function loaded(did: string, v: BadgeRecord | undefined): LoadedBadge | null {
  if (!v || typeof v.media !== "string") return null;
  return {
    did,
    media: v.media,
    alt: typeof v.alt === "string" ? v.alt : "",
    href: typeof v.href === "string" ? v.href : undefined,
  };
}

/**
 * Someone's badges (newest first, as listRecords returns them), for picking
 * a friend's badge in the editor. Null when the account doesn't resolve or
 * can't be shown.
 */
export async function listBadgesOf(
  env: AppEnv,
  actor: string,
  viewerDid: string,
): Promise<{ did: string; handle?: string; badges: (LoadedBadge & { uri: string })[] } | null> {
  const identity = await resolveActor(actor, env.HANDLE_RESOLVER_URL ?? "https://bsky.social");
  if (!identity || !(await allowed(env, identity.did, identity.pds, viewerDid))) return null;
  const entries = await listPublicRecords<BadgeRecord>(
    identity.pds,
    identity.did,
    NSID_BADGE,
    LIMITS.badgesPerSite,
  );
  const badges = entries.flatMap((e) => {
    const b = loaded(identity.did, e.value);
    return b ? [{ ...b, uri: badgeUri(identity.did, e.rkey) }] : [];
  });
  return { did: identity.did, handle: identity.handle, badges };
}

/** Accounts (other than the owner) whose media a page shows, for its CSP. */
export function badgeMediaDids(badges: Map<string, LoadedBadge>, ownerDid: string): string[] {
  return [...new Set([...badges.values()].map((b) => b.did))].filter((d) => d !== ownerDid);
}
