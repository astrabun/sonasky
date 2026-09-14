/**
 * Hand-maintained one-off feeds that aren't tied to the generated species
 * catalog (see catalog.generated.ts) - each defined by an arbitrary filter
 * instead of a single label. Add an entry, run
 * `pnpm -F @sonasky/feeds-def gen` to mint its rkey, and re-deploy.
 *
 * This file must stay free of Node-only APIs (no `node:crypto`, etc.) - unlike
 * catalog.generated.ts, it's imported directly as source by browser apps
 * (e.g. label-browser), which have no Node types available.
 */

import { customFeedRkeys } from "./customFeeds.generated.ts";
import type { FeedDestination } from "./destination.ts";

/**
 * How a custom feed selects which posts appear in it. Every field that's set
 * is ANDed together (e.g. `labelId` + `tags` = "Fox-labeled users' posts
 * tagged X"). At least one of `authorDid` / `labelId` / `tags` should be set,
 * or the feed matches every ingested post.
 */
export interface CustomFeedFilter {
  /** Only posts by this exact author DID. */
  authorDid?: string;
  /** Only posts by accounts carrying this @sonasky/labels-def species label. */
  labelId?: string;
  /**
   * Only posts carrying at least one (`tagMode: "any"`, the default) or all
   * (`tagMode: "all"`) of these tags. Matched case-insensitively against both
   * the record's `tags` field and `#hashtag` facets in the post text.
   */
  tags?: string[];
  tagMode?: "any" | "all";
  /**
   * Only posts whose text and/or alt text contains at least one
   * (`containsMode: "any"`, the default) or all (`containsMode: "all"`) of
   * these substrings, matched case-insensitively. `containsIn` picks which
   * field(s) to check (default "both").
   */
  contains?: string[];
  containsMode?: "any" | "all";
  containsIn?: "text" | "altText" | "both";
  /** Exclude replies. Defaults to true - most custom feeds want top-level posts only. */
  excludeReplies?: boolean;
}

export interface CustomFeedDef {
  /**
   * Seed hashed (sha256, first 16 hex chars) into the record key - must never
   * change once published, same rule as the generated species feeds.
   */
  seed: string;
  displayName: string;
  description: string;
  filter: CustomFeedFilter;
  /**
   * Which account(s) this feed's record is published to. Defaults to "prod";
   * "all" publishes an identical record under every account (e.g. mirroring a
   * feed to "test" for QA while it's still live on "prod").
   */
  destination?: FeedDestination;
}

export interface CustomFeed extends CustomFeedDef {
  /** app.bsky.feed.generator record key, derived from `seed`. */
  rkey: string;
}

export const customFeedDefs: CustomFeedDef[] = [
  {
    seed: "__test_feed__",
    displayName: "Test Feed",
    description: "Experimental feed: posts (no replies or reposts) from a single test account.",
    filter: { authorDid: "did:plc:nkleu4mgtlxpsfwkdm6otsqu" },
    destination: "test",
  },
];

export function getCustomFeeds(): CustomFeed[] {
  return customFeedDefs.map((def) => {
    const rkey = customFeedRkeys[def.seed];
    if (!rkey) {
      throw new Error(
        `No generated rkey for custom feed seed "${def.seed}" - ` +
          "run `pnpm -F @sonasky/feeds-def gen`.",
      );
    }
    return { ...def, rkey };
  });
}
