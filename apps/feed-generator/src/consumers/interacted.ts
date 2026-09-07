import { db } from "../db/index.ts";
import { GRAVITY, hydratePosts, rebuildZset } from "./ranking.ts";

/** How recent a like/repost must be to keep its post eligible. */
const WINDOW_HOURS = 24;
/** How often the ranking is rebuilt. */
const REFRESH_MS = 15 * 60_000;
/** Cap on posts scored per cycle (bounds getPosts calls: MAX_CANDIDATES / 25). */
const MAX_CANDIDATES = 5000;
/** A repost by a labeled account is worth this many likes. */
const REPOST_WEIGHT = 2;

/** Redis sorted set the "SonaSky Comet" feed is served from (member = post URI, score = rank). */
export const interactedZsetKey = (): string => "interacted:all";

const scoreOf = (weightedActors: number, indexedAtMs: number): number => {
  const ageHours = Math.max(0, (Date.now() - indexedAtMs) / 3_600_000);
  return weightedActors / (ageHours + 2) ** GRAVITY;
};

const refresh = async (): Promise<void> => {
  const cutoff = Date.now() - WINDOW_HOURS * 3_600_000;

  // Distinct labeled accounts that liked (any kind) / reposted each post in the window.
  const candidates = await db
    .selectFrom("interaction")
    .select((eb) => [
      "post_uri",
      eb.fn.count<number>("actor_did").distinct().as("actors"),
      eb.fn
        .count<number>("actor_did")
        .distinct()
        .filterWhere("kind", "=", "repost")
        .as("reposters"),
    ])
    .where("indexed_at", ">", cutoff)
    .groupBy("post_uri")
    .orderBy("actors", "desc")
    .limit(MAX_CANDIDATES)
    .execute();

  if (candidates.length === 0) {
    await rebuildZset(interactedZsetKey(), []);
    return;
  }

  const hydrated = await hydratePosts(candidates.map((c) => c.post_uri));

  const entries = candidates.flatMap((c): [number, string][] => {
    const post = hydrated.get(c.post_uri);
    if (!post) return [];
    const weighted = Number(c.actors) + (REPOST_WEIGHT - 1) * Number(c.reposters);
    return [[scoreOf(weighted, post.indexedAtMs), c.post_uri]];
  });

  await rebuildZset(interactedZsetKey(), entries);
  console.log(`interacted: ranked ${entries.length} posts`);
};

/** Rebuilds the "SonaSky Comet" ranking now and every REFRESH_MS. */
export function startInteracted(): { stop: () => void } {
  void refresh().catch((err) => console.error("interacted: initial refresh failed:", err));
  const interval = setInterval(() => {
    refresh().catch((err) => console.error("interacted: refresh failed:", err));
  }, REFRESH_MS);
  interval.unref();
  return { stop: () => clearInterval(interval) };
}
