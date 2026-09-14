import type { ServerResponse } from "node:http";
import { sql } from "kysely";
import { db } from "../../db/index.ts";
import { interactedZsetKey } from "../../consumers/interacted.ts";
import { trendingZsetKey } from "../../consumers/trending.ts";
import { feedForUri } from "../../feeds.ts";
import { mergePins, pinsForFeed } from "../../pinnedPosts.ts";
import { redis } from "../../utils/redis.ts";
import { sendError, sendJson } from "../json.ts";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/** Escapes LIKE wildcards so a `contains` filter's substring matches literally. */
const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (c) => `\\${c}`);

const parseLimit = (raw: string | null): number => {
  if (raw === null || raw === "") return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(n), 1), MAX_LIMIT);
};

const respond = (res: ServerResponse, feedUris: string[], nextCursor: string | undefined): void =>
  sendJson(res, 200, {
    ...(nextCursor ? { cursor: nextCursor } : {}),
    feed: feedUris.map((uri) => ({ post: uri })),
  });

/**
 * app.bsky.feed.getFeedSkeleton - a page of post URIs for the requested feed:
 * reverse-chron for species / "all" feeds, engagement-ranked for the "trending"
 * feed. Configured pins are injected into the first page. Non-personalized: the
 * requester JWT is ignored.
 */
export async function getFeedSkeleton(res: ServerResponse, params: URLSearchParams): Promise<void> {
  const feedParam = params.get("feed");
  if (!feedParam) {
    sendError(res, 400, "InvalidRequest", "Missing feed parameter");
    return;
  }

  const feed = feedForUri(feedParam);
  if (!feed) {
    sendError(res, 400, "UnknownFeed", `No feed for ${feedParam}`);
    return;
  }

  const limit = parseLimit(params.get("limit"));
  const cursor = params.get("cursor");
  const pins = cursor ? [] : pinsForFeed(feed.kind, feed.labelId);
  const pinUris = new Set(pins.map((p) => p.uri));

  if (feed.kind === "trending" || feed.kind === "interacted") {
    // These are served from a periodically-rebuilt Redis sorted set; the sort
    // key is unstable across refreshes, so pagination is a plain offset.
    const zsetKey =
      feed.kind === "interacted" ? interactedZsetKey() : trendingZsetKey(feed.labelId);
    const offset = cursor ? Math.max(0, Number.parseInt(cursor, 10) || 0) : 0;
    const uris = await redis.zrange(zsetKey, offset, offset + limit - 1, "REV");
    const hasMore = uris.length === limit;

    const feedUris = mergePins(uris, pins, limit);
    const organicShown = feedUris.filter((u) => !pinUris.has(u)).length;
    respond(res, feedUris, hasMore ? String(offset + organicShown) : undefined);
    return;
  }

  let query = db
    .selectFrom("post as p")
    .select(["p.uri", "p.indexed_at"])
    .distinct()
    .orderBy("p.indexed_at", "desc")
    .orderBy("p.uri", "desc")
    .limit(limit)
    // Accounts that opted out of algorithmic recommendations never appear.
    .where((eb) =>
      eb.not(
        eb.exists(
          eb.selectFrom("opt_out as o").select("o.did").whereRef("o.did", "=", "p.author_did"),
        ),
      ),
    );

  if (feed.kind === "custom") {
    const { filter } = feed;
    if (filter.authorDid) {
      query = query.where("p.author_did", "=", filter.authorDid);
    }
    if (filter.labelId) {
      const labelId = filter.labelId;
      query = query.where((eb) =>
        eb.exists(
          eb
            .selectFrom("account_label as al")
            .select("al.did")
            .whereRef("al.did", "=", "p.author_did")
            .where("al.label", "=", labelId),
        ),
      );
    }
    if (filter.tags && filter.tags.length > 0) {
      const tags = filter.tags.map((t) => t.toLowerCase());
      const op = filter.tagMode === "all" ? "@>" : "&&";
      query = query.where(sql<boolean>`${sql.ref("p.tags")} ${sql.raw(op)} ${tags}`);
    }
    if (filter.contains && filter.contains.length > 0) {
      const target =
        filter.containsIn === "text"
          ? sql.ref("p.text")
          : filter.containsIn === "altText"
            ? sql.ref("p.alt_text")
            : sql`(${sql.ref("p.text")} || ' ' || ${sql.ref("p.alt_text")})`;
      const conditions = filter.contains.map(
        (needle) =>
          sql<boolean>`${target} LIKE ${`%${escapeLike(needle.toLowerCase())}%`} ESCAPE '\\'`,
      );
      query = query.where((eb) =>
        filter.containsMode === "all" ? eb.and(conditions) : eb.or(conditions),
      );
    }
    if (filter.excludeReplies !== false) {
      query = query.where("p.is_reply", "=", false);
    }
  } else if (feed.kind === "all") {
    query = query.where((eb) =>
      eb.exists(
        eb
          .selectFrom("account_label as al")
          .select("al.did")
          .whereRef("al.did", "=", "p.author_did"),
      ),
    );
  } else {
    query = query
      .innerJoin("account_label as al", "al.did", "p.author_did")
      .where("al.label", "=", feed.labelId);
  }

  if (cursor) {
    const [tsPart, uriPart] = cursor.split("::");
    const ts = Number(tsPart);
    if (Number.isFinite(ts) && uriPart) {
      query = query.where((eb) =>
        eb.or([
          eb("p.indexed_at", "<", ts),
          eb.and([eb("p.indexed_at", "=", ts), eb("p.uri", "<", uriPart)]),
        ]),
      );
    }
  }

  const organic = await query.execute();
  const hasMore = organic.length === limit;
  const feedUris = mergePins(
    organic.map((row) => row.uri),
    pins,
    limit,
  );

  let nextCursor: string | undefined;
  if (hasMore) {
    const lastOrganicUri = [...feedUris].reverse().find((u) => !pinUris.has(u));
    const row = (lastOrganicUri && organic.find((o) => o.uri === lastOrganicUri)) || organic.at(-1);
    if (row) nextCursor = `${row.indexed_at}::${row.uri}`;
  }

  respond(res, feedUris, nextCursor);
}
