import { generatedCatalog } from "./catalog.generated.ts";
import {
  ALL_USERS_DESCRIPTION,
  ALL_USERS_DISPLAY_NAME,
  ALL_USERS_TRENDING_DESCRIPTION,
  ALL_USERS_TRENDING_DISPLAY_NAME,
  GENERATOR_COLLECTION,
  PER_SPECIES_TRENDING_DEFAULT,
  SONASKY_DID,
  SONASKY_HANDLE,
} from "./const.ts";

export {
  PER_SPECIES_TRENDING_DEFAULT,
  SONASKY_DID,
  SONASKY_HANDLE,
  ALL_USERS_DISPLAY_NAME,
  ALL_USERS_TRENDING_DISPLAY_NAME,
} from "./const.ts";

// Shape of catalog.generated.ts (produced by `pnpm -F @sonasky/feeds-def gen`)

export interface GeneratedLabelFeed {
  labelId: string;
  /** Full English species name (untruncated). */
  speciesName: string;
  /** Species-feed display name, truncated to the 24-grapheme record cap. */
  displayName: string;
  /** Per-species trending display name, truncated. */
  trendingDisplayName: string;
  feedRkey: string;
  trendingRkey: string;
}

export interface GeneratedCatalog {
  allRkey: string;
  allTrendingRkey: string;
  labels: GeneratedLabelFeed[];
}

// Public API

export interface FeedRef {
  /** app.bsky.feed.generator record key. */
  rkey: string;
  /** at://<publisher DID>/app.bsky.feed.generator/<rkey> */
  atUri: string;
  /** https://bsky.app/profile/<publisher handle>/feed/<rkey> */
  bskyUrl: string;
  displayName: string;
  description: string;
}

export interface LabelFeeds {
  labelId: string;
  /** Full English species name. */
  speciesName: string;
  /** Reverse-chronological feed of posts from accounts carrying this label. */
  feed: FeedRef;
  /** Engagement-ranked feed - present only when per-species trending is enabled. */
  trendingFeed?: FeedRef;
}

export interface GlobalFeeds {
  /** Reverse-chronological posts from every SonaSky-labelled account. */
  all: FeedRef;
  /** Engagement-ranked posts from every SonaSky-labelled account. */
  trending: FeedRef;
}

const ref = (rkey: string, displayName: string, description: string): FeedRef => ({
  rkey,
  atUri: `at://${SONASKY_DID}/${GENERATOR_COLLECTION}/${rkey}`,
  bskyUrl: `https://bsky.app/profile/${SONASKY_HANDLE}/feed/${rkey}`,
  displayName,
  description,
});

const speciesDescription = (name: string): string =>
  `Reverse-chronological posts from accounts SonaSky has labeled "${name}".`;
const speciesTrendingDescription = (name: string): string =>
  `Most-liked and reposted recent posts from accounts SonaSky has labeled "${name}".`;

/** The two feeds that span every SonaSky-labelled account. */
export function getGlobalFeeds(): GlobalFeeds {
  return {
    all: ref(generatedCatalog.allRkey, ALL_USERS_DISPLAY_NAME, ALL_USERS_DESCRIPTION),
    trending: ref(
      generatedCatalog.allTrendingRkey,
      ALL_USERS_TRENDING_DISPLAY_NAME,
      ALL_USERS_TRENDING_DESCRIPTION,
    ),
  };
}

/**
 * One entry per active species label: its reverse-chron feed, plus a trending
 * feed when `perSpeciesTrending` is set (defaults to PER_SPECIES_TRENDING_DEFAULT).
 */
export function getLabelFeeds(opts: { perSpeciesTrending?: boolean } = {}): LabelFeeds[] {
  const withTrending = opts.perSpeciesTrending ?? PER_SPECIES_TRENDING_DEFAULT;
  return generatedCatalog.labels.map((l) => ({
    labelId: l.labelId,
    speciesName: l.speciesName,
    feed: ref(l.feedRkey, l.displayName, speciesDescription(l.speciesName)),
    ...(withTrending
      ? {
          trendingFeed: ref(
            l.trendingRkey,
            l.trendingDisplayName,
            speciesTrendingDescription(l.speciesName),
          ),
        }
      : {}),
  }));
}

/** Same as {@link getLabelFeeds}, keyed by label id for direct lookup. */
export function getLabelFeedsMap(opts?: {
  perSpeciesTrending?: boolean;
}): Record<string, LabelFeeds> {
  return Object.fromEntries(getLabelFeeds(opts).map((lf) => [lf.labelId, lf]));
}
