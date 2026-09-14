/**
 * Which Bluesky account a feed's app.bsky.feed.generator record is published
 * under. "prod" is the main SonaSky account; "test" is a separate account used
 * to try out experimental feeds without exposing them on the real one.
 */
export type Destination = "prod" | "test";

/**
 * A feed definition's target: a single {@link Destination}, or "all" to
 * publish an identical record under every destination (e.g. mirroring a feed
 * to "test" for QA while it's still live on "prod").
 */
export type FeedDestination = Destination | "all";

export const ALL_DESTINATIONS: readonly Destination[] = ["prod", "test"];

/** Expands a feed's `FeedDestination` into the concrete destinations it targets. */
export const resolveDestinations = (destination: FeedDestination | undefined): Destination[] =>
  destination === "all" ? [...ALL_DESTINATIONS] : [destination ?? "prod"];
