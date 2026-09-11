import type { PostImage, Profile } from "./types";

const BSKY_API = "https://public.api.bsky.app/xrpc";

export async function fetchProfile(did: string): Promise<Profile | undefined> {
  try {
    const res = await fetch(
      `${BSKY_API}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`,
    );
    if (!res.ok) {
      return undefined;
    }
    const data = (await res.json()) as {
      avatar?: string;
      did: string;
      displayName?: string;
      handle: string;
    };
    return {
      avatar: data.avatar,
      did: data.did,
      displayName: data.displayName,
      handle: data.handle,
    };
  } catch {
    return undefined;
  }
}

export async function fetchPostImages(atUri: string): Promise<PostImage[]> {
  try {
    const res = await fetch(
      `${BSKY_API}/app.bsky.feed.getPostThread?uri=${encodeURIComponent(atUri)}&depth=0`,
    );
    if (!res.ok) {
      return [];
    }
    const data = (await res.json()) as {
      thread?: {
        post?: {
          embed?: {
            $type: string;
            images?: { alt?: string; thumb: string }[];
          };
        };
      };
    };
    const embed = data.thread?.post?.embed;
    if (embed?.$type === "app.bsky.embed.images#view" && Array.isArray(embed.images)) {
      return embed.images.map((img) => ({ alt: img.alt ?? "", url: img.thumb }));
    }
    return [];
  } catch {
    return [];
  }
}
