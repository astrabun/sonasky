import { db } from "../db/index.ts";
import { redis } from "../utils/redis.ts";

/** How recent a post must be to be eligible for the trending feed. */
const WINDOW_HOURS = 24;
/** How often the ranking is rebuilt. */
const REFRESH_MS = 15 * 60_000;
/** Cap on posts scored per cycle (bounds getPosts calls: MAX_CANDIDATES / 25). */
const MAX_CANDIDATES = 5000;
/** Age falloff - higher sinks older posts faster. */
const GRAVITY = 1.5;
const GET_POSTS_URL = "https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts";

/** Redis sorted set the trending feed is served from (member = post URI, score = rank). */
export const TRENDING_ZSET_KEY = "trending:all";

interface HydratedPost {
  uri: string;
  likeCount?: number;
  repostCount?: number;
  quoteCount?: number;
}

const scoreOf = (post: HydratedPost, indexedAtMs: number): number => {
  const engagement =
    (post.likeCount ?? 0) + 2 * (post.repostCount ?? 0) + 1.5 * (post.quoteCount ?? 0);
  const ageHours = Math.max(0, (Date.now() - indexedAtMs) / 3_600_000);
  return engagement / (ageHours + 2) ** GRAVITY;
};

/** Fetches authoritative like/repost/quote counts from the AppView, 25 URIs per call. */
const fetchCounts = async (uris: string[]): Promise<Map<string, HydratedPost>> => {
  const byUri = new Map<string, HydratedPost>();
  for (let i = 0; i < uris.length; i += 25) {
    const url = new URL(GET_POSTS_URL);
    for (const uri of uris.slice(i, i + 25)) url.searchParams.append("uris", uri);

    const res = await fetch(url);
    if (!res.ok) {
      console.error(`trending: getPosts HTTP ${res.status}`);
      continue;
    }
    const data = (await res.json()) as { posts: HydratedPost[] };
    for (const post of data.posts) byUri.set(post.uri, post);
  }
  return byUri;
};

const refresh = async (): Promise<void> => {
  const cutoff = Date.now() - WINDOW_HOURS * 3_600_000;

  const candidates = await db
    .selectFrom("post as p")
    .select(["p.uri", "p.indexed_at"])
    .where("p.indexed_at", ">", cutoff)
    .where((eb) =>
      eb.exists(
        eb
          .selectFrom("account_label as al")
          .select("al.did")
          .whereRef("al.did", "=", "p.author_did"),
      ),
    )
    .orderBy("p.indexed_at", "desc")
    .limit(MAX_CANDIDATES)
    .execute();

  if (candidates.length === 0) {
    await redis.del(TRENDING_ZSET_KEY);
    return;
  }

  const counts = await fetchCounts(candidates.map((c) => c.uri));

  const scored = candidates
    .map((c) => {
      const hydrated = counts.get(c.uri);
      return hydrated ? { uri: c.uri, score: scoreOf(hydrated, c.indexed_at) } : null;
    })
    .filter((s): s is { uri: string; score: number } => s !== null);

  if (scored.length === 0) {
    await redis.del(TRENDING_ZSET_KEY);
    return;
  }

  // Build into a temp key, then swap atomically.
  const tmp = `${TRENDING_ZSET_KEY}:next`;
  const pipe = redis.pipeline();
  pipe.del(tmp);
  for (const { uri, score } of scored) pipe.zadd(tmp, score, uri);
  pipe.rename(tmp, TRENDING_ZSET_KEY);
  await pipe.exec();

  console.log(`trending: ranked ${scored.length} posts`);
};

/** Rebuilds the trending ranking now and every REFRESH_MS. */
export function startTrending(): { stop: () => void } {
  void refresh().catch((err) => console.error("trending: initial refresh failed:", err));
  const interval = setInterval(() => {
    refresh().catch((err) => console.error("trending: refresh failed:", err));
  }, REFRESH_MS);
  interval.unref();
  return { stop: () => clearInterval(interval) };
}
