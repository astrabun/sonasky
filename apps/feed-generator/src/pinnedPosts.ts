/**
 * Hand-maintained list of posts to pin into feeds. Edit + redeploy to change.
 *
 * Pins are injected only into the FIRST page of a feed (no cursor). Each pin
 * takes a fixed slot from the top; organic posts flow around it. A pinned post
 * is de-duplicated from the organic results, so it never appears twice.
 */

export interface PinnedPost {
  /** at:// URI of the post to pin. */
  uri: string;
  /**
   * Feed selectors this pin applies to. Omit (or `["*"]`) to pin it on every
   * feed. Each selector is one of:
   *   - `"all"`                - the global reverse-chronological feed
   *   - `"trending"`           - the global trending feed
   *   - `"interacted"`         - the global "SonaSky Comet" feed
   *   - `"<labelId>"`          - that species' reverse-chronological feed
   *   - `"<labelId>.trending"` - that species' trending feed
   *   - `"*.chrono"`           - every reverse-chronological feed
   *   - `"*.trending"`         - every trending feed
   */
  feeds?: string[];
  /**
   * 0-indexed slot from the top of the first page. `0` = very top, `2` = after
   * two organic posts. Clamped to the page size. Defaults to `0`.
   */
  position?: number;
}

type FeedKind = "all" | "species" | "trending" | "interacted";

export const pinnedPosts: PinnedPost[] = [
  {
    uri: "at://did:plc:2qawvcwumvgxmed6iy6pmt6l/app.bsky.feed.post/3muzyyy6x4s27",
    feeds: ["interacted", "trending", "all"],
    position: 0,
  },
  // {
  //   uri: "at://did:plc:nkleu4mgtlxpsfwkdm6otsqu/app.bsky.feed.post/3mutboyzfcc2q",
  //   feeds: ["*"],
  //   position: 10,
  // },
  // { uri: "at://did:plc:xxxx/app.bsky.feed.post/announcement", position: 0 },
  // { uri: "at://did:plc:xxxx/app.bsky.feed.post/rabbitday", feeds: ["rabbit"], position: 2 },
  // { uri: "at://did:plc:xxxx/app.bsky.feed.post/hot", feeds: ["*.trending"], position: 0 },
];

/** The selector string that identifies a served feed. */
const feedSelector = (kind: FeedKind, labelId: string | null): string => {
  if (kind === "all") return "all";
  if (kind === "species") return labelId ?? "";
  if (kind === "interacted") return "interacted";
  return labelId ? `${labelId}.trending` : "trending";
};

const pinMatches = (pin: PinnedPost, kind: FeedKind, selector: string): boolean => {
  if (!pin.feeds || pin.feeds.length === 0) return true;
  return pin.feeds.some(
    (f) =>
      f === "*" ||
      f === selector ||
      (f === "*.trending" && kind === "trending") ||
      (f === "*.chrono" && (kind === "all" || kind === "species")),
  );
};

/** Pins that apply to a given feed, in the order they should be inserted. */
export function pinsForFeed(kind: FeedKind, labelId: string | null): PinnedPost[] {
  const selector = feedSelector(kind, labelId);
  return pinnedPosts
    .filter((p) => pinMatches(p, kind, selector))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

/**
 * Merges pin URIs into a page of `organicUris` (already in feed order, at most
 * `limit` fetched). Pins are de-duplicated from the organic set, inserted at
 * their clamped `position`, and the result truncated to `limit`. Callers derive
 * the next cursor themselves from the organic URIs that survived into the page.
 */
export function mergePins(organicUris: string[], pins: PinnedPost[], limit: number): string[] {
  const capped = pins.slice(0, Math.max(limit - 1, 0));
  if (capped.length === 0) return organicUris.slice(0, limit);

  const pinUris = new Set(capped.map((p) => p.uri));
  const items = organicUris.filter((uri) => !pinUris.has(uri));

  for (const pin of capped) {
    // Clamp into the visible page so a pin never falls off the end.
    const at = Math.max(0, Math.min(pin.position ?? 0, limit - 1, items.length));
    items.splice(at, 0, pin.uri);
  }

  return items.slice(0, limit);
}
