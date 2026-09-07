import { config } from "../config.ts";
import { db } from "../db/index.ts";
import { redis } from "../utils/redis.ts";
import { GRAVITY, type HydratedPost, hydratePosts, rebuildZset } from "./ranking.ts";

/** How recent a post must be to be eligible for the trending feed. */
const WINDOW_HOURS = 24;
/** How often the ranking is rebuilt. */
const REFRESH_MS = 15 * 60_000;
/** Cap on posts scored per cycle (bounds getPosts calls: MAX_CANDIDATES / 25). */
const MAX_CANDIDATES = 5000;

const SPECIES_KEY_PREFIX = "trending:species:";

/** Redis sorted set a trending feed is served from (member = post URI, score = rank). */
export const trendingZsetKey = (labelId?: string | null): string =>
  labelId ? `${SPECIES_KEY_PREFIX}${labelId}` : "trending:all";

interface ScoredPost {
  uri: string;
  authorDid: string;
  score: number;
}

const scoreOf = (post: HydratedPost, indexedAtMs: number): number => {
  const engagement = post.likeCount + 2 * post.repostCount + 1.5 * post.quoteCount;
  const ageHours = Math.max(0, (Date.now() - indexedAtMs) / 3_600_000);
  return engagement / (ageHours + 2) ** GRAVITY;
};

/** Buckets scored posts into per-species entry lists using the current label map. */
const bySpecies = async (scored: ScoredPost[]): Promise<Map<string, [number, string][]>> => {
  const rows = await db.selectFrom("account_label").select(["did", "label"]).distinct().execute();
  const labelsByDid = new Map<string, string[]>();
  for (const { did, label } of rows) {
    const list = labelsByDid.get(did);
    if (list) list.push(label);
    else labelsByDid.set(did, [label]);
  }

  const byLabel = new Map<string, [number, string][]>();
  for (const post of scored) {
    for (const label of labelsByDid.get(post.authorDid) ?? []) {
      const list = byLabel.get(label);
      if (list) list.push([post.score, post.uri]);
      else byLabel.set(label, [[post.score, post.uri]]);
    }
  }
  return byLabel;
};

const refresh = async (): Promise<void> => {
  const cutoff = Date.now() - WINDOW_HOURS * 3_600_000;

  const candidates = await db
    .selectFrom("post as p")
    .select(["p.uri", "p.indexed_at", "p.author_did"])
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
    await rebuildZset(trendingZsetKey(), []);
    return;
  }

  const counts = await hydratePosts(candidates.map((c) => c.uri));

  const scored = candidates
    .map((c): ScoredPost | null => {
      const hydrated = counts.get(c.uri);
      return hydrated
        ? { uri: c.uri, authorDid: c.author_did, score: scoreOf(hydrated, c.indexed_at) }
        : null;
    })
    .filter((s): s is ScoredPost => s !== null);

  await rebuildZset(
    trendingZsetKey(),
    scored.map((s) => [s.score, s.uri]),
  );
  console.log(`trending: ranked ${scored.length} posts`);

  if (!config.perSpeciesTrending) return;

  const byLabel = await bySpecies(scored);
  for (const [label, entries] of byLabel) await rebuildZset(trendingZsetKey(label), entries);

  // Drop per-species sets for labels that no longer have any ranked post.
  const live = new Set([...byLabel.keys()].map((l) => trendingZsetKey(l)));
  const stale = (await redis.keys(`${SPECIES_KEY_PREFIX}*`)).filter((k) => !live.has(k));
  if (stale.length > 0) await redis.del(...stale);
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
