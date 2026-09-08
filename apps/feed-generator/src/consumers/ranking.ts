import { redis } from "../utils/redis.ts";

const GET_POSTS_URL = "https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts";

/** Age falloff shared by the engagement-ranked feeds - higher sinks older posts faster. */
export const GRAVITY = 1.5;

export interface HydratedPost {
  uri: string;
  /** DID of the post's author, or "" */
  authorDid: string;
  /** ms epoch the AppView first indexed the post. */
  indexedAtMs: number;
  likeCount: number;
  repostCount: number;
  quoteCount: number;
}

/**
 * Fetches authoritative like/repost/quote counts and index time from the
 * AppView, 25 URIs per call. URIs the AppView doesn't return (deleted, blocked)
 * are simply absent from the map.
 */
export const hydratePosts = async (uris: string[]): Promise<Map<string, HydratedPost>> => {
  const byUri = new Map<string, HydratedPost>();
  for (let i = 0; i < uris.length; i += 25) {
    const url = new URL(GET_POSTS_URL);
    for (const uri of uris.slice(i, i + 25)) url.searchParams.append("uris", uri);

    const res = await fetch(url);
    if (!res.ok) {
      console.error(`ranking: getPosts HTTP ${res.status}`);
      continue;
    }
    const data = (await res.json()) as {
      posts: {
        uri: string;
        author?: { did?: string };
        indexedAt?: string;
        likeCount?: number;
        repostCount?: number;
        quoteCount?: number;
      }[];
    };
    for (const post of data.posts) {
      const parsed = post.indexedAt ? Date.parse(post.indexedAt) : Number.NaN;
      byUri.set(post.uri, {
        uri: post.uri,
        authorDid: post.author?.did ?? "",
        indexedAtMs: Number.isNaN(parsed) ? Date.now() : parsed,
        likeCount: post.likeCount ?? 0,
        repostCount: post.repostCount ?? 0,
        quoteCount: post.quoteCount ?? 0,
      });
    }
  }
  return byUri;
};

/** Replaces `key` with a sorted set of `[score, uri]` entries via an atomic swap. */
export const rebuildZset = async (key: string, entries: [number, string][]): Promise<void> => {
  if (entries.length === 0) {
    await redis.del(key);
    return;
  }
  const tmp = `${key}:next`;
  const pipe = redis.pipeline();
  pipe.del(tmp);
  for (const [score, uri] of entries) pipe.zadd(tmp, score, uri);
  pipe.rename(tmp, key);
  await pipe.exec();
};
