import { type FeedRef, getGlobalFeeds, getLabelFeeds } from "@sonasky/feeds-def";
import { config } from "./config.ts";

interface BaseFeed {
  /** app.bsky.feed.generator record key. */
  rkey: string;
  /** at://<publisherDid>/app.bsky.feed.generator/<rkey> */
  uri: string;
  displayName: string;
  description: string;
}

export type ServedFeed =
  /** Reverse-chron posts from accounts carrying one label (`labelId` = its value). */
  | (BaseFeed & { kind: "species"; labelId: string })
  /** Reverse-chron posts from accounts carrying any SonaSky label. */
  | (BaseFeed & { kind: "all"; labelId: null })
  /** Engagement-ranked posts: `labelId` null = global, a string = that species. */
  | (BaseFeed & { kind: "trending"; labelId: string | null })
  /** Posts ranked by how much the SonaSky-labeled population liked/reposted them. */
  | (BaseFeed & { kind: "interacted"; labelId: null });

const toServed = (kind: ServedFeed["kind"], labelId: string | null, ref: FeedRef): ServedFeed =>
  ({
    kind,
    labelId,
    rkey: ref.rkey,
    uri: ref.atUri,
    displayName: ref.displayName,
    description: ref.description,
  }) as ServedFeed;

const global = getGlobalFeeds();
const labelFeeds = getLabelFeeds({ perSpeciesTrending: config.perSpeciesTrending });

const servedFeeds: ServedFeed[] = [
  toServed("all", null, global.all),
  toServed("trending", null, global.trending),
  toServed("interacted", null, global.interacted),
  ...labelFeeds.map((lf) => toServed("species", lf.labelId, lf.feed)),
  ...labelFeeds.flatMap((lf) =>
    lf.trendingFeed ? [toServed("trending", lf.labelId, lf.trendingFeed)] : [],
  ),
];

const speciesLabelIds = new Set(labelFeeds.map((lf) => lf.labelId));
const rkeyToFeed = new Map(servedFeeds.map((f) => [f.rkey, f]));

/** Every feed this service serves: the two global feeds plus the per-label feeds. */
export const getServedFeeds = (): readonly ServedFeed[] => servedFeeds;

/** Whether a label value has its own species feed. */
export const isServedLabel = (label: string): boolean => speciesLabelIds.has(label);

/**
 * Maps an `app.bsky.feed.getFeedSkeleton` `feed` AT-URI to the feed it names, or
 * `null` if the rkey is not one we serve. The authority (publisher DID) is not
 * checked - only the rkey matters.
 */
export function feedForUri(feed: string): ServedFeed | null {
  const rkey = feed.split("/").pop();
  return (rkey && rkeyToFeed.get(rkey)) || null;
}
