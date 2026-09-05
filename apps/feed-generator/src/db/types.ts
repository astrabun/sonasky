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
}

export interface Database {
  account_label: AccountLabelTable;
  post: PostTable;
}
