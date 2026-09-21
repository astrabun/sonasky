export interface BskyPost {
  uri: string;
  authorHandle: string;
  authorDisplayName?: string;
  authorAvatar?: string;
  text: string;
  likeCount: number;
  repostCount: number;
  indexedAt: string;
}

export type FeedKind = "all" | "species" | "trending" | "interacted" | "custom";

export interface PostFeedResult {
  feedUri: string;
  displayName: string;
  kind: FeedKind;
  labelId: string | null;
  destination: string;
  eligible: boolean;
  pinned: boolean;
  pinPosition?: number;
  rank?: number;
}

export interface PostFeedsResponse {
  found: boolean;
  post?: {
    uri: string;
    authorDid: string;
    indexedAt: number;
    isReply: boolean;
    tags: string[];
    text: string;
    altText: string;
  };
  authorLabels: string[];
  optedOut: boolean;
  results: PostFeedResult[];
}

export interface RankHistoryPoint {
  t: number;
  rank: number | null;
}

export interface RankHistoryResponse {
  kind: FeedKind;
  points: RankHistoryPoint[];
}

export interface CursorStatus {
  name: string;
  key: string;
  cursor: number | null;
  lagMs: number | null;
}

export interface CursorsResponse {
  now: number;
  streams: CursorStatus[];
}
