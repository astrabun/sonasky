import {
  type CustomFeedFilter,
  type Destination,
  type FeedDestination,
  type FeedRef,
  getCustomFeeds,
  getGlobalFeeds,
  getLabelFeeds,
  resolveDestinations,
} from "@sonasky/feeds-def";
import { config } from "./config.ts";

interface BaseFeed {
  /** app.bsky.feed.generator record key. */
  rkey: string;
  /** at://<publisherDid>/app.bsky.feed.generator/<rkey> */
  uri: string;
  displayName: string;
  description: string;
  /** Which account this feed's record is published under. */
  destination: Destination;
}

export type ServedFeed =
  /** Reverse-chron posts from accounts carrying one label (`labelId` = its value). */
  | (BaseFeed & { kind: "species"; labelId: string })
  /** Reverse-chron posts from accounts carrying any SonaSky label. */
  | (BaseFeed & { kind: "all"; labelId: null })
  /** Engagement-ranked posts: `labelId` null = global, a string = that species. */
  | (BaseFeed & { kind: "trending"; labelId: string | null })
  /** Posts ranked by how much the SonaSky-labeled population liked/reposted them. */
  | (BaseFeed & { kind: "interacted"; labelId: null })
  /** Posts matching an arbitrary filter, defined in @sonasky/feeds-def's customFeeds.ts. */
  | (BaseFeed & { kind: "custom"; labelId: null; filter: CustomFeedFilter });

let warnedMissingTestDid = false;

/** Publisher DID for a feed's `at://` URI, based on where it's deployed. */
const publisherDidFor = (destination: Destination): string => {
  if (destination === "prod") return config.publisherDid;
  if (!config.testPublisherDid && !warnedMissingTestDid) {
    warnedMissingTestDid = true;
    console.warn(
      `One or more feeds target the "test" destination but TEST_SONASKY_DID is unset; ` +
        `their published URIs will be malformed until it's set (skeleton serving is unaffected).`,
    );
  }
  return config.testPublisherDid ?? "";
};

// `destination: "all"` expands into one entry per concrete destination (same
// rkey) - it's still one served feed as far as skeleton serving is concerned,
// just backed by more than one published record.
const withDestinations = <T extends ServedFeed>(
  destination: FeedDestination | undefined,
  build: (destination: Destination) => T,
): T[] => resolveDestinations(destination).map(build);

const toServed = (
  kind: ServedFeed["kind"],
  labelId: string | null,
  ref: FeedRef,
  destination?: FeedDestination,
): ServedFeed[] =>
  withDestinations(
    destination,
    (dest) =>
      ({
        kind,
        labelId,
        destination: dest,
        rkey: ref.rkey,
        uri: `at://${publisherDidFor(dest)}/app.bsky.feed.generator/${ref.rkey}`,
        displayName: ref.displayName,
        description: ref.description,
      }) as ServedFeed,
  );

const global = getGlobalFeeds();
const labelFeeds = getLabelFeeds({ perSpeciesTrending: config.perSpeciesTrending });

const customServedFeeds: ServedFeed[] = getCustomFeeds().flatMap((cf) =>
  withDestinations(
    cf.destination,
    (destination) =>
      ({
        kind: "custom",
        labelId: null,
        filter: cf.filter,
        destination,
        rkey: cf.rkey,
        uri: `at://${publisherDidFor(destination)}/app.bsky.feed.generator/${cf.rkey}`,
        displayName: cf.displayName,
        description: cf.description,
      }) as ServedFeed,
  ),
);

/** Every author DID pinned by a custom feed's filter - the post-stream consumer
 * must ingest these even when the author carries no species label. */
export const customFeedAuthorDids = new Set(
  getCustomFeeds().flatMap((cf) => (cf.filter.authorDid ? [cf.filter.authorDid] : [])),
);

const servedFeeds: ServedFeed[] = [
  // Mirrored to "test" too, so QA can see the same global feed there.
  ...toServed("all", null, global.all, "all"),
  ...toServed("trending", null, global.trending),
  ...toServed("interacted", null, global.interacted),
  ...labelFeeds.flatMap((lf) => toServed("species", lf.labelId, lf.feed)),
  ...labelFeeds.flatMap((lf) =>
    lf.trendingFeed ? toServed("trending", lf.labelId, lf.trendingFeed) : [],
  ),
  ...customServedFeeds,
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
