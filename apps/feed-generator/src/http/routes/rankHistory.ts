import type { ServerResponse } from "node:http";
import { db } from "../../db/index.ts";
import { feedForUri } from "../../feeds.ts";
import { sendError, sendJson } from "../json.ts";
import { chronoNewerTimestamps, chronoRankAtTimes } from "../rankQueries.ts";

const DEFAULT_HOURS = 24;
const MAX_HOURS = 24 * 14;
const DEFAULT_POINTS = 48;
const MAX_POINTS = 200;

interface HistoryPoint {
  t: number;
  rank: number | null;
}

const parsePositiveInt = (raw: string | null, fallback: number, max: number): number => {
  if (raw === null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.trunc(n), max);
};

/**
 * A post's rank in one feed over time. Chrono feeds (all/species/custom) are
 * reconstructed on the fly from `post.indexed_at` (their rank at any past time
 * is fully determined by which now-newer posts already existed by then).
 * Trending/interacted feeds have no such record - the Redis sorted set they're
 * served from only holds the current state - so their history comes from
 * `feed_rank_snapshot`, populated by the trending/interacted refresh jobs going
 * forward from whenever that started running; empty until then. Not part of
 * the public XRPC surface.
 */
export async function rankHistory(res: ServerResponse, params: URLSearchParams): Promise<void> {
  const uri = params.get("uri");
  const feedUri = params.get("feedUri");
  if (!uri || !feedUri) {
    sendError(res, 400, "InvalidRequest", "Missing uri or feedUri parameter");
    return;
  }

  const feed = feedForUri(feedUri);
  if (!feed) {
    sendError(res, 400, "UnknownFeed", `No feed for ${feedUri}`);
    return;
  }

  const hours = parsePositiveInt(params.get("hours"), DEFAULT_HOURS, MAX_HOURS);
  const now = Date.now();
  const cutoff = now - hours * 3_600_000;

  if (feed.kind === "trending" || feed.kind === "interacted") {
    const rows = await db
      .selectFrom("feed_rank_snapshot")
      .select(["rank", "snapshotted_at"])
      .where("feed_rkey", "=", feed.rkey)
      .where("post_uri", "=", uri)
      .where("snapshotted_at", ">=", cutoff)
      .orderBy("snapshotted_at", "asc")
      .execute();

    const points: HistoryPoint[] = rows.map((r) => ({ t: r.snapshotted_at, rank: r.rank }));
    sendJson(res, 200, { kind: feed.kind, points });
    return;
  }

  const post = await db.selectFrom("post").selectAll().where("uri", "=", uri).executeTakeFirst();
  if (!post) {
    sendJson(res, 200, { kind: feed.kind, points: [] });
    return;
  }

  const points = parsePositiveInt(params.get("points"), DEFAULT_POINTS, MAX_POINTS);
  const sampleTimes: number[] = [];
  for (let i = 0; i < points; i++) {
    sampleTimes.push(cutoff + (i * (now - cutoff)) / (points - 1 || 1));
  }
  sampleTimes[sampleTimes.length - 1] = now;

  const newerTimestamps = await chronoNewerTimestamps(feed, post);
  const ranks = chronoRankAtTimes(post, newerTimestamps, sampleTimes);

  sendJson(res, 200, {
    kind: feed.kind,
    points: sampleTimes.map((t, i): HistoryPoint => ({ t, rank: ranks[i] })),
  });
}
