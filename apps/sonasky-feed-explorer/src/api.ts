import { BSKY_API, FEED_GENERATOR_API } from "./const";
import type { BskyPost, CursorsResponse, PostFeedsResponse, RankHistoryResponse } from "./types";

const POST_URL_RE = /^https?:\/\/bsky\.app\/profile\/([^/]+)\/post\/([^/?#]+)/;

/** Resolves a bsky.app post URL or an at:// URI to an at:// URI. */
export async function resolvePostInput(input: string): Promise<string | null> {
  const trimmed = input.trim();

  if (trimmed.startsWith("at://")) {
    return trimmed;
  }

  const match = POST_URL_RE.exec(trimmed);
  if (!match) {
    return null;
  }
  const [, actor, rkey] = match;

  if (actor.startsWith("did:")) {
    return `at://${actor}/app.bsky.feed.post/${rkey}`;
  }

  try {
    const res = await fetch(
      `${BSKY_API}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(actor)}`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { did?: string };
    if (!data.did) return null;
    return `at://${data.did}/app.bsky.feed.post/${rkey}`;
  } catch {
    return null;
  }
}

export async function getPost(uri: string): Promise<BskyPost | undefined> {
  try {
    const res = await fetch(`${BSKY_API}/app.bsky.feed.getPosts?uris=${encodeURIComponent(uri)}`);
    if (!res.ok) return undefined;
    const data = (await res.json()) as {
      posts?: {
        uri: string;
        author: { handle: string; displayName?: string; avatar?: string };
        record: { text: string };
        likeCount?: number;
        repostCount?: number;
        indexedAt: string;
      }[];
    };
    const post = data.posts?.[0];
    if (!post) return undefined;
    return {
      uri: post.uri,
      authorHandle: post.author.handle,
      authorDisplayName: post.author.displayName,
      authorAvatar: post.author.avatar,
      text: post.record.text,
      likeCount: post.likeCount ?? 0,
      repostCount: post.repostCount ?? 0,
      indexedAt: post.indexedAt,
    };
  } catch {
    return undefined;
  }
}

export async function getPostFeeds(uri: string): Promise<PostFeedsResponse> {
  const res = await fetch(`${FEED_GENERATOR_API}/debug/postFeeds?uri=${encodeURIComponent(uri)}`);
  if (!res.ok) {
    throw new Error(`feed-generator returned ${res.status}`);
  }
  return (await res.json()) as PostFeedsResponse;
}

export async function getRankHistory(
  uri: string,
  feedUri: string,
  hours = 24,
): Promise<RankHistoryResponse | undefined> {
  try {
    const params = new URLSearchParams({ uri, feedUri, hours: String(hours) });
    const res = await fetch(`${FEED_GENERATOR_API}/debug/rankHistory?${params}`);
    if (!res.ok) return undefined;
    return (await res.json()) as RankHistoryResponse;
  } catch {
    return undefined;
  }
}

export async function getCursors(): Promise<CursorsResponse | undefined> {
  try {
    const res = await fetch(`${FEED_GENERATOR_API}/debug/cursors`);
    if (!res.ok) return undefined;
    return (await res.json()) as CursorsResponse;
  } catch {
    return undefined;
  }
}
