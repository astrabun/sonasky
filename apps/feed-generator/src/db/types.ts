import type { Generated } from "kysely";

export interface AccountLabelTable {
  /** Subject DID carrying the label (for account labels, the label's `uri`). */
  did: string;
  /** Label value - identical to the @sonasky/labels-def record key. */
  label: string;
  /** DID of the labeler that issued this label (the label's `src`). */
  src: string;
  /** Label creation time (the label's `cts`), ISO 8601. */
  created_at: string;
}

export interface PostTable {
  /** at://<authorDid>/app.bsky.feed.post/<rkey> */
  uri: string;
  author_did: string;
  /** ms epoch - Jetstream `time_us` / 1000. */
  indexed_at: number;
  rkey: string;
  /** Whether the post's record had a `reply` field. */
  is_reply: boolean;
  /** Lowercased tags: the record's `tags` field plus any `#hashtag` facets. */
  tags: string[];
  /** Post text, lowercased (matching only, not for display). */
  text: string;
  /** Concatenated embed alt text, lowercased (matching only, not for display). */
  alt_text: string;
}

export interface InteractionTable {
  /** at://<authorDid>/app.bsky.feed.post/<rkey> of the liked/reposted post. */
  post_uri: string;
  /** DID of the labeled account that liked or reposted it. */
  actor_did: string;
  /** "like" | "repost". */
  kind: string;
  /** rkey of the like/repost record - needed to apply delete events. */
  rkey: string;
  /** ms epoch the interaction was seen - Jetstream `time_us` / 1000. */
  indexed_at: number;
}

export interface FeedRankSnapshotTable {
  /** app.bsky.feed.generator record key of the feed this rank was observed in. */
  feed_rkey: string;
  post_uri: string;
  /** 0-indexed rank within the feed at `snapshotted_at`. */
  rank: number;
  /** ms epoch the trending/interacted refresh job took this snapshot. */
  snapshotted_at: number;
}

export interface OptOutTable {
  /**
   * DID of an account whose `app.bsky.actor.contentVisibilityDeclaration` record
   * sets `hideFromAlgorithmicRecommendations: true`.
   */
  did: string;
  /** When the opt-out row was recorded; defaulted by the DB. */
  created_at: Generated<string>;
}

export interface Database {
  account_label: AccountLabelTable;
  post: PostTable;
  interaction: InteractionTable;
  opt_out: OptOutTable;
  feed_rank_snapshot: FeedRankSnapshotTable;
}
