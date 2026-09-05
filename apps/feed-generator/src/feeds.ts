import { createHash } from "node:crypto";
import { getAllLabels } from "@sonasky/labels-def";
import { config } from "./config.ts";

/** app.bsky.feed.generator.displayName caps at 24 graphemes. */
const MAX_DISPLAY_NAME_GRAPHEMES = 24;
const graphemeSegmenter = new Intl.Segmenter("en", { granularity: "grapheme" });

const truncateGraphemes = (str: string, max: number): string => {
  const graphemes = [...graphemeSegmenter.segment(str)];
  if (graphemes.length <= max) return str;
  return graphemes
    .slice(0, max)
    .map((g) => g.segment)
    .join("")
    .trimEnd();
};

/**
 * Feed record key. A stable hash of a seed string rather than the label id
 * itself: some species names trip the PDS record-key slur filter, and rkeys are
 * permanent while label ids are not.
 */
const feedRkey = (seed: string): string =>
  createHash("sha256").update(seed).digest("hex").slice(0, 16);

interface BaseFeed {
  /** app.bsky.feed.generator record key. */
  rkey: string;
  /** at://<publisherDid>/app.bsky.feed.generator/<rkey> */
  uri: string;
  displayName: string;
  description: string;
}

export type ServedFeed =
  /** Reverse-chron posts from accounts carrying one specific label (`labelId` = its value). */
  | (BaseFeed & { kind: "species"; labelId: string })
  /** Reverse-chron posts from accounts carrying any SonaSky label. */
  | (BaseFeed & { kind: "all"; labelId: null })
  /** Trending (engagement-ranked) posts from accounts carrying any SonaSky label. */
  | (BaseFeed & { kind: "trending"; labelId: null });

const englishName = (locales: { lang: string; name: string }[]): string =>
  (locales.find((l) => l.lang === "en") ?? locales[0])?.name ?? "";

const feedUri = (rkey: string): string =>
  `at://${config.publisherDid}/app.bsky.feed.generator/${rkey}`;

const allUsersRkey = feedRkey("__all_sonasky_users__");
const allUsersFeed: ServedFeed = {
  kind: "all",
  labelId: null,
  rkey: allUsersRkey,
  uri: feedUri(allUsersRkey),
  displayName: "All SonaSky Users",
  description: "Reverse-chronological posts from every account SonaSky has given a species label.",
};

const trendingRkey = feedRkey("__all_sonasky_users_trending__");
const trendingFeed: ServedFeed = {
  kind: "trending",
  labelId: null,
  rkey: trendingRkey,
  uri: feedUri(trendingRkey),
  displayName: "SonaSky Trending",
  description:
    "The most-liked and reposted recent posts from accounts SonaSky has given a species label.",
};

const speciesFeeds: ServedFeed[] = getAllLabels().map((label) => {
  const name = englishName(label.locales) || label.id;
  const rkey = feedRkey(label.id);
  return {
    kind: "species" as const,
    labelId: label.id,
    rkey,
    uri: feedUri(rkey),
    displayName: truncateGraphemes(name, MAX_DISPLAY_NAME_GRAPHEMES),
    description: `Reverse-chronological posts from accounts SonaSky has labeled "${name}".`,
  };
});

const servedFeeds: ServedFeed[] = [allUsersFeed, trendingFeed, ...speciesFeeds];

const labelIds = new Set(speciesFeeds.map((f) => f.labelId));
const rkeyToFeed = new Map(servedFeeds.map((f) => [f.rkey, f]));

/** Every feed this service serves: the "all" feed plus one per active species label. */
export const getServedFeeds = (): readonly ServedFeed[] => servedFeeds;

/** Whether a label value has its own species feed. */
export const isServedLabel = (label: string): boolean => labelIds.has(label);

/**
 * Maps an `app.bsky.feed.getFeedSkeleton` `feed` AT-URI to the feed it names, or
 * `null` if the rkey is not one we serve. The authority (publisher DID) is not
 * checked - only the rkey matters.
 */
export function feedForUri(feed: string): ServedFeed | null {
  const rkey = feed.split("/").pop();
  return (rkey && rkeyToFeed.get(rkey)) || null;
}
