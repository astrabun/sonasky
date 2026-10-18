/** Request/response shapes shared by the Worker API and the SPA. */

import type { ReportDestination } from "./moderation.ts";
import type {
  LayoutRecord,
  MediaRecord,
  PageRecord,
  PostRecord,
  RingRecord,
  ScriptRecord,
  ThemeTokens,
  SiteRecord,
  StyleRecord,
} from "./records.ts";

export type MeResponse =
  | { authenticated: false }
  | {
      authenticated: true;
      did: string;
      handle?: string;
      /** The session is missing scopes Apollo needs to edit - sign in again. */
      reauthRequired: boolean;
      /** The session may like sites (full or visitor scope). */
      canLike: boolean;
      /** Viewer URL of the user's site (whether or not it exists yet). */
      siteUrl: string;
    };

export interface Entry<T> {
  rkey: string;
  cid: string;
  value: T;
}

export interface MediaEntry extends Entry<MediaRecord> {
  /** Public URL on the usercontent origin. */
  url: string;
}

export interface SiteBundle {
  did: string;
  handle?: string;
  siteUrl: string;
  usercontentOrigin: string;
  site: Entry<SiteRecord> | null;
  pages: Entry<PageRecord>[];
  posts: Entry<PostRecord>[];
  styles: Entry<StyleRecord>[];
  scripts: Entry<ScriptRecord>[];
  layouts: Entry<LayoutRecord>[];
  media: MediaEntry[];
}

export interface ApiError {
  ok: false;
  error:
    | "unauthenticated"
    | "reauth_required"
    | "blocked"
    | "rate_limited"
    | "invalid"
    | "bad_origin"
    | "not_found"
    | "limit"
    | "internal";
  message?: string;
  /** Dotted path of the offending field, for `invalid`. */
  field?: string;
}

export interface PutResponse {
  ok: true;
  uri: string;
  cid: string;
}

export interface MediaUploadResponse {
  ok: true;
  media: MediaEntry;
}

export interface PreviewRequest {
  site: SiteRecord;
  target:
    | { kind: "page"; slug: string; record: PageRecord }
    | { kind: "post"; slug: string; record: PostRecord };
  /** Theme style (draft) and any page styles. */
  styles: StyleRecord[];
  layout?: LayoutRecord;
}

export interface PreviewResponse {
  ok: true;
  html: string;
}

export interface StatsResponse {
  /** Accounts with an Apollo site record, or null if it couldn't be counted. */
  sites: number | null;
}

export interface DiscoverSite {
  did: string;
  handle?: string;
  /** Viewer URL, e.g. `https://apollo.sonasky.app/@alice.bsky.social`. */
  url: string;
  title: string;
  description?: string;
  /** Bluesky profile, for the card's byline. */
  displayName?: string;
  avatar?: string;
}

export interface DiscoverResponse {
  /** null when there's nothing to show (empty pool, or the relay is down). */
  site: DiscoverSite | null;
}

/** A site in the public directory. */
export interface DirectorySite extends DiscoverSite {
  createdAt: string;
  updatedAt: string;
  /** Accounts that like the site (approximate; from the backlink index). */
  likes: number;
  /** When someone last posted a link to the site on Bluesky. */
  lastLinkedAt?: string;
}

export interface SiteDirectoryResponse {
  /** null when the index couldn't be reached. */
  sites: DirectorySite[] | null;
  /** 1-based. */
  page: number;
  pages: number;
  total: number;
}

export interface SiteLookupResponse {
  site: DiscoverSite | null;
  /** Why there's no site: no such account, no Apollo site, or it can't be shown. */
  reason?: "not_found" | "no_site" | "unavailable";
  /** The resolved handle, for the "no site" message. */
  handle?: string;
}

export interface LikeStatusResponse {
  count: number;
  /** Whether the caller likes the site (false when signed out). */
  liked: boolean;
}

// Rings

export type RingMemberStatus = "accepted" | "pending";

export interface OwnedRing {
  entry: Entry<RingRecord>;
  uri: string;
  /** Viewer URL of the ring page. */
  url: string;
  members: { did: string; handle?: string; status: RingMemberStatus }[];
}

/** A ring seen from a (prospective) member's side. */
export interface RingRef {
  uri: string;
  name: string;
  description?: string;
  url: string;
  ownerDid: string;
  ownerHandle?: string;
}

/** A ring in the public directory. */
export interface DirectoryRing extends RingRef {
  /** Invited sites that accepted and have a site (approximate; the ring page is authoritative). */
  activeMembers: number;
  createdAt: string;
  updatedAt: string;
  ownerDisplayName?: string;
  ownerAvatar?: string;
}

export interface RingDirectoryResponse {
  /** null when the network index couldn't be reached. */
  rings: DirectoryRing[] | null;
}

export interface RingsResponse {
  did: string;
  hasSite: boolean;
  owned: OwnedRing[];
  /** Rings this account has accepted. `active` is false once the owner removed it. */
  memberships: (RingRef & { active: boolean })[];
  /** Rings that list this account but haven't been accepted. */
  invites: RingRef[];
  /** The account's styles, for ring looks. */
  styles: { rkey: string; name: string; tokens?: ThemeTokens; basedOn?: string }[];
  /** False when the invite index couldn't be reached. */
  invitesOk: boolean;
}

export interface RingLookupResponse {
  ring: RingRef;
  invited: boolean;
  joined: boolean;
  hasSite: boolean;
}

export type ReportSubject = { uri: string; cid: string } | { did: string };

export interface ReportRequest {
  subject: ReportSubject;
  reasonType: string;
  reason?: string;
  destination: ReportDestination;
}
