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
   * Label ids whose feeds this pin applies to. Omit (or include "*") to pin it
   * across every feed; e.g. `["rabbit"]` pins it only on the rabbit feed.
   */
  feeds?: string[];
  /**
   * 0-indexed slot from the top of the first page. `0` = very top, `2` = after
   * two organic posts. Clamped to the page size. Defaults to `0`.
   */
  position?: number;
}

export const pinnedPosts: PinnedPost[] = [
  // { uri: "at://did:plc:xxxx/app.bsky.feed.post/announcement", position: 0 },
  // { uri: "at://did:plc:xxxx/app.bsky.feed.post/rabbitday", feeds: ["rabbit"], position: 2 },
];

/** Pins that apply to a given feed, in the order they should be inserted. */
export function pinsForFeed(labelId: string): PinnedPost[] {
  return pinnedPosts
    .filter(
      (p) => !p.feeds || p.feeds.length === 0 || p.feeds.includes("*") || p.feeds.includes(labelId),
    )
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
