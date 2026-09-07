export { SONASKY_DID } from "@sonasky/labels-def";

/** Handle of the account that owns the published feed generator records. */
export const SONASKY_HANDLE = "sonasky.app";

export const GENERATOR_COLLECTION = "app.bsky.feed.generator";

/**
 * Seed strings hashed (sha256, first 16 hex chars) into feed record keys. These
 * must never change - the rkey is a permanent identity. Per-species seeds are
 * `${labelId}` (reverse-chron) and `${labelId}${SPECIES_TRENDING_SEED_SUFFIX}`.
 */
export const ALL_USERS_SEED = "__all_sonasky_users__";
export const ALL_USERS_TRENDING_SEED = "__all_sonasky_users_trending__";
export const ALL_USERS_INTERACTED_SEED = "__all_sonasky_users_interacted__";
export const SPECIES_TRENDING_SEED_SUFFIX = "__trending";

export const ALL_USERS_DISPLAY_NAME = "🌈 All SonaSky Users";
export const ALL_USERS_TRENDING_DISPLAY_NAME = "📈 SonaSky Trending";
export const ALL_USERS_INTERACTED_DISPLAY_NAME = "☄️ SonaSky Comet";

export const ALL_USERS_DESCRIPTION =
  "Reverse-chronological posts from every account SonaSky has given a species label.";
export const ALL_USERS_TRENDING_DESCRIPTION =
  "The most-liked and reposted recent posts from accounts SonaSky has given a species label.";
export const ALL_USERS_INTERACTED_DESCRIPTION =
  "Recent posts most liked and reposted by SonaSky users (not necessarily users who have a species label).";

/** Default for whether a trending feed is defined per species label. */
export const PER_SPECIES_TRENDING_DEFAULT = true;
