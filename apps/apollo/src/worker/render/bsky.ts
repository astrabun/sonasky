/**
 * Static Bluesky cards for the bskyPost / bskyProfile / starterPack blocks.
 * Data comes from the public AppView at render time - no third-party iframes or
 * scripts in the page. Content Bluesky has labeled as adult/graphic is not
 * reproduced; the card just links out.
 */

import { WARN_LABELS } from "../moderation.ts";

const APPVIEW = "https://public.api.bsky.app";
const HIDE = new Set(["!hide", "!takedown", "!warn"]);

interface Label {
  val: string;
  neg?: boolean;
}

interface ProfileView {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  description?: string;
  labels?: Label[];
}

export interface PostCard {
  url: string;
  author: ProfileView;
  text: string;
  createdAt?: string;
  hidden: boolean;
}

export interface ProfileCard {
  url: string;
  profile: ProfileView;
  hidden: boolean;
}

export interface StarterPackCard {
  url: string;
  name: string;
  description?: string;
  creator: ProfileView;
  memberCount?: number;
  hidden: boolean;
}

function flagged(labels: Label[] | undefined): boolean {
  return (labels ?? []).some((l) => !l.neg && (WARN_LABELS.has(l.val) || HIDE.has(l.val)));
}

/** Only Bluesky's own CDN is allowed by the usercontent CSP. */
export function safeAvatar(url: string | undefined): string | undefined {
  return url && url.startsWith("https://cdn.bsky.app/") ? url : undefined;
}

function parseAtUri(uri: string): { did: string; collection: string; rkey: string } | null {
  const m = /^at:\/\/(did:[a-z]+:[a-zA-Z0-9._:%-]+)\/([a-zA-Z0-9.]+)\/([a-zA-Z0-9._~:-]+)$/.exec(
    uri,
  );
  return m ? { did: m[1], collection: m[2], rkey: m[3] } : null;
}

async function appview<T>(method: string, params: [string, string][]): Promise<T | null> {
  const url = new URL(`/xrpc/${method}`, APPVIEW);
  for (const [k, v] of params) url.searchParams.append(k, v);
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchPostCards(uris: string[]): Promise<Map<string, PostCard>> {
  const out = new Map<string, PostCard>();
  const valid = uris.filter((u) => parseAtUri(u)?.collection === "app.bsky.feed.post");
  for (let i = 0; i < valid.length; i += 25) {
    const batch = valid.slice(i, i + 25);
    const res = await appview<{
      posts: {
        uri: string;
        author: ProfileView;
        record: { text?: string; createdAt?: string };
        labels?: Label[];
      }[];
    }>(
      "app.bsky.feed.getPosts",
      batch.map((u) => ["uris", u]),
    );
    for (const post of res?.posts ?? []) {
      const parts = parseAtUri(post.uri);
      if (!parts) continue;
      out.set(post.uri, {
        url: `https://bsky.app/profile/${post.author.did}/post/${parts.rkey}`,
        author: post.author,
        text: post.record.text ?? "",
        createdAt: post.record.createdAt,
        hidden: flagged(post.labels) || flagged(post.author.labels),
      });
    }
  }
  return out;
}

export async function fetchProfileCard(did: string): Promise<ProfileCard | null> {
  const profile = await appview<ProfileView>("app.bsky.actor.getProfile", [["actor", did]]);
  if (!profile) return null;
  return {
    url: `https://bsky.app/profile/${profile.did}`,
    profile,
    hidden: flagged(profile.labels),
  };
}

export async function fetchStarterPackCard(uri: string): Promise<StarterPackCard | null> {
  const parts = parseAtUri(uri);
  if (!parts || parts.collection !== "app.bsky.graph.starterpack") return null;
  const res = await appview<{
    starterPack: {
      creator: ProfileView;
      record: { name?: string; description?: string };
      list?: { listItemCount?: number };
      labels?: Label[];
    };
  }>("app.bsky.graph.getStarterPack", [["starterPack", uri]]);
  if (!res) return null;
  const sp = res.starterPack;
  return {
    url: `https://bsky.app/starter-pack/${sp.creator.handle}/${parts.rkey}`,
    name: sp.record.name ?? "Starter pack",
    description: sp.record.description,
    creator: sp.creator,
    memberCount: sp.list?.listItemCount,
    hidden: flagged(sp.labels) || flagged(sp.creator.labels),
  };
}
