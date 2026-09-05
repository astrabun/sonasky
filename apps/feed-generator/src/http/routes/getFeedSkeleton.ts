import type { ServerResponse } from "node:http";
import { db } from "../../db/index.ts";
import { feedForUri } from "../../feeds.ts";
import { mergePins, pinsForFeed } from "../../pinnedPosts.ts";
import { sendError, sendJson } from "../json.ts";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const parseLimit = (raw: string | null): number => {
  if (raw === null || raw === "") return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(n), 1), MAX_LIMIT);
};

/**
 * app.bsky.feed.getFeedSkeleton - returns a reverse-chronological page of post
 * URIs authored by accounts carrying the requested feed's species label (or any
 * SonaSky label, for the "all" feed), with any configured pinned posts injected
 * into the first page. Non-personalized: the requester JWT is ignored.
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

  let query = db
    .selectFrom("post as p")
    .select(["p.uri", "p.indexed_at"])
    .distinct()
    .orderBy("p.indexed_at", "desc")
    .orderBy("p.uri", "desc")
    .limit(limit);

  if (feed.kind === "all") {
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

  // Pins are injected into the first page only.
  const pins = cursor ? [] : pinsForFeed(feed.labelId ?? "*");
  const { feedUris, cursorRow } = mergePins(organic, pins, limit, hasMore);

  const nextCursor = cursorRow ? `${cursorRow.indexed_at}::${cursorRow.uri}` : undefined;

  sendJson(res, 200, {
    ...(nextCursor ? { cursor: nextCursor } : {}),
    feed: feedUris.map((uri) => ({ post: uri })),
  });
}
