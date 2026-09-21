import { db } from "../db/index.ts";
import type { ServedFeed } from "../feeds.ts";

export interface PostRow {
  uri: string;
  author_did: string;
  indexed_at: number;
  is_reply: boolean;
  tags: string[];
  text: string;
  alt_text: string;
}

export const matchesCustomFilter = (
  feed: ServedFeed,
  post: PostRow,
  authorLabels: Set<string>,
): boolean => {
  if (feed.kind !== "custom") return false;
  const { filter } = feed;

  if (filter.authorDid && filter.authorDid !== post.author_did) return false;
  if (filter.labelId && !authorLabels.has(filter.labelId)) return false;

  if (filter.tags && filter.tags.length > 0) {
    const tags = filter.tags.map((t) => t.toLowerCase());
    const postTags = new Set(post.tags.map((t) => t.toLowerCase()));
    const matches = tags.filter((t) => postTags.has(t));
    if (filter.tagMode === "all" ? matches.length !== tags.length : matches.length === 0) {
      return false;
    }
  }

  if (filter.contains && filter.contains.length > 0) {
    const haystack =
      filter.containsIn === "text"
        ? post.text
        : filter.containsIn === "altText"
          ? post.alt_text
          : `${post.text} ${post.alt_text}`;
    const needles = filter.contains.map((n) => n.toLowerCase());
    const matches = needles.filter((n) => haystack.includes(n));
    if (filter.containsMode === "all" ? matches.length !== needles.length : matches.length === 0) {
      return false;
    }
  }

  if (filter.excludeReplies !== false && post.is_reply) return false;

  return true;
};

/** Sorted-ascending `indexed_at` of every post that sorts BEFORE `post` (i.e. newer) under
 * this chrono feed's WHERE filter - length is the organic rank; bucketing against a set of
 * past timestamps reconstructs the rank at any point in the last `POST_RETENTION_DAYS`. */
async function newerTimestampsBuiltin(feed: ServedFeed, post: PostRow): Promise<number[]> {
  let query = db
    .selectFrom("post as p")
    .select("p.indexed_at")
    .where((eb) =>
      eb.or([
        eb("p.indexed_at", ">", post.indexed_at),
        eb.and([eb("p.indexed_at", "=", post.indexed_at), eb("p.uri", ">", post.uri)]),
      ]),
    )
    .where((eb) =>
      eb.not(
        eb.exists(
          eb.selectFrom("opt_out as o").select("o.did").whereRef("o.did", "=", "p.author_did"),
        ),
      ),
    );

  if (feed.kind === "all") {
    query = query.where((eb) =>
      eb.exists(
        eb
          .selectFrom("account_label as al")
          .select("al.did")
          .whereRef("al.did", "=", "p.author_did"),
      ),
    );
  } else if (feed.kind === "species") {
    query = query
      .innerJoin("account_label as al", "al.did", "p.author_did")
      .where("al.label", "=", feed.labelId);
  }

  const rows = await query.execute();
  return rows.map((r) => r.indexed_at).sort((a, b) => a - b);
}

/** Same as `newerTimestampsBuiltin`, for a custom feed - filters not cheaply expressible
 * in SQL (tags/contains) are checked in JS via `matchesCustomFilter`. */
async function newerTimestampsCustom(feed: ServedFeed, post: PostRow): Promise<number[]> {
  if (feed.kind !== "custom") return [];
  const { filter } = feed;

  let query = db
    .selectFrom("post as p")
    .select([
      "p.uri",
      "p.author_did",
      "p.indexed_at",
      "p.is_reply",
      "p.tags",
      "p.text",
      "p.alt_text",
    ])
    .where((eb) =>
      eb.or([
        eb("p.indexed_at", ">", post.indexed_at),
        eb.and([eb("p.indexed_at", "=", post.indexed_at), eb("p.uri", ">", post.uri)]),
      ]),
    )
    .where((eb) =>
      eb.not(
        eb.exists(
          eb.selectFrom("opt_out as o").select("o.did").whereRef("o.did", "=", "p.author_did"),
        ),
      ),
    );

  if (filter.authorDid) query = query.where("p.author_did", "=", filter.authorDid);
  if (filter.excludeReplies !== false) query = query.where("p.is_reply", "=", false);

  const candidates = await query.execute();
  if (candidates.length === 0) return [];

  const labelId = filter.labelId;
  const authorDids = labelId ? [...new Set(candidates.map((c) => c.author_did))] : [];
  const labeledDids = labelId
    ? new Set(
        (
          await db
            .selectFrom("account_label")
            .select("did")
            .where("did", "in", authorDids)
            .where("label", "=", labelId)
            .execute()
        ).map((r) => r.did),
      )
    : null;

  const timestamps: number[] = [];
  for (const c of candidates) {
    if (labeledDids && !labeledDids.has(c.author_did)) continue;
    const candidateLabels = labelId ? new Set([labelId]) : new Set<string>();
    if (
      matchesCustomFilter(
        feed,
        {
          uri: c.uri,
          author_did: c.author_did,
          indexed_at: c.indexed_at,
          is_reply: c.is_reply,
          tags: c.tags,
          text: c.text,
          alt_text: c.alt_text,
        },
        candidateLabels,
      )
    ) {
      timestamps.push(c.indexed_at);
    }
  }
  return timestamps.sort((a, b) => a - b);
}

/** Organic-rank-relevant newer-post timestamps for any chrono feed kind (all/species/custom). */
export const chronoNewerTimestamps = (feed: ServedFeed, post: PostRow): Promise<number[]> =>
  feed.kind === "custom" ? newerTimestampsCustom(feed, post) : newerTimestampsBuiltin(feed, post);

/** Current 0-indexed organic rank among posts matching a chrono feed's filter. */
export const chronoRank = async (feed: ServedFeed, post: PostRow): Promise<number> =>
  (await chronoNewerTimestamps(feed, post)).length;

/**
 * Reconstructs a chrono feed's organic rank for `post` at each of `sampleTimes` (ms epoch),
 * from the same newer-post timestamps used for the current rank - a post's rank at any past
 * time T is just how many now-newer eligible posts already existed by T. `null` for a sample
 * time before the post itself existed.
 */
export const chronoRankAtTimes = (
  post: PostRow,
  newerTimestamps: number[],
  sampleTimes: number[],
): (number | null)[] =>
  sampleTimes.map((t) => {
    if (t < post.indexed_at) return null;
    let lo = 0;
    let hi = newerTimestamps.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (newerTimestamps[mid] <= t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  });
