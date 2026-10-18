/**
 * Likes: an `app.sonasky.apollo.like` record in the liker's repo points at a
 * site's `self` record. Nothing is stored on Apollo's side - counts come from
 * the Constellation backlink index.
 */

import { NSID_LIKE, NSID_SITE, SITE_RKEY } from "../shared/nsid.ts";
import { hashRkey } from "./atproto/rkey.ts";

const CONSTELLATION_URL = "https://constellation.microcosm.blue";

export function siteUri(did: string): string {
  return `at://${did}/${NSID_SITE}/${SITE_RKEY}`;
}

/** rkey of the caller's like of the site owned by `did`. */
export function likeRkey(did: string): Promise<string> {
  return hashRkey(siteUri(did));
}

/** Accounts with a like record pointing at `did`'s site. 0 when the index can't be reached. */
export async function likeCount(did: string): Promise<number> {
  const url = new URL("/links/count/distinct-dids", CONSTELLATION_URL);
  url.searchParams.set("target", siteUri(did));
  url.searchParams.set("collection", NSID_LIKE);
  url.searchParams.set("path", ".subject");
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "SonaSky Apollo (likes)" },
    });
    if (!res.ok) return 0;
    const body = (await res.json()) as { total?: number };
    return typeof body.total === "number" ? body.total : 0;
  } catch (err) {
    console.warn("like count failed", did, err);
    return 0;
  }
}
