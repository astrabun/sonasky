/** AT Proto collection NSIDs used by this app. */

/** The site itself: one record per repo, rkey `self`. */
export const NSID_SITE = "app.sonasky.apollo";
export const NSID_PAGE = "app.sonasky.apollo.page";
export const NSID_POST = "app.sonasky.apollo.post";
export const NSID_STYLE = "app.sonasky.apollo.style";
export const NSID_SCRIPT = "app.sonasky.apollo.script";
export const NSID_LAYOUT = "app.sonasky.apollo.layout";
export const NSID_MEDIA = "app.sonasky.apollo.media";
/** A webring, in its owner's repo. rkey is a slug. */
export const NSID_RING = "app.sonasky.apollo.ring";
/** A site's side of a ring membership, in the member's repo. rkey derived from the ring uri. */
export const NSID_RING_MEMBER = "app.sonasky.apollo.ringMember";
/** Shared defs (block union). Not a collection. */
export const NSID_DEFS = "app.sonasky.apollo.defs";

export const SITE_RKEY = "self";

/** Every collection Apollo writes. Order matters for the OAuth scope string only. */
export const APOLLO_COLLECTIONS = [
  NSID_SITE,
  NSID_PAGE,
  NSID_POST,
  NSID_LAYOUT,
  NSID_STYLE,
  NSID_SCRIPT,
  NSID_MEDIA,
  NSID_RING,
  NSID_RING_MEMBER,
] as const;

export type ApolloCollection = (typeof APOLLO_COLLECTIONS)[number];

/** Collections whose rkey is a user-chosen slug (rather than a TID). */
export const SLUG_COLLECTIONS = [
  NSID_PAGE,
  NSID_POST,
  NSID_STYLE,
  NSID_SCRIPT,
  NSID_LAYOUT,
] as const;
export type SlugCollection = (typeof SLUG_COLLECTIONS)[number];

export function isApolloCollection(value: string): value is ApolloCollection {
  return (APOLLO_COLLECTIONS as readonly string[]).includes(value);
}
