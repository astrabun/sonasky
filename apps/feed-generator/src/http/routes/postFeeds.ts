import type { ServerResponse } from "node:http";
import { db } from "../../db/index.ts";
import { interactedZsetKey } from "../../consumers/interacted.ts";
import { trendingZsetKey } from "../../consumers/trending.ts";
import { getServedFeeds, type ServedFeed } from "../../feeds.ts";
import { pinsForFeed } from "../../pinnedPosts.ts";
import { redis } from "../../utils/redis.ts";
import { sendError, sendJson } from "../json.ts";
import { chronoRank, matchesCustomFilter } from "../rankQueries.ts";

interface FeedResult {
  feedUri: string;
  displayName: string;
  kind: ServedFeed["kind"];
  labelId: string | null;
  destination: ServedFeed["destination"];
  eligible: boolean;
  pinned: boolean;
  pinPosition?: number;
  /**
   * 0-indexed organic rank among posts matching this feed's filter, ignoring
   * how pins on OTHER posts shift later organic posts down a slot, and
   * ignoring the requesting client's page size. Not necessarily the exact
   * index a live getFeedSkeleton call would return - "where it'd sort," not a
   * page-accurate position.
   */
  rank?: number;
}

/**
 * Which feeds a post is in and its position in each. Not part of the public
 * XRPC surface - an internal tool for inspecting feed membership.
 */
export async function postFeeds(res: ServerResponse, params: URLSearchParams): Promise<void> {
  const uri = params.get("uri");
  if (!uri) {
    sendError(res, 400, "InvalidRequest", "Missing uri parameter");
    return;
  }

  const post = await db.selectFrom("post").selectAll().where("uri", "=", uri).executeTakeFirst();

  const feeds = getServedFeeds();

  if (!post) {
    const results: FeedResult[] = [];
    for (const feed of feeds) {
      const pins = pinsForFeed(feed.kind, feed.labelId);
      const pin = pins.find((p) => p.uri === uri);
      if (!pin) continue;
      results.push({
        feedUri: feed.uri,
        displayName: feed.displayName,
        kind: feed.kind,
        labelId: feed.labelId,
        destination: feed.destination,
        eligible: false,
        pinned: true,
        pinPosition: pin.position ?? 0,
      });
    }
    sendJson(res, 200, { found: false, authorLabels: [], optedOut: false, results });
    return;
  }

  const [labelRows, optOut] = await Promise.all([
    db.selectFrom("account_label").select("label").where("did", "=", post.author_did).execute(),
    db.selectFrom("opt_out").select("did").where("did", "=", post.author_did).executeTakeFirst(),
  ]);
  const authorLabels = new Set(labelRows.map((r) => r.label));
  const optedOut = optOut !== undefined;

  const results: FeedResult[] = [];

  // A served feed with `destination: "all"` is published once per account (prod
  // and test) as two ServedFeed entries sharing one rkey/filter - rank/eligibility
  // only need computing once per rkey, then reused across its destinations, both
  // to avoid a query per duplicate and so their numbers can't drift apart from
  // concurrent writes landing between two otherwise-identical queries.
  const rankCache = new Map<string, number | null>();

  for (const feed of feeds) {
    const pins = pinsForFeed(feed.kind, feed.labelId);
    const pin = pins.find((p) => p.uri === uri);

    let eligible: boolean;
    if (optedOut) {
      eligible = false;
    } else if (feed.kind === "all") {
      eligible = authorLabels.size > 0;
    } else if (feed.kind === "species") {
      eligible = feed.labelId !== null && authorLabels.has(feed.labelId);
    } else if (feed.kind === "custom") {
      eligible = matchesCustomFilter(feed, post, authorLabels);
    } else {
      // trending / interacted: eligibility is "currently scored", checked via redis below.
      eligible = false;
    }

    if (feed.kind === "trending" || feed.kind === "interacted") {
      let rank = rankCache.get(feed.rkey);
      if (rank === undefined) {
        const zsetKey =
          feed.kind === "interacted" ? interactedZsetKey() : trendingZsetKey(feed.labelId);
        rank = await redis.zrevrank(zsetKey, uri);
        rankCache.set(feed.rkey, rank);
      }
      if (rank === null && !pin) continue;
      results.push({
        feedUri: feed.uri,
        displayName: feed.displayName,
        kind: feed.kind,
        labelId: feed.labelId,
        destination: feed.destination,
        eligible: rank !== null,
        pinned: pin !== undefined,
        pinPosition: pin?.position ?? 0,
        rank: rank ?? undefined,
      });
      continue;
    }

    if (!eligible && !pin) continue;

    let rank: number | undefined;
    if (eligible) {
      let cached = rankCache.get(feed.rkey);
      if (cached === undefined) {
        cached = await chronoRank(feed, post);
        rankCache.set(feed.rkey, cached);
      }
      rank = cached ?? undefined;
    }
    results.push({
      feedUri: feed.uri,
      displayName: feed.displayName,
      kind: feed.kind,
      labelId: feed.labelId,
      destination: feed.destination,
      eligible,
      pinned: pin !== undefined,
      pinPosition: pin?.position ?? 0,
      rank,
    });
  }

  sendJson(res, 200, {
    found: true,
    post: {
      uri: post.uri,
      authorDid: post.author_did,
      indexedAt: post.indexed_at,
      isReply: post.is_reply,
      tags: post.tags,
      text: post.text,
      altText: post.alt_text,
    },
    authorLabels: [...authorLabels],
    optedOut,
    results,
  });
}
